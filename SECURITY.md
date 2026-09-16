# SECURITY.md — Política de Segurança

> Política de segurança do projeto Bot-WPP / WarriorBlack.

**Última atualização**: 2026-09-16 15:40 BRT
**Commit**: a ser criado

---

## 🔐 Princípios de Segurança

### 1. Nunca Expor Secrets

Secrets (tokens, chaves, senhas) **NUNCA** devem ser commitados no repositório.

**Regras**:
- Usar variáveis de ambiente (`.env`) para todos os secrets
- `.env` está no `.gitignore` — não remover
- Nenhum fallback hardcoded de secrets no código
- Em caso de dúvida, usar `process.env.SECRET_NAME` sem fallback

### 2. Proteção de Identidades Protegidas

O bot **NUNCA** executa ações destrutivas contra:

| ID | Descrição |
|----|-----------|
| `558581344211` | WarriorBlack (o bot) |
| `2592935567439` | LID do bot |
| `5588998314322` | SolanoJr (o dono) |
| `202658048684056` | LID do dono |
| Qualquer admin do grupo | Verificado via `groupMetadata` |

**Antes de qualquer ação destrutiva**, verificar:
```typescript
if (isProtectedTarget(senderJid)) {
  return { acted: false, reason: 'ID protegido' };
}
```

### 3. Proteção contra Acesso Não Autorizado

- **TestServer (porta 3004)**: Apenas `127.0.0.1` (localhost)
- **Screen Share (porta 3002)**: Acesso público via Tailscale Funnel
- **Prometheus (porta 3001)**: Acesso público (métricas são read-only)

### 4. Proteção contra SQL Injection

Sempre usar prepared statements:
```typescript
// Correto
await db.run('SELECT * FROM users WHERE id = ?', [userId]);
await db.get('INSERT INTO logs (msg) VALUES (?)', [message]);

// Errado
await db.run(`SELECT * FROM users WHERE id = ${userId}`);
```

### 5. Proteção contra XSS

- Nunca renderizar HTML sem sanitização
- Usar `textContent` em vez de `innerHTML` quando possível
- Headers CSP configurados no servidor Screen Share

---

## 🛡️ Checklist para Desenvolvedores

Antes de commitar:

- [ ] Nenhum secret hardcoded no código
- [ ] Todos os secrets usam `process.env`
- [ ] `.env` está no `.gitignore`
- [ ] Nenhum `eval()` ou `new Function()`
- [ ] SQL usa prepared statements
- [ ] Inputs são validados
- [ ] Erros não expõem stack traces em produção
- [ ] Novas dependências foram auditadas (`npm audit`)

---

## 🚨 Reportando Vulnerabilidades

Se encontrar uma vulnerabilidade de segurança:

1. **NÃO** abra issue público no GitHub
2. Entre em contato diretamente com o mantenedor:
   - Discord: SolanoJr#0001
   - WhatsApp: 5588998314322
3. Descreva a vulnerabilidade com detalhes
4. Aguarde resposta antes de divulgar publicamente

---

## 📋 Histórico de Vulnerabilidades Corrigidas

| Data | Vulnerabilidade | Correção |
|------|-----------------|----------|
| 2026-09-16 | Fallback hardcoded `WARRIOR_AUTH_KEY` | Removido fallback |
| 2026-09-16 | 8 funções dead code | Removidas |
| 2026-09-16 | 17 scripts em `laboratorio/` | Movidos para ARCHIVE |
| 2026-09-15 | DNS EAI_AGAIN | Symlink para systemd-resolved |
| 2026-09-14 | Loop infinito AutoMod | Filtro `fromMe` adicionado |
| 2026-09-14 | Admin sofrendo ação | `isProtectedTarget()` adicionado |

---

## 🔒 Configuração de Segurança do Servidor

### Firewall

```bash
# Permitir apenas portas necessárias
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP (Tailscale Funnel)
sudo ufw allow 443/tcp     # HTTPS (Tailscale Funnel)
sudo ufw allow 3002/tcp    # Screen Share
sudo ufw enable
```

### Fail2Ban

Instalar Fail2Ban para proteger contra brute-force no SSH:
```bash
sudo apt install fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### Tailscale

- Usar Tailscale para acesso seguro sem expor portas públicas
- Tailscale Funnel para acesso externo ao Screen Share
- MagicDNS para resolução de nomes interna

---

## 🧪 Testes de Segurança

O projeto inclui testes de segurança em `tests/unit/`:

- `permissions-security.test.ts` — Testes de escalada de privilégio
- `command-signature.test.ts` — Testes de assinatura de comandos

Para rodar:
```bash
npm test
```

---

## 📚 Referências

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)

---

**Última atualização**: 2026-09-16 15:40 BRT
