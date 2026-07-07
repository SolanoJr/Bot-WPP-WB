# Bot-WPP: Bot de WhatsApp com IA e Comandos

## Visão Geral do Projeto

O Bot-WPP é um bot de WhatsApp multifuncional desenvolvido para automatizar interações, fornecer informações e gerenciar grupos. Ele integra capacidades de inteligência artificial (via Gemini API) para respostas mais inteligentes e um sistema de comandos robusto para diversas funcionalidades. O projeto é construído com Node.js e TypeScript, utilizando o `whatsapp-web.js` para interação com o WhatsApp e um serviço de relay para funcionalidades estendidas.

## 🏗️ Arquitetura Atual (v2.0.0-TS-STABLE)

O sistema foi totalmente migrado para **TypeScript** e utiliza uma arquitetura distribuída e modular:

-   **Bot (Linux VPS)**: Cliente WhatsApp Web em TypeScript que processa comandos, moderação e polling.
-   **AutoMod Avançado**: Sistema de segurança proativo que intercepta spam interativo, filtra DDI estrangeiro e aplica punições imediatas (ban/delete).
-   **Relay (Render)**: Servidor Node.js agindo como buffer intermediário para geolocalização e comandos customizados.
-   **Frontend (Cloudflare Pages)**: Interface web para captura de coordenadas GPS.

## Estrutura do Projeto

O projeto segue uma estrutura modular, com os principais componentes:

-   `src/`: Código fonte principal do bot.
    -   `src/bot/`: Contém a lógica de carregamento e registro de comandos.
        -   `src/bot/commands/`: Módulos individuais para cada comando do bot.
    -   `src/services/`: Serviços auxiliares como manipulação de mensagens, moderação, permissões, e integração com IA.
    -   `src/relay/`: Código para o serviço de relay (API externa).
    -   `src/whatsapp.ts`: Ponto de entrada principal do bot, responsável pela inicialização e gerenciamento de eventos do WhatsApp.
-   `dist/`: Saída dos arquivos TypeScript compilados para JavaScript.
-   `.env`: Arquivo de configuração de variáveis de ambiente.
-   `ecosystem.config.js`: Configuração para gerenciamento de processos com PM2.

## 🔐 Protocolo de Segurança

O sistema utiliza a chave **WARRIOR_AUTH_KEY** (16 caracteres) para autenticar todas as pontas:
-   **Frontend -> Relay**: POST `/location` com header `x-api-key`.
-   **Bot -> Relay**: GET `/pending/:chatId` com header `x-api-key`.

## 🚀 Configuração de Ambiente

### Pré-requisitos

-   Node.js (versão 24.x recomendada para Windows, 20.x+ para Linux)
-   npm (gerenciador de pacotes do Node.js)
-   PM2 (para gerenciamento de processos em produção no Linux)
-   Conta no Google Cloud com acesso à Gemini API (Modelo: `gemini-2.0-flash`)

### Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto, baseado no `.env.example`, e preencha as seguintes variáveis:

-   `MASTER_USER`: Número de telefone do usuário mestre do bot (ex: `5511999999999@c.us`).
-   `GEMINI_API_KEY`: Sua chave da API Gemini para integração com IA.
-   `WARRIOR_AUTH_KEY`: Chave de autenticação para o serviço de relay.
-   `RELAY_URL`: URL do serviço de relay (ex: `https://bot-wpp-relay.onrender.com`).
-   Outras variáveis conforme necessário para funcionalidades específicas (ver `.env.example`).

### Portas e Endereços
-   **Relay**: Rodando em `https://bot-wpp-relay.onrender.com` (Porta padrão 443).
-   **Frontend**: Hospedado em `https://bot-wpp-wb-sc.pages.dev`.

## 🛠️ Scripts Disponíveis

-   `npm start`: Inicia o Relay (específico para deploy no Render).
-   `npm run bot:start`: Inicia o Bot do WhatsApp.
-   `npm test`: Executa a suite de testes de integração e segurança.

## Instalação

1.  **Clonar o repositório:**
    ```bash
    git clone https://github.com/SolanoJr/Bot-WPP-WB-SC.git
    cd Bot-WPP-WB-SC
    ```
2.  **Instalar dependências:**
    ```bash
    npm install
    ```
3.  **Compilar o projeto:**
    ```bash
    npm run build
    ```

## Como Executar o Bot

### Desenvolvimento (com `tsx` e `nodemon`)

Para executar o bot em modo de desenvolvimento com recarregamento automático:

```bash
npm run dev:relay # Para o serviço de relay
npm run bot:start # Para o bot principal
```

### Produção (com PM2 no Linux)

No servidor Linux, após a instalação e compilação, use o PM2 para gerenciar o bot:

```bash
pm2 start ecosystem.config.js
pm2 save
```

Para reiniciar o bot após atualizações:

```bash
pm2 restart bot-wpp
```

## Fluxo de Mensagens e Processamento de Comandos

Quando uma mensagem é recebida pelo bot (`src/whatsapp.ts`), ela passa pelo `src/services/messageHandler.ts`:

1.  **Verificação de Comando:** A mensagem é primeiramente verificada para determinar se é um comando (começa com `$`).
2.  **Moderação e Palavras-Chave (para não-comandos):** Se a mensagem *não* for um comando, ela passa pelos serviços de moderação (`src/services/moderationService.ts`) e manipulação de palavras-chave (`src/services/keywordHandler.ts`). Estes serviços podem interceptar, apagar ou responder a mensagens baseadas em conteúdo suspeito ou palavras-chave específicas.
3.  **Execução de Comando:** Se a mensagem for um comando e não for interceptada, o `messageHandler` tenta encontrar e executar o comando correspondente no mapa de comandos carregados (`src/bot/commands/index.ts`).
4.  **Comandos Customizados (Fallback):** Se o comando não for encontrado localmente, o bot tenta buscar e executar comandos customizados configurados no serviço de relay.

## Solução de Problemas Comuns

### Comandos não respondem ou mensagens são apagadas

**Causa:** As lógicas de moderação (`src/services/moderationService.ts`) e manipulação de palavras-chave (`src/services/keywordHandler.ts`) podem estar interceptando mensagens antes que elas cheguem ao processador de comandos.

-   `moderationService.ts`: Pode apagar mensagens com links ou palavras como "aposta", "bet", etc., especialmente na primeira mensagem de um usuário.
-   `keywordHandler.ts`: Pode responder sarcasticamente ou apagar mensagens que contenham "bot" ou frases de "trollagem".

**Solução:** As correções implementadas ajustam a ordem de processamento para que comandos legítimos (iniciados com `$`) ignorem essas verificações de moderação e palavras-chave, garantindo que sejam processados corretamente. Verifique se as alterações em `src/services/messageHandler.ts` e `src/services/keywordHandler.ts` estão aplicadas.

## Contribuição

Para contribuir com o projeto, por favor, siga as diretrizes de código e submeta Pull Requests para a branch `main`.

---
*Backup de estabilidade disponível na branch: `stable-js-working-v1`*
