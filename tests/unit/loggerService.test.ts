import { describe, it, expect } from 'vitest';
import { redactValue } from '../../src/services/loggerService';

describe('loggerService: redaction por valor', () => {
  it('redacta telefone BR (mobile)', () => {
    expect(redactValue('Mensagem para 5588998314322')).toBe('Mensagem para [REDACTED_PHONE]');
  });

  it('redacta telefone BR (landline)', () => {
    expect(redactValue('Contato 8533442211')).toBe('Contato [REDACTED_PHONE]');
  });

  it('redacta telefone BR com DDI', () => {
    expect(redactValue('Contato +5588998314322')).toBe('Contato [REDACTED_PHONE]');
  });

  it('JID de usuário é redactado como JID, não como telefone', () => {
    expect(redactValue('User 5588998314322@s.whatsapp.net')).toBe('User [REDACTED_JID]');
  });

  it('redacta JID WhatsApp @g.us', () => {
    expect(redactValue('Chat 120363410094452673@g.us')).toBe('Chat [REDACTED_JID]');
  });

  it('redacta JID @lid', () => {
    expect(redactValue('User 2592935567439@lid')).toBe('User [REDACTED_JID]');
  });

  it('redacta email', () => {
    expect(redactValue('Email solanojr@example.com')).toBe('Email [REDACTED_EMAIL]');
  });

  it('controle negativo: não redacta número curto', () => {
    expect(redactValue('Código 12345')).toBe('Código 12345');
  });

  it('controle negativo: não redacta timestamp de 10 dígitos', () => {
    expect(redactValue('Timestamp 1791995140')).toBe('Timestamp 1791995140');
  });
});