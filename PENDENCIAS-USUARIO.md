# PENDÊNCIAS DO DONO — fazer quando o projeto estiver "liso liso"

> Este arquivo lista TUDO que depende do dono (humano). O Hermes e o Arquiteto
> continuam polindo o resto. Consultar este arquivo quando for fazer os testes finais.

## 1. Testes visuais (confirmar no app)

- [ ] **Msg 221 chegou no Telegram?** — forward da apresentação do Alberto
  (publicada 24/10 21:23 como msg 220; forward 221 às 21:49, `sent=1` nos logs).
  Se SIM: apresentação provada end-to-end. Se NÃO: bug no destino do Telegram (reportar).
- [ ] **📩 do feedback do Alberto chegou?** — quando ele responder o PV
  (enviado 24/10 21:49, `awaiting_response=1`), o notifier dispara no privado
  com nome/número/grupo/comunidade. Confirmar formato e conteúdo.

## 2. Testes manuais no Grupo Teste (WhatsApp)

- [ ] **Reverter admin de teste** — PN `639474500179` foi promovido 25/10 18:50
  para provar o `$promover` (INC-022). Remover pelo WhatsApp: Grupo Teste →
  info → PN 639474500179 → remover como admin. (Sem demote no bot — decisão
  arquitetural: interface não tem, não criar.)
- [ ] **Testar `$promover` por chat** (opcional, complementar ao E2E da rota
  `/lab`) — no Grupo Teste, `$promover @candidato` (só MASTER/admin pode rodar).
  Confirmar resposta de sucesso.
- [ ] **`$despromover`** — NÃO EXISTE (feature nova, se quiser).
- [ ] **Testar welcome com pessoa real** — remover + adicionar alguém no Grupo
  Teste (bot é admin), ver boas-vindas com menção + aviso de apresentação
  (restauração de teste via `/lab/restore-member`, add por PN).
- [ ] **Testar apresentação end-to-end** — novato responde o aviso com quote +
  dados → confirmação imediata no grupo → consolidação (2 min) → template no
  grupo + privado do dono (com foto, no Grupo Teste a rota é lab).
- [ ] **Testar feedback end-to-end** — remover alguém → PV de feedback (worker 6h
  ou disparo manual via `/lab/run-feedback-worker`) → pessoa responde → 📩 no
  privado do dono.

## 3. Decisões de produto (não código)

- [ ] **Produção: todas as comunidades no MESMO grupo Fortaleza/tópico 2, ou
  cada comunidade com destino próprio?**
  - A) Mesmo Fortaleza → código atual está certo, nada a fazer ✅
  - B) Cada comunidade o seu → precisa tabela `group_id → telegram_chat_id`
    (mudança média)
- [ ] **Ativar `presentation_enabled=1` / `feedback=1` em grupos reais de
  produção** (hoje só o Grupo Teste está ativo). Quais grupos? Quando?
- [ ] **Notícias — melhoria futura**: qual? (ex: mais temas, curadoria diferente,
  formato, horários)
- [ ] **App PC devtools** — abrir o app, Ctrl+Shift+I, copiar erros do console
  (tela preta pré-JS do screenshare). Enviar ao Hermes para diagnóstico.

## 4. Ações de infra (se acontecer de novo)

- [ ] **Se Tailscale do PC cair em `NoState`**: `taskkill /F /IM tailscaled.exe`
  → `net start Tailscale` (fix documentado no HANDOFF §2).
- [ ] **Se o bot perder a sessão WhatsApp** (401 persistente): pareamento por QR
  no pm2 log — o Hermes monitora e gera QR fresco.

## 5. Testes de carga/estresse (opcional, quando quiser)
- [ ] **Live render watchdog** (só você pode): compartilhar tela no Discord
  (broadcaster real) → abrir o viewer em `http://100.101.218.16:3002/?sala=…`
  → console do viewer: `window.requestAnimationFrame = () => {}` (congela)
  → ~5s → o log do server mostra `render watchdog: … sem pintura há Xs —
  keyframe pedido` → restaurar (`location.reload()`) e ver a tela voltar.
  Sem broadcaster o watchdog não dispara (por design); a prova fake-clock
  já está verde (rooms.test.js 96/96).

- [ ] Vários novatos entrando ao mesmo tempo (welcome + aviso + coleta simultânea)
- [ ] Várias notícias agendadas em horários próximos (Geek 08:00 + Polemic 08:00 —
  testar se sobrepõem bem)
- [ ] Muitos feedbacks pendentes (worker 6h com 10+ eventos — já testado com 20
  fake no stress 24/10, mas E2E real é diferente)

## Regras

- **Tudo acima é OPCIONAL** e pode ser feito em qualquer ordem, quando o dono quiser.
- O projeto está funcional em produção mesmo sem esses testes.
- O Hermes e o Arquiteto continuam polindo o resto que NÃO depende do dono
  (ver `laboratorio/BACKLOG.md`).

---

*Gerado 25/10/2026 — as 2 respostas que DEFINEM "liso liso" são a pergunta 1
(msg 221) e a decisão 3-A/3-B (Fortaleza). Todo o resto pode esperar.*
