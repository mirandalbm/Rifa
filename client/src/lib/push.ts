import { apiRequest } from "./queryClient";
import { ehIos, jaInstalado } from "./pwa";

/**
 * Notificações neste aparelho. Só se pede permissão depois de um toque da
 * pessoa (seguir, ligar o sino, o botão em Minha conta): pedir ao abrir o
 * site é o jeito mais rápido de ganhar um "bloquear" para sempre.
 */
export type EstadoPush =
  | "sem_suporte" // navegador sem push
  | "instalar" // iPhone: só funciona com o app instalado na tela de início
  | "bloqueado" // a pessoa negou; só volta pelo navegador
  | "desligado"
  | "ligado";

export function pushSuportado(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function estadoPush(): Promise<EstadoPush> {
  if (!pushSuportado()) return ehIos() && !jaInstalado() ? "instalar" : "sem_suporte";
  if (Notification.permission === "denied") return "bloqueado";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "ligado" : "desligado";
}

function chaveEmBytes(b64url: string): Uint8Array {
  const b64 = (b64url + "=".repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Pede permissão (se ainda não tem) e inscreve o aparelho na conta. */
export async function ligarPush(): Promise<EstadoPush> {
  if (!pushSuportado()) return estadoPush();
  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") return permissao === "denied" ? "bloqueado" : "desligado";

  const reg = await navigator.serviceWorker.ready;
  const { chave } = await (await apiRequest("GET", "/api/public/push/chave")).json();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: chaveEmBytes(chave),
    }));
  await apiRequest("POST", "/api/public/push/inscricoes", sub.toJSON());
  return "ligado";
}

export async function desligarPush(): Promise<EstadoPush> {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await apiRequest("DELETE", "/api/public/push/inscricoes", { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
  }
  return estadoPush();
}

/**
 * Depois de seguir ou ligar o sino: se o aparelho ainda não decidiu, pede.
 * Se já decidiu (aceitou ou negou), não incomoda de novo.
 */
export async function oferecerPushSePreciso() {
  try {
    if (pushSuportado() && Notification.permission === "default") await ligarPush();
    else if (pushSuportado() && Notification.permission === "granted") {
      // Permissão dada em outra conta ou antes da inscrição: garante que este
      // aparelho está ligado à conta atual.
      if ((await estadoPush()) !== "ligado") await ligarPush();
    }
  } catch {
    /* sem push o seguir continua valendo; o sino liga quando der */
  }
}
