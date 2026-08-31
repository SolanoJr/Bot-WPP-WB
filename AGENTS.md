# AGENTS.md: Diretrizes para Agentes de IA no Projeto Bot-WPP

## 1. Introdução

Este documento estabelece as diretrizes e responsabilidades para Agentes de Inteligência Artificial (IAs) que interagem com o projeto Bot-WPP. O objetivo é garantir que todas as operações sejam realizadas de forma organizada, segura, testada e alinhada com as melhores práticas de engenharia, promovendo a estabilidade e a evolução contínua do sistema.

## 2. Papéis e Responsabilidades dos Agentes

Os agentes de IA podem assumir diversos papéis dentro do ciclo de vida do Bot-WPP. Abaixo estão os papéis principais e suas responsabilidades:

### 2.1. Agente de Desenvolvimento (Development Agent)

-   **Responsabilidades:**
    -   Implementar novas funcionalidades e comandos para o bot.
    -   Refatorar código existente para melhorar a performance, legibilidade e manutenibilidade.
    -   Garantir que o código esteja em conformidade com os padrões de codificação estabelecidos (ESLint, Prettier).
    -   Criar e atualizar testes unitários e de integração para novas e existentes funcionalidades.
    -   Realizar revisões de código automatizadas.
    -   Manter a documentação técnica (`README.md`, `ARCHITECTURE.md`, `AGENTS.md`) atualizada em relação às suas modificações.
-   **Interação:** Trabalha primariamente com o código fonte (`src/`), arquivos de configuração e scripts de build.

### 2.2. Agente de Testes (Testing Agent)

-   **Responsabilidades:**
    -   Executar suítes de testes existentes (unitários, integração, end-to-end).
    -   Identificar lacunas na cobertura de testes e propor/implementar novos testes.
    -   Reportar falhas de teste de forma clara e concisa.
    -   Realizar testes de regressão após cada alteração significativa.
    -   Validar a funcionalidade dos comandos e serviços críticos.
-   **Interação:** Utiliza os scripts de teste (`npm test`, `vitest`) e analisa os resultados.

### 2.3. Agente de Documentação (Documentation Agent)

-   **Responsabilidades:**
    -   Manter a documentação do projeto (`README.md`, `ARCHITECTURE.md`, `AGENTS.md`, `docs/`) sempre atualizada e compreensível.
    -   Garantir que a documentação reflita o estado atual do código e da arquitetura.
    -   Criar diagramas e fluxogramas para ilustrar processos e arquitetura.
    -   Assegurar que a documentação seja acessível e fácil de navegar.
-   **Interação:** Lê e escreve arquivos Markdown, gera diagramas (Mermaid, D2).

### 2.4. Agente de Deploy (Deployment Agent)

-   **Responsabilidades:**
    -   Automatizar o processo de build e deploy do bot para os ambientes de staging e produção (servidor Linux).
    -   Garantir que as dependências sejam instaladas corretamente (`npm ci`).
    -   Monitorar o status do serviço após o deploy (via PM2).
    -   Realizar rollbacks em caso de falhas críticas pós-deploy.
    -   Manter a sincronização do código entre o repositório local (Windows), GitHub e o servidor Linux.
-   **Interação:** Utiliza scripts de shell (`sync_and_deploy.sh`), comandos `git`, `npm` e `pm2` via SSH.

### 2.5. Agente de Manutenção e Monitoramento (Maintenance & Monitoring Agent)

-   **Responsabilidades:**
    -   Monitorar a saúde e performance do bot em produção.
    -   Identificar e diagnosticar problemas em tempo real (logs, métricas).
    -   Aplicar patches e correções rápidas para bugs críticos.
    -   Gerenciar logs e alertas.
    -   Propor melhorias de infraestrutura e otimização de recursos.
-   **Interação:** Analisa logs, executa comandos de diagnóstico via SSH, interage com ferramentas de monitoramento.

## 3. Diretrizes de Interação e Segurança

