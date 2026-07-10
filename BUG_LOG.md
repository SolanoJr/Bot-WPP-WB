# 🐛 BUG & ERROR LOG - Bot-WPP

## 🔴 Erros Ativos (Investigando)
- [PERMISSÕES] No WhatsApp, as vezes o status de admin não é detectado imediatamente em grupos muito grandes.
  - *Status:* Implementado `getChatById` para forçar recarga. Aguardando feedback do campo.

## 🟡 Melhorias Pendentes
- [MULTIPLATAFORMA] Implementar moderação (anti-spam/link) para Telegram e Discord (atualmente focado em WhatsApp).
- [DISCORD] Adicionar suporte a Slash Commands para uma melhor experiência de usuário.
- [RELAY] Criar sistema de mapeamento dinâmico (ex: Grupo Wpp X -> Canal Discord Y).

## 🟢 Correções Realizadas
- [IA] Cota de tokens excedida no Gemini 2.5.
  - *Fix:* Migrado para Gemini 1.5 Flash (1500 req/dia).
- [STARTUP] Falha no PM2 devido a erro de sintaxe no package.json.
  - *Fix:* JSON limpo e validado.
- [DEPLOY] Timeout no GitHub Actions ao tentar acessar IP do Tailscale.
  - *Fix:* Integrado `tailscale/github-action` no workflow de CI/CD.
