/**
 * 🔒 WarriorBlack - WhatsApp Platform Exports
 *
 * ATENÇÃO: o WhatsAppAdapter (WWebJS) é legado e está com @ts-nocheck.
 * Produção usa BaileysAdapter (engine baileys). Exportamos só o que existe
 * de fato para não quebrar importadores.
 */
export { BaileysAdapter } from './BaileysAdapter';
export { WhatsAppAdapter } from './WhatsAppAdapter';
