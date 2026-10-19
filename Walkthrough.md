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
