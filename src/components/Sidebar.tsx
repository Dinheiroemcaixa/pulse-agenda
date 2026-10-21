import type { User, TeamMember, Task, Page, OperatorTestSession } from '../types'
import { getInitials, getTodayStr } from '../lib/utils'
import { canAccessModule, canViewAllTasks, isProgrammer } from '../lib/accessControlApi'
import { DcxFlowIcon } from './DcxFlowLogo'

interface Props {
  page: Page
  setPage: (p: Page) => void
  currentUser: User
  isAdmin: boolean
  tasks: Task[]
  atrasadas: Task[]
  hist: Task[]
  team: TeamMember[]
  viewingAll?: boolean
  memberFilter?: string
  setViewingAll?: (v: boolean) => void
  setMemberFilter?: (m: string) => void
  onLogout: () => void
  onUpdateUser?: (id: string, data: Partial<User>) => Promise<boolean>
  showToast: (msg: string, type?: string) => void
  operatorTestSession?: OperatorTestSession | null
  onEndOperatorSession?: () => Promise<void>
}

function toTitleCaseName(str: string): string {
  if (!str) return ''
  return str
    .trim()
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

export function Sidebar({
  page,
  setPage,
  currentUser,
  tasks,
  atrasadas,
  hist,
  team,
  viewingAll,
  memberFilter,
  setViewingAll,
  setMemberFilter,
  onLogout,
  showToast,
  operatorTestSession,
  onEndOperatorSession,
}: Props) {
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

  const handleMemberClick = (m: TeamMember) => {
    if (showTasks) nav('tasks')
    if (canSeeAllTeamMembers && setViewingAll && setMemberFilter) {
      const isMe = m.name.trim().toLowerCase() === currentUser.name.trim().toLowerCase()
      if (isMe && !viewingAll) {
        setMemberFilter(m.name)
        return
      }
      setViewingAll(true)
      setMemberFilter(m.name)
      try {
        localStorage.setItem('pulse_viewingAll', 'true')
        localStorage.setItem('pulse_memberFilter', m.name)
      } catch {}
    }
  }

  return (
    <aside className="sidebar navy-sidebar">
      <div className="navy-brand">
        <DcxFlowIcon size={36} />
        <div className="navy-brand-text">
          <span className="navy-brand-title" style={{ letterSpacing: '-0.02em', fontWeight: 700 }}>
            DCX <span style={{ color: '#34D399' }}>Flow</span>
          </span>
          <span className="navy-brand-sub">Dinheiro em Caixa</span>
        </div>
      </div>

      <div className="navy-kpi-strip">
        <button
          type="button"
          className="navy-kpi-cell"
          onClick={() => showTasks && nav('tasks')}
          title="Ver tarefas de hoje"
        >
          <span className="navy-kpi-num navy-kpi-today">{todayOpen}</span>
          <span className="navy-kpi-lbl">Hoje</span>
        </button>
        <button
          type="button"
          className="navy-kpi-cell navy-kpi-mid"
          onClick={() => showAtrasadas && nav('atrasadas')}
          title="Ver tarefas em atraso"
        >
          <span className={`navy-kpi-num ${myAtrasadas > 0 ? 'navy-kpi-late-active' : 'navy-kpi-late-zero'}`}>
            {myAtrasadas}
          </span>
          <span className="navy-kpi-lbl">Atraso</span>
        </button>
        <button
          type="button"
          className="navy-kpi-cell"
          onClick={() => showHistory && nav('history')}
          title="Ver histórico de concluídas"
        >
          <span className="navy-kpi-num navy-kpi-done">{doneToday}</span>
          <span className="navy-kpi-lbl">Feitas</span>
        </button>
      </div>

      <nav className="navy-nav">
        <div className="navy-ns">PRINCIPAL</div>
        {showTasks && (
          <button
            type="button"
            className={`navy-ni${page === 'tasks' ? ' active' : ''}`}
            onClick={() => nav('tasks')}
          >
            <span className="material-symbols-outlined navy-ni-icon">task_alt</span>
            <span className="navy-ni-label">Minhas Tarefas</span>
            <span className="navy-ni-count">{todayOpen}</span>
          </button>
        )}
        {showAtrasadas && (
          <button
            type="button"
            className={`navy-ni${page === 'atrasadas' ? ' active' : ''}`}
            onClick={() => nav('atrasadas')}
          >
            <span className="material-symbols-outlined navy-ni-icon">schedule</span>
            <span className="navy-ni-label">Atrasadas</span>
            {myAtrasadas > 0 && <span className="navy-nb navy-nb-danger">{myAtrasadas}</span>}
          </button>
        )}
        {showHistory && (
          <button
            type="button"
            className={`navy-ni${page === 'history' ? ' active' : ''}`}
            onClick={() => nav('history')}
          >
            <span className="material-symbols-outlined navy-ni-icon">history</span>
            <span className="navy-ni-label">Histórico</span>
          </button>
        )}
        {showPops && (
          <button
            type="button"
            className={`navy-ni${page === 'pops' ? ' active' : ''}`}
            onClick={() => nav('pops')}
          >
            <span className="material-symbols-outlined navy-ni-icon">menu_book</span>
            <span className="navy-ni-label">Procedimentos (POP)</span>
          </button>
        )}

        {(showTeam || showMeetings || showMessages) && <div className="navy-ns navy-ns-spaced">EQUIPE</div>}
        {showTeam && (
          <button
            type="button"
            className={`navy-ni${page === 'team' ? ' active' : ''}`}
            onClick={() => nav('team')}
          >
            <span className="material-symbols-outlined navy-ni-icon">group</span>
            <span className="navy-ni-label">Equipe</span>
            <span className="navy-nb">{team.length}</span>
          </button>
        )}
        {showMeetings && (
          <button
            type="button"
            className={`navy-ni${page === 'meetings' ? ' active' : ''}`}
            onClick={() => nav('meetings')}
          >
            <span className="material-symbols-outlined navy-ni-icon">event</span>
            <span className="navy-ni-label">Reuniões</span>
          </button>
        )}
        {showMessages && (
          <button
            type="button"
            className={`navy-ni${page === 'messages' ? ' active' : ''}`}
            onClick={() => nav('messages')}
          >
            <span className="material-symbols-outlined navy-ni-icon">chat_bubble</span>
            <span className="navy-ni-label">Mensagens</span>
          </button>
        )}

        {(showBackup || showSettings) && (
          <>
            <div className="navy-ns navy-ns-spaced">SISTEMA</div>
            {showBackup && (
              <button
                type="button"
                className={`navy-ni${page === 'backup' ? ' active' : ''}`}
                onClick={() => nav('backup')}
              >
                <span className="material-symbols-outlined navy-ni-icon">backup</span>
                <span className="navy-ni-label">Backup</span>
              </button>
            )}
            {showSettings && (
              <button
                type="button"
                className={`navy-ni${page === 'settings' ? ' active' : ''}`}
                onClick={() => nav('settings')}
              >
                <span className="material-symbols-outlined navy-ni-icon">settings</span>
                <span className="navy-ni-label">Configurações</span>
              </button>
            )}
          </>
        )}

        {visibleMembers.length > 0 && <div className="navy-ns navy-ns-spaced">MEMBROS</div>}
        {visibleMembers.map(m => {
          const isMe = m.name.trim().toLowerCase() === currentUser.name.trim().toLowerCase()
          const isSelectedMember =
            page === 'tasks' &&
            viewingAll &&
            memberFilter &&
            memberFilter.trim().toLowerCase() === m.name.trim().toLowerCase()
          const firstName = toTitleCaseName(m.name.split(' ')[0])
          return (
            <button
              key={m.id}
              type="button"
              className={`navy-member-row${isSelectedMember ? ' active' : ''}`}
              onClick={() => handleMemberClick(m)}
            >
              <span className="navy-member-av" style={{ background: m.color || '#3D55D6' }}>
                {getInitials(m.name)}
              </span>
              <span className="navy-member-name">{firstName}</span>
              {isMe && <span className="navy-member-tag">você</span>}
            </button>
          )
        })}
      </nav>

      {operatorTestSession && onEndOperatorSession && (
        <div
          data-testid="sidebar-operator-session-card"
          style={{
            margin: '8px 12px 4px',
            padding: '10px 12px',
            borderRadius: 10,
            background: 'rgba(79, 110, 247, 0.16)',
            border: '1px solid rgba(79, 110, 247, 0.45)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 800, color: '#91a7ff', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            🧑‍💻 Sessão de Teste · Operador
          </div>
          <div style={{ fontSize: 11, color: '#e6ebff', lineHeight: 1.35 }}>
            Operando como <strong>{currentUser.name}</strong>
          </div>
          <button
            type="button"
            data-testid="sidebar-end-operator-session-btn"
            onClick={onEndOperatorSession}
            style={{
              marginTop: 2,
              padding: '6px 10px',
              borderRadius: 7,
              border: '1px solid rgba(255, 255, 255, 0.25)',
              background: '#4f6ef7',
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            ↩ Voltar para Desenvolvedor
          </button>
        </div>
      )}

      <div className="navy-user-card">
        <div className="navy-user-av" style={{ background: currentUser.color || '#3D55D6' }}>
          {getInitials(currentUser.name)}
          <span className="navy-user-online" />
        </div>
        <div className="navy-user-info">
          <span className="navy-user-name">{toTitleCaseName(currentUser.name)}</span>
          <span className="navy-user-role">{currentUser.role}</span>
        </div>
        <button
          type="button"
          className="navy-logout-icon-btn"
          onClick={onLogout}
          title="Sair"
          aria-label="Sair"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>logout</span>
        </button>
      </div>
    </aside>
  )
}
