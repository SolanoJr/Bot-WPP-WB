# COMANDOS PÚBLICOS (úteis para todos)

> Lista oficial de comandos que aparecem no menu e são úteis para os usuários.
> Atualizado em 2026-08-19. Testar um por vez, na ordem do dono.
> Legenda: ⬜ PENDENTE | ✅ OK | ❌ FALHOU | 🔶 PLACEHOLDER | ⏭️ PULADO
> Data do teste: DD/MM. Sintaxe = como digitar completo.

## ADMIN & MODERAÇÃO
| Comando | Sintaxe | O que faz | Status | Data | Obs |
|---------|---------|-----------|--------|------|-----|
| $automod | `$automod on/off` | Liga/desliga AutoMod (cassino/spam) | ✅ OK | 18/08 | Validado: baniu cassino no Teste + dono testou estado |
| $antispam | `$antispam on/off` | Liga/desliga o bloqueio de SPAM/CASSINO. **Ligado = bot age contra spam**; **desligado = permite spam** | ✅ OK | 19/08 | Dono testou on/off; comportamento confere |
| Proteção MASTER/bot | (automática) | Nenhum comando/kick/ban/mute/AutoMod/troll age no dono (88998314322/@lid) nem no bot | ✅ OK | 19/08 | Implementado em permissions + AutoMod + keywordHandler |
| $antiestrangeiro | `$antiestrangeiro on/off` | Remove QUALQUER estrangeiro (DDI não-BR) na entrada | ✅ OK | 19/08 | Desligado em todos os grupos por padrão (nem todo estrangeiro é bot) |
| $antibotas | `$antibotas on/off` | Remove/BANI bots: prefixo de nome/número conhecido OU estrangeiro+link/card | ✅ OK | 19/08 | LIGADO em todos os grupos; prefixos em autoModService (BOT_NUMBER_PREFIXES/BOT_NAME_PATTERNS) |
| $bemvindo | `$bemvindo <texto>` | Define mensagem de boas-vindas | ⬜ | | |
| $detectar | `$detectar` (ou on/off) | Detecta padrões (toggle) | ⬜ | | |
| $remover | `$remover` (ou on/off) | Remove/bane via AutoMod (toggle) | ⬜ | | |
| $kick | `$kick @usuario` (ou responda à msg) | Remove participante | ⬜ | | Proteção MASTER/BOT |
| $ban | `$ban @usuario` (ou responda à msg) | Banir + blacklist + apaga msg | ⬜ | | Proteção MASTER/BOT |
| $mute | `$mute @usuario` (ou `$mute grupo on/off`) | Silencia 8h (ou modo só-admins) | ⬜ | | Proteção MASTER/BOT |
| $banidos | `$banidos` | Lista banidos | ⬜ | | |
| $grupos | `$grupos` | Lista grupos do bot | ⬜ | | |

## USUÁRIO
| Comando | Sintaxe | O que faz | Status | Data | Obs |
|---------|---------|-----------|--------|------|-----|
| $help | `$help` | Ajuda/lista completa | ⬜ | | |
| $feedback | `$feedback <texto>` | Envia feedback aos donos | ⬜ | | |
| $ondeestou | `$ondeestou` | Diz em qual chat está | ⬜ | | |

## INTELIGÊNCIA
| Comando | Sintaxe | O que faz | Status | Data | Obs |
|---------|---------|-----------|--------|------|-----|
| $pergunta | `$pergunta <sua pergunta>` | Pergunta ao Gemini | ⬜ | | |
| $fakechat | `$fakechat` (ou args) | Gera print fake de chat | ⬜ | | Verificar args |
| $cantada | `$cantada` | Cantadas | ⬜ | | |

## JOGOS & DIVERSÃO
| Comando | Sintaxe | O que faz | Status | Data | Obs |
|---------|---------|-----------|--------|------|-----|
| $jogos | `$jogos` | Menu de jogos | ⬜ | | |
| $forca | `$forca <letra>` (ou comando p/ iniciar) | Jogo da forca | ⬜ | | Verificar início |
| $velha | `$velha <posição>` | Jogo da velha | ⬜ | | |
| $sorteio | `$sorteio` (ou `@todos`) | Sorteia participante | ⬜ | | |
| $piada | `$piada` | Piadas | ⬜ | | |
| $conselho | `$conselho` | Conselhos | ⬜ | | |
| $aleatoria | `$aleatoria` | Mensagem aleatória | ⬜ | | |

## UTILITÁRIOS
| Comando | Sintaxe | O que faz | Status | Data | Obs |
|---------|---------|-----------|--------|------|-----|
| $clima | `$clima <cidade>` | Previsão do tempo | ⬜ | | |
| $gtts | `$gtts <texto>` | Texto vira áudio | ⬜ | | |
| $addcmd | `$addcmd <nome> <resposta>` | Adiciona comando custom | ⬜ | | |

## AUTOMAÇÕES (toggles, não digitadas direto — usam on/off acima)
- AutoMod: ✅ validado | antiestrangeiro: ⬜ | antilink: ⬜ | bemvindo: ⬜ | detectar/remover: ⬜
