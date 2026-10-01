/**
 * Normalização de IDs de GRUPO entre plataformas.
 *
 * O sistema usa DOIS formatos para o mesmo grupo:
 *   - PlatformManager / ctx.chatId  → PREFIXADO   ("wpp:120363...@g.us", "tg:146078742", "dc:...")
 *   - BaileysNormalizer / evaluate  → SEM PREFIXO ("120363...@g.us")
 *
 * Sem normalização, um lookup exato em `group_mod` falha silenciosamente e o
 * AutoMod responde "nada ligado — ignorando" mesmo com as flags ligadas no DB.
 * Este helper é a fonte única de verdade para remover o prefixo — não duplicar
 * regex em cada função.
 *
 * ⚠️ ESCOPO: apenas IDs de GRUPO/CANAL. NÃO normalizar identidade de USUÁRIO
 * aqui: converter "@lid" → "@c.us" artificialmente inventaria uma relação
 * LID↔telefone que não existe. A relação real vem do `phoneNumber` do
 * groupMetadata (ver services/groupAdmin.ts).
 */

/** Remove o prefixo de plataforma (wpp:|tg:|dc:) de um ID de grupo/canal. */
export function normGroupId(groupId: string): string {
  return String(groupId ?? '').replace(/^(wpp:|tg:|dc:)/, '');
}
