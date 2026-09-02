# Arquitetura do Bot-WPP

## Visão Geral

O Bot-WPP é um sistema distribuído projetado para operar como um bot multi-plataforma (WhatsApp, Telegram, Discord). A arquitetura está em transição entre dois sistemas:

### Sistema Atual (Legado)
- **Bot (Cliente WhatsApp Web)**: O coração do sistema, responsável por interagir diretamente com o WhatsApp. Ele processa mensagens, executa comandos e gerencia a comunicação com o serviço de Relay.
- **Relay (Serviço Intermediário)**: Um servidor Node.js que atua como um buffer e orquestrador. Ele gerencia a comunicação entre o Frontend e o Bot, armazena temporariamente dados de localização e pode hospedar lógica de comandos customizados.
- **Frontend (Interface Web)**: Uma interface web simples para a captura de coordenadas GPS, que envia dados para o Relay.

### Sistema Novo (Multi-Plataforma)
- **PlatformManager**: Orquestrador singleton que gerencia múltiplas plataformas (WhatsApp, Telegram, Discord)
- **PlatformAdapter**: Interface unificada para cada plataforma
- **CommandContext**: Contexto unificado para execução de comandos
- **Entry Point**: `src/core/multiPlatform.ts` (configurado no PM2)

### Estado Atual (2026-08-12 — ATUALIZADO)
✅ **O sistema multi-plataforma (`PlatformManager` + adapters) É o ativo e funciona.** O entry point do PM2 é `dist/core/multiPlatform.js` (ver `ecosystem.config.js`). O engine de WhatsApp é **Baileys** (`@whiskeysockets/baileys`), que conecta via WebSocket **sem Chromium** (o fallback WWebJS/`whatsapp-web.js` foi removido — ver BUG_TRACKER BUG 39; todas as funcionalidades foram acopladas no Baileys).

Comandos são despachados corretamente via `platformManager.startAll()` → `setupAdapterHandlers()` → `onMessage` → `messageHandler`. O bot conecta no WhatsApp (Baileys), Telegram e Discord simultaneamente, e responde a comandos (`$menu`, `$kick`, `$automod`, etc). Ver `ARCHITECTURE_FIXES.md` (na raiz) para regras de anti-regressão (tratamento `@lid`, despacho `startAll`, AutoMod desacoplado, multi-sessão, Baileys como único engine).

> Nota: a seção "Sistema Atual (Legado)" abaixo está retida apenas como histórico; o legado NÃO é mais o sistema ativo.

## Bugs Críticos Recentes

> **Histórico (obsoleto):** O bug "Puppeteer Browser Launch Failed" (2026-08-05) não se aplica mais — o engine WWebJS (Chrome/Chromium via `whatsapp-web.js`/`puppeteer`) foi **removido** (BUG 39). O bot agora usa **Baileys** (WebSocket, sem Chromium), eliminando essa classe de problema.

### TypeError: .for is not iterable (2026-08-05)
**Problema:** Bot entrava em loop de crash na inicialização com erro em `PlatformManager.loadCommands`

**Causa Raiz:** Incompatibilidade de tipos entre `loadCommands()` (retornava `Record`) e `PlatformManager.loadCommands()` (esperava `Map`)

**Solução:**
- Modificado `loadCommands()` para retornar `Map<string, ICommand>`
- Removido `await` de `loadCommands()` em `multiPlatform.ts`
- Adicionado try/catch robusto na inicialização

**Arquivos Modificados:**
- `src/bot/commands/index.ts` (linha 131-136)
- `src/core/multiPlatform.ts` (linha 22-29)

**Status:** ✅ Resolvido

## Diagrama de Arquitetura

### Sistema Legado (Atual)
```mermaid
graph TD
    User[Usuário WhatsApp] -- Mensagem --> WhatsApp[Serviço WhatsApp]
    WhatsApp -- Evento de Mensagem --> Bot[Bot-WPP (Linux VPS)]

    subgraph Bot-WPP (Linux VPS)
        direction LR
        A[src/core/multiPlatform.ts] -- Registra adapters --> B[PlatformManager]
        B -- Recebe PlatformMessage --> C[CommandContext / AutoMod]
        B -- Não é Comando --> D[src/services/keywordHandler.ts]
        B -- É Comando --> E[src/bot/commands/index.ts]
        E -- Executa --> F[Comandos Individuais (src/bot/commands/*)]
        E -- Comando não encontrado --> G[src/services/relayClient.ts]
    end

    subgraph Relay (Render.com)
        direction LR
        H[API REST] -- Recebe Localização --> I[Armazenamento Temporário (In-Memory)]
        J[API REST] -- Fornece Comandos Customizados --> K[Lógica de Comandos Customizados]
    end

    subgraph Frontend (Cloudflare Pages)
        direction LR
        L[Interface Web] -- Envia Localização --> H
    end

    G -- Busca Comandos Customizados --> J
    Bot -- Polling de Localização --> H
    I -- Envia Localização --> Bot
```

### Sistema Multi-Plataforma (Planejado)
```mermaid
graph TD
    User1[Usuário WhatsApp] --> WhatsApp[WhatsApp Adapter]
    User2[Usuário Telegram] --> Telegram[Telegram Adapter]
    User3[Usuário Discord] --> Discord[Discord Adapter]

    subgraph PlatformManager
        direction LR
        WhatsApp --> PM[PlatformManager]
        Telegram --> PM
        Discord --> PM
        PM --> CR[Command Registry]
        PM --> RH[Rate Limiter]
        PM --> DB[Database Service]
    end

    CR --> Commands[Comandos Unificados]
    Commands --> CTX[CommandContext]
    CTX --> Execute[Executar Comando]
```

