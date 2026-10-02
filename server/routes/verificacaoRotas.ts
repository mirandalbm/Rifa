import type { Request, Router } from "express";
import type { Sujeito } from "@shared/verificacao";
import {
  type AtorDaVerificacao,
  autorizarComparacao,
  documentoDoDono,
  revogarComparacao,
  estadoDaVerificacao,
  salvarDadosDaVerificacao,
  salvarDocumentoDaVerificacao,
} from "../services/verificacao";

/**
 * As rotas do dono da verificação — as mesmas para apostador, afiliado e
 * organização; muda só de quem é o id. `idDe` confere a sessão (e, na
 * organização, o recorte) e lança o erro certo antes de qualquer leitura.
 */
export function montarRotasDaVerificacao(
  router: Router,
  caminho: string,
  sujeito: Sujeito,
  idDe: (req: Request) => string | Promise<string>,
) {
  /**
   * Quem age, para a auditoria — pelo sujeito, nunca pela presença de
   * `req.user`: o mesmo navegador pode ter a sessão do painel e a do
   * comprador, e a autorização do apostador é dele.
   */
  const ator = (req: Request, id: string): AtorDaVerificacao =>
    sujeito === "apostador"
      ? { id, role: "apostador", ip: req.ip ?? null }
      : { id: req.user?.id ?? null, role: req.user?.role ?? sujeito, ip: req.ip ?? null };

  router.get(caminho, async (req, res, next) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      res.json(await estadoDaVerificacao(sujeito, await idDe(req), true));
    } catch (err) {
      next(err);
    }
  });

  router.put(caminho, async (req, res, next) => {
    try {
      const id = await idDe(req);
      await salvarDadosDaVerificacao(sujeito, id, req.body, ator(req, id));
      res.json(await estadoDaVerificacao(sujeito, id, true));
    } catch (err) {
      next(err);
    }
  });

  /**
   * Autorizar e revogar a comparação da foto (consentimento biométrico). A
   * prova (chave e SHA-256 do texto lido) e a auditoria entram na mesma
   * transação, e só quando algo mudou.
   */
  router.post(`${caminho}/consentimento`, async (req, res, next) => {
    try {
      const id = await idDe(req);
      res.json(await autorizarComparacao(sujeito, id, req.body, ator(req, id)));
    } catch (err) {
      next(err);
    }
  });

  router.delete(`${caminho}/consentimento`, async (req, res, next) => {
    try {
      const id = await idDe(req);
      res.json(await revogarComparacao(sujeito, id, ator(req, id)));
    } catch (err) {
      next(err);
    }
  });

  router.put(`${caminho}/documentos/:tipo`, async (req, res, next) => {
    try {
      const id = await idDe(req);
      await salvarDocumentoDaVerificacao(sujeito, id, req.params.tipo, req.body?.arquivo);
      res.json(await estadoDaVerificacao(sujeito, id, true));
    } catch (err) {
      next(err);
    }
  });

  router.get(`${caminho}/documentos/:tipo`, async (req, res, next) => {
    try {
      const d = await documentoDoDono(sujeito, await idDe(req), req.params.tipo);
      res.setHeader("Cache-Control", "no-store");
      res.type(d.mime).send(d.bytes);
    } catch (err) {
      next(err);
    }
  });
}
