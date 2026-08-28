# 🐛 Bug Tracker - WarriorBlack Bot

Este documento registra bugs críticos encontrados e suas respectivas soluções para evitar reincidência.

## 1. Comandos Ignorados ($pergunta, $ban)
- **Sintoma**: O bot recebia o comando mas não respondia ou dava erro de "não definido".
- **Causa**: Conflito no `messageHandler.ts` onde a moderação interceptava o comando antes da execução, ou o `dist` estava desalinhado com o `src`.
- **Solução**: 
    - Reordenado o `messageHandler.ts` para que comandos (iniciados com `$`) pulem a moderação.
    - Forçado o uso de `handleKeywords` e `processAutoMod` com importações explícitas no `WhatsAppAdapter.ts`.
    - Atualizado o modelo da IA para `gemini-1.5-flash` para maior estabilidade e cota.

## 2. Gatilho "bot" sem Resposta
- **Sintoma**: Digitar "bot" no chat não gerava a resposta sarcástica.
- **Causa**: O `WhatsAppAdapter.ts` não estava importando ou chamando o `handleKeywords` corretamente após a migração para TypeScript.
- **Solução**: Importado `handleKeywords` no adaptador e adicionado bloco `try/catch` para interceptar a palavra-chave antes de enviar ao processador de comandos.

## 3. Erro no Comando $ban
- **Sintoma**: "client.blockContact is not a function".
- **Causa**: Uso de método inexistente na versão atual do `whatsapp-web.js`.
- **Solução**: Alterado para `contact.block()`, que é o método nativo correto da biblioteca.

## 4. Menu Desatualizado
- **Sintoma**: O menu não mostrava o status do AutoMod mesmo após a atualização.
- **Causa**: O `menu.ts` estava tentando importar de `moderationService` (antigo) em vez de `autoModService` (novo).
- **Solução**: Unificada a fonte de dados para `autoModService.ts` e atualizado o comando `$menu`.

---
*Mantido por Manus AI - Última atualização: Julho 2026*
