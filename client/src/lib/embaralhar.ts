/**
 * Os números de uma página do mapa em ordem embaralhada. A semente é da
 * visita (sorteada ao abrir a página): trocar de página e voltar mostra a
 * mesma ordem, e a tela não "pula" a cada número escolhido. É só a ordem
 * na tela — quem decide se o número está livre continua sendo a reserva
 * no servidor.
 */
export function embaralharPagina(inicio: number, fim: number, semente: number): number[] {
  const numeros: number[] = [];
  for (let n = inicio; n <= fim; n++) numeros.push(n);
  // mulberry32: gerador pequeno e determinístico, semeado por página.
  let s = (semente ^ Math.imul(inicio, 0x9e3779b1)) >>> 0;
  const aleatorio = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Fisher–Yates.
  for (let i = numeros.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [numeros[i], numeros[j]] = [numeros[j], numeros[i]];
  }
  return numeros;
}
