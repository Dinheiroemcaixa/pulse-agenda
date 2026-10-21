import { useState, useRef } from 'react'
import type { Task, TeamMember, User, ViewMode, FilterMode, Pop } from '../types'
import { isLate, dateTimeLabel, dateStatus, getInitials, getTodayStr, priorityClass, RECUR_LABELS, MONTHS_SHORT, MONTHS_LONG } from '../lib/utils'
import { PopRunnerModal } from '../components/PopRunnerModal'

interface Props {
  tasks: Task[]
  team: TeamMember[]
  currentUser: User
  isAdmin: boolean
  viewMode: ViewMode
  filterMode: FilterMode
  searchQ: string
  dateFilter: string
  viewingAll: boolean
  memberFilter: string
  pops?: Pop[]
  onRefreshPops?: () => Promise<void>
  setViewMode: (v: ViewMode) => void
  setFilterMode: (f: FilterMode) => void
  setSearchQ: (q: string) => void
  setDateFilter: (d: string) => void
  setViewingAll: (v: boolean) => void
  setMemberFilter: (m: string) => void
  openNewTask: (date?: string) => void
  openEditTask: (id: string) => void
  onComplete: (id: string, fromAtrasadas?: boolean) => Promise<boolean>
  onDelete: (id: string, deleteAll?: boolean) => Promise<void>
  onCycleStatus: (id: string) => Promise<void>
  onReorder: (tasks: Task[]) => Promise<boolean | void>
  onToggleSub: (taskId: string, idx: number) => Promise<void>
  onAddSub: (taskId: string, text: string) => Promise<void>
  onDeleteSub: (taskId: string, idx: number) => Promise<void>
  showToast: (msg: string, type?: string) => void
  setPage: (p: any) => void
  theme?: 'dark' | 'light'
  toggleTheme?: () => void
}

