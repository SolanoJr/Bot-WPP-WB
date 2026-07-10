# 🧠 PROJECT MEMORY - Bot-WPP Multiplataforma

## 🎯 Objetivo do Projeto
Transformar um bot de WhatsApp em uma plataforma unificada (WhatsApp, Telegram, Discord) com interoperabilidade (relay) e alta confiabilidade.

## 🛠️ Diretrizes de Engenharia
- **Código Limpo:** TypeScript estrito, separação de preocupações.
- **Segurança:** Segredos apenas em `.env`, validação rigorosa de entradas.
- **Resiliência:** Fallbacks inteligentes para permissões e conexões.
- **Sincronização:** Codebase idêntico entre Linux (Prod), Windows (Dev) e Git.

## 🏗️ Arquitetura Atual
- `src/core`: Ponto de entrada híbrido.
- `src/services`: Lógica de negócio compartilhada (AI, Banco de Dados, Moderação).
- `src/bot/commands`: Comandos universais que funcionam em qualquer plataforma.
- `src/relay`: Ponte de comunicação entre grupos/plataformas.

## 📝 Log de Alterações e Decisões
- **2026-07-10:** Inicialização da fase de Unificação Multiplataforma.
- **2026-07-10:** Migração para Gemini 1.5 Flash (Quota de 1500 req/dia).
- **2026-07-10:** Correção de vulnerabilidades (Dependabot) via `overrides`.
- **2026-07-10:** Configuração do CI/CD para suportar Tailscale no deploy.

## 🐛 Bugs e Falhas Conhecidas
- Falha na detecção de ADMIN em alguns grupos (WWebJS vs Reality).
- Comandos cruzados tentando acessar APIs de plataforma errada.

## 🔒 Credenciais (Mapeamento .env)
- `TELEGRAM_BOT_TOKEN`: OK
- `DISCORD_TOKEN`: OK
- `GEMINI_API_KEY`: OK
- `WARRIOR_AUTH_KEY`: OK
### 2026-07-10: Atualização de Ecosystem e Tipagem
- Corrigido caminho CWD no ecosystem.config.js para o usuário solanojr.
- Adicionada interface IBotMessage em shared/types.ts para suporte multiplataforma.
### 2026-07-10: Estrutura Multiplataforma Implementada
- Criados src/telegram/telegramBot.ts e src/discord/discordBot.ts.
- Refatorado src/services/messageHandler.ts para suportar mensagens universais.
- Atualizado src/core/index.ts para inicializar as 3 plataformas simultaneamente.
### 2026-07-10: Refatoração de Permissões
- Atualizada função isMaster para suportar IDs do Telegram e Discord.
- Implementada nova função isAdmin assíncrona com verificação específica por plataforma (API de membros do Telegram/Discord) e fallback para PV.
### 2026-07-10: Fallback de Permissões WhatsApp
- Adicionada recarga forçada de chat (getChatById) na função isAdmin para evitar erros de cache de status admin no WhatsApp.
- Melhorada detecção de chats privados (PV) para garantir que comandos administrativos funcionem para o proprietário do chat.
### 2026-07-10: Auditoria Estruturada
- Atualizada tabela command_logs para incluir platform, success e error_message.
- Centralizado log de comandos no messageHandler.ts (SQLite + Winston).
- Removido log duplicado no comando pergunta.ts.
### 2026-07-10: Consolidação de Memória
- Criado BUG_LOG.md para rastreamento de erros.
- Atualizado PROJECT_MEMORY.md com as últimas decisões de arquitetura.
- Codebase pronto para sincronização com o servidor Linux.
