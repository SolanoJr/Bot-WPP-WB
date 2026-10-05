/**
 * rankingService — ranqueia aleatórios simples.
 */
export function rankAleatorio(n = 3): string[] {
  const opcoes = ['geek', 'nerd', 'programador', 'hacker', 'cientista', 'artista', 'músico'];
  const resultado: string[] = [];
  for (let i = 0; i < n; i++) {
    resultado.push(opcoes[Math.floor(Math.random() * opcoes.length)]);
  }
  return resultado;
}