-   **Comunicação Clara:** Todas as ações e decisões devem ser comunicadas de forma clara e justificada, especialmente ao usuário humano.
-   **Segurança em Primeiro Lugar:** Agentes devem sempre priorizar a segurança. Isso inclui:
    -   **Validação de Entradas:** Nunca confiar em entradas externas sem validação rigorosa.
    -   **Gerenciamento de Credenciais:** Utilizar variáveis de ambiente (`.env`) e evitar hardcoding de chaves sensíveis.
    -   **Acesso Mínimo:** Operar com o menor privilégio necessário para a tarefa.
    -   **Auditoria:** Registrar ações importantes para fins de auditoria e depuração.
-   **Idempotência:** Operações de deploy e manutenção devem ser idempotentes, ou seja, podem ser executadas múltiplas vezes sem causar efeitos colaterais indesejados.
-   **Reversibilidade:** Sempre que possível, as ações devem ser reversíveis (ex: backups antes de grandes alterações, capacidade de rollback).
-   **Perguntar em Caso de Dúvida:** Se houver incerteza sobre a melhor abordagem ou o impacto de uma ação, o agente DEVE perguntar ao usuário humano antes de prosseguir.
-   **Atualização Contínua:** Agentes devem estar cientes das últimas melhores práticas e tecnologias, e propor atualizações quando apropriado.

## 5. Armadilhas Conhecidas (LEIA ANTES DE DEBUGAR)

### 5.1. LOG DO PM2 — arquivo correto
- O log **ATIVO e estável** do bot é `~/.pm2/logs/bot-wpp-stable.out.log` (configurado em `ecosystem.config.js` com `merge_logs` + `out_file` fixo).
- `bot-wpp-out.log` / `bot-wpp-error.log` na raiz são **antigos (06/Ago)** e NÃO refletem o estado atual. `bot-wpp-out-0.log` também existe (rotate legado) mas o canônico é o `bot-wpp-stable.out.log`.
- **Nunca** conclua "bot não conecta / não autentica" lendo `bot-wpp-out.log`. Use `bot-wpp-stable.out.log` ou `pm2 logs bot-wpp`.
- Prova de que o bot está online aparece assim no log estável:
  ```
  [YYYY-MM-DD HH:MM:SS] [WhatsApp] ✅ Pronto como WarriorBlack (558581344211@c.us)
  [YYYY-MM-DD HH:MM:SS] [WhatsApp] ✅ Mensagem de prova ENVIADA para 558581344211@c.us
  ```

### 5.2. Chromium headless + WhatsApp Web moderno
- O WA Web moderno **exige WebGL** para renderizar a tela de QR. Sem `--use-gl=swiftshader`, o Chromium trava no splashscreen (sem QR, sem erro, CPU 0).
- Use sempre: `--use-gl=swiftshader --enable-webgl --ignore-gpu-blocklist` + `userAgent` de Chrome real no `puppeteerConfig`/`Client` do `WhatsAppAdapter`.
- `qrcode-terminal` DEVE estar instalado (já está em `package.json`); o código usa `qrcode-terminal`, NÃO `qrcode` (não instalar `qrcode` solto).
- Timeout de diagnóstico de "não autenticou" é **240s** (swiftshader demora ~90s só para gerar o QR; 90s é falso-positivo).

### 5.3. Arquitetura atual (não confundir com a doc legada)
- **Entry point real do PM2:** `dist/core/multiPlatform.js` (configurado em `ecosystem.config.js`). O sistema multi-plataforma (`PlatformManager` + adapters) É o ativo.
- **Multi-número:** `src/services/sessionManager.ts` lê `WPP_SESSIONS` (CSV de números) e cria 1 `WhatsAppAdapter` por número (authDir isolado `sessions/<phone>`), registrado no `PlatformManager` como `whatsapp:<phone>`. Se `WPP_SESSIONS` vazio → modo legado (1 sessão `whatsapp`). `PlatformType` é `string` (não union).
- Detalhes de anti-regressão estrutural: `docs/ARCHITECTURE_FIXES.md` (tratamento `@lid`, despacho `startAll`, AutoMod desacoplado, **multi-sessão seção 9**, Baileys seção 10).

