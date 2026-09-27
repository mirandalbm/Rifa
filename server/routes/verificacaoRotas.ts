import type { Request, Router } from "express";
import type { Sujeito } from "@shared/verificacao";
import {
  documentoDoDono,
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
      await salvarDadosDaVerificacao(sujeito, id, req.body);
      res.json(await estadoDaVerificacao(sujeito, id, true));
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
