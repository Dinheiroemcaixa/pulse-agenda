# Walkthrough — Controle de Acesso por Aprovação e Módulo de Configurações (`modernizacao-v3`)

## 1. Visão Geral da Implementação

Implementado o sistema de **Controle de Acesso por Aprovação, Perfis, Permissões por Módulo e Histórico Administrativo**, além do novo card **Configurações** exclusivo do **Programador Principal** (`RAMON CARDOSO` — `ramoncardosobiologo@gmail.com`).

### Contas Existentes Preservadas Integralmente
Nenhuma conta ou dado existente no banco foi removido ou alterado:
- **Programador Principal**: `RAMON CARDOSO` (`ramoncardosobiologo@gmail.com` / `id_1774288221364_jmcbu`) — Acesso administrativo completo e único autorizado a visualizar e operar **Configurações**.
- **Gestora**: `RAFFAELA LIMA` (`raffaelabatistalima1@gmail.com` / `id_1774293514208_f6g52`) — Acesso amplo aos módulos operacionais e visão de tarefas da equipe, sem acesso a **Configurações** ou gestão de permissões.
- **Operadores Ativos**:
  - `Geovana Rayssa Morais` (`geovanarayssamoraisfernandes@gmail.com`)
  - `Andressa Brandão` (`andressabrandao022@gmail.com`)
  - `Monara Cardoso` (`monarageovana.cardoso@gmail.com`)
  - Restritas às próprias tarefas atribuídas (`resp`), sem acesso aos cards **Equipe**, **Backup** e **Configurações**.

---

## 2. Regras de Segurança e Arquitetura Aplicadas

