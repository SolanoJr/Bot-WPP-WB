# PLACEHOLDERS — comandos/utilitários/automações incompletos ou pendentes

> Criado em 2026-08-19. Lista tudo que está em estado de PLACEHOLDER (não funcional ou parcial)
> e as pendências que o dono costuma adiar ("depois vemos", "deixa por último").
> Mantido em sincronia com `COMANDOS_PUBLICOS.md` / `COMANDOS_OCULTOS.md`.
> Itens removidos do menu estão marcados com ❌ MENU.

Legenda: 🔶 PLACEHOLDER (não funcional) · 🔧 PARCIAL (funciona parcialmente) · ⏳ PENDENTE (a fazer)

---

## 1. AUTOMAÇÕES ANTI-X (por tipo de mídia/conteúdo)

> Objetivo: cada um é um toggle em `group_mod` (igual `antibotas`/`antilink`) que, quando ligado,
> apaga a mensagem do tipo e conta infração (3 strikes → kick, nunca ban, exceto bot).
> Hoje NENHUMA dessas existe no código — são esqueletos a criar.

| Toggle | O que deveria fazer | Como usaria | Status |
|--------|---------------------|-------------|--------|
| `$anti-audio` | Apaga áudios (PTT/áudio) do grupo | `$anti-audio on/off` | 🔶 PLACEHOLDER |
| `$anti-imagem` | Apaga imagens enviadas | `$anti-imagem on/off` | 🔶 PLACEHOLDER |
| `$anti-figurinha` | Apaga stickers (figurinhas) | `$anti-figurinha on/off` | 🔶 PLACEHOLDER |
| `$anti-card` | Apaga cards interativos (botões/poll invisível) | `$anti-card on/off` | 🔶 PLACEHOLDER (WA limita leitura de card — ver AI_HANDOFF.md) |
| `$anti-enquete` | Apaga enquetes (polls) | `$anti-enquete on/off` | 🔶 PLACEHOLDER |
| `$anti-video` | Apaga vídeos | `$anti-video on/off` | 🔶 PLACEHOLDER |
| `$anti-localização` | Apaga compartilhamento de localização | `$anti-localização on/off` | 🔶 PLACEHOLDER |
| `$antibutton` | Apaga mensagens com botões (interativas) | `$antibutton on/off` | 🔶 PLACEHOLDER |
| `$anti-gif` | Apaga GIFs animados | `$anti-gif on/off` | 🔶 PLACEHOLDER |

**Notas técnicas:**
- O WWebJS entrega o tipo em `msg.type` (`chat`, `audio`, `image`, `sticker`, `video`, `poll`, `location`, `ptt`, `buttons`, `list`, `document`, etc).
- O `processAutoMod` já tem o esqueleto de REGRAS; basta adicionar uma REGRA por tipo que checa `msg.type` e o toggle correspondente.
- `anti-card`/`antibutton` esbarram na limitação do Store do WA Web com contas `@lid` (cards não materializam no `Msg.byChat`) — investigado no card MI065085 (AI_HANDOFF.md). Pode precisar de abordagem via `message_create` + `_data`.

---

## 2. COMANDOS PLACEHOLDER (no código, mas não funcionais)

| Comando | Sintaxe hoje | O que deveria fazer | Status |
|---------|--------------|---------------------|--------|
| `$alarme` | `$alarme` | Definir alarme recorrente/pontual que o bot avisa | 🔶 PLACEHOLDER ❌ MENU (`msg.reply('ainda não implementado')`) |
| `$lembrete` | `$lembrete` | Criar lembrete com tempo que o bot avisa depois | 🔶 PLACEHOLDER ❌ MENU |
| `$nick` | `$nick` | Alterar apelido de alguém no grupo | 🔶 PLACEHOLDER ❌ MENU |
| `$sorteio` | `$sorteio` | Sortear participantes do grupo | 🔶 PLACEHOLDER ❌ MENU (aparece em JOGOS) |
| `$addcmd` | `$addcmd <groupId> <texto>` | Adicionar comando customizado com resposta | 🔧 PARCIAL ❌ MENU (só salva texto, não tem resposta associada) |

---

## 3. PENDÊNCIAS "DEPOIS VEMOS" (que o dono adia)

| Pendência | Por que está pendente | Status |
|-----------|----------------------|--------|
| **Boas-vindas de reentrada** | `handleMemberJoin` tem `// TODO: implementar storage de histórico de membros` (adapter linha 546/549). Hoje sempre manda "Bem-vindo" mesmo quem já estava. | ⏳ PENDENTE (bem-vindo fica por último, conforme dono) |
| **Card MI065085 (Figurinhas)** | Investigação de apagar card de cassino. FASE 4 concluída: não localizado nos mecanismos, Store.Chats inexistente. Não provado impossível. | ⏳ ABERTO (ver AI_HANDOFF.md / CARD_PENDING.md) |
| **Histórico de membros** | Necessário p/ bem-vindo de volta e p/ antibots detectar reentrada. Não implementado. | ⏳ PENDENTE |
| **Multi-plataforma (Telegram/Discord) espelhamento** | Adapters existem mas com stubs (Discord só sendMessage). Não validado ao vivo. | ⏳ PENDENTE (não testado) |
| **Comando `$votar`/`$voto`/`$delvoto`** | No menu? Pendente de revisão (vários comandos de voto). | ⏳ PENDENTE |
| **Comandos de boas-vindas (vários)** | Dono quer rever/listar comandos de welcome (bemvindo/setwelcome/reentrada). | ⏳ PENDENTE (por último) |

---

## Como implementar um placeholder (guia p/ próxima sessão)

1. Adicionar campo em `GroupModConfig` (`databaseService.ts`) + `MOD_FIELDS` + `statusLine` + `ALIASES` em `modToggle.ts`.
2. Adicionar REGRA no `processAutoMod` (checar `msg.type` + toggle) OU comando em `src/bot/commands/`.
3. Registrar em `index.ts`.
4. Se for toggle de mídia: contar infração em DB (3 strikes) usando `recordInfraction`/`infractions.ts`.
5. Atualizar `COMANDOS_PUBLICOS.md` (✅ quando测试ado) e remover daqui.

**Última Atualização:** 2026-08-19
**Responsável:** WarriorBlack / Hermes
