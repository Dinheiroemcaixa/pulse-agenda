import type { User, TeamMember, Task } from '../types'
import { getInitials, getTodayStr } from '../lib/utils'
import { canAccessModule, canViewAllTasks, isProgrammer } from '../lib/accessControlApi'
import type { Page } from '../types'

interface Props {
  page: Page
  setPage: (p: Page) => void
  currentUser: User
  isAdmin: boolean
  tasks: Task[]
  atrasadas: Task[]
  hist: Task[]
  team: TeamMember[]
  onLogout: () => void
  onUpdateUser?: (id: string, data: Partial<User>) => Promise<boolean>
  showToast: (msg: string, type?: string) => void
}

export function Sidebar({ page, setPage, currentUser, tasks, atrasadas, hist, team, onLogout, showToast }: Props) {
  const today = getTodayStr()
  const me = currentUser.name
  const todayOpen = tasks.filter(t => t.status !== 'Concluída' && t.resp === me && t.date === today).length
  const myAtrasadas = atrasadas.filter(a => a.resp === me).length
  const doneToday = hist.filter(h => h.resp === me && h.completed_at === today.split('-').reverse().join('/')).length

  const nav = (p: Page) => {
    if (!canAccessModule(currentUser, p)) {
      showToast('🔒 Você não tem permissão para acessar este módulo.', 'warn')
      return
    }
    setPage(p)
  }

  const showTasks = canAccessModule(currentUser, 'tasks')
  const showAtrasadas = canAccessModule(currentUser, 'atrasadas')
  const showHistory = canAccessModule(currentUser, 'history')
  const showPops = canAccessModule(currentUser, 'pops')
  const showTeam = canAccessModule(currentUser, 'team')
  const showMeetings = canAccessModule(currentUser, 'meetings')
  const showMessages = canAccessModule(currentUser, 'messages')
  const showBackup = canAccessModule(currentUser, 'backup')
  const showSettings = isProgrammer(currentUser) && canAccessModule(currentUser, 'settings')
  const canSeeAllTeamMembers = canViewAllTasks(currentUser)
  const visibleMembers = canSeeAllTeamMembers
    ? team
    : team.filter(m => m.name.trim().toLowerCase() === currentUser.name.trim().toLowerCase())

  return (
    <>
      <div className="sidebar">
        <div className="logo">
          <div className="logo-icon">P</div>
          <div>
            <div className="logo-text">Pulse Agenda</div>
            <div className="logo-sub">Gestão de Tarefas</div>
          </div>
        </div>

        <div className="stats-grid">
          <div className="sc" onClick={() => showTasks && nav('tasks')}>
            <div className="sc-n blue">{todayOpen}</div>
            <div className="sc-l">Hoje</div>
          </div>
          <div className="sc" onClick={() => showAtrasadas && nav('atrasadas')}>
            <div className="sc-n red">{myAtrasadas}</div>
            <div className="sc-l">Atraso</div>
          </div>
          <div className="sc" onClick={() => showHistory && nav('history')}>
            <div className="sc-n green">{doneToday}</div>
            <div className="sc-l">Feitas</div>
          </div>
        </div>

        <nav className="nav">
          <div className="ns">Principal</div>
          {showTasks && (
            <button className={`ni${page === 'tasks' ? ' active' : ''}`} onClick={() => nav('tasks')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
              Minhas Tarefas
            </button>
          )}
          {showAtrasadas && (
            <button className={`ni${page === 'atrasadas' ? ' active' : ''}`} onClick={() => nav('atrasadas')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              Atrasadas
              {myAtrasadas > 0 && <span className="nb">{myAtrasadas}</span>}
            </button>
          )}
          {showHistory && (
            <button className={`ni${page === 'history' ? ' active' : ''}`} onClick={() => nav('history')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
              Histórico
            </button>
          )}
          {showPops && (
            <button className={`ni${page === 'pops' ? ' active' : ''}`} onClick={() => nav('pops')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              Procedimentos (POP)
            </button>
          )}

          {(showTeam || showMeetings || showMessages) && <div className="ns">Equipe</div>}
          {showTeam && (
            <button className={`ni${page === 'team' ? ' active' : ''}`} onClick={() => nav('team')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
              Equipe
              <span className="nb blue">{team.length}</span>
            </button>
          )}
          {showMeetings && (
            <button className={`ni${page === 'meetings' ? ' active' : ''}`} onClick={() => nav('meetings')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
              Reuniões
            </button>
          )}
          {showMessages && (
            <button className={`ni${page === 'messages' ? ' active' : ''}`} onClick={() => nav('messages')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
              Mensagens
            </button>
          )}

          {(showBackup || showSettings) && (
            <>
              <div className="ns">Sistema</div>
              {showBackup && (
                <button className={`ni${page === 'backup' ? ' active' : ''}`} onClick={() => nav('backup')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  Backup
                </button>
              )}
              {showSettings && (
                <button className={`ni${page === 'settings' ? ' active' : ''}`} onClick={() => nav('settings')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
                  Configurações
                </button>
              )}
            </>
          )}

          {visibleMembers.length > 0 && <div className="ns">Membros</div>}
          {visibleMembers.map(m => (
            <button key={m.id} className="ni" onClick={() => {
              if (showTasks) nav('tasks')
            }} style={{ gap: '7px' }}>
              <div className="avsm" style={{ background: m.color }}>{getInitials(m.name)}</div>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' }}>
                {m.name.split(' ')[0]}
              </span>
              {m.name === currentUser.name && <span style={{ fontSize: '9px', opacity: 0.5, marginLeft: 'auto' }}>eu</span>}
            </button>
          ))}
        </nav>


        <div className="user-area">
          <div className="uc">
            <div className="av" style={{ background: currentUser.color }}>{getInitials(currentUser.name)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="un" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentUser.name}</div>
              <div className="ur">{currentUser.role}</div>
            </div>
            <div className="od" />
          </div>
          <button className="logout-btn" onClick={onLogout}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sair
          </button>
        </div>
      </div>
    </>
  )
}
