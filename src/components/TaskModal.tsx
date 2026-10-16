import { useState, useEffect, useRef } from 'react'
import type { Task, TeamMember, User, RecurType, Priority } from '../types'
import { getTodayStr, RECUR_LABELS } from '../lib/utils'

interface Props {
  editTask?: Task
  team: TeamMember[]
  currentUser: User
  defaultDate?: string
  onSave: (data: Partial<Task>) => Promise<void>
  onClose: () => void
  showToast: (msg: string, type?: string) => void
}

const DAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']
const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export function TaskModal({ editTask, team, currentUser, defaultDate, onSave, onClose, showToast }: Props) {
  const [desc, setDesc] = useState(editTask?.descricao || '')
  const [resp, setResp] = useState(editTask?.resp || currentUser.name)
  const [date, setDate] = useState(editTask?.date || defaultDate || getTodayStr())
  const [prio, setPrio] = useState<Priority>(editTask?.prio || 'Média')
  const [allDay, setAllDay] = useState(editTask?.all_day !== false)
  const [timeStart, setTimeStart] = useState(editTask?.time_start || '09:00')
  const [timeEnd, setTimeEnd] = useState(editTask?.time_end || '10:00')
  const [recur, setRecur] = useState<RecurType>(editTask?.recur || 'none')
  const [recurDays, setRecurDays] = useState<string[]>(editTask?.recur_days || [])
  const [subtasks, setSubtasks] = useState(editTask?.subtasks?.map(s => ({ ...s })) || [])
  const [notes, setNotes] = useState(editTask?.notes || '')
  const [recurOpen, setRecurOpen] = useState(false)
  const [subInput, setSubInput] = useState('')
  const [saving, setSaving] = useState(false)

  const descRef = useRef<HTMLInputElement>(null)
  useEffect(() => { setTimeout(() => descRef.current?.focus(), 100) }, [])

  const handleSave = async () => {
    if (!desc.trim()) { showToast('⚠ Preencha a descrição', 'warn'); return }
    setSaving(true)
    const recurStart = editTask?.recur_start || (recur !== 'none' ? date : undefined)
    await onSave({
      descricao: desc.trim(),
      resp,
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
    })
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
              <select className="inp" value={resp} onChange={e => setResp(e.target.value)}>
                {team.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
              </select>
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