function toTitleCaseName(str: string): string {
  if (!str) return ''
  return str
    .trim()
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

function formatReadableTaskTitle(desc: string): string {
  if (!desc) return ''
  const trimmed = desc.trim()
  const lettersOnly = trimmed.replace(/[^a-zA-ZÀ-ÿ]/g, '')
  if (lettersOnly.length > 3 && lettersOnly === lettersOnly.toUpperCase()) {
    const acronyms = new Set([
      'II', 'III', 'IV', 'VI', 'POP', 'DRE', 'BPO', 'TI', 'RH', 'MEI', 'CNPJ', 'CPF',
      'FGTS', 'INSS', 'DAS', 'DARF', 'ISS', 'ICMS', 'PIS', 'COFINS', 'IRPJ', 'CSLL',
      'XML', 'PDF', 'NFE', 'NFSE', 'PIX', 'TED', 'DOC', 'OFX', 'TR', 'GTNET', 'LM'
    ])
    const lowerWords = new Set(['de', 'da', 'do', 'das', 'dos', 'a', 'o', 'as', 'os', 'e', 'em', 'para', 'por', 'com', 'no', 'na', 'nos', 'nas'])
    const properNouns: Record<string, string> = {
      'itau': 'Itaú',
      'itaú': 'Itaú',
      'sicoob': 'Sicoob',
      'sicredi': 'Sicredi',
      'bradesco': 'Bradesco',
      'santander': 'Santander',
      'brasil': 'Brasil',
      'caixa': 'Caixa',
      'inter': 'Inter',
      'nubank': 'Nubank',
      'cora': 'Cora',
      'matriz': 'Matriz',
      'filial': 'Filial',
      'stuttgard': 'Stuttgard',
      'detroit': 'Detroit',
      'pedro': 'Pedro',
      'pneus': 'Pneus',
      'phenix': 'Phenix',
      'hanover': 'Hanover',
    }
    return trimmed
      .split(/\s+/)
      .map((word, index) => {
        const cleanUpper = word.replace(/[^a-zA-ZÀ-ÿ0-9]/g, '').toUpperCase()
        if (acronyms.has(cleanUpper)) return word.toUpperCase()
        const lower = word.toLowerCase()
        if (properNouns[lower]) return properNouns[lower]
        if (index === 0) return lower.charAt(0).toUpperCase() + lower.slice(1)
        if (lowerWords.has(lower)) return lower
        return lower
      })
      .join(' ')
  }
  return desc
}

function formatNavyDatePrimary(d: string): string {
  if (!d) return '—'
  const parts = d.split('-')
  if (parts.length !== 3) return d
  const [, m, day] = parts
  const monthName = (MONTHS_SHORT[+m - 1] || '').toLowerCase()
  return `${day} ${monthName}`
}

function formatNavyDateInputDisplay(d: string): string {
  if (!d) return 'Todas as datas'
  const parts = d.split('-')
  if (parts.length !== 3) return d
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

export function TasksPage(props: Props) {
  const { tasks, team, currentUser, isAdmin, viewMode, filterMode, searchQ, dateFilter, viewingAll: rawViewingAll, memberFilter } = props
  const viewingAll = isAdmin && rawViewingAll
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({})
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({})
  const [subInputs, setSubInputs] = useState<Record<string, string>>({})
  const [confirmDel, setConfirmDel] = useState<{ id: string; isRecurring: boolean } | null>(null)
  const [agendaDate, setAgendaDate] = useState(new Date())
  const [selectedAgendaDay, setSelectedAgendaDay] = useState<string | null>(null)
  const [activePopTask, setActivePopTask] = useState<Task | null>(null)
  const [editingOrderTaskId, setEditingOrderTaskId] = useState<string | null>(null)
  const [orderInputValue, setOrderInputValue] = useState<string>('')
  const orderCommitInProgressRef = useRef(false)
  const dragSrc = useRef<string | null>(null)
  const dateInputRef = useRef<HTMLInputElement | null>(null)

  const getMember = (name: string) => team.find(m => m.name === name)

  const todayStr = getTodayStr()

  // Base filtrada por escopo (minhas/equipe + membro) e busca, com visibilidade inteligente de virtuais
  const getScopedTasks = () => {
    let base = tasks.filter(t => t.status !== 'Concluída')

    if (!dateFilter) {
      base = base.filter(t => {
        const isVirtual = (t as any).isVirtual
        const isFuture = t.date && t.date > todayStr
        return !isVirtual || !isFuture || t.is_meeting
      })
    }

    if (!viewingAll) {
      base = base.filter(t => (t.resp || '').trim().toLowerCase() === (currentUser.name || '').trim().toLowerCase())
    } else if (memberFilter && memberFilter !== 'all') {
      base = base.filter(t => (t.resp || '').trim().toLowerCase() === memberFilter.trim().toLowerCase())
    }

    if (searchQ) {
      const q = searchQ.toLowerCase()
      base = base.filter(t => (t.descricao || '').toLowerCase().includes(q) || (t.resp || '').toLowerCase().includes(q))
    }

    return base
  }

  const scopedTasks = getScopedTasks()
  const dateFilteredScopedTasks = dateFilter ? scopedTasks.filter(t => t.date === dateFilter) : scopedTasks

  // Contadores reais nas abas de status respeitando escopo, busca e data (Atrasadas ignora dateFilter)
  const countAll = dateFilteredScopedTasks.length
  const countOpen = dateFilteredScopedTasks.filter(t => !isLate(t) && t.status === 'Em Aberto').length
  const countLate = scopedTasks.filter(t => isLate(t)).length

  const getFiltered = () => {
    let list = [...scopedTasks]

    if (filterMode === 'open') list = list.filter(t => !isLate(t) && t.status === 'Em Aberto')
    else if (filterMode === 'late') list = list.filter(t => isLate(t))
    else if (filterMode === 'alta') list = list.filter(t => t.prio === 'Alta')

    if (dateFilter && filterMode !== 'late') {
      list = list.filter(t => t.date === dateFilter)
    }

    // Ordenar pelo sort_order do banco
    list.sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999))
    return list
  }

  const list = getFiltered()

  const moveTaskInList = async (srcId: string, targetIndex: number) => {
    if (list.length <= 1) return
    const srcIdx = list.findIndex(t => t.id === srcId)
    const clampedTarget = Math.max(0, Math.min(list.length - 1, targetIndex))
    if (srcIdx === -1 || srcIdx === clampedTarget) return

    const visibleReordered = [...list]
    const [movedTask] = visibleReordered.splice(srcIdx, 1)
    visibleReordered.splice(clampedTarget, 0, movedTask)

    const minIdx = Math.min(srcIdx, clampedTarget)
    const maxIdx = Math.max(srcIdx, clampedTarget)
    const affectedOriginal = list.slice(minIdx, maxIdx + 1)
    const rawSlots = affectedOriginal.map((t, i) => t.sort_order ?? (minIdx + i))
    const isStrictlyIncreasing = rawSlots.every((v, i) => i === 0 || v > rawSlots[i - 1])

    // Se a tarefa movida pertencer a uma s?rie recorrente (recur_group_id),
    // garante que a ocorr?ncia movida prevale?a ao persistir o sort_order do mestre
    const dedupSeries = (arr: Task[]) =>
      movedTask.recur_group_id
        ? arr.filter(t => t.id === movedTask.id || t.recur_group_id !== movedTask.recur_group_id)
        : arr

    let reorderedPayload: Task[]
    if (isStrictlyIncreasing) {
      const affectedReordered = dedupSeries(visibleReordered.slice(minIdx, maxIdx + 1))
      reorderedPayload = affectedReordered.map((t, i) => ({ ...t, sort_order: rawSlots[i] }))
    } else {
      const baseOrder = Math.min(0, list[0]?.sort_order ?? 0)
      const dedupedVisible = dedupSeries(visibleReordered)
      reorderedPayload = dedupedVisible.map((t, i) => ({ ...t, sort_order: baseOrder + i }))
    }
    const ok = await props.onReorder(reorderedPayload)
    if (ok === false) {
      props.showToast('❌ Erro ao salvar nova posição', 'error')
    } else {
      props.showToast('↕ Ordem das tarefas salva', 'info')
    }
  }

  const commitOrderInput = async (taskId: string, currentIdx: number, rawOverride?: string) => {
    if (orderCommitInProgressRef.current) return
    orderCommitInProgressRef.current = true
    const raw = (rawOverride ?? orderInputValue).trim()
    setEditingOrderTaskId(null)
    try {
      const parsed = parseInt(raw, 10)
      if (!isNaN(parsed) && list.length > 1) {
        const targetIdx = Math.max(0, Math.min(list.length - 1, parsed - 1))
        if (targetIdx !== currentIdx) {
          await moveTaskInList(taskId, targetIdx)
        }
      }
    } finally {
      orderCommitInProgressRef.current = false
    }
  }

  const handleDrop = async (srcId: string, dstId: string, before: boolean) => {
    const srcIdx = list.findIndex(t => t.id === srcId)
    const dstIdx = list.findIndex(t => t.id === dstId)
    if (srcIdx === -1 || dstIdx === -1 || srcId === dstId) return
    let targetIndex = before ? dstIdx : dstIdx + 1
    if (srcIdx < targetIndex) targetIndex -= 1
    targetIndex = Math.max(0, Math.min(list.length - 1, targetIndex))
    await moveTaskInList(srcId, targetIndex)
  }

  const recurLabel = (t: Task) => {
    if (!t.recur || t.recur === 'none') return null
    const label = t.recur === 'custom' && t.recur_days?.length ? t.recur_days.join(', ') : RECUR_LABELS[t.recur] || ''
    return (
      <span className="navy-meta-item">
        <span className="material-symbols-outlined navy-meta-icon">repeat</span>
        {label}
      </span>
    )
  }

  const statusBadge = (t: Task) => {
    if (isLate(t)) {
      return (
        <span
          className="navy-status-pill navy-status-late"
        >
          <span className="navy-status-dot" />
          Atrasada
        </span>
      )
    }
    if (t.status === 'Em Andamento') {
      return (
        <span
          className="navy-status-pill navy-status-progress"
          style={{ cursor: 'pointer' }}
          onClick={() => props.onCycleStatus(t.id)}
          title="Clique para alternar status"
        >
          <span className="navy-status-dot" />
          Em andamento
        </span>
      )
    }
    return (
      <span
        className="navy-status-pill navy-status-open"
        style={{ cursor: 'pointer' }}
        onClick={() => props.onCycleStatus(t.id)}
        title="Clique para alternar status"
      >
        <span className="navy-status-dot" />
        Em aberto
      </span>
    )
  }

  // ── LIST VIEW (NAVY EXECUTIVE) ─────────────────────────────

  const renderList = () => (
    <div className="navy-table">
      <div className="navy-thead">
        <span className="navy-th-center">#</span>
        <span />
        <span>TAREFA</span>
        <span>RESPONSÁVEL</span>
        <span>DATA / HORA</span>
        <span>PRIORIDADE</span>
        <span>STATUS</span>
        <span className="navy-th-right">AÇÕES</span>
      </div>
      {list.length === 0 && (
        <div className="navy-empty-state">
          <span className="material-symbols-outlined navy-empty-icon">task_alt</span>
          <div className="navy-empty-title">Nenhuma tarefa encontrada</div>
          <div className="navy-empty-sub">Crie uma nova tarefa ou ajuste os filtros da barra superior.</div>
        </div>
      )}
      {list.map((t, idx) => {
        const m = getMember(t.resp)
        const mc = m?.color || '#3D55D6'
        const sub = t.subtasks || []
        const doneSub = sub.filter(s => s.done).length
        const allSubDone = sub.length > 0 && doneSub === sub.length
        const prog = sub.length ? Math.round((doneSub / sub.length) * 100) : 0
        const isExp = expandedTasks[t.id]
        const late = isLate(t)
        const ds = dateStatus(t.date)
        const isTodayDate = t.date === todayStr
        const timeSubLabel = !t.all_day && t.time_start
          ? `${t.time_start}${t.time_end ? '–' + t.time_end : ''}`
          : late
            ? 'Atrasada'
            : isTodayDate
              ? 'Hoje'
              : ds === 'soon'
                ? 'Em breve'
                : 'Agendada'

        const prioDotClass =
          t.prio === 'Alta'
            ? 'navy-prio-dot-alta'
            : t.prio === 'Média'
              ? 'navy-prio-dot-media'
              : 'navy-prio-dot-baixa'

        return (
          <div key={t.id} className="navy-row-group">
            <div
              className={`navy-tr${late ? ' navy-tr-late' : ''}${isExp || expandedNotes[t.id] ? ' navy-tr-expanded' : ''}`}
              draggable={editingOrderTaskId !== t.id}
              onDragStart={e => {
                dragSrc.current = t.id
                e.dataTransfer.effectAllowed = 'move'
                setTimeout(() => e.currentTarget.classList.add('dragging-row'), 0)
              }}
              onDragEnd={e => {
                e.currentTarget.classList.remove('dragging-row')
                dragSrc.current = null
              }}
              onDragOver={e => {
                e.preventDefault()
                const mid = e.currentTarget.getBoundingClientRect().top + e.currentTarget.getBoundingClientRect().height / 2
                e.currentTarget.classList.toggle('drag-over-row', e.clientY < mid)
                e.currentTarget.classList.toggle('drag-over-row-bottom', e.clientY >= mid)
              }}
              onDragLeave={e => {
                e.currentTarget.classList.remove('drag-over-row', 'drag-over-row-bottom')
              }}
              onDrop={async e => {
                e.preventDefault()
                e.currentTarget.classList.remove('drag-over-row', 'drag-over-row-bottom')
                if (!dragSrc.current || dragSrc.current === t.id) return
                const before = e.clientY < e.currentTarget.getBoundingClientRect().top + e.currentTarget.getBoundingClientRect().height / 2
                await handleDrop(dragSrc.current, t.id, before)
              }}
            >
              <div className="navy-td-num" onClick={e => e.stopPropagation()}>
                <span
                  className="material-symbols-outlined navy-order-drag"
                  title="Arraste para reordenar"
                >
                  drag_indicator
                </span>
                {editingOrderTaskId === t.id ? (
                  <input
                    type="number"
                    min={1}
                    max={list.length}
                    className="navy-order-input"
                    value={orderInputValue}
                    autoFocus
                    onFocus={e => e.currentTarget.select()}
                    onChange={e => setOrderInputValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void commitOrderInput(t.id, idx, e.currentTarget.value)
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        setEditingOrderTaskId(null)
                      }
                    }}
                    onBlur={e => {
                      void commitOrderInput(t.id, idx, e.currentTarget.value)
                    }}
                    aria-label={`Nova posição para ${t.descricao}`}
                  />
                ) : (
                  <button
                    type="button"
                    className="navy-order-badge"
                    title={`Posição ${idx + 1} de ${list.length} — clique para digitar nova posição`}
                    onClick={() => {
                      setEditingOrderTaskId(t.id)
                      setOrderInputValue(String(idx + 1))
                    }}
                  >
                    {idx + 1}
                  </button>
                )}
                {list.length > 1 && editingOrderTaskId !== t.id && (
                  <div className="navy-order-steppers">
                    <button
                      type="button"
                      className="navy-order-step-btn"
                      disabled={idx === 0}
                      title="Subir 1 posição"
                      aria-label={`Mover ${t.descricao} para cima`}
                      onClick={() => void moveTaskInList(t.id, idx - 1)}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="navy-order-step-btn"
                      disabled={idx === list.length - 1}
                      title="Descer 1 posição"
                      aria-label={`Mover ${t.descricao} para baixo`}
                      onClick={() => void moveTaskInList(t.id, idx + 1)}
                    >
                      ▼
                    </button>
                  </div>
                )}
              </div>
              <button
                type="button"
                className="navy-ck"
                onClick={() => props.onComplete(t.id)}
                title="Concluir tarefa"
                aria-label={`Concluir ${t.descricao}`}
              />
              <div className="navy-task-cell">
                <span className="navy-task-title" title={t.descricao}>
                  {formatReadableTaskTitle(t.descricao)}
                </span>
                {((t.recur && t.recur !== 'none') || sub.length > 0) && (
                  <div className="navy-task-meta">
                    {recurLabel(t)}
                    {sub.length > 0 && (
                      <button
                        type="button"
                        className="navy-sub-trigger"
                        onClick={() => setExpandedTasks(prev => ({ ...prev, [t.id]: !prev[t.id] }))}
                      >
                        <span className="material-symbols-outlined navy-meta-icon">checklist</span>
                        <span className="navy-sub-fraction">{doneSub}/{sub.length}</span>
                        <span className="navy-sub-bar">
                          <span
                            className="navy-sub-fill"
                            style={{
                              width: `${prog}%`,
                              background: allSubDone ? '#1F9D6B' : '#2F46B8',
                            }}
                          />
                        </span>
                        <span className="material-symbols-outlined navy-sub-chevron">
                          {isExp ? 'expand_less' : 'expand_more'}
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              <span className="navy-resp-cell">
                <span className="navy-resp-av" style={{ background: mc }}>
                  {getInitials(t.resp)}
                </span>
                <span className="navy-resp-name">{toTitleCaseName((t.resp || '').split(' ')[0])}</span>
              </span>

              <span className="navy-date-cell">
                <span className={`navy-date-main${late ? ' navy-date-late' : ''}`}>
                  {formatNavyDatePrimary(t.date)}
                </span>
                <span className={`navy-date-sub${late ? ' navy-date-late' : ''}`}>
                  {timeSubLabel}
                </span>
              </span>

              <span className={`navy-prio-cell${t.prio === 'Alta' ? ' navy-prio-alta-text' : ''}`}>
                <span className={`navy-prio-dot ${prioDotClass}`} />
                {t.prio}
              </span>

              <span>{statusBadge(t)}</span>

              <div className="navy-actions-cell">
                <button
                  type="button"
                  className="navy-pop-btn"
                  title="Ver POP — Como executar"
                  onClick={() => setActivePopTask(t)}
                >
                  POP
                </button>
                {t.notes && (
                  <button
                    type="button"
                    className={`navy-icon-act${expandedNotes[t.id] ? ' active' : ''}`}
                    title="Ver anotações"
                    onClick={() => setExpandedNotes(prev => ({ ...prev, [t.id]: !prev[t.id] }))}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 17 }}>sticky_note_2</span>
                  </button>
                )}
                <button
                  type="button"
                  className="navy-icon-act"
                  title="Editar tarefa"
                  onClick={() => props.openEditTask(t.id)}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 17 }}>edit</span>
                </button>
                <button
                  type="button"
                  className="navy-icon-act navy-icon-del"
                  title="Excluir tarefa"
                  onClick={() => setConfirmDel({ id: t.id, isRecurring: !!(t.recur && t.recur !== 'none') })}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 17 }}>delete</span>
                </button>
              </div>
            </div>

            {expandedNotes[t.id] && t.notes && (
              <div className="navy-drawer">
                <div className="navy-notes-box">
                  {t.notes}
                </div>
              </div>
            )}

            {isExp && sub.length > 0 && (
              <div className="navy-drawer">
                {sub.map((s, si) => (
                  <div key={si} className="sub-item navy-sub-item">
                    <div
                      className={`sub-ck${s.done ? ' done' : ''}`}
                      onClick={() => props.onToggleSub(t.id, si)}
                    />
                    <span className={`sub-text${s.done ? ' done' : ''}`} style={{ flex: 1 }}>
                      {s.text}
                    </span>
                    <button className="sub-del" onClick={() => props.onDeleteSub(t.id, si)}>
                      ✕
                    </button>
                  </div>
                ))}
                <div className="sub-add-row navy-sub-add-row">
                  <input
                    className="sub-add-input navy-sub-input"
                    placeholder="Nova subtarefa..."
                    value={subInputs[t.id] || ''}
                    onChange={e => setSubInputs(prev => ({ ...prev, [t.id]: e.target.value }))}
                    onKeyDown={async e => {
                      if (e.key === 'Enter' && subInputs[t.id]?.trim()) {
                        await props.onAddSub(t.id, subInputs[t.id].trim())
                        setSubInputs(prev => ({ ...prev, [t.id]: '' }))
                      }
                    }}
                  />
                  <button
                    className="sub-add-btn navy-sub-add-btn"
                    onClick={async () => {
                      if (subInputs[t.id]?.trim()) {
                        await props.onAddSub(t.id, subInputs[t.id].trim())
                        setSubInputs(prev => ({ ...prev, [t.id]: '' }))
                      }
                    }}
                  >
                    + Add
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  // ── KANBAN VIEW ────────────────────────────────────────────

  const renderKanban = () => {
    const COLS = [
      { id: 'aberto', label: 'Em Aberto', color: 'var(--accent)', filter: (t: Task) => !isLate(t) && t.status === 'Em Aberto' },
      { id: 'andando', label: 'Em Andamento', color: 'var(--orange)', filter: (t: Task) => t.status === 'Em Andamento' },
      { id: 'atrasada', label: 'Atrasadas', color: 'var(--red)', filter: (t: Task) => isLate(t) },
    ]
    return (
      <div className="kanban-wrap">
        {COLS.map(col => {
          const items = list.filter(col.filter)
          return (
            <div key={col.id} className="kanban-col"
              onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-over') }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) e.currentTarget.classList.remove('drag-over') }}
              onDrop={async e => {
                e.preventDefault(); e.currentTarget.classList.remove('drag-over')
                const dragId = e.dataTransfer.getData('text/plain'); if (!dragId) return
                const t = tasks.find(x => x.id === dragId); if (!t) return
                let newStatus = t.status
                if (col.id === 'aberto') newStatus = 'Em Aberto'
                else if (col.id === 'andando') newStatus = 'Em Andamento'
                if (newStatus !== t.status) await props.onCycleStatus(t.id)
              }}>
              <div className="kanban-head" style={{ borderLeft: `3px solid ${col.color}` }}>
                <span>{col.label}</span>
                <span className="kanban-count">{items.length}</span>
              </div>
              <div className="kanban-body">
                {items.length === 0 && <div className="kanban-drop-hint">Arraste aqui</div>}
                {items.map(t => {
                  const m = getMember(t.resp)
                  return (
                    <div key={t.id} className="kcard" draggable
                      onDragStart={e => { e.dataTransfer.setData('text/plain', t.id); setTimeout(() => e.currentTarget.classList.add('dragging'), 0) }}
                      onDragEnd={e => e.currentTarget.classList.remove('dragging')}>
                      <div className="kcard-title">{formatReadableTaskTitle(t.descricao)}</div>
                      <div className="kcard-meta">
                        <span className={`kcard-date${isLate(t) ? ' late' : ''}`}>📅 {dateTimeLabel(t)}</span>
                        <div className="kcard-av" style={{ background: m?.color || '#4f6ef7' }}>{getInitials(t.resp)}</div>
                      </div>
                      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span className={`pb ${priorityClass(t.prio)}`}>{t.prio}</span>
                      </div>
                      <div className="kcard-actions">
                        <div className="kcard-done" onClick={() => props.onComplete(t.id)}>✓ Concluir</div>
                        <div
                          className="kcard-edit navy-pop-btn"
                          title="POP — Como executar"
                          onClick={() => setActivePopTask(t)}
                          style={{ height: 24, fontSize: 11, padding: '2px 7px' }}
                        >
                          POP
                        </div>
                        <div className="kcard-edit" onClick={() => props.openEditTask(t.id)}>✎</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ── AGENDA VIEW ────────────────────────────────────────────

  const renderAgenda = () => {
    const year = agendaDate.getFullYear()
    const month = agendaDate.getMonth()
    const first = new Date(year, month, 1)
    const last = new Date(year, month + 1, 0)
    const startDay = first.getDay()
    const today = new Date(); today.setHours(0, 0, 0, 0)

    const days = []
    for (let i = 0; i < startDay; i++) {
      const d = new Date(year, month, -(startDay - i - 1))
      days.push(<div key={`pre-${i}`} className="agenda-day other-month"><div className="agenda-day-num">{d.getDate()}</div></div>)
    }
    for (let d = 1; d <= last.getDate(); d++) {
      const dt = new Date(year, month, d); dt.setHours(0, 0, 0, 0)
      const isToday = dt.getTime() === today.getTime()
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      let dayTasks = tasks.filter(t => t.date === dateStr && t.status !== 'Concluída')
      if (!viewingAll) dayTasks = dayTasks.filter(t => t.resp.trim() === currentUser.name.trim())
      const isSel = selectedAgendaDay === dateStr

      days.push(
        <div key={d} className={`agenda-day${isToday ? ' today' : ''}${isSel ? ' agenda-selected' : ''}`}
          onClick={() => setSelectedAgendaDay(prev => prev === dateStr ? null : dateStr)}>
          <div className="agenda-day-num">
            {d}
            {dayTasks.length > 0 && <span style={{ float: 'right', background: 'var(--accent)', color: '#fff', borderRadius: 8, padding: '0 5px', fontSize: 9, fontWeight: 700 }}>{dayTasks.length}</span>}
          </div>
          {dayTasks.slice(0, 3).map(t => (
            <div key={t.id} className="agenda-dot" style={{ background: 'var(--accentbg)', color: isLate(t) ? 'var(--red)' : 'var(--accent)' }} title={t.descricao}>{formatReadableTaskTitle(t.descricao)}</div>
          ))}
          {dayTasks.length > 3 && <div style={{ fontSize: 10, color: 'var(--text3)' }}>+{dayTasks.length - 3} mais</div>}
        </div>
      )
    }

    return (
      <div className="agenda-wrap">
        <div className="agenda-nav">
          <button onClick={() => setAgendaDate(new Date(year, month - 1, 1))}>‹</button>
          <span className="agenda-month">{MONTHS_LONG[month]} {year}</span>
          <button onClick={() => setAgendaDate(new Date(year, month + 1, 1))}>›</button>
        </div>
        <div className="agenda-grid">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => <div key={d} className="agenda-day-name">{d}</div>)}
          {days}
        </div>
        {selectedAgendaDay && (() => {
          const [sy, sm, sd] = selectedAgendaDay.split('-')
          let panelTasks = tasks.filter(t => t.date === selectedAgendaDay && t.status !== 'Concluída')
          if (!viewingAll) panelTasks = panelTasks.filter(t => t.resp.trim() === currentUser.name.trim())
          return (
            <div className="agenda-panel">
              <div className="agenda-panel-title">
                <span>📋 {sd} de {MONTHS_LONG[+sm - 1]} de {sy}</span>
                <button style={{ background: 'var(--accentbg)', border: '1px solid var(--accent)', borderRadius: 6, padding: '4px 10px', color: 'var(--accent)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }} onClick={() => props.openNewTask(selectedAgendaDay)}>+ Tarefa</button>
              </div>
              {panelTasks.length === 0 && <div className="agenda-panel-empty">Nenhuma tarefa neste dia</div>}
              {panelTasks.map(t => {
                const m = getMember(t.resp)
                return (
                  <div key={t.id} className="agenda-task-item">
                    <div className="agenda-task-done" onClick={() => props.onComplete(t.id)} />
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: isLate(t) ? 'var(--red)' : 'var(--accent)', flexShrink: 0 }} />
                    <div className="agenda-task-name">{formatReadableTaskTitle(t.descricao)}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {!t.all_day && t.time_start && <span style={{ fontSize: 11, color: 'var(--text3)' }}>🕐 {t.time_start}{t.time_end ? '–' + t.time_end : ''}</span>}
                      <div className="avsm" style={{ background: m?.color || '#4f6ef7', width: 18, height: 18, fontSize: 8 }}>{getInitials(t.resp)}</div>
                      <span className={`pb ${priorityClass(t.prio)}`} style={{ fontSize: 10, padding: '1px 5px' }}>{t.prio}</span>
                    </div>
                    <button
                      type="button"
                      className="navy-pop-btn"
                      onClick={() => setActivePopTask(t)}
                      style={{ height: 24, padding: '0 8px', flexShrink: 0 }}
                    >
                      POP
                    </button>
                    <button className="act edt" onClick={() => props.openEditTask(t.id)} style={{ flexShrink: 0 }}>✎</button>
                  </div>
                )
              })}
            </div>
          )
        })()}
      </div>
    )
  }

  return (
    <div className="navy-tasks-shell">
      {/* TOPBAR (72px Navy Executive) */}
      <div className="navy-topbar">
        <div className="navy-topbar-left">
          <div className="navy-page-title">Minhas Tarefas</div>
          <div className="navy-scope-line">
            <span className="material-symbols-outlined navy-scope-icon">
              {viewingAll ? 'groups' : 'person'}
            </span>
            <span>
              {viewingAll ? 'Mostrando tarefas de toda a equipe' : 'Mostrando apenas suas tarefas'}
            </span>
            {isAdmin && (
              <>
                <span className="navy-scope-sep">·</span>
                <button
                  type="button"
                  className="navy-scope-link"
                  onClick={() => {
                    const next = !viewingAll
                    props.setViewingAll(next)
                    props.setMemberFilter(next ? 'all' : currentUser.name)
                    try { localStorage.setItem('pulse_viewingAll', String(next)) } catch {}
                    try { localStorage.setItem('pulse_memberFilter', next ? 'all' : currentUser.name) } catch {}
                  }}
                >
                  {viewingAll ? 'Ver só as minhas' : 'Ver toda a equipe'}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="navy-topbar-right">
          <div className="navy-search-box">
            <span className="material-symbols-outlined navy-search-icon">search</span>
            <input
              type="text"
              className="navy-search-input"
              placeholder="Buscar tarefa…"
              value={searchQ}
              onChange={e => props.setSearchQ(e.target.value)}
            />
            {searchQ && (
              <button
                type="button"
                className="navy-search-clear"
                onClick={() => props.setSearchQ('')}
                title="Limpar busca"
              >
                ×
              </button>
            )}
          </div>

          <button
            type="button"
            className="navy-theme-btn"
            onClick={props.toggleTheme}
            title={props.theme === 'light' ? 'Mudar para modo escuro' : 'Mudar para modo claro'}
            aria-label={props.theme === 'light' ? 'Mudar para modo escuro' : 'Mudar para modo claro'}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 19 }}>
              {props.theme === 'light' ? 'dark_mode' : 'light_mode'}
            </span>
          </button>

          <button type="button" className="navy-cta-btn" onClick={() => props.openNewTask()}>
            <span className="material-symbols-outlined" style={{ fontSize: 19 }}>add</span>
            Nova tarefa
          </button>
        </div>
      </div>

      {/* TOOLBAR ÚNICA (Segmented Status + Prioridade Alta + Data + Segmented View) */}
      <div className="navy-toolbar">
        <div className="navy-segmented" role="tablist" aria-label="Filtro de status">
          <button
            type="button"
            className={`navy-seg-item${filterMode === 'all' ? ' active' : ''}`}
            onClick={() => props.setFilterMode('all')}
          >
            Todas <span className="navy-seg-count">{countAll}</span>
          </button>
          <button
            type="button"
            className={`navy-seg-item${filterMode === 'open' ? ' active' : ''}`}
            onClick={() => props.setFilterMode('open')}
          >
            Em aberto <span className="navy-seg-count">{countOpen}</span>
          </button>
          <button
            type="button"
            className={`navy-seg-item${filterMode === 'late' ? ' active' : ''}`}
            onClick={() => props.setFilterMode('late')}
          >
            Atrasadas <span className="navy-seg-count">{countLate}</span>
          </button>
        </div>

        <button
          type="button"
          className={`navy-prio-filter-btn${filterMode === 'alta' ? ' active' : ''}`}
          onClick={() => props.setFilterMode(filterMode === 'alta' ? 'all' : 'alta')}
        >
          <span className="material-symbols-outlined navy-prio-flag">flag</span>
          Prioridade alta
        </button>

        <div className="navy-toolbar-spacer" />

        {viewMode !== 'agenda' && (
          <>
            <div className="navy-date-controls">
              <span className="navy-date-label">Data</span>
              <label
                className="navy-date-picker-box"
                onClick={() => {
                  try {
                    dateInputRef.current?.showPicker?.()
                  } catch {}
                }}
              >
                <span className="navy-date-picker-text">{formatNavyDateInputDisplay(dateFilter)}</span>
                <span className="material-symbols-outlined navy-date-cal-icon">calendar_today</span>
                <input
                  ref={dateInputRef}
                  type="date"
                  className="navy-date-native-input"
                  value={dateFilter}
                  onChange={e => props.setDateFilter(e.target.value)}
                />
              </label>
              <button
                type="button"
                className={`navy-date-today-btn${dateFilter === todayStr ? ' active' : ''}`}
                onClick={() => props.setDateFilter(getTodayStr())}
              >
                Hoje
              </button>
              <button
                type="button"
                className="navy-date-clear-btn"
                onClick={() => props.setDateFilter('')}
              >
                Limpar
              </button>
            </div>

            <div className="navy-toolbar-divider" />
          </>
        )}

        <div className="navy-view-segmented" role="group" aria-label="Modo de visualização">
          <button
            type="button"
            className={`navy-view-btn${viewMode === 'list' ? ' active' : ''}`}
            onClick={() => props.setViewMode('list')}
            title="Lista"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>view_list</span>
          </button>
          <button
            type="button"
            className={`navy-view-btn${viewMode === 'kanban' ? ' active' : ''}`}
            onClick={() => props.setViewMode('kanban')}
            title="Kanban"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>view_kanban</span>
          </button>
          <button
            type="button"
            className={`navy-view-btn${viewMode === 'agenda' ? ' active' : ''}`}
            onClick={() => props.setViewMode('agenda')}
            title="Agenda"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>calendar_month</span>
          </button>
        </div>
      </div>

      {/* BARRA DE MEMBROS (QUANDO VIEWING ALL = TRUE) */}
      {viewingAll && (
        <div className="navy-mf-bar">
          <button
            type="button"
            className={`navy-mf-pill${memberFilter === 'all' ? ' active' : ''}`}
            onClick={() => props.setMemberFilter('all')}
          >
            Todos
          </button>
          {props.team.map(m => (
            <button
              key={m.id}
              type="button"
              className={`navy-mf-pill${memberFilter === m.name ? ' active' : ''}`}
              onClick={() => props.setMemberFilter(m.name)}
            >
              <span className="navy-mf-dot" style={{ background: m.color }} />
              {toTitleCaseName(m.name.split(' ')[0])}
              {m.name === currentUser.name && <span className="navy-mf-me"> (eu)</span>}
            </button>
          ))}
        </div>
      )}

      {/* CONTENT */}
      <div className={`navy-tasks-content${viewMode !== 'list' ? ' navy-tasks-content-alt' : ''}`}>
        {viewMode === 'list' && renderList()}
        {viewMode === 'kanban' && renderKanban()}
        {viewMode === 'agenda' && renderAgenda()}
      </div>

      {/* CONFIRM DELETE MODAL */}
      {confirmDel && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmDel(null)}>
          <div className="modal confirm-modal">
            <div className="confirm-title">{confirmDel.isRecurring ? 'Excluir Tarefa Recorrente' : 'Excluir Tarefa'}</div>
            <div className="confirm-body">
              {confirmDel.isRecurring
                ? <>Esta tarefa é <strong style={{ color: 'var(--purple)' }}>recorrente</strong>. O que deseja fazer?</>
                : <>Tem certeza? <strong style={{ color: 'var(--red)' }}>Ação irreversível.</strong></>}
            </div>
            <div className="modal-footer">
              <button className="bcancel" onClick={() => setConfirmDel(null)}>Cancelar</button>
              {confirmDel.isRecurring && (
                <button
                  style={{ background: 'var(--orangebg)', border: '1px solid var(--orange)', borderRadius: 7, padding: '8px 14px', color: 'var(--orange)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
                  onClick={async () => { await props.onDelete(confirmDel.id, false); setConfirmDel(null) }}
                >
                  Só esta
                </button>
              )}
              <button
                style={{ background: 'var(--redbg)', border: '1px solid var(--red)', borderRadius: 7, padding: '8px 14px', color: 'var(--red)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
                onClick={async () => { await props.onDelete(confirmDel.id, confirmDel.isRecurring); setConfirmDel(null) }}
              >
                {confirmDel.isRecurring ? 'Todas' : 'Sim, excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POP RUNNER MODAL (COMO EXECUTAR) */}
      {activePopTask && (
        <PopRunnerModal
          task={activePopTask}
          pops={props.pops || []}
          isAdmin={isAdmin}
          onClose={() => setActivePopTask(null)}
          onOpenLibrary={() => {
            setActivePopTask(null)
            props.setPage('pops')
          }}
          onRefreshPops={props.onRefreshPops}
          showToast={props.showToast}
        />
      )}
    </div>
  )
}
