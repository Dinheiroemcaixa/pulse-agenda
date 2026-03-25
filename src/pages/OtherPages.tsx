import { useState, useEffect, useRef } from 'react'
import type { Task, TeamMember, Meeting, User, Backup } from '../types'
import { getInitials, genId, getTodayStr, COLORS } from '../lib/utils'
import { sb } from '../lib/supabase'
import { isLate } from '../lib/utils'

// ──────────────────────────────────────────────────────────────
// TEAM PAGE
// ──────────────────────────────────────────────────────────────
interface TeamProps {
  tasks: Task[]
  hist: Task[]
  team: TeamMember[]
  currentUser: User
  isAdmin: boolean
  setViewingAll: (v: boolean) => void
  setMemberFilter: (m: string) => void
  setPage: (p: any) => void
  onUpdateTeam: (id: string, data: Partial<TeamMember>) => Promise<boolean>
  showToast: (msg: string, type?: string) => void
}

export function TeamPage({ tasks, hist, team, currentUser, isAdmin, setViewingAll, setMemberFilter, setPage, onUpdateTeam, showToast }: TeamProps) {
  const [editMember, setEditMember] = useState<TeamMember | null>(null)
  const [eName, setEName] = useState('')
  const [eRole, setERole] = useState('')
  const [eColor, setEColor] = useState('')

  const openEdit = (m: TeamMember) => { setEditMember(m); setEName(m.name); setERole(m.role); setEColor(m.color) }

  const saveEdit = async () => {
    if (!editMember) return
    const ok = await onUpdateTeam(editMember.id, { name: eName, role: eRole, color: eColor })
    if (ok) { showToast('✅ Membro atualizado', 'success'); setEditMember(null) }
    else showToast('❌ Erro ao salvar', 'error')
  }

  return (
    <>
      <div className="topbar"><div><div className="pt">Equipe</div><div className="ps">Membros e produtividade</div></div></div>
      <div className="content">
        <div className="team-grid">
          {team.map(m => {
            const mt = tasks.filter(t => t.resp === m.name && t.status !== 'Concluída')
            const late = mt.filter(t => isLate(t))
            const done = hist.filter(h => h.resp === m.name)
            const isMe = m.name === currentUser.name
            return (
              <div key={m.id} className="member-card">
                <div className="mc-top">
                  <div className="mc-av" style={{ background: m.color }}>{getInitials(m.name)}</div>
                  <div>
                    <div className="mc-name">{m.name}{isMe && <span className="mc-badge"> Você</span>}</div>
                    <div className="mc-role">{m.role || '—'}{m.is_admin && ' 👑'}</div>
                  </div>
                </div>
                <div className="mc-stats">
                  <div className="mcs"><div className="mcs-n" style={{ color: 'var(--accent)' }}>{mt.length}</div><div className="mcs-l">Abertas</div></div>
                  <div className="mcs"><div className="mcs-n" style={{ color: 'var(--red)' }}>{late.length}</div><div className="mcs-l">Atraso</div></div>
                  <div className="mcs"><div className="mcs-n" style={{ color: 'var(--green)' }}>{done.length}</div><div className="mcs-l">Feitas</div></div>
                </div>
                <div className="mc-actions">
                  <div className="mc-btn" onClick={() => { setViewingAll(true); setMemberFilter(m.name); setPage('tasks') }}>Ver tarefas</div>
                  {(isMe || isAdmin) && <div className="mc-btn" onClick={() => openEdit(m)}>Editar</div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {editMember && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditMember(null)}>
          <div className="modal modal-sm">
            <div className="modal-title">Editar Membro</div>
            <div className="field"><label className="label">Nome</label><input className="inp" value={eName} onChange={e => setEName(e.target.value)} /></div>
            <div className="field"><label className="label">Cargo</label><input className="inp" value={eRole} onChange={e => setERole(e.target.value)} /></div>
            <div className="field">
              <label className="label">Cor</label>
              <div className="color-picker">{COLORS.map(c => <div key={c} className={`cp${eColor === c ? ' sel' : ''}`} style={{ background: c }} onClick={() => setEColor(c)} />)}</div>
            </div>
            <div className="modal-footer">
              <button className="bcancel" onClick={() => setEditMember(null)}>Cancelar</button>
              <button className="btn-primary" onClick={saveEdit}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ──────────────────────────────────────────────────────────────
// MEETINGS PAGE
// ──────────────────────────────────────────────────────────────
interface MeetProps {
  meets: Meeting[]
  team: TeamMember[]
  currentUser: User
  isAdmin: boolean
  onSaveMeet: (data: Partial<Meeting>, editId?: string) => Promise<boolean>
  onDeleteMeet: (id: string) => Promise<void>
  showToast: (msg: string, type?: string) => void
}

export function MeetingsPage({ meets, team, currentUser, isAdmin, onSaveMeet, onDeleteMeet, showToast }: MeetProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(getTodayStr())
  const [time, setTime] = useState('10:00')
  const [notes, setNotes] = useState('')
  const [parts, setParts] = useState<string[]>([])

  const myMeets = isAdmin ? meets : meets.filter(m => m.parts?.includes(currentUser.name))

  const togglePart = (name: string) => setParts(prev => prev.includes(name) ? prev.filter(p => p !== name) : [...prev, name])

  const save = async () => {
    if (!title.trim()) { showToast('⚠ Preencha o título', 'warn'); return }
    const ok = await onSaveMeet({ title: title.trim(), date, time, notes: notes.trim() || undefined, resp: currentUser.name, parts })
    if (ok) { showToast('✅ Reunião criada!', 'success'); setModalOpen(false); setTitle(''); setNotes(''); setParts([]) }
    else showToast('❌ Erro ao salvar', 'error')
  }

  return (
    <>
      <div className="topbar">
        <div><div className="pt">Reuniões</div><div className="ps">Compromissos agendados</div></div>
        <button className="add-btn" onClick={() => setModalOpen(true)}>+ Nova Reunião</button>
      </div>
      <div className="content">
        {myMeets.length === 0 ? (
          <div className="es"><div className="ei">📅</div><div className="et">Nenhuma reunião agendada</div></div>
        ) : (
          <div className="meets-list">
            {myMeets.map(m => (
              <div key={m.id} className="meet-card">
                <div>
                  <div className="tn">{m.title}</div>
                  {m.notes && <div className="notes-display" style={{ marginTop: 6, fontSize: 11 }} dangerouslySetInnerHTML={{ __html: m.notes.replace(/\n/g, '<br>') }} />}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>{Array.isArray(m.parts) ? m.parts.join(', ') : m.parts}</div>
                <div className="dc">📅 {m.date}</div>
                <div className="dc">🕐 {m.time}</div>
                <div className="ra">
                  <button className="act del" onClick={async () => { await onDeleteMeet(m.id); showToast('🗑 Removida', 'warn') }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal">
            <div className="modal-title">Nova Reunião</div>
            <div className="field"><label className="label">Título</label><input className="inp" placeholder="Título da reunião..." value={title} onChange={e => setTitle(e.target.value)} autoFocus /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field"><label className="label">Data</label><input className="inp" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
              <div className="field"><label className="label">Horário</label><input className="inp" type="time" value={time} onChange={e => setTime(e.target.value)} /></div>
            </div>
            <div className="field">
              <label className="label">Participantes</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {team.map(m => (
                  <button key={m.id} className={`mf${parts.includes(m.name) ? ' active' : ''}`} onClick={() => togglePart(m.name)}>
                    <div className="mf-dot" style={{ background: m.color }} />{m.name.split(' ')[0]}
                  </button>
                ))}
                <button className={`mf${parts.length === team.length ? ' active' : ''}`} onClick={() => setParts(parts.length === team.length ? [] : team.map(m => m.name))}>Todos</button>
              </div>
            </div>
            <div className="field"><label className="label">Observações</label><textarea className="inp" rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></div>
            <div className="modal-footer">
              <button className="bcancel" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn-primary" onClick={save}>Criar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ──────────────────────────────────────────────────────────────
// MESSAGES PAGE
// ──────────────────────────────────────────────────────────────
interface MsgProps {
  team: TeamMember[]
  currentUser: User
  showToast: (msg: string, type?: string) => void
}

interface Message { id: string; from: string; to: string; text: string; created_at: string }

export function MessagesPage({ team, currentUser, showToast }: MsgProps) {
  const [convWith, setConvWith] = useState<string | null>(team.find(m => m.name !== currentUser.name)?.name || null)
  const [msgs, setMsgs] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadMsgs = async (other: string) => {
    const { data } = await sb.from('messages').select('*')
      .or(`and(from.eq.${currentUser.name},to.eq.${other}),and(from.eq.${other},to.eq.${currentUser.name})`)
      .order('created_at', { ascending: true })
    setMsgs(data || [])
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  useEffect(() => { if (convWith) loadMsgs(convWith) }, [convWith])

  useEffect(() => {
    if (!convWith) return
    const channel = sb.channel('messages_' + currentUser.name)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const m = payload.new as Message
        if ((m.from === convWith && m.to === currentUser.name) || (m.from === currentUser.name && m.to === convWith)) {
          setMsgs(prev => [...prev, m])
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
        }
      }).subscribe()
    return () => { sb.removeChannel(channel) }
  }, [convWith])

  const send = async () => {
    if (!input.trim() || !convWith) return
    const msg: Message = { id: genId(), from: currentUser.name, to: convWith, text: input.trim(), created_at: new Date().toISOString() }
    await sb.from('messages').insert(msg)
    setMsgs(prev => [...prev, msg])
    setInput('')
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  const others = team.filter(m => m.name !== currentUser.name)

  return (
    <>
      <div className="topbar"><div><div className="pt">Mensagens</div><div className="ps">Conversas diretas</div></div></div>
      <div className="messages-wrap" style={{ height: 'calc(100vh - 57px)' }}>
        <div className="msg-sidebar">
          <div className="ns" style={{ padding: '8px 0 6px' }}>Conversas</div>
          {others.map(m => (
            <div key={m.id} className={`conv-item${convWith === m.name ? ' active' : ''}`} onClick={() => setConvWith(m.name)}>
              <div className="avsm" style={{ background: m.color }}>{getInitials(m.name)}</div>
              {m.name.split(' ')[0]}
            </div>
          ))}
        </div>
        <div className="msg-conv">
          {convWith ? (
            <>
              <div className="msg-conv-header">
                {(() => { const m = team.find(x => x.name === convWith); return m ? <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div className="avsm" style={{ background: m.color }}>{getInitials(m.name)}</div>{m.name}</span> : convWith })()}
              </div>
              <div className="msg-list">
                {msgs.map(m => {
                  const isMine = m.from === currentUser.name
                  return (
                    <div key={m.id}>
                      <div className={`msg-bubble ${isMine ? 'mine' : 'other'}`}>
                        {!isMine && <div className="msg-bubble-name">{m.from.split(' ')[0]}</div>}
                        {m.text}
                        <div className="msg-bubble-time">{new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>
              <div className="msg-input-row">
                <textarea className="msg-input" rows={1} placeholder="Digite uma mensagem..." value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
                <button className="msg-send" onClick={send}>Enviar</button>
              </div>
            </>
          ) : (
            <div className="es" style={{ margin: 'auto' }}><div className="ei">💬</div><div className="et">Selecione uma conversa</div></div>
          )}
        </div>
      </div>
    </>
  )
}

// ──────────────────────────────────────────────────────────────
// BACKUP PAGE
// ──────────────────────────────────────────────────────────────
interface BackupProps {
  backups: Backup[]
  tasks: Task[]
  currentUser: User
  isAdmin: boolean
  onSaveBackup: (label: string) => Promise<void>
  onDeleteBackup: (id: string) => Promise<void>
  showToast: (msg: string, type?: string) => void
}

export function BackupPage({ backups, tasks, currentUser, isAdmin, onSaveBackup, onDeleteBackup, showToast }: BackupProps) {
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [restoreConfirm, setRestoreConfirm] = useState<string | null>(null)

  const create = async () => {
    setSaving(true)
    await onSaveBackup(label || `Manual ${new Date().toLocaleDateString('pt-BR')}`)
    setLabel('')
    setSaving(false)
    showToast('✅ Backup criado!', 'success')
  }

  const restore = async (backupId: string) => {
    const { data: bk } = await sb.from('backup_tasks').select('tasks_snapshot').eq('id', backupId).single()
    if (!bk?.tasks_snapshot) { showToast('❌ Backup não encontrado', 'error'); return }
    await sb.from('tasks').delete().neq('id', 'x')
    for (const t of bk.tasks_snapshot) await sb.from('tasks').insert(t)
    showToast('✅ Backup restaurado! Recarregue a página.', 'success')
    setRestoreConfirm(null)
  }

  return (
    <>
      <div className="topbar">
        <div><div className="pt">Backup</div><div className="ps">Cópias de segurança das tarefas</div></div>
      </div>
      <div className="content">
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Criar Backup Manual</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="inp" placeholder="Rótulo (opcional)..." value={label} onChange={e => setLabel(e.target.value)} style={{ flex: 1 }} />
            <button className="btn-primary" onClick={create} disabled={saving}>{saving ? 'Salvando...' : '💾 Criar Backup'}</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>📦 {tasks.length} tarefas serão salvas</div>
        </div>

        <div className="backup-list">
          {backups.length === 0 && <div className="es"><div className="ei">💾</div><div className="et">Nenhum backup ainda</div></div>}
          {backups.map(b => (
            <div key={b.id} className="backup-card">
              <div className="backup-icon">💾</div>
              <div className="backup-info">
                <div className="backup-label">{b.backup_label}</div>
                <div className="backup-date">{new Date(b.created_at).toLocaleString('pt-BR')}</div>
              </div>
              <div className="backup-actions">
                <button className="backup-btn" onClick={() => setRestoreConfirm(b.id)}>↩ Restaurar</button>
                <button className="backup-btn danger" onClick={async () => { await onDeleteBackup(b.id); showToast('🗑 Backup removido', 'warn') }}>✕</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {restoreConfirm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setRestoreConfirm(null)}>
          <div className="modal confirm-modal">
            <div className="confirm-title">Restaurar Backup</div>
            <div className="confirm-body">Isso <strong style={{ color: 'var(--red)' }}>substituirá todas as tarefas atuais</strong> pelas do backup. Ação irreversível.</div>
            <div className="modal-footer">
              <button className="bcancel" onClick={() => setRestoreConfirm(null)}>Cancelar</button>
              <button style={{ background: 'var(--redbg)', border: '1px solid var(--red)', borderRadius: 7, padding: '8px 16px', color: 'var(--red)', cursor: 'pointer', fontWeight: 700 }} onClick={() => restore(restoreConfirm)}>Sim, restaurar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
