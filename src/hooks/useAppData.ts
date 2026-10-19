import { useState, useCallback, useMemo, useRef } from 'react'
import { sb } from '../lib/supabase'
import { genId, getTodayStr, isTodayValidForRecur, getNextOccurrenceAfter, isLate } from '../lib/utils'
import type { Task, TeamMember, Meeting, Backup, Pop, User } from '../types'
import { fetchPopsApi } from '../lib/popsApi'
import {
  canAccessModule,
  canAccessTaskRecord,
  canViewAllTasks,
  filterTasksForUser,
  isUserActive,
} from '../lib/accessControlApi'

// ============================================================
// LÓGICA DE RECORRÊNCIA — ARQUITETURA VIRTUAL
//
// PRINCÍPIO: Cada série recorrente tem APENAS 1 registro mestre no banco.
// As ocorrências diárias são geradas VIRTUALMENTE no front-end.
//
// FLUXO:
//  - Abrir o app → gera ocorrências virtuais para exibição (sem gravar no banco)
//  - Concluir uma virtual → materializa no banco como completed=true
//  - Tarefa real já concluída → bloqueia nova virtual para aquela data
//  - Tarefa vencida (data < hoje, não concluída) → aparece como atrasada
//
// BANCO:
//  - tasks: mestres das séries + tarefas únicas + ocorrências materializadas
//  - atrasadas: tarefas NÃO recorrentes que venceram (só para registro)
//  - hist: tudo que foi concluído
//
// CORREÇÃO DO BUG do app antigo:
//  - recurrenceMasters filtra status !== 'completed' E !completed
//  - Mestre do grupo = ocorrência mais RECENTE (não mais antiga)
// ============================================================

