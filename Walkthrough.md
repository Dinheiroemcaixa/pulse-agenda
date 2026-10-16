# Walkthrough — Correção e Validação Visual da Janela de Execução do POP

## 1. Causa Raiz Identificada (Por que a alteração não apareceu antes)
Três fatores combinados causaram a ausência de mudança visual perceptível no teste anterior:

1. **Assinatura e Invocação de `resolveTaskPopId` em `TasksPage.tsx`:**
   - Em `TasksPage.tsx` (linhas 159, 202, 287 e 297), a função `resolveTaskPopId` estava sendo chamada passando apenas `t.id` (`resolveTaskPopId(t.id)`).
   - Como as tarefas do banco não possuíam o ID registrado previamente na chave local `pulse_task_pop_links_v1` nem coluna `pop_id` preenchida, o retorno era `undefined`. O fallback por descrição da tarefa só era acionado se recebesse o objeto `t` completo.
   - Consequentemente, o botão "POP" nem sequer aparecia nas tarefas da lista, e ao clicar no botão genérico da coluna de ações, o modal abria sem POP vinculado exibindo uma caixa cinza simples *"Nenhum POP associado a esta tarefa"* (usando a classe `.modal` antiga herdada).

2. **Componente Duplicado na Página de Procedimentos (`PopsPage.tsx`):**
   - Na biblioteca de POPs (`PopsPage.tsx`), o botão *"👁 Ver Detalhes"* abria um modal inline antigo (linhas 485 a 568), completamente independente de `PopRunnerModal.tsx`. Se o usuário testasse a visualização por ali, via 100% a tela antiga.

3. **Cores e Fontes Herdeiras de Variáveis Globais:**
   - O `PopRunnerModal` anterior estava utilizando variáveis como `var(--bg2)` e fontes padrão do sistema, as quais mantinham a paleta antiga do Pulse Agenda, em vez de aplicar a paleta Dark Navy (`#10162a`, `#141b31`, `#111729`) e as fontes `'IBM Plex Sans'` e `'IBM Plex Mono'` da referência visual `POP-preview.png` e `POP Tarefa.dc.html`.

---

## 2. O que foi efetivamente corrigido
1. **Fallback Inteligente em `popsApi.ts`:**
   - `resolveTaskPopId` agora associa de forma inteligente tarefas de conciliação bancária, caixa, saldo, extrato e DDA ao procedimento `pop_fechamento_caixa`, e tarefas de pagamentos/pix/ted a `pop_agendamento_pix_ted`.
   - O POP padrão `pop_fechamento_caixa` foi atualizado com todos os dados da referência (mídias, vídeos, imagens, documentos XLSX/PDF, dicas e tempo estimado de 30 min).

2. **Botão POP em `TasksPage.tsx`:**
   - A chamada foi corrigida para `(t.pop_id || resolveTaskPopId(t))`.
   - O botão `POP` foi estilizado com o visual azul elegante idêntico à demonstração (`height: 26px`, borda `#3b52d6`, fundo `#1b2550`, texto `#a9b8ff`, fonte IBM Plex Sans) tanto na lista de tarefas quanto no Kanban.

3. **Fidelidade Visual Absoluta em `PopRunnerModal.tsx`:**
   - Inclusão das fontes Google Fonts: `IBM Plex Sans` (400, 500, 600, 700) e `IBM Plex Mono` (400, 500, 600, 700).
   - Cores exatas de `POP Tarefa.dc.html`: fundo `#10162a`, borda `#26304f`, header com badge `POP · v1` (`#1b2550`, `#7d93ff`), botões transparentes com borda `#2a3454`, cards em `#141b31`, barra de progresso azul `#4f6bff` com contador `1/4 passos`, cards destacados de Cuidados (`#2a1720`) e Resultado Esperado (`#13261f`).
   - Grade de anexos com players de vídeo, imagens e badges de documentos com extensões coloridas (PDF `#d64545`, XLSX `#1f8a55`), além do card pontilhado `+ Anexar arquivo`.

4. **Unificação com `PopsPage.tsx`:**
   - O modal duplicado de `PopsPage.tsx` foi removido e substituído por `PopRunnerModal`. Agora, abrir o POP pela tarefa ou pela biblioteca de POPs exibe a mesma interface moderna.

---

## 3. Validação Visual Real via Navegador (Chrome DevTools)
- **Tela de Tarefas:** O botão azul `POP` está presente e visível nas tarefas correspondentes.
- **Abertura do POP:** Ao clicar em `POP` na tarefa *"CONCILIAR CONTAS A RECEBER FILIAL ITAÚ"*, o modal abre perfeitamente com o layout Dark Navy, cabeçalho, barra de progresso em 1/4 passos, cards informativos e anexos.
- **Interatividade:** O clique em *"Executar próximo passo"* avança a barra de progresso para 2/4 passos (50%) e marca a etapa com `✓` verde esmeralda.
- **Preservação de Estado:** Ao fechar o modal, a tarefa permanece intacta com status *"Em Aberto"*, comprovando que marcar etapas do POP não altera a tarefa.
- **Biblioteca de POPs:** Ao abrir *"Procedimentos (POP)"* e clicar em *"👁 Ver Detalhes"*, o mesmo modal moderno é renderizado com sucesso.

---

## 4. Evidências de Validação
- **TypeScript:** `npx tsc --noEmit` aprovado (código 0).
- **Build de Produção:** `npm run build` aprovado em 4.68s.
- **Branch:** `modernizacao-v3`
