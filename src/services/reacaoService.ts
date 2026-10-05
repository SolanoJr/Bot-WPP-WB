/**
 * reacaoService — reações determinísticas para palavras-chave.
 */
export function getReacao(palavra: string): string | null {
  const map: Record<string, string> = {
    'bom': '👍 Bom!',
    'ruim': '👎 Ruim.',
    'feliz': '😊 Feliz!',
    'triste': '😢 Triste.',
    'geek': '🤓 Geek!',
    'nerd': '📚 Nerd!',
    'programador': '💻 Programador!',
  };
  const chave = palavra.toLowerCase().trim();
  return map[chave] || null;
}
