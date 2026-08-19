# COMANDOS OCULTOS (só dono e bot — NÃO aparecem no menu)

> Comandos de controle interno/debug. Não exibidos no $menu.
> Atualizado em 2026-08-19. Testar um por vez, na ordem do dono.
> Legenda: ⬜ PENDENTE | ✅ OK | ❌ FALHOU | 🔶 PLACEHOLDER | ⏭️ PULADO
> Sintaxe = como digitar completo.

| Comando | Sintaxe | O que faz | Status | Data | Obs |
|---------|---------|-----------|--------|------|-----|
| $shutdown | `$shutdown` | DESLIGA o bot (pm2 stop) | ⬜ | | ⚠️ Só com ordem explícita |
| $send | `$send <texto>` | Envia mensagem forçada (raw) | ⬜ | | Teste silencioso |
| $sendmsg | `$sendmsg <texto>` | Envia mensagem (wrapper) | ⬜ | | Teste silencioso |
| $delete | `$delete` (responda à msg) | Apaga a mensagem marcada | ⬜ | | NOVO 19/08 |
| $promover | `$promover @usuario` | Promove a admin | ⬜ | | Oculto por decisão |
| $admin | `$admin` | Info/admin do grupo | ⬜ | | Oculto por decisão |
| $ping | `$ping` | Latência do bot | ⬜ | | Oculto por decisão |
| $alive | `$alive` | Bot vivo? | ⬜ | | Oculto por decisão |
| $nick | `$nick <apelido>` | Muda apelido | ⬜ | | Oculto por decisão |
| $votar / $voto | `$votar <opção1> <opção2> ...` | Sistema de votação | ⬜ | | Oculto por decisão |
| $delvoto | `$delvoto` | Remove votação | ⬜ | | Oculto por decisão |
| $info | `$info` (ou `$info @usuario`) | Info do grupo/contato | ⬜ | | Oculto por decisão |
| $stats | `$stats` | Estatísticas do bot | ⬜ | | Oculto ("stats do bot") |
| $addcmd | `$addcmd <nome> <resposta>` | Adiciona comando custom | ⬜ | | Controle interno |
| $debug / heartbeat | (interno) | Telemetria (só log) | ⬜ | | Não é digitado |
| selftest | (no boot) | Diagnóstico (card, sarcasmo) | ⬜ | | Só log |

## Observações
- Estes NÃO aparecem no $menu (removidos em 19/08).
- O $delete é o único "útil" do lote: responda à mensagem e mande `$delete`.
- Para testar, digite no grupo (o bot responde só pro dono).
