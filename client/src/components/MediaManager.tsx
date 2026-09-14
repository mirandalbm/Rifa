import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Button, Pill, Empty } from "@/components/bits";
import { apiRequest } from "@/lib/queryClient";

interface MediaItem {
  id: string;
  role: "banner" | "photo" | "video";
  position: number;
  url: string;
  mime: string;
  width: number | null;
  height: number | null;
  durationS: number | null;
  bytes: number | null;
  altText: string | null;
}

const ROLE_LABEL = {
  banner: "Banner · 1, obrigatório",
  photo: "Fotos do prêmio · até 5",
  video: "Vídeo do prêmio · até 60 s",
} as const;

const ACCEPT = {
  banner: "image/jpeg,image/png,image/webp",
  photo: "image/jpeg,image/png,image/webp",
  video: "video/mp4,video/quicktime",
} as const;

function describe(m: MediaItem): string {
  if (m.role === "video") {
    const s = m.durationS ?? 0;
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} · medido no servidor`;
  }
  return `${m.width}×${m.height}`;
}

/**
 * Envio em dois passos: pedimos a URL assinada, o arquivo vai direto para o
 * armazenamento e só então confirmamos. Quem mede o arquivo é o servidor —
 * a duração que aparece aqui saiu do arquivo, não deste navegador.
 */
export function MediaManager({ campaignId }: { campaignId: string }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [altText, setAltText] = useState("");
  const inputs = {
    banner: useRef<HTMLInputElement>(null),
    photo: useRef<HTMLInputElement>(null),
    video: useRef<HTMLInputElement>(null),
  };

  const { data: media } = useQuery<MediaItem[]>({
    queryKey: [`/api/admin/campaigns/${campaignId}/media`],
  });

  const { data: blockers } = useQuery<{ blockers: string[] }>({
    queryKey: [`/api/admin/campaigns/${campaignId}/blockers`],
  });

  async function upload(role: keyof typeof ACCEPT, file: File) {
    setError(null);
    setBusy(role);
    try {
      if (role === "photo" && !altText.trim()) {
        throw new Error("Descreva a foto no texto alternativo antes de enviar.");
      }

      const ticketRes = await apiRequest(
        "POST",
        `/api/admin/campaigns/${campaignId}/media/upload-url`,
        { role, filename: file.name, mime: file.type, bytes: file.size },
      );
      const ticket = (await ticketRes.json()) as {
        url: string;
        storageKey: string;
        headers: Record<string, string>;
      };

      const put = await fetch(ticket.url, {
        method: "PUT",
        headers: ticket.headers,
        body: file,
        credentials: "include",
      });
      if (!put.ok) throw new Error("Falha ao enviar o arquivo.");

      await apiRequest("POST", `/api/admin/campaigns/${campaignId}/media`, {
        role,
        storageKey: ticket.storageKey,
        mime: file.type,
        altText: role === "photo" ? altText : undefined,
      });

      setAltText("");
      qc.invalidateQueries();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
      inputs[role].current!.value = "";
    }
  }

  async function remove(id: string) {
    await apiRequest("DELETE", `/api/admin/media/${id}`);
    qc.invalidateQueries();
  }

  const byRole = (role: MediaItem["role"]) => media?.filter((m) => m.role === role) ?? [];

  return (
    <Card
      title="Mídia da campanha"
      right={
        blockers ? (
          <Pill status={blockers.blockers.length === 0 ? "paid" : "pending"}>
            {blockers.blockers.length === 0
              ? "pronta para publicar"
              : `${blockers.blockers.length} pendência(s)`}
          </Pill>
        ) : null
      }
    >
      <div className="space-y-4 p-4">
        {error ? (
          <p className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">{error}</p>
        ) : null}

        {(["banner", "photo", "video"] as const).map((role) => (
          <div key={role} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="label-xs">{ROLE_LABEL[role]}</span>
              <label className="cursor-pointer text-xs font-semibold text-green-deep underline">
                {busy === role ? "enviando…" : "enviar arquivo"}
                <input
                  ref={inputs[role]}
                  id={`upload-${role}`}
                  type="file"
                  accept={ACCEPT[role]}
                  disabled={busy !== null}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void upload(role, file);
                  }}
                />
              </label>
            </div>

            {role === "photo" ? (
              <input
                id="alt-text"
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
                placeholder="texto alternativo da próxima foto (obrigatório)"
                className="w-full rounded-md border border-line-2 px-3 py-1.5 text-xs"
              />
            ) : null}

            {byRole(role).length === 0 ? (
              <p className="rounded-md border border-dashed border-line-2 px-3 py-3 text-center text-xs text-muted">
                nada enviado
              </p>
            ) : (
              <ul className="space-y-1">
                {byRole(role).map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center gap-3 rounded-md border border-line px-3 py-2"
                  >
                    {m.role === "video" ? (
                      <span className="flex h-9 w-12 items-center justify-center rounded bg-ink text-xs text-white">
                        ▶
                      </span>
                    ) : (
                      <img
                        src={m.url}
                        alt={m.altText ?? ""}
                        className="h-9 w-12 rounded object-cover"
                      />
                    )}
                    <span className="tnum flex-1 text-xs text-ink-2">{describe(m)}</span>
                    <span className="tnum text-[11px] text-muted">
                      {m.bytes ? `${(m.bytes / 1024).toFixed(0)} KB` : ""}
                    </span>
                    <Button
                      variant="ghost"
                      className="px-2 py-1 text-xs"
                      onClick={() => remove(m.id)}
                    >
                      remover
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {blockers && blockers.blockers.length > 0 ? (
          <ul className="space-y-1 rounded-md bg-yellow-soft px-3 py-2 text-xs text-yellow-deep">
            {blockers.blockers.map((b) => (
              <li key={b}>• {b}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}
