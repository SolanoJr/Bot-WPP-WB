---
# Regras do Projeto

Documento vivo. Qualquer IA que trabalhar neste projeto DEVE ler este
arquivo antes de agir. Se algo aqui conflitar com instrução de sessão, o
arquivo ganha — ele é a memória entre sessões.

## Regra 1 — Preservar por padrão, deletar só o que é lixo real

Ferramentas, comandos, menus, sistemas, planos, features, backlogs:
NUNCA apagar direto. Sempre criar e melhorar.

Se existe algo morto, o trabalho é DESCOBRIR antes de decidir:
1. O que é exatamente
2. Por que está morto (nunca foi usado? superado? quebrou e ninguém
   consertou? nunca foi ligado?)
3. Deveria existir? Deveria ser implementado / revivido?
4. Só então decidir: manter / melhorar / criar / ocultar / deletar

Delete é a ÚLTIMA opção. Aplicável só a:
- Não melhora nada
- Não serve, nunca serviu, nunca vai servir
- Muito antigo
- Ninguém usa
- Redundância pura
- Sem valor arqueológico

Antes de deletar qualquer coisa, registrar em docs/BACKLOG.md:
"Item X — o que é / por que está morto / deveria existir / decisão".
Delete sem essa investigação registrada não é permitido.

## Regra 2 — Comandos visíveis, ocultos e desabilitados

Comando pode estar em 3 estados:
- VISÍVEL: aparece no $menu / $help
- OCULTO: existe, código vivo, responde, mas não aparece no menu.
  Uso interno (master) e testes.
- DESABILITADO: código existe, mas não responde.

Antes de deletar comando por ser "inútil", avaliar se vira OCULTO. Ex.:
$delete como comando público é inútil (WhatsApp já deleta), mas como
ferramenta oculta serve pra testar como o Baileys lida com delete real.

O inventário completo (visible/hidden/disabled) é tarefa pendente e vive
em docs/BACKLOG.md — não decidir caso a caso antes do inventário.

## Regra 3 — Documentação sempre atualizada

A documentação é a memória do projeto. Sobrevive a troca de sessão, troca
de IA, esquecimento humano. Cada mudança estrutural (feature nova, comando
novo, tabela nova, decisão de design) precisa refletir em:
- docs/BACKLOG.md — pendências e features pedidas
- docs/RULES.md — este arquivo (só quando a própria regra muda)
- docs/DECISIONS.md — ADRs e decisões com contexto
- CHANGELOG.md — o que mudou, quando, por quê

Se descobrir algo novo sobre o projeto, documentar. Se algo documentado
estiver errado, corrigir. Não deixar dívida de doc.

## Regra 4 — Investigar antes de agir

Nunca assumir que algo existe. Nunca assumir que não existe.
Para cada item (comando, tabela, campo, fluxo):
1. VERIFICAR se existe
2. Se existe: descobrir o ESTADO (funciona / parcial / morto)
3. Só então DECIDIR (criar / editar / melhorar / ocultar / deletar)

"Código morto" é hipótese até investigação. Pode ser código adormecido
com valor, ou código esquecido que ainda serve.
---
