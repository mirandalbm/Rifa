import type { ConnectionOptions } from "node:tls";

/**
 * Decide o TLS da conexão com o Postgres a partir da própria URL.
 *
 * O padrão continua o mais seguro — TLS com certificado verificado, que é o
 * que Neon e os bancos gerenciados oferecem. As exceções são as que a URL
 * já declara:
 *
 * - **Máquina local** (`localhost`, `127.0.0.1`): sem TLS.
 * - **Rede privada do Railway** (`*.railway.internal`): sem TLS. O tráfego
 *   não sai da rede do projeto, e o Postgres de lá nem oferece TLS nesse
 *   endereço — forçar aqui derrubava o servidor na subida.
 * - **`sslmode` na URL**: `disable` desliga; `no-verify` cifra sem conferir o
 *   certificado (Postgres com certificado autoassinado, como o endereço
 *   público do Railway). Qualquer outro valor mantém a verificação.
 */
export function sslConfigFor(databaseUrl: string): false | ConnectionOptions {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return { rejectUnauthorized: true };
  }

  const host = url.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") {
    return false;
  }
  if (host.endsWith(".railway.internal")) return false;

  const sslmode = url.searchParams.get("sslmode");
  if (sslmode === "disable") return false;
  if (sslmode === "no-verify") return { rejectUnauthorized: false };

  return { rejectUnauthorized: true };
}
