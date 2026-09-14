/**
 * Shim da ponte com a maquininha.
 *
 * O invólucro Android injeta este arquivo em toda página carregada. Ele
 * transforma a interface síncrona do Android (`RifaPOSNative`, cujos métodos
 * não podem devolver Promise) no contrato que o app web espera:
 * `window.RifaPOS` com `pay()` e `print()` devolvendo Promise.
 *
 * O contrato do lado web está em `client/src/lib/pos.ts` — os dois precisam
 * andar juntos.
 */
(function () {
  "use strict";

  var nativo = window.RifaPOSNative;
  if (!nativo) return;

  // Já injetado: recarregar a página não pode criar duas pontes.
  if (window.RifaPOS && window.RifaPOS.__shim) return;

  var pendentes = Object.create(null);
  var proximoId = 0;

  /** O Android chama isto quando a operação termina. */
  window.__rifaPosResolve = function (chamadaId, resposta) {
    var pendente = pendentes[chamadaId];
    if (!pendente) return;
    delete pendentes[chamadaId];
    clearTimeout(pendente.relogio);
    pendente.resolve(resposta);
  };

  /**
   * Toda chamada tem prazo. Sem isso, uma falha do lado nativo deixaria a
   * Promise pendurada e o cambista olhando um botão que não responde.
   */
  function chamar(executor, prazoMs) {
    return new Promise(function (resolve) {
      var chamadaId = "c" + proximoId++;

      var relogio = setTimeout(function () {
        if (!pendentes[chamadaId]) return;
        delete pendentes[chamadaId];
        resolve({
          ok: false,
          message: "A maquininha não respondeu. Tente de novo.",
        });
      }, prazoMs);

      pendentes[chamadaId] = { resolve: resolve, relogio: relogio };

      try {
        executor(chamadaId);
      } catch (erro) {
        delete pendentes[chamadaId];
        clearTimeout(relogio);
        resolve({ ok: false, message: String((erro && erro.message) || erro) });
      }
    });
  }

  window.RifaPOS = {
    __shim: true,
    version: nativo.version(),
    terminal: nativo.terminalName(),
    hasPrinter: nativo.hasPrinter(),

    pay: function (requisicao) {
      // Cartão pede senha e conversa com a adquirente: dois minutos é o
      // tempo que uma transação lenta leva de verdade.
      return chamar(function (chamadaId) {
        nativo.payAsync(JSON.stringify(requisicao), chamadaId);
      }, 120000);
    },

    print: function (texto) {
      return chamar(function (chamadaId) {
        nativo.printAsync(texto, chamadaId);
      }, 30000).then(function (resposta) {
        if (!resposta.ok) {
          throw new Error(resposta.message || "Falha ao imprimir.");
        }
      });
    },
  };
})();
