# COMANDOS OCULTOS (só dono e bot — NÃO aparecem no menu)

> Lista de comandos de controle interno/debug. Não são exibidos no $menu.
> Atualizado em 2026-08-19. Testar um por vez, na ordem do dono.
> Legenda: ⬜ PENDENTE | ✅ OK | ❌ FALHOU | 🔶 PLACEHOLDER | ⏭️ PULADO

| Comando | O que faz | Status | Data teste | Obs |
|---------|-----------|--------|-----------|-----|
| $shutdown | DESLIGA o bot (pm2 stop) | ⬜ | | ⚠️ Só com ordem explícita |
| $send | Envia mensagem forçada (raw) | ⬜ | | Teste silencioso |
| $sendmsg | Envia mensagem (wrapper) | ⬜ | | Teste silencioso |
| $delete | Apaga a mensagem marcada (reply) | ⬜ | | NOVO — criado 19/08 |
| $promover | Promove a admin | ⬜ | | Oculto por decisão do dono |
| $admin | Info/admin do grupo | ⬜ | | Oculto por decisão do dono |
| $ping | Latência do bot | ⬜ | | Oculto por decisão do dono |
| $alive | Bot vivo? | ⬜ | | Oculto por decisão do dono |
| $nick | Muda apelido | ⬜ | | Oculto por decisão do dono |
| $votar / $voto / $delvoto | Sistema de votação | ⬜ | | Oculto por decisão do dono |
| $info | Info do grupo/contato | ⬜ | | Oculto por decisão do dono |
| $stats | Estatísticas do bot | ⬜ | | Oculto por decisão do dono ("stats do bot") |
| $addcmd | Adiciona comando custom | ⬜ | | Oculto (controle interno) |
| $debug / heartbeat | Telemetria interna (não é comando de usuário) | ⬜ | | Só log |
| selftest | Diagnóstico no boot (card, sarcasmo) | ⬜ | | Só log, não é comando digitado |

## Observações
- Estes comandos NÃO aparecem no $menu (removidos em 19/08).
- O $delete é o único "útil" do lote: apaga a mensagem que você citar (responda à msg e mande $delete).
- Para testar qualquer um, basta digitar no grupo (o bot responde só pra VC, pois é dono).
