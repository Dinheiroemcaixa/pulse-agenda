import { useState, useCallback } from 'react'
import { sb } from '../lib/supabase'
import { genId, hashPass, getTodayStr, isTodayValidForRecur } from '../lib/utils'
import type { Task, User, TeamMember, Meeting, Tag, Backup } from '../types'

export function useAppData() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [hist, setHist] = useState<Task[]>([])
  const [meets, setMeets] = useState<Meeting[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [atrasadas, setAtrasadas] = useState<Task[]>([])
  const [backups, setBackups] = useState<Backup[]>([])
  const [loading, setLoading] = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true)
    const [tasksRes, histRes, meetsRes, teamRes, tagsRes, atrasadasRes, backupsRes] = await Promise.all([
      sb.from('tasks').select('*').order('sort_order', { ascending: true }),
      sb.from('hist').select('*').order('created_at', { ascending: false }),
      sb.from('meets').select('*').order('created_at', { ascending: false }),
      sb.from('team').select('*'),
      sb.from('tags').select('*'),
      sb.from('atrasadas').select('*').order('date', { ascending: true }),
      sb.from('backup_tasks').select('id,backup_date,backup_label,created_at').order('created_at', { ascending: false }).limit(30),
    ])

    const loadedTasks: Task[] = tasksRes.data || []
    const loadedAtrasadas: Task[] = atrasadasRes.data || []

    setHist(histRes.data || [])
    setMeets(meetsRes.data || [])
    setTeam(teamRes.data || [])
    setTags(tagsRes.data || [])
    setBackups(backupsRes.data || [])

    // 1. Move vencidas para atrasadas (incluindo recorrentes)
    const todayStr = getTodayStr()
    const todayBR = new Date().toLocaleDateString('pt-BR')
    const today = new Date(todayStr + 'T00:00:00')

    let updatedTasks = [...loadedTasks]
    let updatedAtrasadas = [...loadedAtrasadas]

    const vencidas = updatedTasks.filter(t => t.date && t.date < todayStr && t.status !== 'Concluída')
    for (const t of vencidas) {
      const jaEsta = updatedAtrasadas.some(a => a.id === t.id)
      if (jaEsta) continue
      await sb.from('atrasadas').upsert({ ...t, status: 'Atrasada', moved_at: todayBR })
      await sb.from('tasks').delete().eq('id', t.id)
      updatedTasks = updatedTasks.filter(x => x.id !== t.id)
      updatedAtrasadas = [...updatedAtrasadas, { ...t, status: 'Atrasada', moved_at: todayBR }]
    }

    // 2. Gera ocorrências recorrentes para hoje
    // Usa tasks + atrasadas como base
    const recorrentesMap: Record<string, Task> = {}
    for (const t of updatedTasks.filter(t => t.recur && t.recur !== 'none')) {
      const key = `${t.descricao}||${t.resp}||${t.recur}||${t.recur_start || t.date}`
      if (!recorrentesMap[key] || t.date > recorrentesMap[key].date) recorrentesMap[key] = t
    }
    for (const t of updatedAtrasadas.filter(t => t.recur && t.recur !== 'none')) {
      const key = `${t.descricao}||${t.resp}||${t.recur}||${t.recur_start || t.date}`
      if (!recorrentesMap[key] || t.date > recorrentesMap[key].date) recorrentesMap[key] = t
    }

    for (const t of Object.values(recorrentesMap)) {
      if (t.date >= todayStr) continue
      const recurDays = Array.isArray(t.recur_days) ? t.recur_days : []
      const recurStart = t.recur_start || t.date
      if (!isTodayValidForRecur(t.recur, recurDays, recurStart, today)) continue
      const jaExiste = updatedTasks.some(x => x.descricao === t.descricao && x.resp === t.resp && x.recur === t.recur && x.date === todayStr)
      if (jaExiste) continue
      const newTask: Task = {
        ...t,
        id: genId(),
        date: todayStr,
        status: 'Em Aberto',
        completed_at: undefined,
        moved_at: undefined,
        subtasks: (t.subtasks || []).map(s => ({ ...s, done: false })),
        sort_order: t.sort_order,
      }
      await sb.from('tasks').insert(newTask)
      updatedTasks = [...updatedTasks, newTask]
    }

    // Recarrega do banco para garantir consistência
    const { data: finalTasks } = await sb.from('tasks').select('*').order('sort_order', { ascending: true })
    const { data: finalAtrasadas } = await sb.from('atrasadas').select('*').order('date', { ascending: true })

    setTasks(finalTasks || [])
    setAtrasadas(finalAtrasadas || [])
    setLoading(false)
  }, [])

  // ── TASKS ──────────────────────────────────────────────────

  const saveTask = useCallback(async (taskData: Partial<Task>, editId?: string): Promise<boolean> => {
    if (editId) {
      const { error } = await sb.from('tasks').update(taskData).eq('id', editId)
      if (error) return false
      setTasks(prev => prev.map(t => t.id === editId ? { ...t, ...taskData } : t))
    } else {
      const id = genId()
      const { data: allTasks } = await sb.from('tasks').select('sort_order').order('sort_order', { ascending: false }).limit(1)
      const maxOrder = allTasks?.[0]?.sort_order ?? -1
      const newTask = { ...taskData, id, sort_order: maxOrder + 1 } as Task
      const { error } = await sb.from('tasks').insert(newTask)
      if (error) return false
      setTasks(prev => [...prev, newTask])
    }
    return true
  }, [])

  const completeTask = useCallback(async (id: string, fromAtrasadas = false): Promise<boolean> => {
    const list = fromAtrasadas ? atrasadas : tasks
    const t = list.find(x => x.id === id)
    if (!t) return false

    const completedAt = new Date().toLocaleDateString('pt-BR')
    // Constrói histItem SOMENTE com campos que existem na tabela hist
    // Nunca usa spread para evitar enviar sort_order, moved_at, etc.
    const histItem = {
      id: genId(),
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
      subtasks: t.subtasks || [],
      notes: t.notes || null,
      is_meeting: t.is_meeting || false,
      completed_at: completedAt,
    }

    const { error } = await sb.from('hist').insert(histItem)
    if (error) { console.error('Erro hist:', error); return false }

    if (fromAtrasadas) {
      await sb.from('atrasadas').delete().eq('id', id)
      setAtrasadas(prev => prev.filter(x => x.id !== id))
    } else {
      await sb.from('tasks').delete().eq('id', id)
      setTasks(prev => prev.filter(x => x.id !== id))
    }
    setHist(prev => [histItem as unknown as Task, ...prev])
    return true
  }, [tasks, atrasadas])

  const deleteTask = useCallback(async (id: string, deleteAll = false): Promise<void> => {
    const t = tasks.find(x => x.id === id)
    if (!t) return
    if (deleteAll && t.recur && t.recur !== 'none') {
      // Remove todas as da mesma série (mesmo desc+resp+recur)
      const series = tasks.filter(x => x.descricao === t.descricao && x.resp === t.resp && x.recur === t.recur)
      for (const s of series) await sb.from('tasks').delete().eq('id', s.id)
      setTasks(prev => prev.filter(x => !(x.descricao === t.descricao && x.resp === t.resp && x.recur === t.recur)))
    } else {
      await sb.from('tasks').delete().eq('id', id)
      setTasks(prev => prev.filter(x => x.id !== id))
    }
  }, [tasks])

  const cycleStatus = useCallback(async (id: string): Promise<void> => {
    const t = tasks.find(x => x.id === id)
    if (!t) return
    const newStatus = t.status === 'Em Aberto' ? 'Em Andamento' : 'Em Aberto'
    await sb.from('tasks').update({ status: newStatus }).eq('id', id)
    setTasks(prev => prev.map(x => x.id === id ? { ...x, status: newStatus } : x))
  }, [tasks])

  const reorderTasks = useCallback(async (reordered: Task[]): Promise<void> => {
    setTasks(reordered)
    const updates = reordered.map((t, i) => sb.from('tasks').update({ sort_order: i }).eq('id', t.id))
    await Promise.all(updates)
  }, [])

  const reopenTask = useCallback(async (histId: string): Promise<boolean> => {
    const h = hist.find(x => x.id === histId)
    if (!h) return false
    const todayStr = getTodayStr()
    const { data: allTasks } = await sb.from('tasks').select('sort_order').order('sort_order', { ascending: false }).limit(1)
    const maxOrder = allTasks?.[0]?.sort_order ?? -1
    const newTask: Task = {
      ...h,
      id: genId(),
      date: todayStr,
      status: 'Em Aberto',
      completed_at: undefined,
      sort_order: 0,
    }
    // Abre espaço no topo
    await sb.from('tasks').update({ sort_order: maxOrder + 2 }).eq('id', 'dummy_nonexistent') // noop trick
    const allCurrent = await sb.from('tasks').select('id,sort_order').order('sort_order', { ascending: true })
    if (allCurrent.data) {
      const ups = allCurrent.data.map(t => sb.from('tasks').update({ sort_order: (t.sort_order || 0) + 1 }).eq('id', t.id))
      await Promise.all(ups)
      setTasks(prev => prev.map(t => ({ ...t, sort_order: (t.sort_order || 0) + 1 })))
    }
    await sb.from('tasks').insert(newTask)
    setTasks(prev => [newTask, ...prev])
    return true
  }, [hist])

  const deleteAtrasada = useCallback(async (id: string): Promise<void> => {
    await sb.from('atrasadas').delete().eq('id', id)
    setAtrasadas(prev => prev.filter(x => x.id !== id))
  }, [])

  // ── MEETINGS ───────────────────────────────────────────────

  const saveMeet = useCallback(async (meetData: Partial<Meeting>, editId?: string): Promise<boolean> => {
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
  }, [])

  const deleteMeet = useCallback(async (id: string): Promise<void> => {
    await sb.from('meets').delete().eq('id', id)
    setMeets(prev => prev.filter(m => m.id !== id))
  }, [])

  // ── TAGS ───────────────────────────────────────────────────

  const saveTag = useCallback(async (name: string, color: string, bg: string): Promise<boolean> => {
    const id = genId()
    const newTag = { id, name, color, bg }
    const { error } = await sb.from('tags').insert(newTag)
    if (error) return false
    setTags(prev => [...prev, newTag])
    return true
  }, [])

  const deleteTag = useCallback(async (id: string): Promise<void> => {
    await sb.from('tags').delete().eq('id', id)
    setTags(prev => prev.filter(t => t.id !== id))
  }, [])

  // ── SUBTASKS ───────────────────────────────────────────────

  const toggleSubtask = useCallback(async (taskId: string, idx: number): Promise<void> => {
    const t = tasks.find(x => x.id === taskId)
    if (!t) return
    const updated = t.subtasks.map((s, i) => i === idx ? { ...s, done: !s.done } : s)
    await sb.from('tasks').update({ subtasks: updated }).eq('id', taskId)
    setTasks(prev => prev.map(x => x.id === taskId ? { ...x, subtasks: updated } : x))
  }, [tasks])

  const addSubtask = useCallback(async (taskId: string, text: string): Promise<void> => {
    const t = tasks.find(x => x.id === taskId)
    if (!t) return
    const updated = [...t.subtasks, { text, done: false }]
    await sb.from('tasks').update({ subtasks: updated }).eq('id', taskId)
    setTasks(prev => prev.map(x => x.id === taskId ? { ...x, subtasks: updated } : x))
  }, [tasks])

  const deleteSubtask = useCallback(async (taskId: string, idx: number): Promise<void> => {
    const t = tasks.find(x => x.id === taskId)
    if (!t) return
    const updated = t.subtasks.filter((_, i) => i !== idx)
    await sb.from('tasks').update({ subtasks: updated }).eq('id', taskId)
    setTasks(prev => prev.map(x => x.id === taskId ? { ...x, subtasks: updated } : x))
  }, [tasks])

  // ── TEAM ───────────────────────────────────────────────────

  const updateTeamMember = useCallback(async (id: string, data: Partial<TeamMember>): Promise<boolean> => {
    const { error } = await sb.from('team').update(data).eq('id', id)
    if (error) return false
    setTeam(prev => prev.map(m => m.id === id ? { ...m, ...data } : m))
    return true
  }, [])

  // ── BACKUP ─────────────────────────────────────────────────

  const checkDailyBackup = useCallback(async (): Promise<void> => {
    const todayStr = getTodayStr()
    const exists = backups.some(b => b.backup_date === todayStr)
    if (exists) return
    const id = genId()
    const label = `Auto ${new Date().toLocaleDateString('pt-BR')}`
    await sb.from('backup_tasks').insert({ id, backup_date: todayStr, backup_label: label, tasks_snapshot: tasks })
    setBackups(prev => [{ id, backup_date: todayStr, backup_label: label, created_at: new Date().toISOString() }, ...prev])
  }, [backups, tasks])

  const saveBackupManual = useCallback(async (label: string): Promise<void> => {
    const id = genId()
    const todayStr = getTodayStr()
    await sb.from('backup_tasks').insert({ id, backup_date: todayStr, backup_label: label || `Manual ${new Date().toLocaleDateString('pt-BR')}`, tasks_snapshot: tasks })
    const { data } = await sb.from('backup_tasks').select('id,backup_date,backup_label,created_at').order('created_at', { ascending: false }).limit(30)
    setBackups(data || [])
  }, [tasks])

  const deleteBackup = useCallback(async (id: string): Promise<void> => {
    await sb.from('backup_tasks').delete().eq('id', id)
    setBackups(prev => prev.filter(b => b.id !== id))
  }, [])

  return {
    tasks, hist, meets, team, tags, atrasadas, backups, loading,
    setTasks, setHist, setMeets, setTeam, setTags, setAtrasadas,
    loadAll,
    saveTask, completeTask, deleteTask, cycleStatus, reorderTasks, reopenTask, deleteAtrasada,
    saveMeet, deleteMeet,
    saveTag, deleteTag,
    toggleSubtask, addSubtask, deleteSubtask,
    updateTeamMember,
    checkDailyBackup, saveBackupManual, deleteBackup,
  }
}