export function useAppData(currentUser?: User | null) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [hist, setHist] = useState<Task[]>([])
  const [meets, setMeets] = useState<Meeting[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [backups, setBackups] = useState<Backup[]>([])
  const [pops, setPops] = useState<Pop[]>([])

  const [loading, setLoading] = useState(false)

  // Estado local para subtarefas de tarefas virtuais (não persiste no tasks state)
  // Chave: virtual task ID → array de booleans (done por índice)
  const [vsOverrides, setVsOverrides] = useState<Record<string, boolean[]>>({})

  // ── EXPANDED TASKS (lógica virtual) ──────────────────────
  // Gera ocorrências para séries recorrentes desde a data inicial de cada série
  // SEM criar registros antecipados no banco
  const expandedTasks = useMemo(() => {
    const todayStr = getTodayStr()
    const today = new Date(todayStr + 'T00:00:00')

    const rangeEnd = new Date(today)
    rangeEnd.setDate(rangeEnd.getDate() + 90)

    // Unificar fonte de dados: Tarefas atuais
    const result: Task[] = [...tasks]

    // Lookup de datas já materializadas por série
    // Garante que ocorrências já gravadas em tasks (físicas) OU concluídas em hist
    // NUNCA sejam geradas novamente como virtuais (deduplicação absoluta).
    const materializedKeys = new Set<string>()
    tasks.forEach(t => {
      if (t.recur_group_id && t.date) {
        materializedKeys.add(`${t.recur_group_id}_${t.date}`)
      }
    })
    hist.forEach(h => {
      if (h.recur_group_id && h.date) {
        materializedKeys.add(`${h.recur_group_id}_${h.date}`)
      }
    })

    // Agrupa mestres por série — pega o mais RECENTE não concluído
    const recurrenceMasters = tasks.filter(t =>
      t.recur && t.recur !== 'none' &&
      t.recur_group_id &&
      t.status !== 'Concluída'
    )

    const groups: Record<string, Task> = {}
    recurrenceMasters.forEach(t => {
      const gid = t.recur_group_id!
      if (!groups[gid]) {
        groups[gid] = t
      } else {
        // MESTRE = O mais ANTIGO não concluído para servir de âncora para o gerador
        if (t.date < groups[gid].date) {
          groups[gid] = t
        }
      }
    })

    // Para cada série, gera ocorrências virtuais desde a data de início da série até rangeEnd
    Object.values(groups).forEach(master => {
      const recurStart = master.recur_start || master.date
      let masterDate = new Date(recurStart + 'T00:00:00')
      if (isNaN(masterDate.getTime())) {
        masterDate = new Date(today)
      }

      // Itera dia a dia a partir da data de início da série (sem descartar pendências passadas)
      const current = new Date(masterDate)
      current.setHours(0, 0, 0, 0)

      let count = 0
      while (current <= rangeEnd && count < 1000) {
        const y = current.getFullYear()
        const mo = String(current.getMonth() + 1).padStart(2, '0')
        const dy = String(current.getDate()).padStart(2, '0')
        const dateStr = `${y}-${mo}-${dy}`
        const key = `${master.recur_group_id}_${dateStr}`

        // Só gera virtual se não existe registro real para esta data/série (nem em tasks nem em hist)
        if (!materializedKeys.has(key)) {
          const recurDays = Array.isArray(master.recur_days) ? master.recur_days : []
          const dayOfWeek = current.getDay()
          let matches = false

          if (master.recur === 'daily') {
            matches = true
          } else if (master.recur === 'weekdays') {
            matches = dayOfWeek >= 1 && dayOfWeek <= 5
          } else if (master.recur === 'weekly') {
            const orig = new Date(recurStart + 'T00:00:00')
            matches = orig.getDay() === dayOfWeek
          } else if (master.recur === 'monthly') {
            const orig = new Date(recurStart + 'T00:00:00')
            matches = orig.getDate() === current.getDate()
          } else if (master.recur === 'custom' && recurDays.length > 0) {
            const dayNames = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']
            matches = recurDays.includes(dayNames[dayOfWeek])
          }

          if (matches) {
            const virtualId = `virtual_${master.recur_group_id}_${dateStr}`
            const override = vsOverrides[virtualId]
            result.push({
              ...master,
              id: virtualId,
              date: dateStr,
              status: 'Em Aberto',
              // Usa override local se existir, senão inicia do zero (done: false)
              subtasks: (master.subtasks || []).map((s, i) => ({
                ...s,
                done: override ? (override[i] ?? false) : false,
              })),
              completed_at: undefined,
              moved_at: undefined,
              isVirtual: true as any,
            })
          }
        }

        current.setDate(current.getDate() + 1)
        count++
      }
    })

    // Desduplicação final: Real > Virtual para mesmo grupo+data
    const finalResult: Task[] = []
    const seenKeys = new Map<string, Task>()

    result.forEach(t => {
      const key = t.recur_group_id
        ? `${t.recur_group_id}_${t.date}`
        : t.id

      if (!seenKeys.has(key)) {
        seenKeys.set(key, t)
        finalResult.push(t)
      } else {
        const existing = seenKeys.get(key)!
        const isNewReal = !(t as any).isVirtual && (existing as any).isVirtual
        if (isNewReal) {
          seenKeys.set(key, t)
          const idx = finalResult.findIndex(x => x === existing)
          if (idx !== -1) finalResult[idx] = t
        }
      }
    })

    return finalResult
  }, [tasks, hist, vsOverrides])

  // ── TAREFAS ATRASADAS DA LISTA PRINCIPAL ─────────────────
  // Captura qualquer tarefa no estado 'tasks' que esteja com data passada
  // e não concluída. Isso unifica contadores para recorrentes e não-recorrentes.
  const atrasadasDaLista = useMemo(() => {
    const todayStr = getTodayStr()
    return tasks.filter(t =>
      t.date && t.date < todayStr &&
      t.status !== 'Concluída'
    )
  }, [tasks])

  // ── UNIFICAÇÃO DE ATRASADAS ──────────────────────────────
  // Agora usamos a lista expandida como fonte única de verdade.
  // Qualquer instância (real ou virtual) que esteja atrasada será contada.
  const allAtrasadas = useMemo(() => {
    return expandedTasks.filter((t: Task) => isLate(t))
  }, [expandedTasks])

  // ── LOAD ALL ─────────────────────────────────────────────
  const loadAll = useCallback(async (userOverride?: User | null) => {
    const activeUser = userOverride ?? currentUser
    // Bloqueia carregamento de dados internos para usuários pendentes, suspensos, recusados ou não autenticados
    if (!activeUser || !isUserActive(activeUser)) {
      setTasks([])
      setHist([])
      setMeets([])
      setTeam([])
      setBackups([])
      setPops([])
      setLoading(false)
      return
    }

    setLoading(true)
    const canSeeAll = canViewAllTasks(activeUser)
    const canSeeBackup = canAccessModule(activeUser, 'backup')
    const userRespName = (activeUser.name || '').trim()

    // Auto-paginação para buscar tarefas respeitando escopo de propriedade/atribuição
    const fetchAllTasks = async () => {
      let all: any[] = []
      let from = 0
      const step = 1000
      while (true) {
        let q = sb.from('tasks').select('*').order('sort_order', { ascending: true })
        if (!canSeeAll) {
          q = q.ilike('resp', userRespName)
        }
        const { data, error } = await q.range(from, from + step - 1)
        if (error || !data || data.length === 0) break
        all = all.concat(data)
        if (data.length < step) break
        from += step
      }
      return { data: filterTasksForUser(activeUser, all) }
    }

    // Auto-paginação para buscar histórico respeitando escopo de propriedade/atribuição
    const fetchAllHist = async () => {
      let all: any[] = []
      let from = 0
      const step = 1000
      while (true) {
        let q = sb.from('hist').select('*').order('created_at', { ascending: false })
        if (!canSeeAll) {
          q = q.ilike('resp', userRespName)
        }
        const { data, error } = await q.range(from, from + step - 1)
        if (error || !data || data.length === 0) break
        all = all.concat(data)
        if (data.length < step) break
        from += step
      }
      return { data: filterTasksForUser(activeUser, all) }
    }

    const [tasksRes, histRes, meetsRes, teamRes, backupsRes] = await Promise.all([
      fetchAllTasks(),
      fetchAllHist(),
      sb.from('meets').select('*').order('created_at', { ascending: false }),
      sb.from('team').select('*'),
      canSeeBackup
        ? sb.from('backup_tasks').select('id,backup_date,backup_label,created_at').order('created_at', { ascending: false }).limit(30)
        : Promise.resolve({ data: [] as Backup[] }),
    ])

    // Normaliza campos de data (remove parte de hora se houver) para evitar bugs de filtro e recorrência
    const normalizeDate = (d?: string) => d ? d.substring(0, 10) : d

    setHist((histRes.data || []).map(h => ({
      ...h,
      date: normalizeDate(h.date),
      recur_start: normalizeDate(h.recur_start)
    })))
    setMeets(meetsRes.data || [])
    setTeam(teamRes.data || [])
    setBackups(backupsRes.data || [])

    setTasks((tasksRes.data || []).map(t => ({
      ...t,
      date: normalizeDate(t.date),
      recur_start: normalizeDate(t.recur_start)
    })))

    // Carregar procedimentos operacionais padrão (POP)
    const popsData = await fetchPopsApi()
    setPops(popsData)

    setLoading(false)
  }, [currentUser])

  const loadPops = useCallback(async () => {
    if (!currentUser || !isUserActive(currentUser)) return
    const data = await fetchPopsApi()
    setPops(data)
  }, [currentUser])

  // ── SAVE TASK ─────────────────────────────────────────────
  const saveTask = useCallback(async (taskData: Partial<Task>, editId?: string): Promise<boolean> => {
    if (!currentUser || !isUserActive(currentUser) || !canAccessModule(currentUser, 'tasks')) {
      return false
    }

    // Se editando uma virtual, materializa como nova tarefa real
    const isVirtual = editId?.startsWith('virtual_')

    // Limpar campos que não pertencem ao banco (como isVirtual)
    const { isVirtual: _iv, ...cleanData } = taskData as any

    // Se o usuário for Operador (sem permissão de gerir tarefas de terceiros), força atribuição a si mesmo
    if (!canViewAllTasks(currentUser)) {
      cleanData.resp = currentUser.name.trim()
    } else if (cleanData.resp) {
      cleanData.resp = cleanData.resp.trim()
    }

    if (editId && !isVirtual) {
      const existingTask = tasks.find(t => t.id === editId)
      if (existingTask && !canAccessTaskRecord(currentUser, existingTask)) {
        console.error('❌ Acesso negado: tentativa de editar tarefa de terceiro sem autorização.')
        return false
      }
      // Editar tarefa real existente
      const { error } = await sb.from('tasks').update(cleanData).eq('id', editId)
      if (error) {
        console.error('❌ Erro ao atualizar tarefa:', error)
        return false
      }
      setTasks(prev => prev.map(t => t.id === editId ? { ...t, ...cleanData } : t))
    } else {
      // Nova tarefa ou materialização de virtual
      const id = genId()
      const { data: allTasks } = await sb.from('tasks').select('sort_order').order('sort_order', { ascending: false }).limit(1)
      const maxOrder = (allTasks && allTasks.length > 0) ? (allTasks[0].sort_order || 0) : 0

      // Gerar recur_group_id para novas tarefas recorrentes
      const recur_group_id = cleanData.recur && cleanData.recur !== 'none'
        ? (cleanData.recur_group_id || `rg_${id}`)
        : undefined

      const newTask = {
        ...cleanData,
        id,
        recur_group_id,
        sort_order: maxOrder + 1,
        created_at: new Date().toISOString()
      } as Task

      const { error } = await sb.from('tasks').insert(newTask)
      if (error) {
        console.error('❌ Erro Supabase (insert task):', error)
        return false
      }
      setTasks(prev => [...prev, newTask])
    }
    return true
  }, [currentUser, tasks])

  const tasksRef = useRef<Task[]>(tasks)
  tasksRef.current = tasks
  const expandedTasksRef = useRef<Task[]>(expandedTasks)
  expandedTasksRef.current = expandedTasks

  // ── COMPLETE TASK ─────────────────────────────────────────
  const completeTask = useCallback(async (id: string, fromAtrasadas = false): Promise<boolean> => {
    if (!currentUser || !isUserActive(currentUser)) return false
    const isVirtual = id.startsWith('virtual_')

    const liveTasks = tasksRef.current
    const liveExpanded = expandedTasksRef.current

    // Busca a tarefa de acordo com a origem
    let t: Task | undefined
    if (isVirtual) {
      t = liveExpanded.find(x => x.id === id)
    } else if (fromAtrasadas) {
      t = liveExpanded.find(x => x.id === id) || liveTasks.find(x => x.id === id)
    } else {
      t = liveTasks.find(x => x.id === id) || liveExpanded.find(x => x.id === id)
    }

    if (!t || !canAccessTaskRecord(currentUser, t)) return false


    const completedAt = new Date().toLocaleDateString('pt-BR')
    const histId = isVirtual ? genId() : t.id
    const histItem = {
      id: histId,
      descricao: t.descricao,
      resp: t.resp,
      date: t.date || null,
      prio: t.prio || 'Média',
      status: 'Concluída' as const,
      all_day: t.all_day !== undefined ? t.all_day : true,
      time_start: t.time_start || null,
      time_end: t.time_end || null,
      tags: t.tags || [],
      recur: t.recur || 'none',
      recur_days: t.recur_days || [],
      recur_start: t.recur_start || null,
      recur_group_id: (t as any).recur_group_id || null,
      subtasks: t.subtasks || [],
      notes: t.notes || null,
      is_meeting: t.is_meeting || false,
      completed_at: completedAt,
    }

    const { error: histErr } = await sb.from('hist').insert(histItem)
    if (histErr) { console.error('Erro hist:', histErr); return false }

    if (isVirtual) {
      // Tarefa virtual: materializa como concluída no banco
      const { isVirtual: _iv, ...payload } = t as any
      const completedPayload = {
        ...payload,
        id: histItem.id,
        status: 'Concluída' as const,
        completed_at: completedAt,
      }
      const { error } = await sb.from('tasks').insert(completedPayload)
      if (error) {
        console.warn('Aviso: não materializou virtual como concluída:', error)
        return false
      }
      // Atualiza estado local para remover virtual imediatamente das pendências
      const nextTasks = [...tasksRef.current, completedPayload]
      tasksRef.current = nextTasks
      setTasks(nextTasks)

    } else if ((t as any).recur_group_id && t.recur && t.recur !== 'none') {
      // ── TAREFA MESTRE RECORRENTE ────────────────────────────
      // 1. Materializa a data original como concluída (bloqueia re-geração virtual)
      // 2. Avança o mestre para a próxima ocorrência
      const originalDate = t.date
      const completedRecord = {
        ...(t as any),
        id: genId(),
        date: originalDate,
        status: 'Concluída' as const,
        completed_at: completedAt,
        isVirtual: undefined,
      }
      const { error: insErr } = await sb.from('tasks').insert(completedRecord)
      if (insErr) {
        console.error('Erro ao inserir registro concluído recorrente:', insErr)
        return false
      }

      // Avança o mestre para a próxima ocorrência
      const baseDate = originalDate < getTodayStr() ? getTodayStr() : originalDate
      const nextDate = getNextOccurrenceAfter(
        t.recur!,
        t.recur_days || [],
        t.recur_start || originalDate,
        baseDate
      )
      if (nextDate) {
        const { error: updErr } = await sb.from('tasks').update({ date: nextDate }).eq('id', id)
        if (updErr) {
          console.error('Erro ao avançar tarefa mestre recorrente:', updErr)
          return false
        }
        const nextTasks = [...tasksRef.current, completedRecord].map(x => x.id === id ? { ...x, date: nextDate } : x)
        tasksRef.current = nextTasks
        setTasks(nextTasks)
      } else {
        // Série esgotada — sem mais ocorrências futuras
        const { error: delErr } = await sb.from('tasks').delete().eq('id', id)
        if (delErr) {
          console.error('Erro ao remover mestre de série esgotada:', delErr)
          return false
        }
        const nextTasks = [...tasksRef.current, completedRecord].filter(x => x.id !== id)
        tasksRef.current = nextTasks
        setTasks(nextTasks)
      }

    } else {
      // Tarefa não-recorrente comum
      const { error: delErr } = await sb.from('tasks').delete().eq('id', id)
      if (delErr) {
        console.error('Erro ao remover tarefa concluída:', delErr)
        return false
      }
      const nextTasks = tasksRef.current.filter(x => x.id !== id)
      tasksRef.current = nextTasks
      setTasks(nextTasks)
    }

    setHist(prev => [histItem as unknown as Task, ...prev])
    return true
  }, [currentUser, tasks, expandedTasks])

  // ── DELETE TASK ───────────────────────────────────────────
  const deleteTask = useCallback(async (id: string, deleteAll = false): Promise<void> => {
    if (!currentUser || !isUserActive(currentUser)) return
    const isVirtual = id.startsWith('virtual_')
    
    if (isVirtual) {
      // Tarefa virtual: para "deletar" sem apagar a série, 
      // materializamos ela como 'Concluída' no banco para aquela data específica.
      const t = expandedTasks.find(x => x.id === id)
      if (!t || !canAccessTaskRecord(currentUser, t)) return
      
      const { isVirtual: _iv, ...payload } = t as any
      const completedAt = new Date().toLocaleDateString('pt-BR')
      const deletedRecord = {
        ...payload,
        id: genId(),
        status: 'Concluída' as const,
        completed_at: completedAt,
      }
      await sb.from('tasks').insert(deletedRecord)
      setTasks(prev => [...prev, deletedRecord])
      return
    }

    const t = tasks.find(x => x.id === id)
    if (!t || !canAccessTaskRecord(currentUser, t)) return

    if (deleteAll && t.recur_group_id) {
      // Deleta todos os registros reais da série
      await sb.from('tasks').delete().eq('recur_group_id', t.recur_group_id)
      setTasks(prev => prev.filter(x => x.recur_group_id !== t.recur_group_id))
    } else {
      await sb.from('tasks').delete().eq('id', id)
      setTasks(prev => prev.filter(x => x.id !== id))
    }
  }, [currentUser, tasks, expandedTasks])

  // ── CYCLE STATUS ──────────────────────────────────────────
  const cycleStatus = useCallback(async (id: string): Promise<void> => {
    if (!currentUser || !isUserActive(currentUser)) return
    const isVirtual = id.startsWith('virtual_')
    if (isVirtual) return // Não altera status de virtual sem materializar

    const t = tasks.find(x => x.id === id)
    if (!t || !canAccessTaskRecord(currentUser, t)) return
    const newStatus = t.status === 'Em Aberto' ? 'Em Andamento' : 'Em Aberto'
    const { error } = await sb.from('tasks').update({ status: newStatus }).eq('id', id)
    if (error) {
      console.error('❌ Erro Supabase (cycleStatus):', error)
      return
    }
    setTasks(prev => prev.map(x => x.id === id ? { ...x, status: newStatus } : x))
  }, [currentUser, tasks])

  const reorderTasks = useCallback(async (reordered: Task[]): Promise<void> => {
    if (!currentUser || !isUserActive(currentUser)) return
    // Filtra apenas tarefas reais (exclui virtuais geradas pelo expandedTasks)
    // Sem esse filtro, setTasks recebe centenas de virtuais passadas,
    // corrompendo atrasadasRecorrentes e causando o bug do contador 122+
    const realOnly = reordered.filter(t => !String(t.id).startsWith('virtual_') && canAccessTaskRecord(currentUser, t))
    setTasks(realOnly)
    const updates = realOnly.map((t, i) => sb.from('tasks').update({ sort_order: i }).eq('id', t.id))
    await Promise.all(updates)
  }, [currentUser])

  const reopenTask = useCallback(async (histId: string): Promise<boolean> => {
    if (!currentUser || !isUserActive(currentUser) || !canAccessModule(currentUser, 'history')) return false
    const h = hist.find(x => x.id === histId)
    if (!h || !canAccessTaskRecord(currentUser, h)) return false
    const originalDate = h.date || getTodayStr()
    const { data: allTasks } = await sb.from('tasks').select('sort_order').order('sort_order', { ascending: false }).limit(1)
    const maxOrder = allTasks?.[0]?.sort_order ?? -1
    const newTask: Task = {
      ...h,
      id: h.id || genId(),
      date: originalDate,
      status: 'Em Aberto',
      recur: h.recur || 'none',
      recur_days: h.recur_days || [],
      recur_start: h.recur_start,
      recur_group_id: h.recur_group_id,
      completed_at: undefined,
      sort_order: maxOrder + 1,
    } as Task
    const allCurrent = await sb.from('tasks').select('id,sort_order').order('sort_order', { ascending: true })
    if (allCurrent.data) {
      const ups = allCurrent.data.map(t => sb.from('tasks').update({ sort_order: (t.sort_order || 0) + 1 }).eq('id', t.id))
      await Promise.all(ups)
      setTasks(prev => prev.map(t => ({ ...t, sort_order: (t.sort_order || 0) + 1 })))
    }
    const { error } = await sb.from('tasks').insert(newTask)
    if (error) {
      console.error('❌ Erro Supabase (reopenTask):', error)
      return false
    }
    await sb.from('hist').delete().eq('id', histId)
    setTasks(prev => [newTask, ...prev])
    setHist(prev => prev.filter(x => x.id !== histId))
    return true
  }, [currentUser, hist])

  const deleteAtrasada = useCallback(async (id: string): Promise<boolean> => {
    if (!currentUser || !isUserActive(currentUser) || !canAccessModule(currentUser, 'atrasadas')) return false

    const liveTasks = tasksRef.current
    const liveExpanded = expandedTasksRef.current

    // Virtual recorrente → materializa como concluída silenciosamente (sem hist),
    // exceto se o mestre da série já tiver avançado para esta mesma data durante uma exclusão em massa
    let promotedMaster: Task | undefined
    if (id.startsWith('virtual_')) {
      const vt = liveExpanded.find(x => x.id === id)
      if (!vt || !canAccessTaskRecord(currentUser, vt)) return false

      if (vt.recur_group_id && vt.date) {
        promotedMaster = liveTasks.find(
          x => x.recur_group_id === vt.recur_group_id && x.status !== 'Concluída' && x.date === vt.date
        )
      }

      if (!promotedMaster) {
        const { isVirtual: _iv, ...payload } = vt as any
        const skipped = { ...payload, id: genId(), status: 'Concluída' as const, completed_at: new Date().toLocaleDateString('pt-BR') }
        const { error } = await sb.from('tasks').insert(skipped)
        if (error) {
          console.error('❌ Erro Supabase (deleteAtrasada virtual):', error)
          return false
        }
        const nextTasks = [...tasksRef.current, skipped]
        tasksRef.current = nextTasks
        setTasks(nextTasks)
        return true
      }
    }

    // Tarefa mestre recorrente vencida ou tarefa comum no state tasks
    const t = promotedMaster || liveTasks.find(x => x.id === id)
    if (!t || !canAccessTaskRecord(currentUser, t)) return false
    const realId = t.id

    if ((t as any).recur_group_id && t.recur && t.recur !== 'none') {
      const completedAt = new Date().toLocaleDateString('pt-BR')
      const completedRecord = { ...t, id: genId(), status: 'Concluída' as const, completed_at: completedAt }
      const { error: insErr } = await sb.from('tasks').insert(completedRecord)
      if (insErr) {
        console.error('❌ Erro Supabase (deleteAtrasada recur insert):', insErr)
        return false
      }

      let nextDate = getNextOccurrenceAfter(t.recur!, t.recur_days || [], t.recur_start || t.date, t.date)
      while (
        nextDate &&
        tasksRef.current.some(x => x.recur_group_id === t.recur_group_id && x.date === nextDate && x.status === 'Concluída')
      ) {
        nextDate = getNextOccurrenceAfter(t.recur!, t.recur_days || [], t.recur_start || t.date, nextDate)
      }

      if (nextDate) {
        const { error: updErr } = await sb.from('tasks').update({ date: nextDate }).eq('id', realId)
        if (updErr) {
          console.error('❌ Erro Supabase (deleteAtrasada recur update):', updErr)
          return false
        }
        const nextTasks = [...tasksRef.current, completedRecord].map(x => x.id === realId ? { ...x, date: nextDate } : x)
        tasksRef.current = nextTasks
        setTasks(nextTasks)
      } else {
        const { error: delErr } = await sb.from('tasks').delete().eq('id', realId)
        if (delErr) {
          console.error('❌ Erro Supabase (deleteAtrasada recur delete):', delErr)
          return false
        }
        const nextTasks = [...tasksRef.current, completedRecord].filter(x => x.id !== realId)
        tasksRef.current = nextTasks
        setTasks(nextTasks)
      }
      return true
    } else {
      // Tarefa comum (não recorrente) vinda do tasks state
      const { error } = await sb.from('tasks').delete().eq('id', realId)
      if (error) {
        console.error('❌ Erro Supabase (deleteAtrasada single):', error)
        return false
      }
      const nextTasks = tasksRef.current.filter(x => x.id !== realId)
      tasksRef.current = nextTasks
      setTasks(nextTasks)
      return true
    }
  }, [currentUser, tasks, expandedTasks])

  // ── MEETINGS ──────────────────────────────────────────────
  const saveMeet = useCallback(async (meetData: Partial<Meeting>, editId?: string): Promise<boolean> => {
    if (!currentUser || !isUserActive(currentUser) || !canAccessModule(currentUser, 'meetings')) return false
    if (editId) {
      const { error } = await sb.from('meets').update(meetData).eq('id', editId)
      if (error) return false
      setMeets(prev => prev.map(m => m.id === editId ? { ...m, ...meetData } : m))
    } else {
      const id = genId()
      const newMeet = { ...meetData, id } as Meeting
      const { error } = await sb.from('meets').insert(newMeet)
      if (error) return false
      setMeets(prev => [newMeet, ...prev])
    }
    return true
  }, [currentUser])

  const deleteMeet = useCallback(async (id: string): Promise<void> => {
    if (!currentUser || !isUserActive(currentUser) || !canAccessModule(currentUser, 'meetings')) return
    await sb.from('meets').delete().eq('id', id)
    setMeets(prev => prev.filter(m => m.id !== id))
  }, [currentUser])


  // ── SUBTASKS ──────────────────────────────────────────────
  const toggleSubtask = useCallback(async (taskId: string, idx: number): Promise<void> => {
    if (!currentUser || !isUserActive(currentUser)) return
    const isVirtual = taskId.startsWith('virtual_')

    if (isVirtual) {
      // Tarefa virtual: atualiza o override local (não toca no tasks state)
      // e persiste a alteração no mestre para referência futura
      const virtualTask = expandedTasks.find(x => x.id === taskId)
      if (!virtualTask || !canAccessTaskRecord(currentUser, virtualTask) || !(virtualTask as any).recur_group_id) return
      const master = tasks.find(x =>
        (x as any).recur_group_id === (virtualTask as any).recur_group_id &&
        !String(x.id).startsWith('virtual_') &&
        x.status !== 'Concluída'
      )
      if (!master) return
      // Calcula o novo estado: parte do override existente ou do estado atual da virtual
      const current = vsOverrides[taskId] ?? (virtualTask.subtasks || []).map(s => s.done)
      const newDone = current.map((d, i) => i === idx ? !d : d)
      setVsOverrides(prev => ({ ...prev, [taskId]: newDone }))
      // Persiste no mestre em background (sem alterar tasks state)
      const masterUpdated = (master.subtasks || []).map((s, i) => ({ ...s, done: newDone[i] ?? s.done }))
      await sb.from('tasks').update({ subtasks: masterUpdated }).eq('id', master.id)
      return
    }

    const t = tasks.find(x => x.id === taskId)
    if (!t || !canAccessTaskRecord(currentUser, t)) return
    const updated = t.subtasks.map((s, i) => i === idx ? { ...s, done: !s.done } : s)
    await sb.from('tasks').update({ subtasks: updated }).eq('id', taskId)
    setTasks(prev => prev.map(x => x.id === taskId ? { ...x, subtasks: updated } : x))
  }, [currentUser, tasks, expandedTasks, vsOverrides])

  const addSubtask = useCallback(async (taskId: string, text: string): Promise<void> => {
    if (!currentUser || !isUserActive(currentUser)) return
    const t = tasks.find(x => x.id === taskId)
    if (!t || !canAccessTaskRecord(currentUser, t)) return
    const updated = [...t.subtasks, { text, done: false }]
    await sb.from('tasks').update({ subtasks: updated }).eq('id', taskId)
    setTasks(prev => prev.map(x => x.id === taskId ? { ...x, subtasks: updated } : x))
  }, [currentUser, tasks])

  const deleteSubtask = useCallback(async (taskId: string, idx: number): Promise<void> => {
    if (!currentUser || !isUserActive(currentUser)) return
    const t = tasks.find(x => x.id === taskId)
    if (!t || !canAccessTaskRecord(currentUser, t)) return
    const updated = t.subtasks.filter((_, i) => i !== idx)
    await sb.from('tasks').update({ subtasks: updated }).eq('id', taskId)
    setTasks(prev => prev.map(x => x.id === taskId ? { ...x, subtasks: updated } : x))
  }, [currentUser, tasks])

  // ── TEAM ──────────────────────────────────────────────────
  const updateTeamMember = useCallback(async (id: string, data: Partial<TeamMember>): Promise<boolean> => {
    if (!currentUser || !isUserActive(currentUser) || !canAccessModule(currentUser, 'team')) return false
    // Remove campos sensíveis (como is_admin) de edições operacionais de equipe
    const { is_admin: _ia, ...safeTeamData } = data
    const { error } = await sb.from('team').update(safeTeamData).eq('id', id)
    if (error) return false
    setTeam(prev => prev.map(m => m.id === id ? { ...m, ...safeTeamData } : m))
    return true
  }, [currentUser])

  // ── BACKUP 2.0 ──────────────────────────────────────────
  const createFullSnapshot = useCallback(() => {
    return {
      tasks,
      hist,
      meets,
      atrasadas: [],
      tags: [],
      team,
      version: '2.0',
      generated_at: new Date().toISOString()
    }
  }, [tasks, hist, meets, team])

  const downloadBackupFile = (snapshot: any, label: string) => {
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pulse_backup_${getTodayStr()}_${label.replace(/\s+/g, '_')}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const checkDailyBackup = useCallback(async (): Promise<void> => {
    const todayStr = getTodayStr()
    const now = new Date()
    const hour = now.getHours()
    const period = hour < 12 ? 'Manhã' : 'Tarde'
    const autoLabel = `Auto ${now.toLocaleDateString('pt-BR')} - ${period}`
    
    // Permite até 2 backups automáticos por dia (manhã e tarde)
    const { data: todayBackups } = await sb.from('backup_tasks')
      .select('id, backup_label')
      .ilike('backup_label', 'Auto%')
      .eq('backup_date', todayStr)
    
    if (todayBackups && todayBackups.length >= 2) return // Já tem 2 hoje, não cria mais

    // Verifica se já existe um backup para este período (manhã/tarde)
    const alreadyHasPeriod = todayBackups?.some(b => b.backup_label.includes(period))
    if (alreadyHasPeriod) return // Já tem backup deste período

    // Limpa backups automáticos com mais de 7 dias
    const sevenDaysAgo = new Date(now)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const cutoffDate = sevenDaysAgo.toISOString().split('T')[0] // YYYY-MM-DD

    const { data: oldAutos } = await sb.from('backup_tasks')
      .select('id, backup_date')
      .ilike('backup_label', 'Auto%')
      .lt('backup_date', cutoffDate)
    
    if (oldAutos && oldAutos.length > 0) {
      await sb.from('backup_tasks').delete().in('id', oldAutos.map(b => b.id))
    }

    const id = genId()
    const snapshot = createFullSnapshot()
    
    const { error } = await sb.from('backup_tasks').insert({ 
      id, 
      backup_date: todayStr, 
      backup_label: autoLabel, 
      tasks_snapshot: snapshot 
    })

    if (!error) {
      // Recarrega lista de backups para refletir o novo + remoção dos antigos
      const { data: refreshed } = await sb.from('backup_tasks')
        .select('id,backup_date,backup_label,created_at')
        .order('created_at', { ascending: false })
        .limit(30)
      setBackups(refreshed || [])
      // Dispara download para o PC
      downloadBackupFile(snapshot, `Automatico_${period}`)
    }
  }, [backups, createFullSnapshot])

  const saveBackupManual = useCallback(async (label: string): Promise<void> => {
    const id = genId()
    const todayStr = getTodayStr()
    const finalLabel = label || `Manual ${new Date().toLocaleDateString('pt-BR')}`
    const snapshot = createFullSnapshot()

    const { error } = await sb.from('backup_tasks').insert({ 
      id, 
      backup_date: todayStr, 
      backup_label: finalLabel, 
      tasks_snapshot: snapshot 
    })

    if (!error) {
      const { data } = await sb.from('backup_tasks').select('id,backup_date,backup_label,created_at').order('created_at', { ascending: false }).limit(30)
      setBackups(data || [])
      downloadBackupFile(snapshot, finalLabel)
    }
  }, [createFullSnapshot])

  const deleteBackup = useCallback(async (id: string): Promise<void> => {
    await sb.from('backup_tasks').delete().eq('id', id)
    setBackups(prev => prev.filter(b => b.id !== id))
  }, [])

  const restoreFromBackup = useCallback(async (backupIdOrSnapshot: string | any): Promise<boolean> => {
    setLoading(true)
    let snapshot: any = null

    if (typeof backupIdOrSnapshot === 'string') {
      const { data, error } = await sb.from('backup_tasks').select('tasks_snapshot').eq('id', backupIdOrSnapshot).single()
      if (error || !data) { setLoading(false); return false }
      snapshot = data.tasks_snapshot
    } else {
      snapshot = backupIdOrSnapshot
    }

    if (!snapshot) { setLoading(false); return false }

    try {
      // 1. Limpar tabelas atuais no Supabase
      // Nota: Team não é limpo para evitar perder acesso ao app se algo der errado, 
      // mas as outras tabelas de dados sim.
      await Promise.all([
        sb.from('tasks').delete().neq('id', 'placeholder'),
        sb.from('hist').delete().neq('id', 'placeholder'),
        sb.from('meets').delete().neq('id', 'placeholder'),
        sb.from('tags').delete().neq('id', 'placeholder'),
      ])

      // 2. Inserir dados do backup
      const inserts = []
      if (snapshot.tasks?.length) inserts.push(sb.from('tasks').insert(snapshot.tasks))
      if (snapshot.hist?.length) inserts.push(sb.from('hist').insert(snapshot.hist))
      if (snapshot.meets?.length) inserts.push(sb.from('meets').insert(snapshot.meets))
      if (snapshot.tags?.length) inserts.push(sb.from('tags').insert(snapshot.tags))

      await Promise.all(inserts)
      
      // 3. Atualizar estado local
      setTasks(snapshot.tasks || [])
      setHist(snapshot.hist || [])
      setMeets(snapshot.meets || [])
      // setAtrasadas removido — tudo unificado em tasks
      if (snapshot.team?.length) {
        // Opcional: atualizar equipe se contido no backup
        setTeam(snapshot.team)
      }

      setLoading(false)
      return true
    } catch (err) {
      console.error('Erro na restauração:', err)
      setLoading(false)
      return false
    }
  }, [])

  return {
    tasks,
    expandedTasks,
    hist, meets, team, loading,
    atrasadas: allAtrasadas,
    atrasadasDaLista: allAtrasadas, 
    atrasadasRecorrentes: allAtrasadas, 
    allAtrasadas, backups, pops,
    setTasks, setHist, setMeets, setTeam, setPops,
    loadAll, loadPops,
    saveTask, completeTask, deleteTask, cycleStatus, reorderTasks, reopenTask, deleteAtrasada,
    saveMeet, deleteMeet,
    toggleSubtask, addSubtask, deleteSubtask,
    updateTeamMember,
    checkDailyBackup, saveBackupManual, deleteBackup, restoreFromBackup,
  }
}
