/**
 * bomDiaService — atualizações do dia às 09h.
 *
 * Funcionalidade real. Não é comando fantasma.
 */
export function getBomDiaMsg(): string {
  const now = new Date();
  const hora = now.getHours();
  const data = now.toLocaleDateString('pt-BR');
  const dia = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'][now.getDay()];
  if (hora >= 6 && hora < 12) {
    return `☀️ Bom dia! Hoje é ${dia}, ${data}. Que o dia seja produtivo!`;
  }
  if (hora >= 12 && hora < 18) {
    return `🌤️ Boa tarde! ${dia}, ${data}. Continue firme.`;
  }
  return `🌙 Boa noite. ${dia}, ${data}. Descanse.`;
}
