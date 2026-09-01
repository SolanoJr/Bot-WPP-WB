# Plano Médio Prazo — Melhorias de Codebase

## 🎯 Objetivo
Elevar a qualidade do codebase através de melhorias estruturais, limpeza de código e otimizações, mantendo 100% de estabilidade nas 4 suites críticas.

## 📋 Tarefas Identificadas

### 1. `keywordHandler.test.ts` — Isolar mocks do aiService
- **Arquivo**: `tests/unit/keywordHandler.test.ts`
- **Problema**: Mock `vi.mock('../../src/services/aiService')` interfere no contexto
- **Solução**: 
  - Usar `vi.isolate()` para escopo do mock
  - Ou reestruturar o teste para não depender do mock global
  - Ou mock mais específico apenas do que é necessário
- **Arquivos envolvidos**: `tests/unit/keywordHandler.test.ts`, `src/services/aiService.ts`
- **Risco**: Baixo (apenas teste)
- **Prazo**: 1 sessão

### 2. `commands-registry.test.ts` — Injetar env vars
- **Arquivo**: `tests/unit/commands-registry.test.ts`
- **Problema**: `ondeestou` precisa de `WARRIOR_AUTH_KEY` + `RELAY_URL`
- **Solução**: Adicionar `beforeEach` com env vars
- **Arquivos envolvidos**: `tests/unit/commands-registry.test.ts`
- **Risco**: Baixo (apenas teste)
- **Prazo**: 1 sessão

### 3. `memberJoinService.test.ts` — Ajustar makeCtx
- **Arquivo**: `tests/unit/memberJoinService.test.ts`
- **Problema**: `makeCtx()` não inclui `event: { groupId, members }`
- **Solução**: Incluir `event` nos objetos de contexto nos testes
- **Arquivos envolvidos**: `tests/unit/memberJoinService.test.ts`
- **Risco**: Baixo (apenas teste)
- **Prazo**: 1 sessão

### 4. Limpeza de arquivos órfãos
- **Arquivos**: Verificar `git status` em busca de arquivos marcados
- **Problema**: Arquivos deletados do git mas ainda presentes, ou vice-versa
- **Solução**: 
  - `git status --short` para identificar
  - `git ls-files` para verificar arquivos rastreados
  - Remover referências órfãs se necessário
- **Arquivos envolvidos**: `package-lock.json`, `package.json`, arquivos de teste
- **Risco**: Baixo (limpeza)
- **Prazo**: 1-2 sessões

### 5. Verificar package-lock.json e package.json
- **Arquivos**: `package-lock.json`, `package.json`
- **Problema**: Dependências desatualizadas ou conflitantes
- **Solução**: 
  - `npm ls --depth=0` para verificar dependências diretas
  - `npm audit` para segurança
  - Atualizar versões quando crítico
- **Arquivos envolvidos**: `package-lock.json`, `package.json`
- **Risco**: Baixo/Médio (dependências)
- **Prazo**: 1 sessão

### 6. Verificar Git e sincronização
- **Arquivos**: Todo repositório
- **Problema**: Confirmar branch, commits, divergências
- **Solução**: 
  - `git status`
  - `git log --oneline -5`
  - `git log --oneline main..origin/main`
  - `git diff --stat`
- **Arquivos envolvidos**: Todo repositório
- **Risco**: Baixo
- **Prazo**: 1 sessão

### 7. Auditoria de produção (quando tiver acesso)
- **Arquivos**: SSH access `solanojr@100.101.218.16`
- **Problema**: Validar consistência entre Windows/GitHub/Linux
- **Solução**: 
  - `git status` no servidor
  - `git log --oneline -3`
  - `pm2 list`
  - Verificar processo e healthcheck
- **Arquivos envolvidos**: Servidor de produção
- **Risco**: Médio (produção)
- **Prazo**: Quando autorizado

## 📊 Prioridades

| Prioridade | Tarefa | Arquivo | Estimativa |
|------------|--------|---------|------------|
| **Alta** | 3 testes isolados | Tests unitários | 3 sessões |
| **Média** | Limpeza de arquivos órfãos | Todo repo | 1-2 sessões |
| **Média** | Verificar dependências | package.json / lock | 1 sessão |
| **Média** | Git sync verification | Repositório | 1 sessão |
| **Baixa** | Auditoria produção | Servidor | Quando autorizado |

## 📈 Impacto Esperado

- **Sem risco** para a estabilidade (todos testes isolados)
- **Qualidade de código** elevada
- **Manutenibilidade** aumentada
- **Zero downtime** garantido
- **Deploy** continua pronto

## 🛠️ Comandos Úteis

```bash
# Verificar status Git
git status
git log --oneline -5
git diff --stat

# Verificar dependências
npm ls --depth=0
npm audit

# Verificar testes
npx vitest run --reporter=verbose

# Verificar typecheck
npx tsc --noEmit --ignoreDeprecations 6.0

# Verificar build
npm run build
```
