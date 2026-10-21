import { useState, useCallback, useMemo, useRef } from 'react'
import { sb } from '../lib/supabase'
import { genId, getTodayStr, isTodayValidForRecur, getNextOccurrenceAfter, isLate } from '../lib/utils'
import type { Task, TeamMember, Meeting, Backup, Pop, User } from '../types'
import { fetchPopsApi, setLocalTaskPopLink } from '../lib/popsApi'
import {
  canAccessModule,
  canAccessTaskRecord,
  canViewAllTasks,
  filterTasksForUser,
  hydrateUserAccess,
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

export interface BulkProgressDetail {
  done: number
  succeeded: number
  failed: number
  pending: number
  total: number
}

export const DEFAULT_BULK_CHUNK_SIZE = 250

export function buildHistItemPayload(t: Task, histId: string, completedAt: string) {
  return {
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
}

export function buildCompletedTaskPayload(t: Task, instanceId: string, completedAt: string): Task {
  return {
    id: instanceId,
    descricao: t.descricao,
    resp: t.resp,
    date: t.date || '',
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
    sort_order: typeof t.sort_order === 'number' ? t.sort_order : 0,
    completed_at: completedAt,
  } as unknown as Task
}

export async function runBulkCompleteEngine(params: {
  targets: Task[]
  currentUser?: User | null
  initialTasks: Task[]
  initialHist: Task[]
  sbClient?: any
  chunkSize?: number
  onProgress?: (done: number, total: number, detail: BulkProgressDetail) => void
}): Promise<{
  completedIds: string[]
  failedIds: string[]
  nextTasks: Task[]
  nextHist: Task[]
}> {
  const {
    targets,
    currentUser,
    initialTasks,
    initialHist,
    sbClient = sb,
    chunkSize = DEFAULT_BULK_CHUNK_SIZE,
    onProgress,
  } = params

  const total = targets.length
  if (!currentUser || !isUserActive(currentUser) || !canAccessModule(currentUser, 'atrasadas')) {
    const allIds = targets.map(t => t.id)
    onProgress?.(total, total, { done: total, succeeded: 0, failed: total, pending: 0, total })
    return {
      completedIds: [],
      failedIds: allIds,
      nextTasks: initialTasks,
      nextHist: initialHist,
    }
  }

  const completedIds: string[] = []
  const failedIds: string[] = []
  const authorizedTargets: Task[] = []
  const seenTargetIds = new Set<string>()
  let done = 0

  for (const task of targets) {
    if (seenTargetIds.has(task.id)) continue
    seenTargetIds.add(task.id)

    if (!canAccessTaskRecord(currentUser, task)) {
      failedIds.push(task.id)
      done++
      onProgress?.(done, total, {
        done,
        succeeded: completedIds.length,
        failed: failedIds.length,
        pending: Math.max(0, total - done),
        total,
      })
    } else {
      authorizedTargets.push(task)
    }
  }

  if (authorizedTargets.length === 0) {
    return {
      completedIds,
      failedIds,
      nextTasks: initialTasks,
      nextHist: initialHist,
    }
  }

  const completedAt = new Date().toLocaleDateString('pt-BR')
  const todayStr = getTodayStr()

  const liveTasksMap = new Map<string, Task>()
  const openMasterByGroupDate = new Map<string, Task>()
  const completedGroupDates = new Set<string>()

  for (const t of initialTasks) {
    liveTasksMap.set(t.id, t)
    if (t.recur_group_id && t.date) {
      const key = `${t.recur_group_id}_${t.date}`
      if (t.status === 'Concluída') {
        completedGroupDates.add(key)
      } else {
        openMasterByGroupDate.set(key, t)
      }
    }
  }
  for (const h of initialHist) {
    if (h.recur_group_id && h.date) {
      completedGroupDates.add(`${h.recur_group_id}_${h.date}`)
    }
  }

  // Datas de séries recorrentes incluídas neste lote (para avanço seguro do mestre)
  const batchTargetGroupDates = new Set<string>()
  for (const t of authorizedTargets) {
    if (t.recur_group_id && t.date) {
      batchTargetGroupDates.add(`${t.recur_group_id}_${t.date}`)
    }
  }

  const addedCompletedTasks: Task[] = []
  const deletedRealTaskIds = new Set<string>()
  const updatedMasters = new Map<string, { date: string; recur_start?: string }>()
  const addedHistItems: Task[] = []

  const processSingleItemFallback = async (t: Task): Promise<boolean> => {
    try {
      const isVirtual = t.id.startsWith('virtual_')
      const groupDateKey = t.recur_group_id && t.date ? `${t.recur_group_id}_${t.date}` : ''
      const promotedMaster = isVirtual && groupDateKey ? openMasterByGroupDate.get(groupDateKey) : undefined
      const effectiveTask = promotedMaster || liveTasksMap.get(t.id) || t
      const isRecurringMaster = Boolean(
        !effectiveTask.id.startsWith('virtual_') &&
          (effectiveTask as any).recur_group_id &&
          effectiveTask.recur &&
          effectiveTask.recur !== 'none'
      )
      const isVirtualOnly = effectiveTask.id.startsWith('virtual_') && !promotedMaster

      const instanceId = isVirtualOnly || isRecurringMaster ? genId() : effectiveTask.id
      const histItem = buildHistItemPayload(effectiveTask, instanceId, completedAt)

      const { error: histErr } = await sbClient.from('hist').upsert(histItem, { onConflict: 'id' })
      if (histErr) return false

      if (isVirtualOnly) {
        const completedPayload = buildCompletedTaskPayload(effectiveTask, instanceId, completedAt)
        const { error: insErr } = await sbClient.from('tasks').insert(completedPayload)
        if (insErr) {
          await sbClient.from('hist').delete().eq('id', instanceId)
          return false
        }
        addedCompletedTasks.push(completedPayload)
        if (groupDateKey) completedGroupDates.add(groupDateKey)
      } else if (isRecurringMaster) {
        const originalDate = effectiveTask.date
        const completedRecord = buildCompletedTaskPayload(effectiveTask, instanceId, completedAt)
        const { error: insErr } = await sbClient.from('tasks').insert(completedRecord)
        if (insErr) {
          await sbClient.from('hist').delete().eq('id', instanceId)
          return false
        }
        if (effectiveTask.recur_group_id && originalDate) {
          completedGroupDates.add(`${effectiveTask.recur_group_id}_${originalDate}`)
        }

        const baseDate = originalDate < todayStr ? todayStr : originalDate
        const anchorStart = effectiveTask.recur_start || originalDate
        let nextDate = getNextOccurrenceAfter(
          effectiveTask.recur!,
          effectiveTask.recur_days || [],
          anchorStart,
          baseDate
        )
        while (
          nextDate &&
          (completedGroupDates.has(`${effectiveTask.recur_group_id}_${nextDate}`) ||
            batchTargetGroupDates.has(`${effectiveTask.recur_group_id}_${nextDate}`))
        ) {
          nextDate = getNextOccurrenceAfter(
            effectiveTask.recur!,
            effectiveTask.recur_days || [],
            anchorStart,
            nextDate
          )
        }

        if (nextDate) {
          const { error: updErr } = await sbClient
            .from('tasks')
            .update({ date: nextDate, recur_start: anchorStart })
            .eq('id', effectiveTask.id)
          if (updErr) return false
          updatedMasters.set(effectiveTask.id, { date: nextDate, recur_start: anchorStart })
        } else {
          const { error: delErr } = await sbClient.from('tasks').delete().eq('id', effectiveTask.id)
          if (delErr) return false
          deletedRealTaskIds.add(effectiveTask.id)
        }
        addedCompletedTasks.push(completedRecord)
      } else {
        const { error: delErr } = await sbClient.from('tasks').delete().eq('id', effectiveTask.id)
        if (delErr) {
          await sbClient.from('hist').delete().eq('id', instanceId)
          return false
        }
        deletedRealTaskIds.add(effectiveTask.id)
      }

      addedHistItems.push(histItem as unknown as Task)
      return true
    } catch (err) {
      console.error('❌ Erro no fallback individual de conclusão:', t.id, err)
      return false
    }
  }

  for (let i = 0; i < authorizedTargets.length; i += chunkSize) {
    const chunk = authorizedTargets.slice(i, i + chunkSize)

    const chunkHistRows: ReturnType<typeof buildHistItemPayload>[] = []
    const chunkCompletedTaskRows: Task[] = []
    const chunkNonRecurDeleteIds: string[] = []
    const chunkMasters: { selectedId: string; master: Task; instanceId: string }[] = []

    for (const t of chunk) {
      const isVirtual = t.id.startsWith('virtual_')
      const groupDateKey = t.recur_group_id && t.date ? `${t.recur_group_id}_${t.date}` : ''
      const promotedMaster = isVirtual && groupDateKey ? openMasterByGroupDate.get(groupDateKey) : undefined
      const effectiveTask = promotedMaster || liveTasksMap.get(t.id) || t
      const isRecurringMaster = Boolean(
        !effectiveTask.id.startsWith('virtual_') &&
          (effectiveTask as any).recur_group_id &&
          effectiveTask.recur &&
          effectiveTask.recur !== 'none'
      )
      const isVirtualOnly = effectiveTask.id.startsWith('virtual_') && !promotedMaster

      const instanceId = isVirtualOnly || isRecurringMaster ? genId() : effectiveTask.id
      const histRow = buildHistItemPayload(effectiveTask, instanceId, completedAt)
      chunkHistRows.push(histRow)

      if (isVirtualOnly) {
        chunkCompletedTaskRows.push(buildCompletedTaskPayload(effectiveTask, instanceId, completedAt))
      } else if (isRecurringMaster) {
        chunkCompletedTaskRows.push(buildCompletedTaskPayload(effectiveTask, instanceId, completedAt))
        chunkMasters.push({ selectedId: t.id, master: effectiveTask, instanceId })
      } else {
        chunkNonRecurDeleteIds.push(effectiveTask.id)
      }
    }

    let chunkBatchSucceeded = false
    try {
      const { error: histErr } = await sbClient.from('hist').upsert(chunkHistRows, { onConflict: 'id' })
      if (histErr) throw histErr

      if (chunkCompletedTaskRows.length > 0) {
        const { error: insErr } = await sbClient.from('tasks').insert(chunkCompletedTaskRows)
        if (insErr) {
          await sbClient.from('hist').delete().in('id', chunkHistRows.map(r => r.id))
          throw insErr
        }
      }

      if (chunkNonRecurDeleteIds.length > 0) {
        const { error: delErr } = await sbClient.from('tasks').delete().in('id', chunkNonRecurDeleteIds)
        if (delErr) {
          await sbClient.from('hist').delete().in('id', chunkHistRows.map(r => r.id))
          if (chunkCompletedTaskRows.length > 0) {
            await sbClient.from('tasks').delete().in('id', chunkCompletedTaskRows.map(r => r.id))
          }
          throw delErr
        }
      }

      if (chunkMasters.length > 0) {
        for (const row of chunkCompletedTaskRows) {
          if (row.recur_group_id && row.date) {
            completedGroupDates.add(`${row.recur_group_id}_${row.date}`)
          }
        }

        const masterResults = await Promise.all(
          chunkMasters.map(async ({ master }) => {
            const originalDate = master.date
            const baseDate = originalDate < todayStr ? todayStr : originalDate
            const anchorStart = master.recur_start || originalDate
            let nextDate = getNextOccurrenceAfter(
              master.recur!,
              master.recur_days || [],
              anchorStart,
              baseDate
            )
            while (
              nextDate &&
              (completedGroupDates.has(`${master.recur_group_id}_${nextDate}`) ||
                batchTargetGroupDates.has(`${master.recur_group_id}_${nextDate}`))
            ) {
              nextDate = getNextOccurrenceAfter(
                master.recur!,
                master.recur_days || [],
                anchorStart,
                nextDate
              )
            }

            if (nextDate) {
              const { error: updErr } = await sbClient
                .from('tasks')
                .update({ date: nextDate, recur_start: anchorStart })
                .eq('id', master.id)
              return { masterId: master.id, nextDate, anchorStart, error: updErr }
            } else {
              const { error: delErr } = await sbClient.from('tasks').delete().eq('id', master.id)
              return { masterId: master.id, nextDate: null, anchorStart, error: delErr }
            }
          })
        )

        const failedMaster = masterResults.find(r => r.error)
        if (failedMaster) {
          throw failedMaster.error
        }

        for (const r of masterResults) {
          if (r.nextDate) {
            updatedMasters.set(r.masterId, { date: r.nextDate, recur_start: r.anchorStart })
          } else {
            deletedRealTaskIds.add(r.masterId)
          }
        }
      }

      // Lote concluído com sucesso
      chunkBatchSucceeded = true
      for (const t of chunk) {
        completedIds.push(t.id)
      }
      for (const row of chunkCompletedTaskRows) {
        addedCompletedTasks.push(row)
        if (row.recur_group_id && row.date) {
          completedGroupDates.add(`${row.recur_group_id}_${row.date}`)
        }
      }
      for (const delId of chunkNonRecurDeleteIds) {
        deletedRealTaskIds.add(delId)
      }
      for (const hRow of chunkHistRows) {
        addedHistItems.push(hRow as unknown as Task)
      }

      done += chunk.length
      onProgress?.(done, total, {
        done,
        succeeded: completedIds.length,
        failed: failedIds.length,
        pending: Math.max(0, total - done),
        total,
      })
    } catch (chunkErr) {
      console.warn('⚠️ Falha no lote de conclusão; executando fallback item a item para o lote:', chunkErr)
      chunkBatchSucceeded = false
    }

    if (!chunkBatchSucceeded) {
      for (const t of chunk) {
        const ok = await processSingleItemFallback(t)
        if (ok) {
          completedIds.push(t.id)
        } else {
          failedIds.push(t.id)
        }
        done++
        onProgress?.(done, total, {
          done,
          succeeded: completedIds.length,
          failed: failedIds.length,
          pending: Math.max(0, total - done),
          total,
        })
      }
    }
  }

  const nextTasks = [
    ...initialTasks
      .filter(t => !deletedRealTaskIds.has(t.id))
      .map(t => {
        const upd = updatedMasters.get(t.id)
        return upd ? { ...t, date: upd.date, recur_start: upd.recur_start || t.recur_start } : t
      }),
    ...addedCompletedTasks,
  ]

  const addedHistIds = new Set(addedHistItems.map(h => h.id))
  const nextHist = [
    ...addedHistItems,
    ...initialHist.filter(h => !addedHistIds.has(h.id)),
  ]

  return {
    completedIds,
    failedIds,
    nextTasks,
    nextHist,
  }
}

export async function runBulkDeleteEngine(params: {
  targets: Task[]
  currentUser?: User | null
  initialTasks: Task[]
  sbClient?: any
  chunkSize?: number
  onProgress?: (done: number, total: number, detail: BulkProgressDetail) => void
}): Promise<{
  deletedIds: string[]
  failedIds: string[]
  nextTasks: Task[]
}> {
  const {
    targets,
    currentUser,
    initialTasks,
    sbClient = sb,
    chunkSize = DEFAULT_BULK_CHUNK_SIZE,
    onProgress,
  } = params

  const total = targets.length
  if (!currentUser || !isUserActive(currentUser) || !canAccessModule(currentUser, 'atrasadas')) {
    const allIds = targets.map(t => t.id)
    onProgress?.(total, total, { done: total, succeeded: 0, failed: total, pending: 0, total })
    return {
      deletedIds: [],
      failedIds: allIds,
      nextTasks: initialTasks,
    }
  }

  const deletedIds: string[] = []
  const failedIds: string[] = []
  const authorizedTargets: Task[] = []
  const seenTargetIds = new Set<string>()
  let done = 0

  for (const task of targets) {
    if (seenTargetIds.has(task.id)) continue
    seenTargetIds.add(task.id)

    if (!canAccessTaskRecord(currentUser, task)) {
      failedIds.push(task.id)
      done++
      onProgress?.(done, total, {
        done,
        succeeded: deletedIds.length,
        failed: failedIds.length,
        pending: Math.max(0, total - done),
        total,
      })
    } else {
      authorizedTargets.push(task)
    }
  }

  if (authorizedTargets.length === 0) {
    return {
      deletedIds,
      failedIds,
      nextTasks: initialTasks,
    }
  }

  const completedAt = new Date().toLocaleDateString('pt-BR')
  const liveTasksMap = new Map<string, Task>()
  const openMasterByGroupDate = new Map<string, Task>()
  const completedGroupDates = new Set<string>()

  for (const t of initialTasks) {
    liveTasksMap.set(t.id, t)
    if (t.recur_group_id && t.date) {
      const key = `${t.recur_group_id}_${t.date}`
      if (t.status === 'Concluída') {
        completedGroupDates.add(key)
      } else {
        openMasterByGroupDate.set(key, t)
      }
    }
  }

  const batchTargetGroupDates = new Set<string>()
  for (const t of authorizedTargets) {
    if (t.recur_group_id && t.date) {
      batchTargetGroupDates.add(`${t.recur_group_id}_${t.date}`)
    }
  }

  const addedSkippedTasks: Task[] = []
  const deletedRealTaskIds = new Set<string>()
  const updatedMasters = new Map<string, { date: string; recur_start?: string }>()

  const processSingleDeleteFallback = async (t: Task): Promise<boolean> => {
    try {
      const isVirtual = t.id.startsWith('virtual_')
      const groupDateKey = t.recur_group_id && t.date ? `${t.recur_group_id}_${t.date}` : ''
      const promotedMaster = isVirtual && groupDateKey ? openMasterByGroupDate.get(groupDateKey) : undefined
      const effectiveTask = promotedMaster || liveTasksMap.get(t.id) || t
      const isRecurringMaster = Boolean(
        !effectiveTask.id.startsWith('virtual_') &&
          (effectiveTask as any).recur_group_id &&
          effectiveTask.recur &&
          effectiveTask.recur !== 'none'
      )
      const isVirtualOnly = effectiveTask.id.startsWith('virtual_') && !promotedMaster

      if (isVirtualOnly) {
        const skipped = buildCompletedTaskPayload(effectiveTask, genId(), completedAt)
        const { error } = await sbClient.from('tasks').insert(skipped)
        if (error) return false
        addedSkippedTasks.push(skipped)
        if (groupDateKey) completedGroupDates.add(groupDateKey)
        return true
      }

      if (isRecurringMaster) {
        const skipped = buildCompletedTaskPayload(effectiveTask, genId(), completedAt)
        const { error: insErr } = await sbClient.from('tasks').insert(skipped)
        if (insErr) return false
        if (effectiveTask.recur_group_id && effectiveTask.date) {
          completedGroupDates.add(`${effectiveTask.recur_group_id}_${effectiveTask.date}`)
        }

        const anchorStart = effectiveTask.recur_start || effectiveTask.date
        let nextDate = getNextOccurrenceAfter(
          effectiveTask.recur!,
          effectiveTask.recur_days || [],
          anchorStart,
          effectiveTask.date
        )
        while (
          nextDate &&
          (completedGroupDates.has(`${effectiveTask.recur_group_id}_${nextDate}`) ||
            batchTargetGroupDates.has(`${effectiveTask.recur_group_id}_${nextDate}`))
        ) {
          nextDate = getNextOccurrenceAfter(
            effectiveTask.recur!,
            effectiveTask.recur_days || [],
            anchorStart,
            nextDate
          )
        }

        if (nextDate) {
          const { error: updErr } = await sbClient
            .from('tasks')
            .update({ date: nextDate, recur_start: anchorStart })
            .eq('id', effectiveTask.id)
          if (updErr) return false
          updatedMasters.set(effectiveTask.id, { date: nextDate, recur_start: anchorStart })
        } else {
          const { error: delErr } = await sbClient.from('tasks').delete().eq('id', effectiveTask.id)
          if (delErr) return false
          deletedRealTaskIds.add(effectiveTask.id)
        }
        addedSkippedTasks.push(skipped)
        return true
      }

      const { error } = await sbClient.from('tasks').delete().eq('id', effectiveTask.id)
      if (error) return false
      deletedRealTaskIds.add(effectiveTask.id)
      return true
    } catch (err) {
      console.error('❌ Erro no fallback individual de exclusão:', t.id, err)
      return false
    }
  }

  for (let i = 0; i < authorizedTargets.length; i += chunkSize) {
    const chunk = authorizedTargets.slice(i, i + chunkSize)
    const chunkSkippedRows: Task[] = []
    const chunkNonRecurDeleteIds: string[] = []
    const chunkMasters: Task[] = []

    for (const t of chunk) {
      const isVirtual = t.id.startsWith('virtual_')
      const groupDateKey = t.recur_group_id && t.date ? `${t.recur_group_id}_${t.date}` : ''
      const promotedMaster = isVirtual && groupDateKey ? openMasterByGroupDate.get(groupDateKey) : undefined
      const effectiveTask = promotedMaster || liveTasksMap.get(t.id) || t
      const isRecurringMaster = Boolean(
        !effectiveTask.id.startsWith('virtual_') &&
          (effectiveTask as any).recur_group_id &&
          effectiveTask.recur &&
          effectiveTask.recur !== 'none'
      )
      const isVirtualOnly = effectiveTask.id.startsWith('virtual_') && !promotedMaster

      if (isVirtualOnly) {
        chunkSkippedRows.push(buildCompletedTaskPayload(effectiveTask, genId(), completedAt))
      } else if (isRecurringMaster) {
        chunkSkippedRows.push(buildCompletedTaskPayload(effectiveTask, genId(), completedAt))
        chunkMasters.push(effectiveTask)
      } else {
        chunkNonRecurDeleteIds.push(effectiveTask.id)
      }
    }

    let chunkBatchSucceeded = false
    try {
      if (chunkSkippedRows.length > 0) {
        const { error: insErr } = await sbClient.from('tasks').insert(chunkSkippedRows)
        if (insErr) throw insErr
      }

      if (chunkNonRecurDeleteIds.length > 0) {
        const { error: delErr } = await sbClient.from('tasks').delete().in('id', chunkNonRecurDeleteIds)
        if (delErr) {
          if (chunkSkippedRows.length > 0) {
            await sbClient.from('tasks').delete().in('id', chunkSkippedRows.map(r => r.id))
          }
          throw delErr
        }
      }

      if (chunkMasters.length > 0) {
        for (const row of chunkSkippedRows) {
          if (row.recur_group_id && row.date) {
            completedGroupDates.add(`${row.recur_group_id}_${row.date}`)
          }
        }

        const masterResults = await Promise.all(
          chunkMasters.map(async master => {
            const anchorStart = master.recur_start || master.date
            let nextDate = getNextOccurrenceAfter(
              master.recur!,
              master.recur_days || [],
              anchorStart,
              master.date
            )
            while (
              nextDate &&
              (completedGroupDates.has(`${master.recur_group_id}_${nextDate}`) ||
                batchTargetGroupDates.has(`${master.recur_group_id}_${nextDate}`))
            ) {
              nextDate = getNextOccurrenceAfter(
                master.recur!,
                master.recur_days || [],
                anchorStart,
                nextDate
              )
            }

            if (nextDate) {
              const { error: updErr } = await sbClient
                .from('tasks')
                .update({ date: nextDate, recur_start: anchorStart })
                .eq('id', master.id)
              return { masterId: master.id, nextDate, anchorStart, error: updErr }
            } else {
              const { error: delErr } = await sbClient.from('tasks').delete().eq('id', master.id)
              return { masterId: master.id, nextDate: null, anchorStart, error: delErr }
            }
          })
        )

        const failedMaster = masterResults.find(r => r.error)
        if (failedMaster) throw failedMaster.error

        for (const r of masterResults) {
          if (r.nextDate) {
            updatedMasters.set(r.masterId, { date: r.nextDate, recur_start: r.anchorStart })
          } else {
            deletedRealTaskIds.add(r.masterId)
          }
        }
      }

      chunkBatchSucceeded = true
      for (const t of chunk) {
        deletedIds.push(t.id)
      }
      for (const row of chunkSkippedRows) {
        addedSkippedTasks.push(row)
        if (row.recur_group_id && row.date) {
          completedGroupDates.add(`${row.recur_group_id}_${row.date}`)
        }
      }
      for (const delId of chunkNonRecurDeleteIds) {
        deletedRealTaskIds.add(delId)
      }

      done += chunk.length
      onProgress?.(done, total, {
        done,
        succeeded: deletedIds.length,
        failed: failedIds.length,
        pending: Math.max(0, total - done),
        total,
      })
    } catch (chunkErr) {
      console.warn('⚠️ Falha no lote de exclusão; executando fallback item a item para o lote:', chunkErr)
      chunkBatchSucceeded = false
    }

    if (!chunkBatchSucceeded) {
      for (const t of chunk) {
        const ok = await processSingleDeleteFallback(t)
        if (ok) {
          deletedIds.push(t.id)
        } else {
          failedIds.push(t.id)
        }
        done++
        onProgress?.(done, total, {
          done,
          succeeded: deletedIds.length,
          failed: failedIds.length,
          pending: Math.max(0, total - done),
          total,
        })
      }
    }
  }

  const nextTasks = [
    ...initialTasks
      .filter(t => !deletedRealTaskIds.has(t.id))
      .map(t => {
        const upd = updatedMasters.get(t.id)
        return upd ? { ...t, date: upd.date, recur_start: upd.recur_start || t.recur_start } : t
      }),
    ...addedSkippedTasks,
  ]

  return {
    deletedIds,
    failedIds,
    nextTasks,
  }
}

export function useAppData(currentUser?: User | null) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [hist, setHist] = useState<Task[]>([])
  const [meets, setMeets] = useState<Meeting[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [backups, setBackups] = useState<Backup[]>([])
  const [pops, setPops] = useState<Pop[]>([])

  const [loading, setLoading] = useState(false)
  const [fullHistoryLoaded, setFullHistoryLoaded] = useState(false)
  const loadGenerationRef = useRef(0)
  const completedRecurKeysRef = useRef<Set<string>>(new Set())
  const loadingFullHistRef = useRef(false)

  // Estado local para subtarefas de tarefas virtuais (não persiste no tasks state)
  // Chave: virtual task ID → array de booleans (done por índice)
  const [vsOverrides, setVsOverrides] = useState<Record<string, boolean[]>>({})

  // ── EXPANDED TASKS (lógica virtual O(N)) ──────────────────────
  // Gera ocorrências para séries recorrentes desde a data inicial de cada série
  // SEM criar registros antecipados no banco
  const expandedTasks = useMemo(() => {
    const todayStr = getTodayStr()
    const today = new Date(todayStr + 'T00:00:00')

    const rangeEnd = new Date(today)
    rangeEnd.setDate(rangeEnd.getDate() + 90)

    // Unificar fonte de dados: apenas tarefas ativas (não concluídas)
    const result: Task[] = tasks.filter(t => t.status !== 'Concluída')

    // Lookup de datas já materializadas por série
    // Garante que ocorrências já gravadas em tasks (físicas), concluídas em completedRecurKeysRef OU concluídas em hist
    // NUNCA sejam geradas novamente como virtuais (deduplicação absoluta).
    const materializedKeys = new Set<string>(completedRecurKeysRef.current)
    tasks.forEach(t => {
      if (t.recur_group_id && t.date) {
        materializedKeys.add(`${t.recur_group_id}_${t.date}`)
      }
    })
    hist.forEach(h => {
      if (h.recur_group_id) {
        const hDate = (h as any).completed_for_date || h.date
        if (hDate) {
          materializedKeys.add(`${h.recur_group_id}_${String(hDate).substring(0, 10)}`)
        }
      }
    })

    // Agrupa mestres por série — pega o mais ANTIGO não concluído para servir de âncora
    const recurrenceMasters = result.filter(t =>
      t.recur && t.recur !== 'none' &&
      t.recur_group_id &&
      t.status !== 'Concluída'
    )

    const groups: Record<string, Task> = {}
    recurrenceMasters.forEach(t => {
      const gid = t.recur_group_id!
      if (!groups[gid] || t.date < groups[gid].date) {
        groups[gid] = t
      }
    })

    const dayNames = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']

    // Para cada série, gera ocorrências virtuais desde a data de início da série até rangeEnd
    Object.values(groups).forEach(master => {
      const recurStart = master.recur_start || master.date
      let masterDate = new Date(recurStart + 'T00:00:00')
      if (isNaN(masterDate.getTime())) {
        masterDate = new Date(today)
      }

      const origDay = masterDate.getDay()
      const origDate = masterDate.getDate()
      const recurDays = Array.isArray(master.recur_days) ? master.recur_days : []

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

        // Só gera virtual se não existe registro real para esta data/série
        if (!materializedKeys.has(key)) {
          const dayOfWeek = current.getDay()
          let matches = false

          if (master.recur === 'daily') {
            matches = true
          } else if (master.recur === 'weekdays') {
            matches = dayOfWeek >= 1 && dayOfWeek <= 5
          } else if (master.recur === 'weekly') {
            matches = origDay === dayOfWeek
          } else if (master.recur === 'monthly') {
            matches = origDate === current.getDate()
          } else if (master.recur === 'custom' && recurDays.length > 0) {
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

    // Desduplicação final O(N): Real > Virtual para mesmo grupo+data
    const finalResult: Task[] = []
    const seenIndexByKey = new Map<string, number>()

    result.forEach(t => {
      const key = t.recur_group_id
        ? `${t.recur_group_id}_${t.date}`
        : t.id

      const existingIdx = seenIndexByKey.get(key)
      if (existingIdx === undefined) {
        seenIndexByKey.set(key, finalResult.length)
        finalResult.push(t)
      } else {
        const existing = finalResult[existingIdx]
        const isNewReal = !(t as any).isVirtual && Boolean((existing as any).isVirtual)
        if (isNewReal) {
          finalResult[existingIdx] = t
        }
      }
    })

    return finalResult
  }, [tasks, hist, vsOverrides])

  // ── TAREFAS ATRASADAS DA LISTA PRINCIPAL ─────────────────
  const atrasadasDaLista = useMemo(() => {
    const todayStr = getTodayStr()
    return tasks.filter(t =>
      t.date && t.date < todayStr &&
      t.status !== 'Concluída'
    )
  }, [tasks])

  // ── UNIFICAÇÃO DE ATRASADAS ──────────────────────────────
  const allAtrasadas = useMemo(() => {
    return expandedTasks.filter((t: Task) => isLate(t))
  }, [expandedTasks])

  // ── LOAD ALL (OTIMIZADO: < 300 KB / 1 RODADA PARALELA) ───
  const loadAll = useCallback(async (userOverride?: User | null) => {
    const myGen = ++loadGenerationRef.current
    const activeUser = userOverride ?? currentUser
    if (!activeUser || !isUserActive(activeUser)) {
      completedRecurKeysRef.current = new Set()
      setTasks([])
      setHist([])
      setMeets([])
      setTeam([])
      setBackups([])
      setPops([])
      setFullHistoryLoaded(false)
      setLoading(false)
      return
    }

    setLoading(true)
    const canSeeAll = canViewAllTasks(activeUser)
    const canSeeBackup = canAccessModule(activeUser, 'backup')
    const userRespName = (activeUser.name || '').trim()

    const cutoff60d = new Date()
    cutoff60d.setDate(cutoff60d.getDate() - 60)
    const cutoff60dStr = cutoff60d.toISOString().split('T')[0]

    const fetchActiveTasksAndRecurKeys = async () => {
      const fetchOpenTasks = async () => {
        let all: any[] = []
        let from = 0
        const step = 1000
        while (true) {
          if (myGen !== loadGenerationRef.current) break
          let q = sb
            .from('tasks')
            .select('*')
            .neq('status', 'Concluída')
            .order('sort_order', { ascending: true })
            .order('date', { ascending: true })
          if (!canSeeAll) {
            q = q.ilike('resp', userRespName)
          }
          const { data, error } = await q.range(from, from + step - 1)
          if (myGen !== loadGenerationRef.current) break
          if (error || !data || data.length === 0) break
          all = all.concat(data)
          if (data.length < step) break
          from += step
        }
        return filterTasksForUser(activeUser, all)
      }

      const fetchCompletedRecurKeys = async () => {
        let q = sb
          .from('tasks')
          .select('id, recur_group_id, date, status, resp')
          .eq('status', 'Concluída')
          .not('recur_group_id', 'is', null)
          .gte('date', cutoff60dStr)
          .limit(2000)
        if (!canSeeAll) {
          q = q.ilike('resp', userRespName)
        }
        const { data } = await q
        return filterTasksForUser(activeUser, (data || []) as Task[])
      }

      const [openTasks, completedRecurRows] = await Promise.all([
        fetchOpenTasks(),
        fetchCompletedRecurKeys(),
      ])

      return { openTasks, completedRecurRows }
    }

    // No boot, busca apenas os 500 registros mais recentes de hist (~120 ms)
    const fetchRecentHist = async () => {
      let q = sb.from('hist').select('*').order('created_at', { ascending: false }).limit(500)
      if (!canSeeAll) {
        q = q.ilike('resp', userRespName)
      }
      const { data } = await q
      const rawCount = data?.length || 0
      return {
        data: filterTasksForUser(activeUser, data || []),
        hasMore: rawCount >= 500,
      }
    }

    const [tasksBundle, histRes, meetsRes, teamRes, usersRes, backupsRes, popsData] = await Promise.all([
      fetchActiveTasksAndRecurKeys(),
      fetchRecentHist(),
      sb.from('meets').select('*').order('created_at', { ascending: false }),
      sb.from('team').select('*'),
      sb.from('users').select('id,name,email,role,color,is_admin'),
      canSeeBackup
        ? sb.from('backup_tasks').select('id,backup_date,backup_label,created_at').order('created_at', { ascending: false }).limit(30)
        : Promise.resolve({ data: [] as Backup[] }),
      fetchPopsApi(),
    ])

    if (myGen !== loadGenerationRef.current) return

    const normalizeDate = (d?: string) => (d ? d.substring(0, 10) : d)

    const nextCompletedKeys = new Set<string>()
    for (const r of tasksBundle.completedRecurRows) {
      const normDate = normalizeDate(r.date)
      if (r.recur_group_id && normDate) {
        nextCompletedKeys.add(`${r.recur_group_id}_${normDate}`)
      }
    }
    completedRecurKeysRef.current = nextCompletedKeys

    setHist(
      (histRes.data || []).map(h => ({
        ...h,
        date: normalizeDate(h.date),
        recur_start: normalizeDate(h.recur_start),
      }))
    )
    setFullHistoryLoaded(!histRes.hasMore)
    setMeets(meetsRes.data || [])

    const mergedTeam: TeamMember[] = [...(teamRes.data || [])]
    const seenTeamNames = new Set(
      mergedTeam.map(m => (m.name || '').trim().toLowerCase()).filter(Boolean)
    )
    for (const rawUser of usersRes.data || []) {
      const hydrated = hydrateUserAccess(rawUser as User)
      const trimmedName = (hydrated.name || '').trim()
      if (!trimmedName || !isUserActive(hydrated)) continue
      const lowerName = trimmedName.toLowerCase()
      if (!seenTeamNames.has(lowerName)) {
        seenTeamNames.add(lowerName)
        mergedTeam.push({
          id: hydrated.id,
          name: trimmedName,
          role: hydrated.role || 'Operador',
          email: hydrated.email || '',
          color: hydrated.color || '#3D55D6',
          is_admin: Boolean(hydrated.is_admin),
        })
      }
    }
    setTeam(mergedTeam)
    setBackups(backupsRes.data || [])

    setTasks(
      (tasksBundle.openTasks || []).map(t => ({
        ...t,
        date: normalizeDate(t.date),
        recur_start: normalizeDate(t.recur_start),
      }))
    )

    setPops(popsData)
    setLoading(false)
  }, [currentUser])

  const tasksRef = useRef<Task[]>(tasks)
  tasksRef.current = tasks
  const histRef = useRef<Task[]>(hist)
  histRef.current = hist
  const expandedTasksRef = useRef<Task[]>(expandedTasks)
  expandedTasksRef.current = expandedTasks

  // Carrega o histórico completo sob demanda quando solicitado na HistoryPage
  const loadFullHistory = useCallback(async () => {
    if (!currentUser || !isUserActive(currentUser) || fullHistoryLoaded || loadingFullHistRef.current) {
      return
    }
    loadingFullHistRef.current = true
    try {
      const canSeeAll = canViewAllTasks(currentUser)
      const userRespName = (currentUser.name || '').trim()
      const normalizeDate = (d?: string) => (d ? d.substring(0, 10) : d)

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

      const filtered = filterTasksForUser(currentUser, all).map(h => ({
        ...h,
        date: normalizeDate(h.date),
        recur_start: normalizeDate(h.recur_start),
      }))
      histRef.current = filtered
      setHist(filtered)
      setFullHistoryLoaded(true)
    } finally {
      loadingFullHistRef.current = false
    }
  }, [currentUser, fullHistoryLoaded])

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

    const isVirtual = Boolean(editId?.startsWith('virtual_'))

    const hasExplicitPopId = Object.prototype.hasOwnProperty.call(taskData, 'pop_id')
    const rawPopId = (taskData as any).pop_id
    const normalizedPopId: string | null | undefined = hasExplicitPopId
      ? (rawPopId && String(rawPopId).trim() ? String(rawPopId).trim() : null)
      : undefined

    // Limpar campos que não pertencem ao banco (como isVirtual)
    const { isVirtual: _iv, pop_id: _rawPopId, moved_at: _ma, ...cleanData } = taskData as any

    cleanData.resp = (cleanData.resp || currentUser.name || '').trim()

    // Resolver tarefa existente (ou tarefa mestre real caso editId seja virtual_ de uma série recorrente)
    let resolvedEditId = editId
    let existingTask: Task | undefined
    let virtualTask: Task | undefined

    if (editId && isVirtual) {
      virtualTask = expandedTasks.find(t => t.id === editId)
      if (virtualTask?.recur_group_id) {
        const masterTask = tasks.find(
          t => t.recur_group_id && t.recur_group_id === virtualTask!.recur_group_id && t.status !== 'Concluída'
        )
        if (masterTask) {
          resolvedEditId = masterTask.id
          existingTask = masterTask
          if (!cleanData.date || cleanData.date === virtualTask.date) {
            cleanData.date = masterTask.date
          }
        }
      }
    } else if (editId) {
      existingTask = tasks.find(t => t.id === editId)
    }

    const taskForPermissionCheck = existingTask || virtualTask
    if (editId && taskForPermissionCheck && !canAccessTaskRecord(currentUser, taskForPermissionCheck)) {
      console.error('❌ Acesso negado: tentativa de editar tarefa de terceiro sem autorização.')
      return false
    }

    if (resolvedEditId && !resolvedEditId.startsWith('virtual_') && existingTask) {
      const isTransfer = Boolean(
        existingTask &&
        cleanData.resp &&
        (existingTask.resp || '').trim().toLowerCase() !== cleanData.resp.trim().toLowerCase()
      )

      if (isTransfer) {
        const { data: destTasks } = await sb
          .from('tasks')
          .select('sort_order')
          .ilike('resp', cleanData.resp)
          .neq('status', 'Concluída')
          .order('sort_order', { ascending: false })
          .limit(1)
        const nextSortOrder =
          destTasks && destTasks.length > 0
            ? (destTasks[0].sort_order ?? 0) + 1
            : (existingTask.sort_order ?? 0)
        cleanData.sort_order = nextSortOrder
      }

      if (hasExplicitPopId) {
        cleanData.pop_id = normalizedPopId
      }

      // Editar tarefa real existente
      const { error } = await sb.from('tasks').update(cleanData).eq('id', resolvedEditId)
      if (error) {
        console.error('❌ Erro ao atualizar tarefa:', error)
        return false
      }

      if (hasExplicitPopId) {
        setLocalTaskPopLink(resolvedEditId, normalizedPopId ?? null)
        if (editId) {
          setLocalTaskPopLink(editId, normalizedPopId ?? null)
        }
      }

      let transferredSiblingIds: string[] = []
      let popUpdatedSiblingIds: string[] = []
      if (
        existingTask.recur_group_id &&
        existingTask.recur &&
        existingTask.recur !== 'none'
      ) {
        if (isTransfer) {
          transferredSiblingIds = tasks
            .filter(
              t =>
                t.id !== resolvedEditId &&
                t.recur_group_id === existingTask!.recur_group_id &&
                t.status !== 'Concluída' &&
                (t.resp || '').trim().toLowerCase() === (existingTask!.resp || '').trim().toLowerCase()
            )
            .map(t => t.id)

          if (transferredSiblingIds.length > 0) {
            const sibPayload: Record<string, any> = {
              resp: cleanData.resp,
              sort_order: cleanData.sort_order,
            }
            if (hasExplicitPopId) {
              sibPayload.pop_id = normalizedPopId
            }
            const { error: sibError } = await sb
              .from('tasks')
              .update(sibPayload)
              .in('id', transferredSiblingIds)
            if (sibError) {
              console.error('❌ Erro ao atualizar série recorrente na transferência:', sibError)
              return false
            }
          }
        } else if (hasExplicitPopId) {
          popUpdatedSiblingIds = tasks
            .filter(
              t =>
                t.id !== resolvedEditId &&
                t.recur_group_id === existingTask!.recur_group_id &&
                t.status !== 'Concluída'
            )
            .map(t => t.id)

          if (popUpdatedSiblingIds.length > 0) {
            await sb
              .from('tasks')
              .update({ pop_id: normalizedPopId })
              .in('id', popUpdatedSiblingIds)
            for (const sibId of popUpdatedSiblingIds) {
              setLocalTaskPopLink(sibId, normalizedPopId ?? null)
            }
          }
        }
      }

      const localUpdates = hasExplicitPopId
        ? { ...cleanData, pop_id: normalizedPopId }
        : cleanData
      const updatedTask = { ...existingTask, ...localUpdates } as Task
      const siblingSet = new Set(transferredSiblingIds)
      const popSiblingSet = new Set(popUpdatedSiblingIds)

      setTasks(prev => {
        if (!canViewAllTasks(currentUser) && !canAccessTaskRecord(currentUser, updatedTask)) {
          return prev.filter(t => t.id !== resolvedEditId && !siblingSet.has(t.id))
        }
        return prev.map(t => {
          if (t.id === resolvedEditId) return { ...t, ...localUpdates }
          if (siblingSet.has(t.id)) {
            return {
              ...t,
              resp: cleanData.resp,
              sort_order: cleanData.sort_order,
              ...(hasExplicitPopId ? { pop_id: normalizedPopId } : {})
            }
          }
          if (popSiblingSet.has(t.id) && hasExplicitPopId) {
            return {
              ...t,
              pop_id: normalizedPopId
            }
          }
          return t
        })
      })
    } else {
      // Nova tarefa ou materialização de virtual sem mestre real aberto
      const id = genId()
      const maxOrder = tasksRef.current.reduce((max, t) => Math.max(max, t.sort_order || 0), 0)

      // Gerar recur_group_id para novas tarefas recorrentes
      const recur_group_id = cleanData.recur && cleanData.recur !== 'none'
        ? (cleanData.recur_group_id || `rg_${id}`)
        : undefined

      const newTask = {
        ...cleanData,
        id,
        recur_group_id,
        pop_id: normalizedPopId ?? null,
        sort_order: maxOrder + 1,
        created_at: new Date().toISOString()
      } as Task

      const { error } = await sb.from('tasks').insert(newTask)
      if (error) {
        console.error('❌ Erro Supabase (insert task):', error)
        return false
      }
      setLocalTaskPopLink(id, normalizedPopId ?? null)
      if (canViewAllTasks(currentUser) || canAccessTaskRecord(currentUser, newTask)) {
        setTasks(prev => [...prev, newTask])
      }
    }
    return true
  }, [currentUser, tasks, expandedTasks])

  // ── LINK / UNLINK TASK POP ─────────────────────────────────
  const linkTaskPop = useCallback(async (taskId: string, popId: string | null): Promise<boolean> => {
    if (!currentUser || !isUserActive(currentUser)) return false
    const normalized = popId && popId.trim() ? popId.trim() : null

    let targetId = taskId
    let targetRecurGroupId: string | undefined

    if (taskId.startsWith('virtual_')) {
      const virtualTask = expandedTasks.find(t => t.id === taskId)
      if (virtualTask?.recur_group_id) {
        targetRecurGroupId = virtualTask.recur_group_id
        const masterTask = tasks.find(
          t => t.recur_group_id === virtualTask.recur_group_id && t.status !== 'Concluída'
        )
        if (masterTask) {
          targetId = masterTask.id
        }
      }
    } else {
      const existing = tasks.find(t => t.id === taskId)
      if (existing?.recur_group_id && existing.recur && existing.recur !== 'none') {
        targetRecurGroupId = existing.recur_group_id
      }
    }

    setLocalTaskPopLink(taskId, normalized)
    setLocalTaskPopLink(targetId, normalized)

    if (!targetId.startsWith('virtual_')) {
      const { error } = await sb.from('tasks').update({ pop_id: normalized }).eq('id', targetId)
      if (error) {
        console.error('❌ Erro ao atualizar vínculo de POP na tarefa:', error)
        return false
      }
      if (targetRecurGroupId) {
        const siblingIds = tasks
          .filter(t => t.id !== targetId && t.recur_group_id === targetRecurGroupId && t.status !== 'Concluída')
          .map(t => t.id)
        if (siblingIds.length > 0) {
          await sb.from('tasks').update({ pop_id: normalized }).in('id', siblingIds)
          for (const sibId of siblingIds) {
            setLocalTaskPopLink(sibId, normalized)
          }
        }
      }
    }

    setTasks(prev =>
      prev.map(t =>
        t.id === targetId ||
        (targetRecurGroupId && t.recur_group_id === targetRecurGroupId && t.status !== 'Concluída')
          ? { ...t, pop_id: normalized }
          : t
      )
    )
    return true
  }, [currentUser, tasks, expandedTasks])

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

    const isRecurringMaster = Boolean(!isVirtual && (t as any).recur_group_id && t.recur && t.recur !== 'none')
    const completedAt = new Date().toLocaleDateString('pt-BR')
    const histId = isVirtual || isRecurringMaster ? genId() : t.id
    const histItem = buildHistItemPayload(t, histId, completedAt)

    if (isVirtual) {
      // Tarefa virtual: grava histórico e materializa como concluída no banco em paralelo
      const completedPayload = buildCompletedTaskPayload(t, histItem.id, completedAt)
      const [histRes, taskRes] = await Promise.all([
        sb.from('hist').upsert(histItem, { onConflict: 'id' }),
        sb.from('tasks').insert(completedPayload),
      ])
      if (histRes.error || taskRes.error) {
        console.warn('Aviso: erro ao concluir tarefa virtual:', histRes.error || taskRes.error)
        if (!histRes.error && taskRes.error) {
          await sb.from('hist').delete().eq('id', histItem.id)
        } else if (histRes.error && !taskRes.error) {
          await sb.from('tasks').delete().eq('id', completedPayload.id)
        }
        return false
      }
      if (t.recur_group_id && t.date) {
        completedRecurKeysRef.current.add(`${t.recur_group_id}_${t.date}`)
      }
      // Atualiza estado local para remover virtual imediatamente das pendências
      const nextTasks = [...tasksRef.current, completedPayload]
      tasksRef.current = nextTasks
      setTasks(nextTasks)

    } else if (isRecurringMaster) {
      // ── TAREFA MESTRE RECORRENTE ────────────────────────────
      // 1. Materializa a data original como concluída (bloqueia re-geração virtual)
      // 2. Avança o mestre para a próxima ocorrência em paralelo com hist
      const originalDate = t.date
      const completedRecord = buildCompletedTaskPayload(t, histItem.id, completedAt)
      const baseDate = originalDate < getTodayStr() ? getTodayStr() : originalDate
      const anchorStart = t.recur_start || originalDate
      let nextDate = getNextOccurrenceAfter(
        t.recur!,
        t.recur_days || [],
        anchorStart,
        baseDate
      )
      while (
        nextDate &&
        (completedRecurKeysRef.current.has(`${t.recur_group_id}_${nextDate}`) ||
          tasksRef.current.some(x => x.recur_group_id === t!.recur_group_id && x.date === nextDate && x.status === 'Concluída'))
      ) {
        nextDate = getNextOccurrenceAfter(t.recur!, t.recur_days || [], anchorStart, nextDate)
      }

      const [histRes, insRes, masterRes] = await Promise.all([
        sb.from('hist').upsert(histItem, { onConflict: 'id' }),
        sb.from('tasks').insert(completedRecord),
        nextDate
          ? sb.from('tasks').update({ date: nextDate, recur_start: anchorStart }).eq('id', id)
          : sb.from('tasks').delete().eq('id', id),
      ])

      if (histRes.error || insRes.error || masterRes.error) {
        console.error('Erro ao concluir tarefa mestre recorrente:', histRes.error || insRes.error || masterRes.error)
        if (!histRes.error) await sb.from('hist').delete().eq('id', histItem.id)
        if (!insRes.error) await sb.from('tasks').delete().eq('id', completedRecord.id)
        return false
      }

      if (t.recur_group_id && originalDate) {
        completedRecurKeysRef.current.add(`${t.recur_group_id}_${originalDate}`)
      }

      if (nextDate) {
        const nextTasks = [...tasksRef.current, completedRecord].map(x => x.id === id ? { ...x, date: nextDate, recur_start: anchorStart } : x)
        tasksRef.current = nextTasks
        setTasks(nextTasks)
      } else {
        const nextTasks = [...tasksRef.current, completedRecord].filter(x => x.id !== id)
        tasksRef.current = nextTasks
        setTasks(nextTasks)
      }

    } else {
      // Tarefa não-recorrente comum: grava hist e remove de tasks em paralelo
      const [histRes, delRes] = await Promise.all([
        sb.from('hist').upsert(histItem, { onConflict: 'id' }),
        sb.from('tasks').delete().eq('id', id),
      ])
      if (histRes.error || delRes.error) {
        console.error('Erro ao concluir tarefa:', histRes.error || delRes.error)
        if (!histRes.error && delRes.error) {
          await sb.from('hist').delete().eq('id', histItem.id)
        }
        return false
      }
      const nextTasks = tasksRef.current.filter(x => x.id !== id)
      tasksRef.current = nextTasks
      setTasks(nextTasks)
    }

    const nextHist = [histItem as unknown as Task, ...histRef.current.filter(h => h.id !== histItem.id)]
    histRef.current = nextHist
    setHist(nextHist)
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
      if (t.recur_group_id && t.date) {
        completedRecurKeysRef.current.add(`${t.recur_group_id}_${t.date}`)
      }
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

  const reorderSeqRef = useRef(0)

  const reorderTasks = useCallback(async (reorderedList: Task[]): Promise<boolean> => {
    if (!currentUser || !isUserActive(currentUser)) return false
    const seq = ++reorderSeqRef.current
    const prevSnapshot = tasksRef.current

    const seenRealIds = new Set<string>()
    const newOrderByRealId = new Map<string, number>()
    let nextOrder = 0

    for (const t of reorderedList) {
      if (!canAccessTaskRecord(currentUser, t)) continue

      const isVirt = String(t.id).startsWith('virtual_')
      const resolvedRealIds: string[] = []

      if (!isVirt) {
        resolvedRealIds.push(t.id)
        if (t.recur_group_id) {
          for (const x of prevSnapshot) {
            if (
              x.id !== t.id &&
              x.recur_group_id === t.recur_group_id &&
              x.status !== 'Concluída' &&
              canAccessTaskRecord(currentUser, x)
            ) {
              resolvedRealIds.push(x.id)
            }
          }
        }
      } else if (t.recur_group_id) {
        for (const x of prevSnapshot) {
          if (
            x.recur_group_id === t.recur_group_id &&
            x.status !== 'Concluída' &&
            canAccessTaskRecord(currentUser, x)
          ) {
            resolvedRealIds.push(x.id)
          }
        }
      }

      for (const realId of resolvedRealIds) {
        if (!seenRealIds.has(realId)) {
          seenRealIds.add(realId)
          const assignedOrder = typeof t.sort_order === "number" && !Number.isNaN(t.sort_order) ? t.sort_order : nextOrder++;
          newOrderByRealId.set(realId, assignedOrder)
        }
      }
    }

    const changedEntries: Array<{ id: string; sort_order: number }> = []
    for (const [realId, newOrder] of newOrderByRealId.entries()) {
      const existing = prevSnapshot.find(x => x.id === realId)
      if (existing && existing.sort_order !== newOrder) {
        changedEntries.push({ id: realId, sort_order: newOrder })
      }
    }

    if (changedEntries.length === 0) {
      return true
    }

    setTasks(prev => {
      const next = prev.map(t => {
        const updatedOrder = newOrderByRealId.get(t.id)
        return updatedOrder !== undefined && t.sort_order !== updatedOrder
          ? { ...t, sort_order: updatedOrder }
          : t
      })
      tasksRef.current = next
      return next
    })

    const BATCH_SIZE = 6
    const results: Array<{ error: any }> = []
    for (let i = 0; i < changedEntries.length; i += BATCH_SIZE) {
      const batch = changedEntries.slice(i, i + BATCH_SIZE)
      const batchResults = await Promise.all(
        batch.map(item =>
          sb.from('tasks').update({ sort_order: item.sort_order }).eq('id', item.id)
        )
      )
      results.push(...batchResults)
    }

    const failed = results.find(r => r.error)
    if (failed?.error) {
      console.error('❌ Erro Supabase (reorderTasks):', failed.error)
      if (seq === reorderSeqRef.current) {
        tasksRef.current = prevSnapshot
        setTasks(prevSnapshot)
      }
      return false
    }

    return true
  }, [currentUser])

  const reopenTask = useCallback(async (histId: string): Promise<boolean> => {
    if (!currentUser || !isUserActive(currentUser) || !canAccessModule(currentUser, 'history')) return false
    const h = hist.find(x => x.id === histId)
    if (!h || !canAccessTaskRecord(currentUser, h)) return false
    const originalDate = h.date || getTodayStr()
    const maxOrder = tasksRef.current.reduce((max, t) => Math.max(max, t.sort_order || 0), -1)
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
    const { error } = await sb.from('tasks').upsert(newTask, { onConflict: 'id' })
    if (error) {
      console.error('❌ Erro Supabase (reopenTask):', error)
      return false
    }
    await sb.from('hist').delete().eq('id', histId)
    if (newTask.recur_group_id) {
      completedRecurKeysRef.current.delete(`${newTask.recur_group_id}_${originalDate}`)
    }
    setTasks(prev => [newTask, ...prev.filter(x => x.id !== newTask.id)])
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
        if (vt.recur_group_id && vt.date) {
          completedRecurKeysRef.current.add(`${vt.recur_group_id}_${vt.date}`)
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
      if (t.recur_group_id && t.date) {
        completedRecurKeysRef.current.add(`${t.recur_group_id}_${t.date}`)
      }

      let nextDate = getNextOccurrenceAfter(t.recur!, t.recur_days || [], t.recur_start || t.date, t.date)
      while (
        nextDate &&
        (completedRecurKeysRef.current.has(`${t.recur_group_id}_${nextDate}`) ||
          tasksRef.current.some(x => x.recur_group_id === t.recur_group_id && x.date === nextDate && x.status === 'Concluída'))
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

  // ── BULK COMPLETE & BULK DELETE (OTIMIZADO EM LOTE) ───────
  const completeTasksBulk = useCallback(
    async (
      targets: Task[],
      onProgress?: (done: number, total: number, detail: BulkProgressDetail) => void
    ): Promise<{ completedIds: string[]; failedIds: string[] }> => {
      const res = await runBulkCompleteEngine({
        targets,
        currentUser,
        initialTasks: tasksRef.current,
        initialHist: histRef.current,
        sbClient: sb,
        onProgress,
      })

      for (const ct of res.nextTasks) {
        if (ct.status === 'Concluída' && ct.recur_group_id && ct.date) {
          completedRecurKeysRef.current.add(`${ct.recur_group_id}_${ct.date}`)
        }
      }

      tasksRef.current = res.nextTasks
      histRef.current = res.nextHist
      setTasks(res.nextTasks)
      setHist(res.nextHist)

      return {
        completedIds: res.completedIds,
        failedIds: res.failedIds,
      }
    },
    [currentUser]
  )

  const deleteAtrasadasBulk = useCallback(
    async (
      targets: Task[],
      onProgress?: (done: number, total: number, detail: BulkProgressDetail) => void
    ): Promise<{ deletedIds: string[]; failedIds: string[] }> => {
      const res = await runBulkDeleteEngine({
        targets,
        currentUser,
        initialTasks: tasksRef.current,
        sbClient: sb,
        onProgress,
      })

      for (const ct of res.nextTasks) {
        if (ct.status === 'Concluída' && ct.recur_group_id && ct.date) {
          completedRecurKeysRef.current.add(`${ct.recur_group_id}_${ct.date}`)
        }
      }

      tasksRef.current = res.nextTasks
      setTasks(res.nextTasks)

      return {
        deletedIds: res.deletedIds,
        failedIds: res.failedIds,
      }
    },
    [currentUser]
  )

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
    const periodKey = `${todayStr}_${period}`
    try {
      if (localStorage.getItem('pulse_daily_backup_last_date') === periodKey) return
    } catch {
      // ignore storage errors
    }
    const autoLabel = `Auto ${now.toLocaleDateString('pt-BR')} - ${period}`
    
    // Permite até 2 backups automáticos por dia (manhã e tarde)
    const { data: todayBackups } = await sb.from('backup_tasks')
      .select('id, backup_label')
      .ilike('backup_label', 'Auto%')
      .eq('backup_date', todayStr)
    
    if (todayBackups && todayBackups.length >= 2) {
      try { localStorage.setItem('pulse_daily_backup_last_date', periodKey) } catch { /* ignore */ }
      return // Já tem 2 hoje, não cria mais
    }

    // Verifica se já existe um backup para este período (manhã/tarde)
    const alreadyHasPeriod = todayBackups?.some(b => b.backup_label.includes(period))
    if (alreadyHasPeriod) {
      try { localStorage.setItem('pulse_daily_backup_last_date', periodKey) } catch { /* ignore */ }
      return // Já tem backup deste período
    }

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
      try { localStorage.setItem('pulse_daily_backup_last_date', periodKey) } catch { /* ignore */ }
      // Recarrega lista de backups para refletir o novo + remoção dos antigos
      const { data: refreshed } = await sb.from('backup_tasks')
        .select('id,backup_date,backup_label,created_at')
        .order('created_at', { ascending: false })
        .limit(30)
      setBackups(refreshed || [])
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
    fullHistoryLoaded,
    atrasadas: allAtrasadas,
    atrasadasDaLista: allAtrasadas, 
    atrasadasRecorrentes: allAtrasadas, 
    allAtrasadas, backups, pops,
    setTasks, setHist, setMeets, setTeam, setPops,
    loadAll, loadPops, loadFullHistory,
    saveTask, linkTaskPop, completeTask, completeTasksBulk, deleteTask, cycleStatus, reorderTasks, reopenTask, deleteAtrasada, deleteAtrasadasBulk,
    saveMeet, deleteMeet,
    toggleSubtask, addSubtask, deleteSubtask,
    updateTeamMember,
    checkDailyBackup, saveBackupManual, deleteBackup, restoreFromBackup,
  }
}
