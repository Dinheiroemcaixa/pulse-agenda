import { useState, useMemo, useRef, useEffect } from 'react'
import type { Task, TeamMember, User, Pop, Page } from '../types'
import { getInitials, fDate } from '../lib/utils'
import { PopRunnerModal } from '../components/PopRunnerModal'
import {
  canAccessModule,
  canAccessTaskRecord,
  canViewAllTasks,
  isUserActive,
} from '../lib/accessControlApi'

interface Props {
  atrasadas: Task[]
  team: TeamMember[]
  currentUser: User
  isAdmin: boolean
  pops?: Pop[]
  onRefreshPops?: () => Promise<void>
  setPage?: (p: Page) => void
  onComplete: (id: string, fromAtrasadas: boolean) => Promise<boolean>
  onDeleteAtrasada: (id: string) => Promise<boolean | void>
  openEditTask: (id: string) => void
  showToast: (msg: string, type?: string) => void
}

export interface BulkDeleteResult {
  deletedIds: string[]
  failedIds: string[]
  remainingSelectedIds: string[]
  toastMessage: string
  toastType: 'warn' | 'error'
}

export interface BulkCompleteResult {
  completedIds: string[]
  failedIds: string[]
  remainingSelectedIds: string[]
  toastMessage: string
  toastType: 'success' | 'error'
}

export function getFilteredAtrasadas(
  atrasadas: Task[],
  currentUser: User,
  isAdmin: boolean,
  scope: 'mine' | 'all',
  search: string
): Task[] {
  if (!currentUser || !isUserActive(currentUser) || !canAccessModule(currentUser, 'atrasadas')) {
    return []
  }

  let list = atrasadas.filter(a => canAccessTaskRecord(currentUser, a))
  const effectiveScope = isAdmin && canViewAllTasks(currentUser) ? scope : 'mine'
  if (effectiveScope === 'mine') {
    list = list.filter(a => a.resp.trim().toLowerCase() === currentUser.name.trim().toLowerCase())
  }
  if (search) {
    const q = search.toLowerCase()
    list = list.filter(a => a.descricao.toLowerCase().includes(q))
  }

  return [...list].sort((a, b) => (a.date || '—').localeCompare(b.date || '—'))
}

export function formatBulkDeleteConfirmationMessage(count: number, allDisplayedSelected = false): string {
  if (count === 1) {
    return 'Deseja excluir 1 tarefa atrasada selecionada? Essa ação não poderá ser desfeita.'
  }
  if (allDisplayedSelected) {
    return `Deseja excluir todas as ${count} tarefas atrasadas selecionadas na visualização atual? Essa ação não poderá ser desfeita.`
  }
  return `Deseja excluir ${count} tarefas atrasadas selecionadas? Essa ação não poderá ser desfeita.`
}

export function formatBulkCompleteConfirmationMessage(
  count: number,
  scopeLabel?: string,
  searchQuery?: string
): string {
  const details: string[] = []
  if (scopeLabel) details.push(scopeLabel)
  if (searchQuery && searchQuery.trim()) details.push(`busca "${searchQuery.trim()}"`)
  const contextSuffix = details.length > 0 ? ` (${details.join(' • ')})` : ''

  if (count === 1) {
    return `Deseja concluir a única tarefa atrasada abrangida pela seleção geral${contextSuffix}?`
  }
  return `Deseja concluir todas as ${count} tarefas atrasadas abrangidas pela seleção geral${contextSuffix}?`
}

