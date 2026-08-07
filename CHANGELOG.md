# 📜 ChangeLog - WarriorBlack Bot

## [v1.0.0-JS-STABLE] - 2026-04-30
### 🚀 Estabilização e Blindagem de Produção

#### Adicionado
- **Novo Protocolo de Autenticação**: Implementada a variável `WARRIOR_AUTH_KEY` (16 caracteres) substituindo o sistema legado.
- **Middleware Manual de CORS**: Interceptor de Pre-flight (`OPTIONS`) respondendo com `204 No Content` para eliminar erros de `Failed to fetch`.
- **Diagnóstico Profundo**: Rota `/debug-env-check` no Relay para validar comprimentos de chaves e status de variáveis de ambiente.
- **Sanitização de URL**: Lógica no Frontend para remover automaticamente sufixos de porta (ex: `:296`) injetados por erro.

#### Alterado
- **Arquitetura Zero-Native (Anti-GLIBC)**: Remoção completa da dependência do SQLite no Relay. O armazenamento agora é **In-Memory** (Pure JS), resolvendo definitivamente os erros de `GLIBC_2.38` no Render.
- **Downgrade de Ambiente**: Node.js ajustado para **v20.x (LTS)** no `package.json` para máxima estabilidade em containers Linux.
- **Sincronização de Parâmetros**: Frontend e Bot agora utilizam `warriorKey` como padrão de comunicação.

#### Corrigido
- **CORS Pre-flight**: Erro de cabeçalho `x-api-key` não permitido resolvido com `Access-Control-Allow-Headers` explícito.
- **Polling Authentication**: Corrigido erro `401` no Bot ao tentar capturar localizações no Relay sem a chave Warrior.
- **Erro de Módulo**: Dependências `cors`, `express` e `dotenv` reinstaladas e formalizadas no `package.json`.

---

## [v1.1.1] - 2026-08-06
### 🔧 Recuperação de Produção (Bot Offline no Linux)

#### Corrigido
- **WhatsApp offline por ProtocolError de Puppeteer** (`Page.navigate timed out` / `Runtime.callFunctionOn timed out` durante `whatsapp-web.js` init).
  - **Causa:** o `dist/` do Linux não continha `protocolTimeout` no `puppeteerConfig` do `WhatsAppAdapter`. A máquina virtual do Linux reinicia eventualmente e o processo caía sempre na inicialização.
  - **Solução:** adicionado `protocolTimeout: 180000` ao `puppeteerConfig` em `src/platforms/whatsapp/WhatsAppAdapter.ts` (linha 46). O `whatsapp-web.js` encaminha esse campo para `puppeteer.launch()`, elevando o limite das chamadas CDP.
  - **Arquivo afetado:** `src/platforms/whatsapp/WhatsAppAdapter.ts`
  - **Commit:** `4f34b5e` (main)
- **DNS do Linux não resolvia `github.com`** (`Could not resolve host`). Resolver do container apontava só para o Tailscale DNS.
  - **Solução aplicada no servidor (sudo, manual):** `tailscale set --accept-dns=false` + `resolv.conf` fixo com `nameserver 8.8.8.8` / `1.1.1.1`. Isso reabilita o fluxo canônico Windows→GitHub→`git pull`→build→restart.
  - **Persistência:** `tailscale set --accept-dns=false` é persistente; `resolv.conf` é arquivo fixo (não symlink). Risco de reversão só em reboot completo do container que restaurasse o resolv.conf do PVE.

#### Validação
- `npm run build` OK (Windows e Linux).
- `pm2 restart bot-wpp` → status `online`, WhatsApp "Pronto como WarriorBlack (558581344211@c.us)", AutoMod ativo.
- `grep protocolTimeout dist/core/multiPlatform.js` = 1 ocorrência (fix presente no build de produção).

---

*Este é o estado estável pré-migração para TypeScript.*
