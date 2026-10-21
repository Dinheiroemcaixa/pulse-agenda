import { useState, useEffect, useRef, useMemo } from 'react'
import type { Task, TeamMember, User, RecurType, Priority, Pop } from '../types'
import { getTodayStr, RECUR_LABELS } from '../lib/utils'
import { resolveTaskPopId, linkTaskToPopApi } from '../lib/popsApi'
import { canViewAllTasks, isUserActive } from '../lib/accessControlApi'

interface Props {
  editTask?: Task
  team: TeamMember[]
  currentUser: User
  pops?: Pop[]
  defaultDate?: string
  onSave: (data: Partial<Task>) => Promise<boolean | void>
  onClose: () => void
  showToast: (msg: string, type?: string) => void
}

const DAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']
const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export function TaskModal({ editTask, team, currentUser, pops = [], defaultDate, onSave, onClose, showToast }: Props) {
  const canAssignOthers = Boolean(editTask ? isUserActive(currentUser) : (canViewAllTasks(currentUser) || isUserActive(currentUser)))

  const availableOperators = useMemo(() => {
    const list: Array<{ id: string; name: string }> = []
    const seen = new Set<string>()
    const addOp = (id: string, rawName?: string) => {
      const trimmed = (rawName || '').trim()
      if (!trimmed) return
      const key = trimmed.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        list.push({ id, name: trimmed })
      }
    }
    team.forEach(m => addOp(m.id, m.name))
    addOp(currentUser.id || 'current_user', currentUser.name)
    if (editTask?.resp) {
      addOp(`task_resp_${editTask.id}`, editTask.resp)
    }
    return list
  }, [team, currentUser.id, currentUser.name, editTask?.id, editTask?.resp])

  const resolveCanonicalOperatorName = (rawName?: string) => {
    const target = (rawName || currentUser.name || '').trim()
    const match = availableOperators.find(op => op.name.toLowerCase() === target.toLowerCase())
    return match ? match.name : target
  }

  const [desc, setDesc] = useState(editTask?.descricao || '')
  const [resp, setResp] = useState(() => resolveCanonicalOperatorName(editTask?.resp || currentUser.name))
  const [date, setDate] = useState(editTask?.date || defaultDate || getTodayStr())
  const [prio, setPrio] = useState<Priority>(editTask?.prio || 'Média')
  const [allDay, setAllDay] = useState(editTask?.all_day !== false)
  const [timeStart, setTimeStart] = useState(editTask?.time_start || '09:00')
  const [timeEnd, setTimeEnd] = useState(editTask?.time_end || '10:00')
  const [recur, setRecur] = useState<RecurType>(editTask?.recur || 'none')
  const [recurDays, setRecurDays] = useState<string[]>(editTask?.recur_days || [])
  const [subtasks, setSubtasks] = useState(editTask?.subtasks?.map(s => ({ ...s })) || [])
  const [notes, setNotes] = useState(editTask?.notes || '')
  const [popId, setPopId] = useState<string>(() => {
    if (editTask?.pop_id) return editTask.pop_id
    if (editTask?.id) return resolveTaskPopId(editTask.id) || ''
    return ''
  })
  const [recurOpen, setRecurOpen] = useState(false)
  const [subInput, setSubInput] = useState('')
  const [saving, setSaving] = useState(false)

  const descRef = useRef<HTMLInputElement>(null)
  useEffect(() => { setTimeout(() => descRef.current?.focus(), 100) }, [])

  const isTransferring = Boolean(
    editTask &&
    resp.trim() &&
    resp.trim().toLowerCase() !== (editTask.resp || '').trim().toLowerCase()
  )

  const handleSave = async () => {
    if (!desc.trim()) { showToast('⚠ Preencha a descrição', 'warn'); return }
    setSaving(true)
    const recurStart = editTask?.recur_start || (recur !== 'none' ? date : undefined)
    const selectedPopId = popId || undefined
    const saved = await onSave({
      descricao: desc.trim(),
      resp: resp.trim() || currentUser.name.trim(),
      date,
      prio,
      status: editTask?.status || 'Em Aberto',
      all_day: allDay,
      time_start: allDay ? undefined : timeStart,
      time_end: allDay ? undefined : timeEnd,
      tags: editTask?.tags || [],
      recur,
      recur_days: recur === 'custom' ? recurDays : [],
      recur_start: recurStart,
      recur_group_id: editTask?.recur_group_id,
      subtasks,
      notes: notes.trim() || undefined,
      is_meeting: editTask?.is_meeting || false,
      pop_id: selectedPopId,
    })
    if (saved !== false && editTask?.id) {
      await linkTaskToPopApi(editTask.id, selectedPopId || null)
    }
    setSaving(false)
  }

  const toggleRecurDay = (day: string) => {
    setRecurDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])
  }

  const addSubtask = () => {
    if (!subInput.trim()) return
    setSubtasks(prev => [...prev, { text: subInput.trim(), done: false }])
    setSubInput('')
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="modal" style={{ width: 520 }}>
          <div className="modal-title">{editTask ? 'Editar Tarefa' : 'Nova Tarefa'}</div>

          <div className="field">
            <label className="label">Descrição *</label>
            <input ref={descRef} className="inp" placeholder="O que precisa ser feito?" value={desc} onChange={e => setDesc(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field">
              <label className="label">Responsável</label>
              <select
                className="inp"
                value={resolveCanonicalOperatorName(resp)}
                disabled={!canAssignOthers}
                onChange={e => setResp(e.target.value)}
              >
                {canAssignOthers ? (
                  availableOperators.map(m => <option key={m.id} value={m.name}>{m.name}</option>)
                ) : (
                  <option value={currentUser.name}>{currentUser.name}</option>
                )}
              </select>
              {isTransferring && editTask && (
                <div
                  style={{
                    marginTop: 6,
                    padding: '5px 8px',
                    borderRadius: 6,
                    fontSize: 11.5,
                    fontWeight: 500,
                    background: 'rgba(37, 99, 235, 0.1)',
                    border: '1px solid rgba(37, 99, 235, 0.28)',
                    color: 'var(--accent, #2563eb)',
                    lineHeight: 1.35,
                  }}
                >
                  ↪ Transferindo responsável: de <strong>{editTask.resp}</strong> para <strong>{resp}</strong>
                </div>
              )}
            </div>
            <div className="field">
              <label className="label">Prioridade</label>

              <select className="inp" value={prio} onChange={e => setPrio(e.target.value as Priority)}>
                <option>Alta</option>
                <option>Média</option>
                <option>Baixa</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label className="label">Data</label>
            <input className="inp" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>

          <div className="allday-row">
            <button className={`toggle${allDay ? ' on' : ''}`} onClick={() => setAllDay(!allDay)} />
            <span style={{ fontSize: 13, color: 'var(--text2)' }}>{allDay ? 'Dia todo' : 'Horário específico'}</span>
          </div>
          {!allDay && (
            <div className="time-row" style={{ marginBottom: 14 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="label">Início</label>
                <input className="inp" type="time" value={timeStart} onChange={e => setTimeStart(e.target.value)} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="label">Fim</label>
                <input className="inp" type="time" value={timeEnd} onChange={e => setTimeEnd(e.target.value)} />
              </div>
            </div>
          )}

          <div className="field">
            <label className="label">Recorrência</label>
            <div className="recur-wrap">
              <button className={`recur-trigger${recurOpen ? ' open' : ''}`} onClick={() => setRecurOpen(!recurOpen)}>
                <span>{RECUR_LABELS[recur] || recur}</span>
                <span>{recurOpen ? '▲' : '▼'}</span>
              </button>
              <div className={`recur-dropdown${recurOpen ? ' open' : ''}`}>
                {(Object.entries(RECUR_LABELS) as [RecurType, string][]).map(([val, label]) => (
                  <div key={val} className={`recur-opt${recur === val ? ' sel' : ''}`} onClick={() => { setRecur(val); if (val !== 'custom') setRecurOpen(false) }}>
                    {label} {recur === val && <span className="check-icon">✓</span>}
                  </div>
                ))}
                {recur === 'custom' && (
                  <div className="custom-days">
                    {DAYS.map((d, i) => (
                      <button key={d} className={`day-btn${recurDays.includes(d) ? ' sel' : ''}`} onClick={() => toggleRecurDay(d)}>{DAY_LABELS[i]}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>


          <div className="field">
            <label className="label">Subtarefas</label>
            <div style={{ marginBottom: 8 }}>
              {subtasks.map((s, i) => (
                <div key={i} className="modal-sub-item">
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>•</span>
                  <input value={s.text} onChange={e => setSubtasks(prev => prev.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} />
                  <button className="modal-sub-remove" onClick={() => setSubtasks(prev => prev.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="inp" placeholder="Nova subtarefa..." value={subInput} onChange={e => setSubInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addSubtask()} style={{ flex: 1 }} />
              <button className="tbtn" style={{ width: 'auto', padding: '0 12px' }} onClick={addSubtask}>+ Add</button>
            </div>
          </div>

          <div className="field">
            <label className="label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Procedimento Padrão (POP)</span>
              {popId ? (
                <span style={{ fontSize: 11, color: 'var(--accent, #2563eb)', fontWeight: 600 }}>● Vinculado</span>
              ) : (
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>Opcional</span>
              )}
            </label>
            <select
              className="inp"
              value={popId}
              onChange={e => setPopId(e.target.value)}
              style={{ cursor: 'pointer' }}
            >
              <option value="">Nenhum POP associado (execução livre)</option>
              {pops.map(p => (
                <option key={p.id} value={p.id} disabled={!p.active && p.id !== popId}>
                  📘 {p.title} {!p.active ? '(Inativo)' : ''}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
              Vincula instruções passo a passo para orientar quem for executar ou substituir esta tarefa.
            </div>
          </div>

          <div className="field">
            <label className="label">Observações</label>
            <textarea className="inp" rows={2} placeholder="Notas adicionais..." value={notes} onChange={e => setNotes(e.target.value)} style={{ resize: 'vertical' }} />
          </div>

          <div className="modal-footer">
            <button className="bcancel" onClick={onClose}>Cancelar</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : (editTask ? 'Atualizar' : 'Criar Tarefa')}</button>
          </div>
        </div>
      </div>
  )
}