1. **Identidade Imutável do Programador Principal**:
   - Validada em [accessControlApi.ts](file:///c:/Users/BPO04.LMCONTABILIDADE/Documents/Projetos/pulse-agenda/src/lib/accessControlApi.ts) por verificação combinada de ID (`id_1774288221364_jmcbu`) e e-mail (`ramoncardosobiologo@gmail.com`) confirmada no banco (`verifyProgrammerActor`), jamais confiando apenas no campo editável `role` ou `is_admin`.
   - Protegida contra auto-suspensão, recusa ou redução de perfil/permissões.
2. **Fluxo de Novos Cadastros (`Pendente de Aprovação`)**:
   - Em [useAuth.ts](file:///c:/Users/BPO04.LMCONTABILIDADE/Documents/Projetos/pulse-agenda/src/hooks/useAuth.ts), qualquer novo cadastro entra obrigatoriamente com `access_status: 'pending'`, `access_profile: 'operador'` e `is_admin: false`.
   - Enquanto estiver `pending`, `suspended` ou `rejected`, o `App.tsx` renderiza [PendingAccessView.tsx](file:///c:/Users/BPO04.LMCONTABILIDADE/Documents/Projetos/pulse-agenda/src/components/PendingAccessView.tsx) e **não executa** `loadAll()` em [useAppData.ts](file:///c:/Users/BPO04.LMCONTABILIDADE/Documents/Projetos/pulse-agenda/src/hooks/useAppData.ts), impedindo qualquer consulta a tarefas, histórico, equipe ou reuniões.
3. **Isolamento de Dados e Rotas por Perfil**:
   - **Guardas de Rota e URL** ([App.tsx](file:///c:/Users/BPO04.LMCONTABILIDADE/Documents/Projetos/pulse-agenda/src/App.tsx) e [Sidebar.tsx](file:///c:/Users/BPO04.LMCONTABILIDADE/Documents/Projetos/pulse-agenda/src/components/Sidebar.tsx)): bloqueiam acesso via menu, estado ou URL direta (`#settings`, `#team`, `?page=settings`, etc.) para perfis não autorizados.
   - **Isolamento de Consultas e Mutações para Operador** ([useAppData.ts](file:///c:/Users/BPO04.LMCONTABILIDADE/Documents/Projetos/pulse-agenda/src/hooks/useAppData.ts), [TasksPage.tsx](file:///c:/Users/BPO04.LMCONTABILIDADE/Documents/Projetos/pulse-agenda/src/pages/TasksPage.tsx), [TaskModal.tsx](file:///c:/Users/BPO04.LMCONTABILIDADE/Documents/Projetos/pulse-agenda/src/components/TaskModal.tsx)): consultas de `tasks` e `hist` filtram diretamente por `resp` (`.ilike('resp', activeUser.name)`) e todas as mutações (`saveTask`, `completeTask`, `deleteTask`, `cycleStatus`, `reopenTask`, `deleteAtrasada`, subtarefas) validam `canAccessTaskRecord(currentUser, task)`.
   - **Bloqueio de Auto-Promoção**: `sanitizeSelfProfileUpdate` filtra estritamente edições de perfil próprio, removendo `is_admin`, `access_profile`, `access_status` e `permissions`.

---

## 3. Card Configurações ([SettingsPage.tsx](file:///c:/Users/BPO04.LMCONTABILIDADE/Documents/Projetos/pulse-agenda/src/pages/SettingsPage.tsx))

Contém as 5 seções especificadas:
1. **Solicitações pendentes**: dados do solicitante, data do pedido, seletor de perfil inicial (`Operador` / `Gestora`), **Aprovar** e **Recusar**.
2. **Usuários autorizados**: listagem completa com filtro por situação, badges de perfil/status e ações rápidas.
3. **Permissões por usuário**: modal de configuração granular dos módulos reais (`tasks`, `atrasadas`, `history`, `pops`, `meetings`, `messages`, `team`, `backup`, `view_all_tasks` e `settings` exclusivo do Programador).
4. **Controle de situação**: transição entre `Ativo`, `Pendente`, `Suspenso` e `Recusado` preservando todo o histórico.
5. **Histórico administrativo**: trilha de auditoria (`access_audit_logs`) registrando autor, usuário-alvo, ação, detalhes e carimbo de data/hora.

---

## 4. Migration SQL Preparada para Revisão (Não Executada em Produção)

O arquivo [20261016160000_access_control_and_settings.sql](file:///c:/Users/BPO04.LMCONTABILIDADE/Documents/Projetos/pulse-agenda/supabase/migrations/20261016160000_access_control_and_settings.sql) foi preparado para revisão do Programador antes de qualquer aplicação no banco:
- Adiciona `access_profile`, `access_status`, `permissions`, `approved_by`, `approved_at` e `status_updated_at` em `public.users`.
- Preserva os 5 usuários atuais com seus respectivos perfis (`programador`, `gestora`, `operador`) e status `active`.
- Cria a tabela `public.access_audit_logs` com RLS habilitado.
- Cria a trigger `trg_protect_user_security_fields` (`fn_protect_user_security_fields`) que impede auto-aprovação no `INSERT`, bloqueia alteração direta de colunas de segurança no `UPDATE` por usuários comuns e protege a conta do Programador Principal contra exclusão ou rebaixamento.
- Cria a RPC `public.fn_admin_manage_user_access` (`SECURITY DEFINER`) restrita exclusivamente ao Programador Principal.

---

## 5. Validação e Evidências de Testes

- **Suíte de Autorização e Segurança (`verify_access_control.mjs`)**: 6/6 baterias aprovadas (preservação de contas legadas, bloqueio de usuário pendente, bloqueio de acesso administrativo por Gestora/Operador, bloqueio de auto-promoção no perfil, isolamento de tarefas por operador, aprovação/suspensão/reativação/recusa e auditoria pelo Programador).
- **Integridade do Banco de Produção**: Confirmado `DB Users count: 5`, `DB Team count: 5` (nenhuma escrita ou alteração no banco de produção).
- **Typecheck & Build**: `npx tsc --noEmit` e `npm run build` concluídos com código `0`.


---

## 6. Exclusão em Massa no Card Atrasados (`modernizacao-v3`)

### Arquivos Alterados
- [`src/pages/AtrasadasPage.tsx`](file:///c:/Users/BPO04.LMCONTABILIDADE/Documents/Projetos/pulse-agenda/src/pages/AtrasadasPage.tsx):
  - Adicionada caixa de seleção individual em cada tarefa atrasada e barra superior com controle **Selecionar todos** (com suporte a estado `indeterminate` e contagem de tarefas exibidas pelos filtros ativos `search` e `scope`) e opção **Desmarcar todas**.
  - Adicionado botão **Excluir selecionadas (N)** com modal de confirmação explícita (`"Deseja excluir N tarefa(s) atrasada(s)? Essa ação não poderá ser desfeita."`) e opção de cancelamento segura.
  - Adicionada proteção contra duplo clique e execução concorrente (`bulkDeleteLockRef`, `singleDeleteLockRef`, `isBulkDeleting`, `deletingSingleId`).
  - Reutilizadas integralmente as guardas de autorização (`isUserActive`, `canAccessModule(currentUser, 'atrasadas')` e `canAccessTaskRecord(currentUser, task)`).
  - Tratamento de erros por item e falhas parciais (`executeBulkDeleteAtrasadas`), diferenciando sucesso total, exclusão parcial e falha total, e limpando da seleção apenas os itens efetivamente excluídos.
- [`src/hooks/useAppData.ts`](file:///c:/Users/BPO04.LMCONTABILIDADE/Documents/Projetos/pulse-agenda/src/hooks/useAppData.ts):
  - Atualizada [`deleteAtrasada`](file:///c:/Users/BPO04.LMCONTABILIDADE/Documents/Projetos/pulse-agenda/src/hooks/useAppData.ts#L578-L664) para retornar `Promise<boolean>` após validar `{ error }` nas operações do Supabase e sincronizar referências em lote (`tasksRef` / `expandedTasksRef`), preservando exatamente o ciclo de vida atual de tarefas comuns, recorrentes mestres e virtuais recorrentes sem alterar o histórico (`hist`).


---

## 7. Restauração do Layout Original da Página Atrasados (`modernizacao-v3`)

### Diagnóstico da Causa Raiz (`git diff 4cd7ff5..2bf1121`)
1. **Quebra do CSS Grid de 3 colunas (`.hist-card`)**: Em [`src/index.css`](file:///c:/Users/BPO04.LMCONTABILIDADE/Documents/Projetos/pulse-agenda/src/index.css#L238), `.hist-card` é definido como `display: grid; grid-template-columns: 32px 1fr auto` para acomodar exatamente **3 elementos filhos diretos** (`.hist-card-check`, `.hist-card-body` e `.hist-card-right`). A inserção de um `<input type="checkbox">` como 4º filho direto empurrou `.hist-card-check` para a coluna `1fr`, `.hist-card-body` para a coluna `auto` e jogou `.hist-card-right` (data e botões de ação) para uma segunda linha espremida na primeira coluna de `32px`.
2. **Variáveis e classes CSS inexistentes**: O banner extra adicionado dentro de `.content` utilizava `var(--surface)` (inexistente no tema, que usa `var(--bg2)` e `var(--bg3)`) e `btn-ghost` no modal (o tema utiliza `.bcancel` e `.modal-footer`).

### Correção Aplicada em [`src/pages/AtrasadasPage.tsx`](file:///c:/Users/BPO04.LMCONTABILIDADE/Documents/Projetos/pulse-agenda/src/pages/AtrasadasPage.tsx)
- Restaurada exatamente a estrutura de **3 filhos diretos** dentro de `.hist-card` (`.hist-card-check`, `.hist-card-body`, `.hist-card-right`), mantendo o alinhamento vertical em `0px` de diferença entre as 3 colunas (`gridTemplateColumns: 32px 1fr auto`).
- O próprio círculo `.hist-card-check` (coluna 1 de `32px`) atua como seletor clicável da tarefa: exibe `!` idêntico ao original quando desmarcado e um ícone SVG branco nítido sobre fundo `var(--red)` quando selecionado.
- Removido o banner extra de dentro de `.content`; os botões compactos **Selecionar todos** e **Excluir selecionadas (N)** foram integrados diretamente à `.topbar` utilizando as classes nativas `.fg` e `.fb` do [`src/index.css`](file:///c:/Users/BPO04.LMCONTABILIDADE/Documents/Projetos/pulse-agenda/src/index.css#L84-L87), e o modal de confirmação utiliza `.modal.confirm-modal`, `.confirm-title`, `.confirm-body`, `.modal-footer` e `.bcancel`.

---

## 8. Recuperação Integral das Ações em Massa na Página Atrasadas (`modernizacao-v3`)

### Causa da Perda Funcional em `5babc5b` e Solução Aplicada
1. **Diagnóstico (`2bf1121` vs `5babc5b`)**:
   - No commit `5babc5b`, a restauração das 3 colunas de `.hist-card` removeu o `<input type="checkbox">` explícito de cada tarefa e manteve apenas **Selecionar todos** e **Excluir selecionadas**, sem disponibilizar as ações **Concluir selecionadas** e **Concluir todas** e ocultando os botões de ação quando nenhuma tarefa estava marcada.
2. **Solução em [`src/pages/AtrasadasPage.tsx`](file:///c:/Users/BPO04.LMCONTABILIDADE/Documents/Projetos/pulse-agenda/src/pages/AtrasadasPage.tsx) e [`src/hooks/useAppData.ts`](file:///c:/Users/BPO04.LMCONTABILIDADE/Documents/Projetos/pulse-agenda/src/hooks/useAppData.ts)**:
   - **Estrutura de 3 Filhos Diretos Preservada**: `.hist-card` permanece estritamente com 3 filhos diretos (`.hist-card-check`, `.hist-card-body`, `.hist-card-right`, `0px` de diferença vertical entre colunas). O `<input type="checkbox">` individual foi posicionado dentro de `.hist-card-title` (filho de `.hist-card-body`), mantendo o badge `!` original intacto na 1ª coluna.
   - **Quatro Controles em Massa na `.topbar`**:
     1. **Selecionar todas (`☐ Selecionar todas (N)`) / Desmarcar todas (`☑ Desmarcar todas (N)`)**: seleciona ou desmarca todas as tarefas atrasadas exibidas pelos filtros ativos (`scope` e `search`).
     2. **Concluir selecionadas (`✓ Concluir selecionadas (N)`)**: conclui exclusivamente as tarefas marcadas via `executeBulkCompleteAtrasadas`, atualizando a lista, limpando a seleção das tarefas concluídas e exibindo feedback claro de sucesso ou falha parcial/total.
     3. **Concluir todas (`✓✓ Concluir todas (N)`)**: seleciona todas as tarefas atrasadas exibidas e abre modal de confirmação explícita (`formatBulkCompleteConfirmationMessage`) informando a quantidade e os filtros ativos antes de executar.
     4. **Excluir selecionadas (`🗑 Excluir selecionadas (N)`)**: abre modal de confirmação (`formatBulkDeleteConfirmationMessage`) antes de excluir exclusivamente as tarefas marcadas via `executeBulkDeleteAtrasadas`.
   - **Consistência em Lote no Hook (`completeTask`)**: [`completeTask`](file:///c:/Users/BPO04.LMCONTABILIDADE/Documents/Projetos/pulse-agenda/src/hooks/useAppData.ts#L371-L492) em `useAppData.ts` passou a ler e atualizar `tasksRef.current` e `expandedTasksRef.current` de forma síncrona a cada iteração e verificar `{ error }` nas chamadas ao Supabase, sem alterar nenhuma regra de recorrência.

---

## 9. Simplificação dos Controles e Otimização em Lote de Alto Volume na Página Atrasadas (`modernizacao-v3`)

### 1. Causa Comprovada da Lentidão
A investigação de código e diagnóstico somente leitura (`SELECT`) do estado real do banco identificou **4 gargalos cumulativos**:
1. **Waterfall HTTP Sequencial (`2N` a `3N` chamadas de rede ao Supabase)**:
   - `executeBulkCompleteAtrasadas` executava um loop `for (const task of targets)` estritamente sequencial (`await onComplete(task.id, true)`).
   - Para 3.000+ tarefas atrasadas (sendo ~98% ocorrências virtuais recorrentes `virtual_...`), `completeTask` disparava **2 requisições HTTP sequenciais por tarefa** (`sb.from('hist').insert(...)` + `sb.from('tasks').insert(...)`), totalizando **> 6.000 round-trips de rede sequenciais** (~575–675 ms por tarefa = **~1,5 a 1,74 tarefas/s**, exigindo **> 31 minutos** para 3.500 tarefas e concluindo apenas ~350 tarefas nos primeiros 3 minutos).
2. **Re-cálculo Completo de `expandedTasks` e Re-renderização DOM por Item (`O(N²)` no Front-end)**:
   - A cada tarefa concluída no loop, `completeTask` invocava `setTasks(...)` e `setHist(...)`, além de `handleComplete` em `App.tsx` invocar `showToast('✅ Concluída!')` a cada item. Como havia `await` entre iterações, o React recalculava `expandedTasks` (`useMemo` iterando sobre ~9.940 registros de `tasks` + ~13.209 de `hist` e gerando ~9.500 virtuais) e re-renderizava ~3.000 cards DOM **3.000 vezes seguidas**.
3. **Colisão de Chave Primária em `hist` para Mestres Recorrentes (`23505 hist_pkey`)**:
   - Na linha `const histId = isVirtual ? genId() : t.id` de `completeTask`, tarefas mestres recorrentes (`!isVirtual && t.recur_group_id`) reutilizavam `t.id` ao inserir em `hist`, enquanto o mestre permanecia em `tasks` com o mesmo `t.id` avançado para `nextDate`. A partir da 2ª conclusão da série (42 mestres identificados no banco), `sb.from('hist').insert` falhava com erro de chave duplicada.
4. **Risco de Colisão em `genId()` no Mesmo Milissegundo**:
   - `genId()` usava apenas `Date.now() + Math.random()`, sujeito a colisões quando milhares de IDs são gerados no mesmo milissegundo em operações em lote.

### 2. Skills Efetivamente Consultadas e Utilizadas
- `graphify` (`.agents/skills/graphify/SKILL.md`)
- `diagnosing-bugs` (`.agents/skills/diagnosing-bugs/SKILL.md`)
- `systematic-debugging` (`.agents/skills/systematic-debugging/SKILL.md`)
- `supabase` (`.agents/skills/supabase/SKILL.md`)
- `supabase-postgres-best-practices` (`.agents/skills/supabase-postgres-best-practices/SKILL.md`)
- `vercel-react-best-practices` (`.agents/skills/vercel-react-best-practices/SKILL.md`)
- `ponytail` (`.agents/skills/ponytail/SKILL.md`)
- `verification-before-completion` (`.agents/skills/verification-before-completion/SKILL.md`)
- `playwright` (`.agents/skills/playwright/SKILL.md`)
- `web-design-guidelines` (`.agents/skills/web-design-guidelines/SKILL.md`)
- `code-review` (`.agents/skills/code-review/SKILL.md`)
- `devils-advocate` (`.agents/skills/devils-advocate/SKILL.md`)
- `antigravity-guide` & `agy-customizations` (`builtin/skills/`)

### 3. Arquivos Modificados
- [`src/pages/AtrasadasPage.tsx`](file:///c:/Users/BPO04.LMCONTABILIDADE/Documents/Projetos/pulse-agenda/src/pages/AtrasadasPage.tsx):
  - Removido o botão independente **“Concluir todas”**.
  - Mantidos os 3 controles na `.topbar`: **Selecionar todas / Desmarcar todas**, **Concluir selecionadas (N)** e **Excluir selecionadas (N)**.
  - Adicionado modal de confirmação também para **Concluir selecionadas**, informando quantidade exata e escopo/filtros ativos.
  - Exibição de progresso real em tempo real (`concluídas/excluídas`, `pendentes`, `falhas` e `total` + barra de progresso) durante a execução.
  - Identificação visual das tarefas que falharam (`⚠ Falha ao processar` dentro de `.hist-card-meta`, mantendo apenas os itens com falha selecionados para reprocessamento seletivo sem repetir os já concluídos).
  - Preservada rigorosamente a estrutura de **3 filhos diretos** de `.hist-card` (`childrenCount: 3`, `0px` de desalinhamento vertical em `1440x900`).
- [`src/hooks/useAppData.ts`](file:///c:/Users/BPO04.LMCONTABILIDADE/Documents/Projetos/pulse-agenda/src/hooks/useAppData.ts):
  - Implementados [`runBulkCompleteEngine`](file:///c:/Users/BPO04.LMCONTABILIDADE/Documents/Projetos/pulse-agenda/src/hooks/useAppData.ts#L92-L426), [`runBulkDeleteEngine`](file:///c:/Users/BPO04.LMCONTABILIDADE/Documents/Projetos/pulse-agenda/src/hooks/useAppData.ts#L428-L699), [`completeTasksBulk`](file:///c:/Users/BPO04.LMCONTABILIDADE/Documents/Projetos/pulse-agenda/src/hooks/useAppData.ts#L1458-L1483) e [`deleteAtrasadasBulk`](file:///c:/Users/BPO04.LMCONTABILIDADE/Documents/Projetos/pulse-agenda/src/hooks/useAppData.ts#L1485-L1507).
  - Corrigida geração de `histId` para mestres recorrentes (`genId()` único + `upsert` em `hist`) e normalização de colunas (`buildHistItemPayload`, `buildCompletedTaskPayload`) evitando `PGRST102`.
  - Atualização única de estado React (`setTasks` / `setHist`) ao final do processamento em lote.
- [`src/lib/utils.ts`](file:///c:/Users/BPO04.LMCONTABILIDADE/Documents/Projetos/pulse-agenda/src/lib/utils.ts):
  - Adicionado contador monotônico sequencial em [`genId()`](file:///c:/Users/BPO04.LMCONTABILIDADE/Documents/Projetos/pulse-agenda/src/lib/utils.ts#L20-L24) garantindo zero colisão mesmo gerando dezenas de milhares de IDs no mesmo milissegundo.
- [`src/App.tsx`](file:///c:/Users/BPO04.LMCONTABILIDADE/Documents/Projetos/pulse-agenda/src/App.tsx):
  - Conectados `onBulkCompleteAtrasadas` e `onBulkDeleteAtrasadas` ao `pageProps`.

### 4. Benchmark Comparativo (Lote de 3.500 Tarefas Atrasadas)
| Métrica | Antes (Sequencial Item a Item) | Depois (Lotes de 250 + Commit Único de Estado) | Ganho |
| :--- | :--- | :--- | :--- |
| **Tamanho do Lote Testado** | `3.500` tarefas (3.400 virtuais + 30 mestres + 70 únicas) | `3.500` tarefas (3.400 virtuais + 30 mestres + 70 únicas) | — |
| **Requisições HTTP ao Supabase** | `7.000` requisições sequenciais | **`59` requisições** (`14` chunks) | **`-99,2%` requests** |
| **Re-cálculos de `expandedTasks` / Re-renders** | `3.500` vezes | **`1` vez** (no commit final) | **`-99,97%` renders** |
| **Tempo Medido (RTT simulado 20ms)** | `222.415 ms` (~3,7 min) | **`1.109 ms` (`1,11 s`)** (Concluir) / **`848 ms`** (Excluir) | **`200,5x` mais rápido** |
| **Estimativa em Rede Real (~150ms RTT)** | ~31,6 minutos (~1,74 tarefas/s) | **~4 a 8 segundos** | **~250x mais rápido** |