## Componentes Detalhados

### 1. Bot (Linux VPS) - Sistema Legado

-   **Tecnologia**: Node.js, TypeScript, **Baileys** (`@whiskeysockets/baileys`, WhatsApp via WebSocket sem Chromium).
-   **Funções**:
    -   Conexão e autenticação com o WhatsApp.
    -   Recebimento e processamento de mensagens.
    -   Execução de comandos internos.
    -   Polling do serviço de Relay para localizações pendentes.
    -   Moderação de conteúdo e filtragem de palavras-chave.
    -   Integração com a API Gemini para respostas inteligentes.
-   **Gerenciamento de Processos**: PM2 para garantir alta disponibilidade e reinício automático.
-   **Entry Point**: `src/core/multiPlatform.ts` → `initializePlatforms()`
-   **Comandos**: Assinatura legada `(msg, client, args)`

### 2. PlatformManager (Sistema Novo)

-   **Tecnologia**: Node.js, TypeScript
-   **Funções**:
    -   Gerenciar múltiplas plataformas simultaneamente
    -   Normalizar IDs com prefixos (wpp:, tg:, dc:)
    -   Executar comandos de forma agnóstica
    -   Suportar broadcast entre plataformas
    -   Registry de comandos global
-   **Entry Point**: `src/core/multiPlatform.ts`
-   **Comandos**: Assinatura nova `(ctx: CommandContext)`
-   **Status**: Implementado mas não está sendo usado

### 3. Problemas de Integração

**Entry Point Conflitante:**
- `ecosystem.config.js` aponta para `dist/core/multiPlatform.js`
- `src/core/index.ts` chama `startBot()` do sistema legado
- Isso causa inconsistência no sistema ativo

**Comandos com Problemas:**
- `$ban`: Tem `platforms: ['whatsapp']` mas verificação falha
- `lista1edit`: Usa formato legado sem `CommandContext`
- Outros comandos podem ter problemas similares

**Solução Necessária:**
1. Unificar entry point para usar `multiPlatform.ts`
2. Migrar todos os comandos para `CommandContext`
3. Remover código legado desnecessário

### 2. Relay (Render.com)

-   **Tecnologia**: Node.js, Express.js.
-   **Funções**: 
    -   API REST para receber dados de localização do Frontend.
    -   API REST para fornecer localizações pendentes ao Bot.
    -   API REST para gerenciar e fornecer comandos customizados.
    -   Armazenamento temporário (in-memory) de localizações e metadados de clientes.
-   **Características**: Arquitetura `Pure JS` para evitar problemas de dependências nativas em ambientes de deploy como Render.

### 3. Frontend (Cloudflare Pages)

-   **Tecnologia**: HTML, CSS, JavaScript.
-   **Funções**: 
    -   Interface de usuário para solicitar e capturar a localização GPS do dispositivo.
    -   Envio seguro das coordenadas de localização para o serviço de Relay.

## Fluxo de Dados e Interações Chave

1.  **Inicialização do Bot**: O `src/core/multiPlatform.ts` (entry point do PM2) inicia os adapters (`PlatformManager.startAll()`), conecta o WhatsApp via **Baileys** (WebSocket, sem Chromium), Telegram e Discord, e registra os handlers de mensagem.
2.  **Recebimento de Mensagens**: Qualquer mensagem recebida pelo WhatsApp é encaminhada para `src/services/messageHandler.ts`.
3.  **Processamento de Mensagens**: 
    -   O `messageHandler` primeiro verifica se a mensagem é um comando (começa com `$`).
    -   Se **não** for um comando, a mensagem pode passar pelo `autoModEngine.ts` e pelo `keywordHandler.ts`. Essas etapas podem resultar na exclusão da mensagem ou em uma resposta automática.
    -   Se **for** um comando, ele é processado diretamente. O `messageHandler` tenta encontrar o comando no mapa de comandos carregados (`src/bot/commands/index.ts`).
    -   Se o comando não for encontrado localmente, o `src/services/relayClient.ts` é acionado para buscar comandos customizados no serviço de Relay.
4.  **Sistema de Geolocalização**: 
    -   O Frontend captura a localização do usuário e a envia para o Relay via API.
    -   O Bot periodicamente faz polling no Relay para verificar se há localizações pendentes para os `chatIds` que as solicitaram.
    -   Ao receber uma localização do Relay, o Bot a formata e a envia de volta ao usuário no WhatsApp.

## Protocolo de Segurança

A comunicação entre os componentes é protegida por uma chave de autenticação (`WARRIOR_AUTH_KEY`) que deve ser configurada em todas as pontas (Frontend, Bot, Relay) para garantir que apenas serviços autorizados possam interagir. A chave é enviada no cabeçalho `x-api-key` nas requisições para o Relay.

## Considerações de Design

-   **Modularidade**: O código é organizado em módulos para facilitar a manutenção e a adição de novas funcionalidades.
-   **Escalabilidade**: A separação de responsabilidades entre Bot, Relay e Frontend permite que cada componente seja escalado independentemente.
-   **Resiliência**: O uso de PM2 para o Bot e a arquitetura `Pure JS` para o Relay visam aumentar a robustez do sistema em ambientes de produção.
-   **Segurança**: Implementação de chaves de API e moderação de conteúdo para proteger o sistema contra uso indevido e spam.
