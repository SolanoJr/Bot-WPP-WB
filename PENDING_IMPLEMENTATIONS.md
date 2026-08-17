# 📋 Comandos/Automações PENDENTES de Implementação (Placeholders)

Lista de comandos que hoje são apenas placeholders (respondem mensagem fixa "ainda não implementado").
Criado em 2026-08-17 durante a sequência de testes de comandos (1 por vez).

## Placeholders encontrados (grep em src/bot/commands/)

| Comando | Arquivo | Mensagem atual | Sugestão de implementação |
|---------|---------|----------------|---------------------------|
| `$alarme` | `src/bot/commands/alarme.ts` | "⏰ Sistema de alarmes ainda não implementado. Em breve você poderá definir alarmes!" | Agendamento via `node-cron` ou `setTimeout` persistido em SQLite; dispara msg no grupo/dono no horário. |
| `$lembrete` | `src/bot/commands/lembrete.ts` | "📝 Sistema de lembretes ainda não implementado. Em breve você poderá criar lembretes!" | Igual alarme, mas com duração relativa ("lembrete 10min comprar pão"). |
| `$nick` | `src/bot/commands/nick.ts` | "🪪 Alteração de apelido ainda não implementada. Em breve!" | Usa `chat.setChatProperty` ou `participants.update` pra mudar nome de exibição no grupo. |
| `$sorteio` | `src/bot/commands/sorteio.ts` | "🎲 Sorteio ainda não implementado. Em breve!" | Sorteia N participantes da lista de membros do grupo (`getChat().participants`). |

## Notas
- Todos foram testados e responderam a mensagem placeholder (comando dispara, mas não faz nada útil).
- `$alarme` e `$lembrete` podem compartilhar um módulo de agendamento (`src/services/schedulerService.ts`).
- `$nick` depende de permissão de admin no grupo (bot precisa ser admin pra mudar apelido).
- Prioridade sugerida: `$lembrete` > `$alarme` > `$sorteio` > `$nick` (lembrete é o mais útil pro dia a dia).