### 5.4. Sincronização de ambientes
- Windows (dev) → GitHub → Linux (PM2). Sempre `git pull` no Linux + `npm run build` + `pm2 restart` (ou `pm2 delete` + `pm2 start ecosystem.config.js` se mudou log) após push.
- O bot Linux está online; **não fazer `pm2 stop`/`restart` em loop** durante investigação — isso gera processos zumbis (Chromium) que saturaram a CPU (load 15) e impediam o QR.
- Ver BUG_TRACKER.md (último: BUG 39) para histórico completo.

### 5.5. Screen Sharing (`$screen`) — topologia e regras
- **Screen server (original Jc007zZ/discord-screen):** `src/services/discord-screen/` (WebCodecs + WebSocket + Express SPA). Roda via **systemd `bot-wpp-screen.service`** na porta **3003** (`DISCORD_SCREEN_PORT`), NÃO via PM2 (o `screen-server` foi removido do `ecosystem.config.js` — conflito de porta; systemd é o dono).
- **HTTPS:** Tailscale Funnel → `https://ubuntu.tail8486e7.ts.net` → `http://127.0.0.1:3003` (systemd `tailscale-funnel.service`, `Restart=always`). WebCodecs **exige HTTPS**; HTTP não funciona. Cloudflare Tunnel bloqueado por firewall (QUIC/UDP 7844); localtunnel instável — Funnel é o caminho estável.
- **Discord Activity:** Developer Portal → Activity URL `https://ubuntu.tail8486e7.ts.net`, Redirect URI `https://ubuntu.tail8486e7.ts.net/auth/callback`.
- **`$screen`:** `src/bot/commands/screen.ts` cria guest session (`POST /api/session-guest`) + sala (`POST /api/rooms/create`) no 3003, responde com 2 links: **Transmitir** (`shareUrl`, role `broadcaster`) e **Assistir** (`viewerToken`, role `viewer`). Ambos ~100-110 chars (token compacto `room.uid.name.role.exp.sig` em `tokens.js`) — cabem no Discord sem truncar.
- **Build do screen server:** `npm run build` (ou `build:screen-server`) copia `src/services/discord-screen/*.js` → `dist/services/discord-screen/` automaticamente. O `index.js` lê `DISCORD_SCREEN_PORT` e `DISCORD_SCREEN_PUBLIC_ORIGIN` do env (default 3003 / localhost:3003).
- **Teste automatizado:** `testServer` na porta 3004 injeta comandos (`curl -X POST http://127.0.0.1:3004/test -d '{"platform":"discord","command":"$screen"}'`). O `PlatformManager` real fica em `globalThis.__platformManager` (defesa contra bundle scopes do tsup); `testServer.ts` usa `getInstance()` + `getAdapter()` (API pública, sem acesso a privados).
- **Typecheck:** `npm run typecheck` (`tsc --noEmit`, com `ignoreDeprecations: 6.0`). **0 erros** (BUG 37 resolvido — dívida histórica de typecheck foi zerada). Manter 0 erros em todo commit.

### 5.6. Singleton do PlatformManager (anti-padrão conhecido)
- O `PlatformManager` é singleton estático (`getInstance()`), mas o bundler (tsup) pode criar escopos de módulo separados por bundle. `multiPlatform.ts` publica a instância viva em `globalThis.__platformManager`; `testServer.ts` resolve via `getInstance()` caindo para o global. **Não remover o `globalThis`** — ele é a ponte cross-bundle intencional. Acessar `pm.adapters` (privado) de fora está proibido; use `getAdapter(platform)`.

## 4. Política de Atualização do AGENTS.md

Este documento deve ser revisado e atualizado sempre que houver uma mudança significativa nos papéis dos agentes, nas diretrizes de segurança, ou na arquitetura do projeto. As atualizações devem ser propostas pelo Agente de Documentação ou por qualquer outro agente que identifique a necessidade, e aprovadas pelo usuário humano ou por um Agente de Governança (se definido).
