# BACKLOG — Verificações de runtime pendentes

Itens que exigem teste no lab + grupo teste, não validação estática.
Consumidos principalmente na Rodada 4 (Comandos + Automações).

## Bem-vindo
- Trigger: alguém entra no grupo
- Verificar: mensagem de boas-vindas dispara? Personalizada por grupo?
- Evidência esperada: mensagem no grupo teste + registro em log

> Ver também: docs/ROADMAP.md § 🔄 EM ANDAMENTO — mesmo item de validação
> em produção; consolidar na Rodada 4.

## Antibot
- Trigger: bot entra no grupo (ou é adicionado)
- Verificar: mensagem apagada? bot removido? (config: antibot=1 em group_mod)
- Evidência esperada: mensagem some + participante removido + log

## Listas
- Verificar: criação, edição, remoção, persistência entre reinícios
- Tabela envolvida: lists (existe, 0 rows em prod)

## Feedback de saída
- Trigger: alguém sai do grupo
- Verificar: notifica? mensagem? log?
- Tabela envolvida: feedback_events (11 rows em prod — sugere que funciona)

## Sarcasmo
- Trigger: mensagem contém "bot" | menciona o bot | marca o bot
- Verificar: responde? anti-loop funciona (não responde a si mesmo)?
- Config: sarcasmo=0 no Figurinhas — ativar no grupo teste antes

## Mute
- Trigger: comando de mute com duração
- Verificar: muta o alvo? deleta mensagens dele durante o mute? expira sozinho?
- Evidência esperada: mensagens apagadas durante janela + log de expiração

## Rodada planejada
Rodada 4 (Comandos + Automações) — após Rodadas 2 e 3.