export async function executeBulkCompleteAtrasadas(params: {
  selectedIds: string[]
  displayedTasks: Task[]
  currentUser: User
  onComplete: (id: string, fromAtrasadas: boolean) => Promise<boolean>
  onProgress?: (done: number, total: number) => void
}): Promise<BulkCompleteResult> {
  const selectedSet = new Set(params.selectedIds)
  const targets = params.displayedTasks.filter(t => selectedSet.has(t.id))

  if (!params.currentUser || !isUserActive(params.currentUser) || !canAccessModule(params.currentUser, 'atrasadas')) {
    const allIds = targets.map(t => t.id)
    return {
      completedIds: [],
      failedIds: allIds,
      remainingSelectedIds: allIds,
      toastMessage: '🚫 Você não possui permissão para concluir tarefas atrasadas.',
      toastType: 'error',
    }
  }

  const completedIds: string[] = []
  const failedIds: string[] = []
  let done = 0

  for (const task of targets) {
    if (!canAccessTaskRecord(params.currentUser, task)) {
      failedIds.push(task.id)
      done++
      params.onProgress?.(done, targets.length)
      continue
    }

    try {
      const ok = await params.onComplete(task.id, true)
      if (!ok) {
        failedIds.push(task.id)
      } else {
        completedIds.push(task.id)
      }
    } catch (err) {
      console.error('❌ Erro ao concluir tarefa atrasada em massa:', task.id, err)
      failedIds.push(task.id)
    }

    done++
    params.onProgress?.(done, targets.length)
  }

  const completedSet = new Set(completedIds)
  const remainingSelectedIds = targets.map(t => t.id).filter(id => !completedSet.has(id))

  let toastMessage = ''
  let toastType: 'success' | 'error' = 'success'

  if (failedIds.length === 0) {
    toastMessage =
      completedIds.length === 1
        ? '✅ 1 tarefa atrasada concluída!'
        : `✅ ${completedIds.length} tarefas atrasadas concluídas!`
    toastType = 'success'
  } else if (completedIds.length > 0 && failedIds.length > 0) {
    toastMessage = `⚠️ Conclusão parcial: ${completedIds.length} concluída(s) e ${failedIds.length} falhou/falharam.`
    toastType = 'error'
  } else {
    toastMessage =
      failedIds.length === 1
        ? '❌ Não foi possível concluir a tarefa selecionada.'
        : `❌ Não foi possível concluir as ${failedIds.length} tarefas selecionadas.`
    toastType = 'error'
  }

  return {
    completedIds,
    failedIds,
    remainingSelectedIds,
    toastMessage,
    toastType,
  }
}

export async function executeBulkDeleteAtrasadas(params: {
  selectedIds: string[]
  displayedTasks: Task[]
  currentUser: User
  onDeleteAtrasada: (id: string) => Promise<boolean | void>
  onProgress?: (done: number, total: number) => void
}): Promise<BulkDeleteResult> {
  const selectedSet = new Set(params.selectedIds)
  const targets = params.displayedTasks.filter(t => selectedSet.has(t.id))

  if (!params.currentUser || !isUserActive(params.currentUser) || !canAccessModule(params.currentUser, 'atrasadas')) {
    const allIds = targets.map(t => t.id)
    return {
      deletedIds: [],
      failedIds: allIds,
      remainingSelectedIds: allIds,
      toastMessage: '🚫 Você não possui permissão para excluir tarefas atrasadas.',
      toastType: 'error',
    }
  }

  const deletedIds: string[] = []
  const failedIds: string[] = []
  let done = 0

  for (const task of targets) {
    if (!canAccessTaskRecord(params.currentUser, task)) {
      failedIds.push(task.id)
      done++
      params.onProgress?.(done, targets.length)
      continue
    }

    try {
      const res = await params.onDeleteAtrasada(task.id)
      if (res === false) {
        failedIds.push(task.id)
      } else {
        deletedIds.push(task.id)
      }
    } catch (err) {
      console.error('❌ Erro ao excluir tarefa atrasada em massa:', task.id, err)
      failedIds.push(task.id)
    }

    done++
    params.onProgress?.(done, targets.length)
  }

  const deletedSet = new Set(deletedIds)
  const remainingSelectedIds = targets.map(t => t.id).filter(id => !deletedSet.has(id))

  let toastMessage = ''
  let toastType: 'warn' | 'error' = 'warn'

  if (failedIds.length === 0) {
    toastMessage =
      deletedIds.length === 1
        ? '🗑 1 tarefa atrasada excluída!'
        : `🗑 ${deletedIds.length} tarefas atrasadas excluídas!`
    toastType = 'warn'
  } else if (deletedIds.length > 0 && failedIds.length > 0) {
    toastMessage = `⚠️ Exclusão parcial: ${deletedIds.length} excluída(s) e ${failedIds.length} falhou/falharam.`
    toastType = 'error'
  } else {
    toastMessage =
      failedIds.length === 1
        ? '❌ Não foi possível excluir a tarefa selecionada.'
        : `❌ Não foi possível excluir as ${failedIds.length} tarefas selecionadas.`
    toastType = 'error'
  }

  return {
    deletedIds,
    failedIds,
    remainingSelectedIds,
    toastMessage,
    toastType,
  }
}

