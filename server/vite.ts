import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";
import { MARCADOR_DE_META } from "../shared/seo";
import { comMeta, metaDaRequisicao } from "./services/seo";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const transformada = await vite.transformIndexHtml(url, template);
      const meta = await metaDaRequisicao(req, res);
      if (meta.naoIndexar) res.setHeader("X-Robots-Tag", "noindex, nofollow");
      res.setHeader("Vary", "Host");
      res.status(200).set({ "Content-Type": "text/html" }).end(comMeta(transformada, MARCADOR_DE_META, meta));
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // `index: false`: a raiz também passa pelo marcador do <head>, não sai direto do arquivo.
  app.use(express.static(distPath, { index: false }));

  // O `index.html` é lido uma vez; por requisição o servidor troca o marcador
  // pelo `canonical`, o Open Graph e o `robots` da página e do host.
  const html = fs.readFileSync(path.resolve(distPath, "index.html"), "utf-8");

  // fall through to index.html if the file doesn't exist
  app.use("*", async (req, res, next) => {
    try {
      const meta = await metaDaRequisicao(req, res);
      if (meta.naoIndexar) res.setHeader("X-Robots-Tag", "noindex, nofollow");
      // O HTML muda com o host e o caminho: nenhum cache compartilhado guarda o de outro.
      res.setHeader("Vary", "Host");
      res.setHeader("Cache-Control", "no-cache");
      res.status(200).type("html").send(comMeta(html, MARCADOR_DE_META, meta));
    } catch (e) {
      next(e);
    }
  });
}
