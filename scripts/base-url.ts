/**
 * O endereço do servidor para os scripts que batem na API de verdade.
 *
 * Lê o mesmo `PORT` do `.env` que o servidor usa, então seguir o README e
 * rodar `npm run dev` numa porta diferente não quebra os testes. `--url`
 * ainda sobrepõe, para apontar para outra máquina.
 */
export function baseUrl(argv = process.argv): string {
  const i = argv.indexOf("--url");
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  return `http://127.0.0.1:${process.env.PORT ?? 5000}`;
}