export function AtrasadasPage({ atrasadas, team, currentUser, isAdmin, pops, onRefreshPops, setPage, onComplete, onDeleteAtrasada, openEditTask, showToast }: Props) {
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState<'mine' | 'all'>('mine')
  const [activePopTask, setActivePopTask] = useState<Task | null>(null)

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [confirmModalMode, setConfirmModalMode] = useState<'delete-selected' | 'complete-all' | null>(null)
  const [activeBulkOp, setActiveBulkOp] = useState<'delete' | 'complete-selected' | 'complete-all' | null>(null)
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)
  const [busySingleId, setBusySingleId] = useState<string | null>(null)

  const bulkOpLockRef = useRef(false)
  const singleOpLockRef = useRef<string | null>(null)

  const getMember = (name: string) => team.find(m => m.name === name)

  const list = useMemo(
    () => getFilteredAtrasadas(atrasadas, currentUser, isAdmin, scope, search),
    [atrasadas, currentUser, isAdmin, scope, search]
  )

  const visibleIdSet = useMemo(() => new Set(list.map(a => a.id)), [list])

  // Mantém a seleção sincronizada apenas com as tarefas atualmente exibidas pelos filtros ativos
  useEffect(() => {
    setSelectedIds(prev => {
      const next = prev.filter(id => visibleIdSet.has(id))
      return next.length === prev.length ? prev : next
    })
  }, [visibleIdSet])

  const activeSelectedIds = useMemo(
    () => selectedIds.filter(id => visibleIdSet.has(id)),
    [selectedIds, visibleIdSet]
  )
  const selectedSet = useMemo(() => new Set(activeSelectedIds), [activeSelectedIds])

  const allSelected = list.length > 0 && activeSelectedIds.length === list.length
  const someSelected = activeSelectedIds.length > 0 && activeSelectedIds.length < list.length
  const isBulkBusy = activeBulkOp !== null
  const isBusy = isBulkBusy || Boolean(busySingleId)

  const toggleSelectOne = (id: string) => {
    if (isBusy) return
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    )
  }

  const toggleSelectAll = () => {
    if (isBusy) return
    if (allSelected) {
      setSelectedIds([])
    } else {
      setSelectedIds(list.map(a => a.id))
    }
  }

  const handleSingleComplete = async (id: string) => {
    if (bulkOpLockRef.current || singleOpLockRef.current) return
    singleOpLockRef.current = id
    setBusySingleId(id)
    try {
      const ok = await onComplete(id, true)
      if (ok) {
        setSelectedIds(prev => prev.filter(item => item !== id))
        showToast('✅ Concluída!', 'success')
      } else {
        showToast('❌ Não foi possível concluir a tarefa.', 'error')
      }
    } catch (err) {
      console.error('❌ Erro ao concluir tarefa atrasada:', id, err)
      showToast('❌ Não foi possível concluir a tarefa.', 'error')
    } finally {
      singleOpLockRef.current = null
      setBusySingleId(null)
    }
  }

  const handleSingleDelete = async (id: string) => {
    if (bulkOpLockRef.current || singleOpLockRef.current) return
    singleOpLockRef.current = id
    setBusySingleId(id)
    try {
      const ok = await onDeleteAtrasada(id)
      if (ok === false) {
        showToast('❌ Não foi possível remover a tarefa.', 'error')
      } else {
        setSelectedIds(prev => prev.filter(item => item !== id))
        showToast('🗑 Removida', 'warn')
      }
    } catch (err) {
      console.error('❌ Erro ao excluir tarefa atrasada:', id, err)
      showToast('❌ Não foi possível remover a tarefa.', 'error')
    } finally {
      singleOpLockRef.current = null
      setBusySingleId(null)
    }
  }

  const handleBulkCompleteSelected = async () => {
    if (bulkOpLockRef.current || singleOpLockRef.current || activeSelectedIds.length === 0) {
      return
    }
    bulkOpLockRef.current = true
    setActiveBulkOp('complete-selected')
    setBulkProgress({ done: 0, total: activeSelectedIds.length })

    try {
      const result = await executeBulkCompleteAtrasadas({
        selectedIds: activeSelectedIds,
        displayedTasks: list,
        currentUser,
        onComplete,
        onProgress: (done, total) => setBulkProgress({ done, total }),
      })

      setSelectedIds(result.remainingSelectedIds)
      showToast(result.toastMessage, result.toastType)
    } finally {
      bulkOpLockRef.current = false
      setActiveBulkOp(null)
      setBulkProgress(null)
    }
  }

  const handleOpenCompleteAllConfirm = () => {
    if (isBusy || list.length === 0) return
    setSelectedIds(list.map(a => a.id))
    setConfirmModalMode('complete-all')
  }

  const handleConfirmCompleteAll = async () => {
    const allIds = list.map(a => a.id)
    if (bulkOpLockRef.current || singleOpLockRef.current || allIds.length === 0) {
      return
    }
    bulkOpLockRef.current = true
    setActiveBulkOp('complete-all')
    setBulkProgress({ done: 0, total: allIds.length })

    try {
      const result = await executeBulkCompleteAtrasadas({
        selectedIds: allIds,
        displayedTasks: list,
        currentUser,
        onComplete,
        onProgress: (done, total) => setBulkProgress({ done, total }),
      })

      setSelectedIds(result.remainingSelectedIds)
      setConfirmModalMode(null)
      showToast(result.toastMessage, result.toastType)
    } finally {
      bulkOpLockRef.current = false
      setActiveBulkOp(null)
      setBulkProgress(null)
    }
  }

  const handleConfirmBulkDelete = async () => {
    if (bulkOpLockRef.current || singleOpLockRef.current || activeSelectedIds.length === 0) {
      return
    }
    bulkOpLockRef.current = true
    setActiveBulkOp('delete')
    setBulkProgress({ done: 0, total: activeSelectedIds.length })

    try {
      const result = await executeBulkDeleteAtrasadas({
        selectedIds: activeSelectedIds,
        displayedTasks: list,
        currentUser,
        onDeleteAtrasada,
        onProgress: (done, total) => setBulkProgress({ done, total }),
      })

      setSelectedIds(result.remainingSelectedIds)
      setConfirmModalMode(null)
      showToast(result.toastMessage, result.toastType)
    } finally {
      bulkOpLockRef.current = false
      setActiveBulkOp(null)
      setBulkProgress(null)
    }
  }

  // Agrupar por data
  const groups: Record<string, Task[]> = {}
  list.forEach(a => {
    const g = a.date || '—'
    if (!groups[g]) groups[g] = []
    groups[g].push(a)
  })
  const sortedDates = Object.keys(groups).sort((a, b) => a.localeCompare(b))
  const effectiveScopeLabel = isAdmin && canViewAllTasks(currentUser)
    ? (scope === 'all' ? 'Toda a equipe' : 'Minhas atrasadas')
    : 'Minhas atrasadas'

  return (
    <>
      <div className="topbar">
        <div>
          <div className="pt">Atrasadas</div>
          <div className="ps">Tarefas que passaram do prazo</div>
        </div>
        <input className="search" style={{ maxWidth: 210 }} placeholder="🔍 Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
        {isAdmin && (
          <select className="hist-filter-sel" value={scope} onChange={e => setScope(e.target.value as 'mine' | 'all')}>
            <option value="mine">Minhas atrasadas</option>
            <option value="all">Toda a equipe</option>
          </select>
        )}
        {list.length > 0 && (
          <div className="fg" style={{ marginLeft: 'auto', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <button
              type="button"
              className={`fb ${allSelected ? 'active' : ''}`}
              onClick={toggleSelectAll}
              disabled={isBusy}
              title="Selecionar ou desmarcar todas as tarefas atrasadas exibidas"
              style={{ padding: '6px 10px', fontSize: 12 }}
            >
              {allSelected
                ? `☑ Desmarcar todas (${list.length})`
                : someSelected
                ? `⊟ Selecionar todas (${activeSelectedIds.length}/${list.length})`
                : `☐ Selecionar todas (${list.length})`}
            </button>
            <button
              type="button"
              className="fb"
              disabled={isBusy || activeSelectedIds.length === 0}
              onClick={handleBulkCompleteSelected}
              title="Concluir apenas as tarefas atrasadas marcadas"
              style={{
                padding: '6px 10px',
                fontSize: 12,
                background: activeSelectedIds.length > 0 ? 'var(--greenbg)' : undefined,
                borderColor: activeSelectedIds.length > 0 ? 'var(--green)' : undefined,
                color: activeSelectedIds.length > 0 ? 'var(--green)' : undefined,
                fontWeight: activeSelectedIds.length > 0 ? 700 : undefined,
                opacity: isBusy || activeSelectedIds.length === 0 ? 0.5 : 1,
                cursor: isBusy || activeSelectedIds.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {activeBulkOp === 'complete-selected' && bulkProgress
                ? `⏳ Concluindo (${bulkProgress.done}/${bulkProgress.total})...`
                : `✓ Concluir selecionadas (${activeSelectedIds.length})`}
            </button>
            <button
              type="button"
              className="fb"
              disabled={isBusy || list.length === 0}
              onClick={handleOpenCompleteAllConfirm}
              title="Selecionar e concluir todas as tarefas atrasadas exibidas (com confirmação)"
              style={{
                padding: '6px 10px',
                fontSize: 12,
                background: 'var(--greenbg)',
                borderColor: 'var(--green)',
                color: 'var(--green)',
                fontWeight: 700,
                opacity: isBusy ? 0.6 : 1,
                cursor: isBusy ? 'not-allowed' : 'pointer',
              }}
            >
              {activeBulkOp === 'complete-all' && bulkProgress
                ? `⏳ Concluindo todas (${bulkProgress.done}/${bulkProgress.total})...`
                : `✓✓ Concluir todas (${list.length})`}
            </button>
            <button
              type="button"
              className="fb"
              disabled={isBusy || activeSelectedIds.length === 0}
              onClick={() => !isBusy && activeSelectedIds.length > 0 && setConfirmModalMode('delete-selected')}
              title="Excluir apenas as tarefas atrasadas marcadas (com confirmação)"
              style={{
                padding: '6px 10px',
                fontSize: 12,
                background: activeSelectedIds.length > 0 ? 'var(--redbg)' : undefined,
                borderColor: activeSelectedIds.length > 0 ? 'var(--red)' : undefined,
                color: activeSelectedIds.length > 0 ? 'var(--red)' : undefined,
                fontWeight: activeSelectedIds.length > 0 ? 700 : undefined,
                opacity: isBusy || activeSelectedIds.length === 0 ? 0.5 : 1,
                cursor: isBusy || activeSelectedIds.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {activeBulkOp === 'delete' && bulkProgress
                ? `⏳ Excluindo (${bulkProgress.done}/${bulkProgress.total})...`
                : `🗑 Excluir selecionadas (${activeSelectedIds.length})`}
            </button>
          </div>
        )}
      </div>
      <div className="content">
        {list.length === 0 ? (
          <div className="es"><div className="ei">🎉</div><div className="et">Nenhuma tarefa atrasada!</div><div style={{ color: 'var(--text3)', fontSize: 13 }}>Tudo em dia por aqui.</div></div>
        ) : sortedDates.map(dateKey => {
          const items = groups[dateKey]
          return (
            <div key={dateKey} className="hist-group">
              <div className="hist-group-title" style={{ color: 'var(--red)' }}>
                📅 {fDate(dateKey)} <span style={{ color: 'var(--accent)', fontSize: 10 }}>{items.length}</span>
              </div>
              {items.map(a => {
                const m = getMember(a.resp)
                const mc = m?.color || '#ff4d6d'
                const diasAtraso = a.date ? Math.floor((Date.now() - new Date(a.date + 'T00:00:00').getTime()) / 86400000) : 0
                const isChecked = selectedSet.has(a.id)
                return (
                  <div
                    key={a.id}
                    className="hist-card"
                    style={{
                      borderLeft: `3px solid ${a.recur && a.recur !== 'none' ? 'var(--orange)' : 'var(--red)'}`,
                      boxShadow: isChecked ? '0 0 0 1px var(--red)' : undefined,
                    }}
                  >
                    <div
                      className="hist-card-check"
                      onClick={() => toggleSelectOne(a.id)}
                      title={isChecked ? 'Clique para desmarcar' : 'Clique para selecionar'}
                      style={{
                        background: 'var(--redbg)',
                        color: 'var(--red)',
                        border: '1.5px solid var(--red)',
                        cursor: isBusy ? 'not-allowed' : 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      !
                    </div>
                    <div className="hist-card-body">
                      <div className="hist-card-title">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isBusy}
                          onChange={() => toggleSelectOne(a.id)}
                          aria-label={`Selecionar tarefa ${a.descricao}`}
                          title={isChecked ? 'Desmarcar tarefa' : 'Selecionar tarefa'}
                          style={{
                            width: 14,
                            height: 14,
                            marginRight: 7,
                            accentColor: 'var(--red)',
                            cursor: isBusy ? 'not-allowed' : 'pointer',
                            verticalAlign: '-2px',
                          }}
                        />
                        {a.recur && a.recur !== 'none' && <span style={{ marginRight: 5, opacity: 0.7 }}>🔁</span>}
                        {a.descricao}
                      </div>
                      <div className="hist-card-meta">
                        <div className="asgn">
                          <div className="avsm" style={{ background: mc, width: 18, height: 18, fontSize: 8 }}>{getInitials(a.resp)}</div>
                          <span style={{ fontSize: 11, color: 'var(--text2)' }}>{a.resp.split(' ')[0]}</span>
                        </div>
                        <span style={{ fontSize: 10, background: 'var(--redbg)', color: 'var(--red)', borderRadius: 3, padding: '1px 6px', fontWeight: 700 }}>
                          ⏰ {diasAtraso} dia{diasAtraso !== 1 ? 's' : ''} atrasada
                        </span>
                      </div>
                    </div>
                    <div className="hist-card-right">
                      <div className="hist-card-date" style={{ color: 'var(--red)' }}>📅 {fDate(a.date)}</div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setActivePopTask(a)}
                          style={{
                            height: 26,
                            padding: '0 9px',
                            borderRadius: 6,
                            border: '1px solid #3b52d6',
                            background: '#1b2550',
                            color: '#a9b8ff',
                            font: "600 11px 'IBM Plex Sans', sans-serif",
                            cursor: isBusy ? 'not-allowed' : 'pointer'
                          }}
                        >
                          POP
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          style={{ background: 'var(--greenbg)', border: '1px solid var(--green)', borderRadius: 6, padding: '4px 9px', color: 'var(--green)', fontSize: 11, fontWeight: 700, cursor: isBusy ? 'not-allowed' : 'pointer' }}
                          onClick={() => handleSingleComplete(a.id)}>✓ Concluir</button>
                        <button
                          type="button"
                          disabled={isBusy}
                          style={{ background: 'var(--accentbg)', border: '1px solid var(--accent)', borderRadius: 6, padding: '4px 9px', color: 'var(--accent)', fontSize: 11, fontWeight: 700, cursor: isBusy ? 'not-allowed' : 'pointer' }}
                          onClick={() => openEditTask(a.id)}>✏</button>
                        <button
                          type="button"
                          disabled={isBusy}
                          style={{ background: 'var(--redbg)', border: '1px solid var(--red)', borderRadius: 6, padding: '4px 9px', color: 'var(--red)', fontSize: 11, fontWeight: 700, cursor: isBusy ? 'not-allowed' : 'pointer' }}
                          onClick={() => handleSingleDelete(a.id)}>✕</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {confirmModalMode === 'delete-selected' && (
        <div
          className="modal-overlay"
          onClick={e => {
            if (e.target === e.currentTarget && !isBulkBusy) {
              setConfirmModalMode(null)
            }
          }}
        >
          <div className="modal confirm-modal">
            <div className="confirm-title" style={{ color: 'var(--red)' }}>
              🗑 Excluir tarefas selecionadas
            </div>
            <div className="confirm-body">
              {formatBulkDeleteConfirmationMessage(activeSelectedIds.length, allSelected)}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="bcancel"
                disabled={isBulkBusy}
                onClick={() => setConfirmModalMode(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isBulkBusy || activeSelectedIds.length === 0}
                onClick={handleConfirmBulkDelete}
                style={{
                  background: 'var(--red)',
                  border: '1px solid var(--red)',
                  borderRadius: 8,
                  padding: '9px 16px',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: isBulkBusy ? 'not-allowed' : 'pointer',
                  opacity: isBulkBusy ? 0.7 : 1,
                }}
              >
                {activeBulkOp === 'delete' && bulkProgress
                  ? `Excluindo (${bulkProgress.done}/${bulkProgress.total})...`
                  : `Excluir (${activeSelectedIds.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmModalMode === 'complete-all' && (
        <div
          className="modal-overlay"
          onClick={e => {
            if (e.target === e.currentTarget && !isBulkBusy) {
              setConfirmModalMode(null)
            }
          }}
        >
          <div className="modal confirm-modal">
            <div className="confirm-title" style={{ color: 'var(--green)' }}>
              ✓✓ Concluir todas as tarefas atrasadas exibidas
            </div>
            <div className="confirm-body">
              {formatBulkCompleteConfirmationMessage(list.length, effectiveScopeLabel, search)}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="bcancel"
                disabled={isBulkBusy}
                onClick={() => setConfirmModalMode(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isBulkBusy || list.length === 0}
                onClick={handleConfirmCompleteAll}
                style={{
                  background: 'var(--green)',
                  border: '1px solid var(--green)',
                  borderRadius: 8,
                  padding: '9px 16px',
                  color: '#0b101b',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: isBulkBusy ? 'not-allowed' : 'pointer',
                  opacity: isBulkBusy ? 0.7 : 1,
                }}
              >
                {activeBulkOp === 'complete-all' && bulkProgress
                  ? `Concluindo (${bulkProgress.done}/${bulkProgress.total})...`
                  : `Concluir todas (${list.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {activePopTask && (
        <PopRunnerModal
          task={activePopTask}
          pops={pops || []}
          isAdmin={isAdmin}
          onClose={() => setActivePopTask(null)}
          onOpenLibrary={() => {
            setActivePopTask(null)
            setPage?.('pops')
          }}
          onRefreshPops={onRefreshPops}
          showToast={showToast}
        />
      )}
    </>
  )
}
