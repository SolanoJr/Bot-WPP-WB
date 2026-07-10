# AGENTS.md: Diretrizes para Agentes de IA no Projeto Bot-WPP

## 1. Introdução

Este documento estabelece as diretrizes e responsabilidades para Agentes de Inteligência Artificial (IAs) que interagem com o projeto Bot-WPP. O objetivo é garantir que todas as operações sejam realizadas de forma organizada, segura, testada e alinhada com as melhores práticas de engenharia, promovendo a estabilidade e a evolução contínua do sistema.

## 2. Papéis e Responsabilidades dos Agentes

Os agentes de IA podem assumir diversos papéis dentro do ciclo de vida do Bot-WPP. Abaixo estão os papéis principais e suas responsabilidades:

### 2.1. Agente de Desenvolvimento (Development Agent)

- **Responsabilidades:**
  - Implementar novas funcionalidades e comandos para o bot.
  - Refatorar código existente para melhorar a performance, legibilidade e manutenibilidade.
  - Garantir que o código esteja em conformidade com os padrões de codificação estabelecidos (ESLint, Prettier).
  - Criar e atualizar testes unitários e de integração para novas e existentes funcionalidades.
  - Realizar revisões de código automatizadas.
  - Manter a documentação técnica (`README.md`, `ARCHITECTURE.md`, `AGENTS.md`) atualizada em relação às suas modificações.
- **Interação:** Trabalha primariamente com o código fonte (`src/`), arquivos de configuração e scripts de build.

### 2.2. Agente de Testes (Testing Agent)

- **Responsabilidades:**
  - Executar suítes de testes existentes (unitários, integração, end-to-end).
  - Identificar lacunas na cobertura de testes e propor/implementar novos testes.
  - Reportar falhas de teste de forma clara e concisa.
  - Realizar testes de regressão após cada alteração significativa.
  - Validar a funcionalidade dos comandos e serviços críticos.
- **Interação:** Utiliza os scripts de teste (`npm test`, `vitest`) e analisa os resultados.

### 2.3. Agente de Documentação (Documentation Agent)

- **Responsabilidades:**
  - Manter a documentação do projeto (`README.md`, `ARCHITECTURE.md`, `AGENTS.md`, `docs/`) sempre atualizada e compreensível.
  - Garantir que a documentação reflita o estado atual do código e da arquitetura.
  - Criar diagramas e fluxogramas para ilustrar processos e arquitetura.
  - Assegurar que a documentação seja acessível e fácil de navegar.
- **Interação:** Lê e escreve arquivos Markdown, gera diagramas (Mermaid, D2).

### 2.4. Agente de Deploy (Deployment Agent)

- **Responsabilidades:**
  - Automatizar o processo de build e deploy do bot para os ambientes de staging e produção (servidor Linux).
  - Garantir que as dependências sejam instaladas corretamente (`npm ci`).
  - Monitorar o status do serviço após o deploy (via PM2).
  - Realizar rollbacks em caso de falhas críticas pós-deploy.
  - Manter a sincronização do código entre o repositório local (Windows), GitHub e o servidor Linux.
- **Interação:** Utiliza scripts de shell (`sync_and_deploy.sh`), comandos `git`, `npm` e `pm2` via SSH.

### 2.5. Agente de Manutenção e Monitoramento (Maintenance & Monitoring Agent)

- **Responsabilidades:**
  - Monitorar a saúde e performance do bot em produção.
  - Identificar e diagnosticar problemas em tempo real (logs, métricas).
  - Aplicar patches e correções rápidas para bugs críticos.
  - Gerenciar logs e alertas.
  - Propor melhorias de infraestrutura e otimização de recursos.
- **Interação:** Analisa logs, executa comandos de diagnóstico via SSH, interage com ferramentas de monitoramento.

## 3. Diretrizes de Interação e Segurança

- **Comunicação Clara:** Todas as ações e decisões devem ser comunicadas de forma clara e justificada, especialmente ao usuário humano.
- **Segurança em Primeiro Lugar:** Agentes devem sempre priorizar a segurança. Isso inclui:
  - **Validação de Entradas:** Nunca confiar em entradas externas sem validação rigorosa.
  - **Gerenciamento de Credenciais:** Utilizar variáveis de ambiente (`.env`) e evitar hardcoding de chaves sensíveis.
  - **Acesso Mínimo:** Operar com o menor privilégio necessário para a tarefa.
  - **Auditoria:** Registrar ações importantes para fins de auditoria e depuração.
- **Idempotência:** Operações de deploy e manutenção devem ser idempotentes, ou seja, podem ser executadas múltiplas vezes sem causar efeitos colaterais indesejados.
- **Reversibilidade:** Sempre que possível, as ações devem ser reversíveis (ex: backups antes de grandes alterações, capacidade de rollback).
- **Perguntar em Caso de Dúvida:** Se houver incerteza sobre a melhor abordagem ou o impacto de uma ação, o agente DEVE perguntar ao usuário humano antes de prosseguir.
- **Atualização Contínua:** Agentes devem estar cientes das últimas melhores práticas e tecnologias, e propor atualizações quando apropriado.

## 4. Política de Atualização do AGENTS.md

Este documento deve ser revisado e atualizado sempre que houver uma mudança significativa nos papéis dos agentes, nas diretrizes de segurança, ou na arquitetura do projeto. As atualizações devem ser propostas pelo Agente de Documentação ou por qualquer outro agente que identifique a necessidade, e aprovadas pelo usuário humano ou por um Agente de Governança (se definido).
