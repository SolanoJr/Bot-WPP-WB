# PLACEHOLDERS — comandos/utilitários/automações incompletos ou pendentes

> Última atualização: 2026-08-20. Mantido em sincronia com COMANDOS_PUBLICOS.md / COMANDOS_OCULTOS.md.
> Tudo que existe de incompleto OU que o dono anotou como "depois vemos" está aqui.
> Itens removidos do menu estão marcados com ❌ MENU.

Legenda: 🔶 PLACEHOLDER (não funcional) · 🔧 PARCIAL · ⏳ PENDENTE (criar) · ✅ TESTAR (existe, falta validar)

---

## 1. CORRIGIR + TESTAR (já existe no código, falta validar 1 por vez)
| Comando | Arquivo | Status |
|---------|---------|--------|
| `$forca` | forca.ts | ✅ TESTAR |
| `$ban` | ban.ts | ✅ TESTAR |
| `$pergunta` (Gemini) | pergunta.ts | ✅ TESTAR |
| sarcasmo | keywordHandler.ts | ✅ TESTAR (já corrigido p/ não pegar o bot) |
| `$cantada` | cantada.ts | ✅ TESTAR |
| `$fakechat` | fakechat.ts | ✅ TESTAR |
| `$aleatoria` | aleatoria.ts | ✅ TESTAR |
| pergunta/responder glr com IA | pergunta.ts (gemini) | ✅ TESTAR / estender p/ responder grupo |

---

## 2. ANTI-X (por tipo de mídia) — NENHUM existe hoje
Toggle em `group_mod` que, ligado, apaga a mídia e conta infração (3 strikes → kick, nunca ban, exceto bot).
| Toggle | O que faz | Sintaxe | Status |
|--------|-----------|---------|--------|
| `$anti-audio` | apaga áudios/PTT | `$anti-audio on/off` | 🔶 |
| `$anti-imagem` | apaga imagens | `$anti-imagem on/off` | 🔶 |
| `$anti-figurinha` | apaga stickers | `$anti-figurinha on/off` | 🔶 |
| `$anti-card` | apaga cards interativos | `$anti-card on/off` | 🔶 (WA limita leitura de card — ver AI_HANDOFF) |
| `$anti-enquete` | apaga polls | `$anti-enquete on/off` | 🔶 |
| `$anti-video` | apaga vídeos | `$anti-video on/off` | 🔶 |
| `$anti-localização` | apaga localização | `$anti-localização on/off` | 🔶 |
| `$antibutton` | apaga msgs com botões | `$antibutton on/off` | 🔶 |
| `$anti-gif` | apaga GIFs | `$anti-gif on/off` | 🔶 |

**Nota:** melhorar palavras/frases de aposta (cassino/aposta) p/ apagar msg — MAS não apagar quem só fala "cassino" sem link de aposta (complexo, anotado p/ ver depois).

---

## 3. COMANDOS PLACEHOLDER (no código, não funcionais) ❌ MENU
| Comando | Hoje | O que deveria | Status |
|---------|------|---------------|--------|
| `$alarme` | stub "ainda não implementado" | definir alarme recorrente | 🔶 |
| `$lembrete` | stub | criar lembrete com tempo | 🔶 |
| `$nick` | stub | alterar apelido | 🔶 |
| `$sorteio` | stub | sortear participantes | 🔶 |
| `$addcmd` | parcial (só salva texto) | comando customizado c/ resposta | 🔧 |

---

## 4. CRIAR — ZOEIRA / ENGAJAMENTO (pra gente que nunca falou no grupo)
> Todos são "zoeira" pra gerar engajamento. Vamos devagar, sem IA em tudo.
| Comando | Definição do dono | Como funcionaria | Status |
|---------|-------------------|------------------|--------|
| `$ppt` | pedra-papel-tesoura contra o bot | `$ppt pedra` → resultado | ⏳ |
| roleta-russa | "tiro" = ser removido do grupo | `$roleta` → 1/6 chance de kick (zoeira) | ⏳ |
| reações | reagir emoji em msgs | `$reagir` ou auto-react | ⏳ |
| reações em palavras | auto-react quando falam X | palavra-gatilho → emoji | ⏳ |
| marcar resposta (reply) | sempre que citam bot/falam "bot"/comando/aviso | já parcial (bot replya comandos) | 🔧 |
| `$quiz` | perguntas | `$quiz` | ⏳ |
| criação de sticker | imagem→sticker | `$sticker` (baixa img, converte) | ⏳ |
| "qm é o mais (adjetivo)" | frases aleatórias c/ membros | `$mais "gostoso"` → "@X é mais gostoso que @Y" | ⏳ |
| aleatório + % | "porcentagem de inteligência" | `$porcentagem @fulano` ou `$aleatorio adjetivo` | ⏳ |
| avaliação do @ | "analise meu nariz" | `$avaliar @fulano` / `$analise <coisa>` (zoeira) | ⏳ |
| ranquear aleatórios | top 10 aleatórios | `$rank "mais nonito"` | ⏳ |
| `$takefoto` | pede foto, bot manda meme "ficou lindo" | `$foto` → img aleatória da net | ⏳ |
| `$bomdia` | resumo das 09h | **resumo por grupo**: ex. grupo geek → principais notícias geek daquele tipo p/ aquele grupo | ⏳ |
| `$resumo` | resumo da conversa | resumo das msgs recentes do grupo | ⏳ |

---

## 5. MODERAÇÃO EXTRA (warning/unban/admins)
| Comando | O que faz | Status |
|---------|-----------|--------|
| `$warning` | dar aviso (infração leve) | ⏳ |
| `$unban` | desbanir | ⏳ |
| `$admins` | listar admins do grupo e do bot | ⏳ |

---

## 6. GERENCIAR SESSÕES
| Comando | O que faz | Status |
|---------|-----------|--------|
| `$addsession <numero>` | adicionar sessão/número do bot | ⏳ (suspeita: multi-número via WPP_SESSIONS) |
| `$sessions` | listar sessões ativas | ⏳ |

---

## 7. PENDÊNCIAS "DEPOIS VEMOS" (anotadas, não fazer hoje)
- bem-vindo de reentrada (histórico de membros — TODO no adapter)
- card MI065085 (AI_HANDOFF / CARD_PENDING)
- multi-plataforma espelhada (TG/Discord stubs)
- melhorar detecção de aposta sem falsos positivos (só falar "cassino" não apaga)
- comandos de boas-vindas (bemvindo/setwelcome/reentrada) — por último

---

## Guia p/ implementar (próxima sessão)
1. Toggle de mídia: campo em `GroupModConfig` + `MOD_FIELDS` + `statusLine` + `ALIASES` (modToggle.ts).
2. REGRA no `processAutoMod` checando `msg.type` + toggle; contar infração em DB (3 strikes).
3. Comando zoeira: arquivo em `src/bot/commands/`, registrar em `index.ts`, sintaxe no COMANDOS_PUBLICOS.md.
4. `$bomdia`/`$resumo`: criar job cron ou comando que lê histórico do grupo (fetchMessages) e monta resumo (IA opcional).
5. Ao implementar, remover daqui e marcar ✅ no COMANDOS_PUBLICOS.md.
