/**
 * Service worker do rifa.br — o mínimo para o app instalar e abrir sem rede.
 *
 * O que NÃO passa por cache, nunca: `/api/` e `/uploads/`. Cota, pedido,
 * saldo e sorteio são estado vivo; mostrar a versão de ontem é mostrar
 * número vendido como livre. Se a rede cair, a API falha — e a tela diz isso.
 *
 * - Navegação (abrir uma página): rede primeiro; sem rede, a casca guardada.
 * - `/assets/`: o nome já traz o hash do conteúdo, então cache primeiro é
 *   seguro — arquivo novo nasce com nome novo.
 *
 * Notificações (Web Push): o servidor manda título, texto, endereço e
 * etiqueta (`shared/push.ts`). Tocar abre o endereço — sempre interno.
 */
const VERSAO = "rifa-v2";
const CASCA = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSAO).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== VERSAO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/")) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone();
          if (res.ok) caches.open(VERSAO).then((c) => c.put("/", copia));
          return res;
        })
        .catch(() => caches.match("/").then((r) => r || Response.error())),
    );
    return;
  }

  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (guardado) =>
          guardado ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copia = res.clone();
              caches.open(VERSAO).then((c) => c.put(req, copia));
            }
            return res;
          }),
      ),
    );
  }
});

self.addEventListener("push", (event) => {
  let m = {};
  try {
    m = event.data ? event.data.json() : {};
  } catch (e) {
    m = { title: "rifa.br", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(m.title || "rifa.br", {
      body: m.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: m.tag,
      renotify: Boolean(m.tag),
      data: { url: typeof m.url === "string" && m.url.startsWith("/") ? m.url : "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const alvo = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((abertas) => {
      for (const c of abertas) {
        if ("focus" in c) {
          c.navigate(alvo);
          return c.focus();
        }
      }
      return self.clients.openWindow(alvo);
    }),
  );
});
