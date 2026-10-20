import { useState, useEffect, useRef, useCallback } from 'react'
import './index.css'
import { useAuth } from './hooks/useAuth'
import { useAppData } from './hooks/useAppData'
import { getTodayStr, COLORS } from './lib/utils'
import {
  canAccessModule,
  canViewAllTasks,
  isProgrammer,
  isUserActive,
} from './lib/accessControlApi'
import type { Page, ViewMode, FilterMode, Task } from './types'
import { Sidebar } from './components/Sidebar'
import { TasksPage } from './pages/TasksPage'
import { HistoryPage } from './pages/HistoryPage'
import { AtrasadasPage } from './pages/AtrasadasPage'
import { TeamPage, MeetingsPage, MessagesPage, BackupPage } from "./pages/OtherPages"
import { PopsPage } from './pages/PopsPage'
import { SettingsPage } from './pages/SettingsPage'
import { TaskModal } from './components/TaskModal'
import { Toast } from './components/Toast'
import { LoginView } from './components/LoginView'
import { PendingAccessView } from './components/PendingAccessView'

const VALID_PAGES: Page[] = ['tasks', 'team', 'history', 'atrasadas', 'meetings', 'messages', 'backup', 'pops', 'settings']

export default function App() {
  const {
    currentUser,
    operatorTestSession,
    authLoading,
    login,
    signup,
    logout,
    updateUser,
    resetPassword,
    refreshCurrentUser,
    startOperatorSession,
    endOperatorSession,
  } = useAuth()
  const data = useAppData(currentUser)
  const [appReady, setAppReady] = useState(false)
  const loadedUserIdRef = useRef<string | null>(null)
  const [page, setPageState] = useState<Page>('tasks')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [searchQ, setSearchQ] = useState('')
  const [dateFilter, setDateFilter] = useState(getTodayStr())
  const [viewingAll, setViewingAll] = useState(() => {
    try { return localStorage.getItem('pulse_viewingAll') === 'true' } catch { return false }
  })
  const [memberFilter, setMemberFilter] = useState(() => {
    try { return localStorage.getItem('pulse_memberFilter') || 'all' } catch { return 'all' }
  })
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [editTaskId, setEditTaskId] = useState<string | null>(null)
  const [taskModalDate, setTaskModalDate] = useState<string | undefined>()
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Tema claro / escuro (Navy Executive usa 'light' como padrão)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('pulse-theme')
    return (saved === 'dark' || saved === 'light') ? saved : 'light'
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark'
    localStorage.setItem('pulse-theme', theme)
  }, [theme])
  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  // Auth forms
  const [authTab, setAuthTab] = useState<'login' | 'signup' | 'recover'>('login')
  const [lEmail, setLEmail] = useState('')
  const [lPass, setLPass] = useState('')
  const [sName, setSName] = useState('')
  const [sRole, setSRole] = useState('')
  const [sEmail, setSEmail] = useState('')
  const [sPass, setSPass] = useState('')
  const [sColor, setSColor] = useState(COLORS[0])
  const [rEmail, setREmail] = useState('')
  const [rName, setRName] = useState('')
  const [rPass, setRPass] = useState('')
  const [authErr, setAuthErr] = useState('')
  const [authLoading2, setAuthLoading2] = useState(false)

  const showToast = useCallback((msg: string, type = 'info') => {
    setToast({ msg, type })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2800)
  }, [])

  // Guarda central de navegação: impede acesso a rotas não autorizadas (ex: settings ou team)
  const setPage = useCallback((targetPage: Page) => {
    if (!currentUser || !isUserActive(currentUser)) return
    if (!canAccessModule(currentUser, targetPage)) {
      showToast('🔒 Acesso negado: você não possui autorização para acessar este módulo.', 'warn')
      setPageState('tasks')
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname)
      }
      return
    }
    setPageState(targetPage)
  }, [currentUser, showToast])

  // Intercepta tentativas de acesso direto via URL (hash #settings, #team, ?page=settings, etc.)
  useEffect(() => {
    if (!currentUser || !isUserActive(currentUser)) return

    const checkUrlRouteGuard = () => {
      const hashRoute = window.location.hash.replace(/^#\/?/, '').trim().toLowerCase()
      const searchParams = new URLSearchParams(window.location.search)
      const queryRoute = (searchParams.get('page') || '').trim().toLowerCase()
      const candidate = (hashRoute || queryRoute) as Page

      if (candidate && VALID_PAGES.includes(candidate)) {
        if (!canAccessModule(currentUser, candidate)) {
          showToast('🔒 Acesso direto bloqueado: rota não autorizada para seu perfil.', 'warn')
          setPageState('tasks')
          window.history.replaceState(null, '', window.location.pathname)
        } else {
          setPageState(candidate)
        }
      }
    }

    checkUrlRouteGuard()
    window.addEventListener('hashchange', checkUrlRouteGuard)
    window.addEventListener('popstate', checkUrlRouteGuard)
    return () => {
      window.removeEventListener('hashchange', checkUrlRouteGuard)
      window.removeEventListener('popstate', checkUrlRouteGuard)
    }
  }, [currentUser, showToast])

  // Redireciona automaticamente caso a página atual deixe de ser permitida para o usuário logado
  useEffect(() => {
    if (currentUser && isUserActive(currentUser) && !canAccessModule(currentUser, page)) {
      setPageState('tasks')
    }
  }, [currentUser, page])

  // Launch app after login ONLY if user is active (approved) and reload whenever active user identity changes
  useEffect(() => {
    if (currentUser && isUserActive(currentUser)) {
      if (!appReady || loadedUserIdRef.current !== currentUser.id) {
        loadedUserIdRef.current = currentUser.id
        if (!canViewAllTasks(currentUser)) {
          setViewingAll(false)
          setMemberFilter(currentUser.name)
        }
        data.loadAll(currentUser).then(() => {
          setAppReady(true)
          data.checkDailyBackup()
        })
      }
    } else {
      loadedUserIdRef.current = null
      setAppReady(false)
    }
  }, [currentUser, appReady])

  const handleStartOperatorSession = useCallback(async (targetEmailOrId: string) => {
    const operatorUser = await startOperatorSession(targetEmailOrId)
    loadedUserIdRef.current = operatorUser.id
    if (!canViewAllTasks(operatorUser)) {
      setViewingAll(false)
      setMemberFilter(operatorUser.name)
    }
    setPageState('tasks')
    await data.loadAll(operatorUser)
    showToast(`🧑‍💻 Sessão iniciada com a identidade real de ${operatorUser.name} (${operatorUser.email})`, 'success')
  }, [startOperatorSession, data, showToast])

  const handleEndOperatorSession = useCallback(async () => {
    try {
      const restoredAdmin = await endOperatorSession()
      loadedUserIdRef.current = restoredAdmin.id
      await data.loadAll(restoredAdmin)
      setPageState('settings')
      showToast(`🛡️ Sessão de teste encerrada. Retornado para Desenvolvedor (${restoredAdmin.name}).`, 'info')
    } catch (err: any) {
      showToast(err?.message || '❌ Erro ao encerrar sessão de teste', 'error')
    }
  }, [endOperatorSession, data, showToast])

  const handleLogin = async () => {
    setAuthErr(''); setAuthLoading2(true)
    const err = await login(lEmail, lPass)
    setAuthLoading2(false)
    if (err) setAuthErr(err)
  }

  const handleSignup = async () => {
    setAuthErr(''); setAuthLoading2(true)
    const err = await signup(sName, sRole, sEmail, sPass, sColor)
    setAuthLoading2(false)
    if (err) setAuthErr(err)
  }

  const handleRecover = async () => {
    setAuthErr(''); setAuthLoading2(true)
    const err = await resetPassword(rEmail, rName, rPass)
    setAuthLoading2(false)
    if (err) {
      setAuthErr(err)
    } else {
      showToast('✅ Senha redefinida com sucesso! Faça login.', 'success')
      setAuthTab('login')
      setRPass('')
    }
  }

  const openNewTask = (date?: string) => {
    setEditTaskId(null)
    setTaskModalDate(date)
    setTaskModalOpen(true)
  }

  const openEditTask = (id: string) => {
    setEditTaskId(id)
    setTaskModalDate(undefined)
    setTaskModalOpen(true)
  }

  const handleSaveTask = async (taskData: Partial<Task>) => {
    const ok = await data.saveTask(taskData, editTaskId || undefined)
    if (ok) {
      showToast(editTaskId ? '✏ Atualizada!' : '✅ Criada!', 'success')
      setTaskModalOpen(false)
    } else {
      showToast('❌ Erro ao salvar', 'error')
    }
  }

  const handleComplete = async (id: string, fromAtrasadas = false): Promise<boolean> => {
    const ok = await data.completeTask(id, fromAtrasadas)
    if (ok) showToast('✅ Concluída!', 'success')
    else showToast('❌ Erro ao concluir', 'error')
    return ok
  }

  const handleDelete = async (id: string, deleteAll = false) => {
    await data.deleteTask(id, deleteAll)
    showToast('🗑 Removida', 'warn')
  }

  const handleReopen = async (histId: string): Promise<boolean> => {
    const ok = await data.reopenTask(histId)
    if (ok) showToast('↩ Tarefa reaberta!', 'info')
    else showToast('❌ Erro ao reabrir', 'error')
    return ok
  }

  // LOADING SCREEN
  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="logo-icon loading-logo">P</div>
        <div className="loading-text">Carregando...</div>
      </div>
    )
  }

  // LOGIN SCREEN
  if (!currentUser) {
    return (
      <LoginView
        authTab={authTab}
        setAuthTab={setAuthTab}
        lEmail={lEmail}
        setLEmail={setLEmail}
        lPass={lPass}
        setLPass={setLPass}
        sName={sName}
        setSName={setSName}
        sRole={sRole}
        setSRole={setSRole}
        sEmail={sEmail}
        setSEmail={setSEmail}
        sPass={sPass}
        setSPass={setSPass}
        sColor={sColor}
        setSColor={setSColor}
        rEmail={rEmail}
        setREmail={setREmail}
        rName={rName}
        setRName={setRName}
        rPass={rPass}
        setRPass={setRPass}
        authErr={authErr}
        setAuthErr={setAuthErr}
        authLoading2={authLoading2}
        handleLogin={handleLogin}
        handleSignup={handleSignup}
        handleRecover={handleRecover}
      />
    )
  }

  // BLOQUEIO DE USUÁRIOS PENDENTES DE APROVAÇÃO, SUSPENSOS OU RECUSADOS
  if (!isUserActive(currentUser)) {
    return (
      <>
        <PendingAccessView
          user={currentUser}
          onRefresh={refreshCurrentUser}
          onLogout={logout}
        />
        {toast && <Toast msg={toast.msg} type={toast.type} />}
      </>
    )
  }

  // APP LOADING
  if (!appReady) {
    return (
      <div className="loading-screen">
        <div className="logo-icon loading-logo">P</div>
        <div className="loading-text">Carregando Pulse Agenda...</div>
      </div>
    )
  }

  const isAdmin = canViewAllTasks(currentUser)

  const pageProps = {
    tasks: data.expandedTasks, // expandedTasks inclui virtuais para exibição
    hist: data.hist,
    meets: data.meets,
    team: data.team,
    atrasadas: data.allAtrasadas,
    backups: data.backups,
    pops: data.pops,
    onRefreshPops: data.loadPops,
    currentUser,
    isAdmin,
    viewMode,
    filterMode,
    searchQ,
    dateFilter,
    viewingAll: isAdmin ? viewingAll : false,
    memberFilter: isAdmin ? memberFilter : currentUser.name,
    setViewMode,
    setFilterMode,
    setSearchQ,
    setDateFilter,
    setViewingAll,
    setMemberFilter,
    openNewTask,
    openEditTask,
    onComplete: handleComplete as (id: string, fromAtrasadas?: boolean) => Promise<boolean>,
    onBulkCompleteAtrasadas: data.completeTasksBulk,
    onDelete: handleDelete,
    onReopen: handleReopen as (histId: string) => Promise<boolean>,
    onCycleStatus: data.cycleStatus,
    onReorder: data.reorderTasks,
    onToggleSub: data.toggleSubtask,
    onAddSub: data.addSubtask,
    onDeleteSub: data.deleteSubtask,
    onDeleteAtrasada: data.deleteAtrasada,
    onBulkDeleteAtrasadas: data.deleteAtrasadasBulk,
    onSaveMeet: data.saveMeet,
    onDeleteMeet: data.deleteMeet,
    onUpdateTeam: data.updateTeamMember,
    onSaveBackup: data.saveBackupManual,
    onDeleteBackup: data.deleteBackup,
    onRestoreBackup: data.restoreFromBackup,
    onUpdateUser: updateUser,
    showToast,
    setPage,
    theme,
    toggleTheme,
  }

  return (
    <div id="app">
      <Sidebar
        page={page}
        setPage={setPage}
        currentUser={currentUser}
        isAdmin={isAdmin}
        tasks={data.expandedTasks}
        atrasadas={data.allAtrasadas}
        hist={data.hist}
        team={data.team}
        viewingAll={isAdmin ? viewingAll : false}
        memberFilter={isAdmin ? memberFilter : currentUser.name}
        setViewingAll={setViewingAll}
        setMemberFilter={setMemberFilter}
        onLogout={logout}
        onUpdateUser={updateUser}
        showToast={showToast}
        operatorTestSession={operatorTestSession}
        onEndOperatorSession={handleEndOperatorSession}
      />
      <div className="main">
        {operatorTestSession && (
          <div
            data-testid="operator-test-session-banner"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
              padding: '10px 20px',
              background: 'linear-gradient(90deg, #1b2856 0%, #263875 100%)',
              borderBottom: '1px solid rgba(116, 192, 252, 0.35)',
              color: '#f8fafc',
              fontSize: 12,
              zIndex: 40,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span
                style={{
                  padding: '3px 9px',
                  borderRadius: 999,
                  background: 'rgba(61, 214, 140, 0.2)',
                  border: '1px solid rgba(61, 214, 140, 0.5)',
                  color: '#69db7c',
                  fontWeight: 800,
                  fontSize: 11,
                }}
              >
                🧑‍💻 SESSÃO REAL DE OPERADOR ATIVA
              </span>
              <span>
                Sessão ativa como: <strong>{currentUser.name}</strong> ({currentUser.email}) · Perfil:{' '}
                <strong>{(currentUser.access_profile || 'operador').toUpperCase()}</strong>
              </span>
              <span style={{ color: '#94a3b8' }}>|</span>
              <span style={{ color: '#cbd5e1' }}>
                Iniciada por: <strong>{operatorTestSession.adminName}</strong> ({operatorTestSession.adminEmail})
              </span>
            </div>

            <button
              type="button"
              data-testid="end-operator-session-btn"
              onClick={handleEndOperatorSession}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                border: '1px solid rgba(255, 255, 255, 0.3)',
                background: '#4f6ef7',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              ↩ Encerrar sessão de teste e voltar para Desenvolvedor
            </button>
          </div>
        )}
        {page === 'tasks' && canAccessModule(currentUser, 'tasks') && <TasksPage {...pageProps} />}
        {page === 'history' && canAccessModule(currentUser, 'history') && <HistoryPage {...pageProps} />}
        {page === 'atrasadas' && canAccessModule(currentUser, 'atrasadas') && <AtrasadasPage {...pageProps} />}
        {page === 'team' && canAccessModule(currentUser, 'team') && <TeamPage {...pageProps} />}
        {page === 'meetings' && canAccessModule(currentUser, 'meetings') && <MeetingsPage {...pageProps} />}
        {page === 'messages' && canAccessModule(currentUser, 'messages') && <MessagesPage {...pageProps} />}
        {page === 'backup' && canAccessModule(currentUser, 'backup') && <BackupPage {...pageProps} />}
        {page === 'pops' && canAccessModule(currentUser, 'pops') && (
          <PopsPage {...pageProps} pops={data.pops} onRefreshPops={data.loadPops} />
        )}
        {page === 'settings' && isProgrammer(currentUser) && canAccessModule(currentUser, 'settings') && (
          <SettingsPage
            currentUser={currentUser}
            showToast={showToast}
            onRefreshCurrentUser={refreshCurrentUser}
            onStartOperatorSession={handleStartOperatorSession}
          />
        )}
      </div>

      {taskModalOpen && (
        <TaskModal
          editTask={editTaskId ? data.expandedTasks.find(t => t.id === editTaskId) : undefined}
          team={data.team}
          currentUser={currentUser}
          pops={data.pops}
          defaultDate={taskModalDate}
          onSave={handleSaveTask}
          onClose={() => setTaskModalOpen(false)}
          showToast={showToast}
        />
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}

