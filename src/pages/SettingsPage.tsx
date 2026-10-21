import { useState, useEffect, useCallback } from 'react'
import type {
  AccessAuditLog,
  AccessProfile,
  AccessStatus,
  User,
  UserPermissions,
} from '../types'
import { getInitials } from '../lib/utils'
import { DcxFlowBrand } from '../components/DcxFlowLogo'
import {
  MODULE_METADATA,
  approveUserRequest,
  fetchAccessAuditLogs,
  fetchAllManagedUsers,
  getDefaultPermissionsForProfile,
  isPrimaryProgrammerIdentity,
  isProgrammer,
  normalizePermissionsForProfile,
  reactivateUserAccess,
  rejectUserRequest,
  suspendUserAccess,
  updateUserAccessConfig,
} from '../lib/accessControlApi'

interface SettingsPageProps {
  currentUser: User
  showToast: (msg: string, type?: string) => void
  onRefreshCurrentUser?: () => Promise<void>
  onStartOperatorSession?: (targetEmailOrId: string) => Promise<void>
}

const PROFILE_LABELS: Record<AccessProfile, { label: string; color: string; bg: string; desc: string }> = {
  programador: {
    label: 'Programador (Admin Principal)',
    color: '#4f6ef7',
    bg: 'rgba(79, 110, 247, 0.15)',
    desc: 'Acesso administrativo total, aprovação de contas e gestão de permissões.',
  },
  gestora: {
    label: 'Gestora',
    color: '#cc5de8',
    bg: 'rgba(204, 93, 232, 0.15)',
    desc: 'Acesso operacional amplo à equipe e tarefas conforme permissões, sem acesso a Configurações.',
  },
  operador: {
    label: 'Operador',
    color: '#3dd68c',
    bg: 'rgba(61, 214, 140, 0.14)',
    desc: 'Acessa somente suas próprias tarefas atribuídas e módulos liberados; sem acesso a Equipe ou Configurações.',
  },
}

const STATUS_BADGES: Record<AccessStatus, { label: string; color: string; bg: string }> = {
  active: { label: 'Ativo', color: '#3dd68c', bg: 'rgba(61, 214, 140, 0.14)' },
  pending: { label: 'Pendente', color: '#ffa94d', bg: 'rgba(255, 169, 77, 0.15)' },
  suspended: { label: 'Suspenso', color: '#ff4d6d', bg: 'rgba(255, 77, 109, 0.15)' },
  rejected: { label: 'Recusado', color: '#8b93a7', bg: 'rgba(139, 147, 167, 0.15)' },
}

const ACTION_LABELS: Record<AccessAuditLog['action'], { label: string; color: string }> = {
  APPROVE_USER: { label: 'Aprovação de Cadastro', color: '#3dd68c' },
  REJECT_USER: { label: 'Recusa de Cadastro', color: '#ff4d6d' },
  SUSPEND_USER: { label: 'Suspensão de Acesso', color: '#ffa94d' },
  REACTIVATE_USER: { label: 'Reativação de Acesso', color: '#4f6ef7' },
  UPDATE_PERMISSIONS: { label: 'Alteração de Permissões', color: '#cc5de8' },
  UPDATE_PROFILE: { label: 'Alteração de Perfil/Permissões', color: '#74c0fc' },
  START_OPERATOR_SESSION: { label: 'Início de Sessão como Operador', color: '#4f6ef7' },
  END_OPERATOR_SESSION: { label: 'Término de Sessão como Operador', color: '#3dd68c' },
  REJECT_FORGED_SESSION: { label: 'Bloqueio de Segurança (Sessão)', color: '#ff4d6d' },
}

export function SettingsPage({ currentUser, showToast, onRefreshCurrentUser, onStartOperatorSession }: SettingsPageProps) {
  const [users, setUsers] = useState<User[]>([])
  const [auditLogs, setAuditLogs] = useState<AccessAuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | AccessStatus>('all')
  const [pendingProfiles, setPendingProfiles] = useState<Record<string, AccessProfile>>({})
  const [selectedTestOperatorId, setSelectedTestOperatorId] = useState<string>('')
  const [startingSessionId, setStartingSessionId] = useState<string | null>(null)

  // Modal de edição de permissões e perfil por usuário
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [editProfile, setEditProfile] = useState<AccessProfile>('operador')
  const [editPermissions, setEditPermissions] = useState<UserPermissions>(
    getDefaultPermissionsForProfile('operador')
  )
  const [savingConfig, setSavingConfig] = useState(false)

  const authorizedProgrammer = isProgrammer(currentUser)

  const loadData = useCallback(async () => {
    if (!authorizedProgrammer) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [managedUsers, logs] = await Promise.all([
        fetchAllManagedUsers(currentUser),
        fetchAccessAuditLogs(currentUser),
      ])
      setUsers(managedUsers)
      setAuditLogs(logs)
      const firstTestable = managedUsers.find(
        u => !isPrimaryProgrammerIdentity(u) && u.access_status === 'active'
      )
      if (firstTestable) {
        setSelectedTestOperatorId(prev => prev || firstTestable.id)
      }
    } catch (err: any) {
      showToast(err?.message || 'Erro ao carregar configurações de acesso', 'error')
    } finally {
      setLoading(false)
    }
  }, [authorizedProgrammer, currentUser, showToast])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Guarda de segurança de defesa em profundidade no componente
  if (!authorizedProgrammer) {
    return (
      <>
        <div className="topbar">
          <div>
            <div className="pt">Acesso Restrito</div>
            <div className="ps">Operação exclusiva do Programador principal</div>
          </div>
        </div>
        <div className="content">
          <div className="es" style={{ padding: '60px 20px' }}>
            <div className="ei">🔒</div>
            <div className="et">Acesso bloqueado</div>
            <div style={{ color: 'var(--text3)', fontSize: 13, maxWidth: 420, margin: '8px auto 0' }}>
              Somente o Programador principal possui autorização para visualizar ou acessar o módulo de Configurações e Controle de Acesso.
            </div>
          </div>
        </div>
      </>
    )
  }

  const pendingUsers = users.filter(u => u.access_status === 'pending')
  const filteredUsers = users.filter(u =>
    statusFilter === 'all' ? true : (u.access_status || 'pending') === statusFilter
  )

  const handleApprove = async (u: User) => {
    try {
      const chosenProfile = pendingProfiles[u.id] || 'operador'
      await approveUserRequest(currentUser, u, chosenProfile)
      showToast(`✅ Cadastro de ${u.name} aprovado como ${PROFILE_LABELS[chosenProfile].label}!`, 'success')
      await loadData()
      await onRefreshCurrentUser?.()
    } catch (err: any) {
      showToast(err?.message || '❌ Erro ao aprovar solicitação', 'error')
    }
  }

  const handleReject = async (u: User) => {
    if (!window.confirm(`Deseja recusar a solicitação de cadastro de ${u.name} (${u.email})?`)) return
    try {
      await rejectUserRequest(currentUser, u, 'Recusado pelo Programador em Configurações')
      showToast(`🚫 Solicitação de ${u.name} recusada.`, 'warn')
      await loadData()
    } catch (err: any) {
      showToast(err?.message || '❌ Erro ao recusar solicitação', 'error')
    }
  }

  const handleSuspend = async (u: User) => {
    if (isPrimaryProgrammerIdentity(u)) {
      showToast('⚠ A conta do Programador principal é protegida e não pode ser suspensa.', 'warn')
      return
    }
    if (!window.confirm(`Suspender temporariamente o acesso de ${u.name}? O histórico será integralmente preservado.`)) return
    try {
      await suspendUserAccess(currentUser, u)
      showToast(`🔒 Acesso de ${u.name} suspenso.`, 'warn')
      await loadData()
    } catch (err: any) {
      showToast(err?.message || '❌ Erro ao suspender usuário', 'error')
    }
  }

  const handleReactivate = async (u: User) => {
    try {
      await reactivateUserAccess(currentUser, u)
      showToast(`✅ Acesso de ${u.name} reativado com sucesso!`, 'success')
      await loadData()
    } catch (err: any) {
      showToast(err?.message || '❌ Erro ao reativar usuário', 'error')
    }
  }

  const openPermissionsModal = (u: User) => {
    const profile = u.access_profile || 'operador'
    const perms = normalizePermissionsForProfile(profile, u.permissions)
    setSelectedUser(u)
    setEditProfile(profile)
    setEditPermissions(perms)
  }

  const handleProfileSelectInModal = (nextProf: AccessProfile) => {
    setEditProfile(nextProf)
    setEditPermissions(getDefaultPermissionsForProfile(nextProf))
  }

  const toggleModulePermission = (key: keyof UserPermissions) => {
    if (!selectedUser) return
    if (isPrimaryProgrammerIdentity(selectedUser)) return
    if (key === 'settings') return // Configurações é sempre exclusivo do Programador
    if (editProfile === 'operador' && key === 'team') {
      showToast('⚠ Perfil Operador não tem permissão para acessar o card Equipe.', 'warn')
      return
    }
    setEditPermissions(prev => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const saveUserPermissions = async () => {
    if (!selectedUser) return
    setSavingConfig(true)
    try {
      await updateUserAccessConfig(currentUser, selectedUser, editProfile, editPermissions)
      showToast(`✅ Permissões e perfil de ${selectedUser.name} atualizados!`, 'success')
      setSelectedUser(null)
      await loadData()
      await onRefreshCurrentUser?.()
    } catch (err: any) {
      showToast(err?.message || '❌ Erro ao salvar permissões', 'error')
    } finally {
      setSavingConfig(false)
    }
  }

  const testableOperators = users.filter(
    u => !isPrimaryProgrammerIdentity(u) && u.access_status === 'active'
  )

  const handleLaunchOperatorSession = async (targetUserOrId: User | string) => {
    if (!onStartOperatorSession) return
    const targetId = typeof targetUserOrId === 'string' ? targetUserOrId : targetUserOrId.id
    if (!targetId) {
      showToast('Selecione um operador ativo para iniciar a sessão.', 'warn')
      return
    }
    setStartingSessionId(targetId)
    try {
      await onStartOperatorSession(targetId)
    } catch (err: any) {
      showToast(err?.message || '❌ Erro ao iniciar sessão como operador', 'error')
    } finally {
      setStartingSessionId(null)
    }
  }

  const formatDateTime = (iso?: string) => {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return iso
    }
  }

  return (
    <>
      <div className="topbar">
        <div className="topbar-brand">
          <DcxFlowBrand variant="compact" />
        </div>
        <div>
          <div className="pt">Configurações & Controle de Acesso</div>
          <div className="ps">Exclusivo do Programador Principal · Gestão de aprovações, perfis, permissões e auditoria</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              padding: '5px 12px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              background: 'rgba(79, 110, 247, 0.16)',
              color: 'var(--accent)',
              border: '1px solid rgba(79, 110, 247, 0.35)',
            }}
          >
            🛡️ Administrador Principal: {currentUser.name}
          </span>
          <button className="mc-btn" style={{ width: 'auto', padding: '7px 14px' }} onClick={loadData}>
            🔄 Atualizar
          </button>
        </div>
      </div>

      <div className="content">
        {/* RESUMO RÁPIDO */}
        <div className="hist-stats" style={{ marginBottom: 22 }}>
          <div className="hist-stat-card">
            <div className="hist-stat-num" style={{ color: 'var(--orange)' }}>{pendingUsers.length}</div>
            <div className="hist-stat-label">Solicitações Pendentes</div>
            <div className="hist-stat-sub">Aguardando aprovação</div>
          </div>
          <div className="hist-stat-card">
            <div className="hist-stat-num" style={{ color: 'var(--green)' }}>
              {users.filter(u => u.access_status === 'active').length}
            </div>
            <div className="hist-stat-label">Usuários Ativos</div>
            <div className="hist-stat-sub">Com acesso liberado</div>
          </div>
          <div className="hist-stat-card">
            <div className="hist-stat-num" style={{ color: 'var(--red)' }}>
              {users.filter(u => u.access_status === 'suspended' || u.access_status === 'rejected').length}
            </div>
            <div className="hist-stat-label">Suspensos / Recusados</div>
            <div className="hist-stat-sub">Bloqueados no sistema</div>
          </div>
          <div className="hist-stat-card">
            <div className="hist-stat-num" style={{ color: 'var(--accent)' }}>{auditLogs.length}</div>
            <div className="hist-stat-label">Registros de Auditoria</div>
            <div className="hist-stat-sub">Histórico administrativo</div>
          </div>
        </div>

        {/* SESSÃO ADMINISTRATIVA DE TESTE COMO OPERADOR (IDENTIDADE REAL) */}
        <div
          data-testid="operator-test-session-panel"
          style={{
            background: 'var(--bg2)',
            border: '1.5px solid rgba(79, 110, 247, 0.4)',
            borderRadius: 12,
            padding: 20,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 14,
              marginBottom: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, maxWidth: 680 }}>
              <span style={{ fontSize: 20, lineHeight: 1.2 }}>🧑‍💻</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
                  Sessão Administrativa de Teste como Operador (Identidade Real)
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3, lineHeight: 1.45 }}>
                  Inicia uma sessão real autenticada sob o <strong>ID, e-mail, permissões e escopo de banco de dados</strong> do operador selecionado, sem expor senhas e com auditoria completa de início e término.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <select
                data-testid="operator-session-select"
                className="inp"
                style={{ height: 36, padding: '4px 12px', fontSize: 12, minWidth: 260 }}
                value={selectedTestOperatorId}
                onChange={e => setSelectedTestOperatorId(e.target.value)}
              >
                {testableOperators.map(op => (
                  <option key={op.id} value={op.id}>
                    {op.name} ({op.email}) · {(op.access_profile || 'operador').toUpperCase()}
                  </option>
                ))}
              </select>

              <button
                type="button"
                data-testid="start-operator-session-btn"
                className="btn-primary"
                style={{ height: 36, padding: '0 16px', fontSize: 12, fontWeight: 700 }}
                disabled={!selectedTestOperatorId || startingSessionId !== null}
                onClick={() => handleLaunchOperatorSession(selectedTestOperatorId)}
              >
                {startingSessionId ? 'Iniciando sessão...' : '▶ Entrar com a Identidade deste Operador'}
              </button>
            </div>
          </div>

          {testableOperators.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, alignSelf: 'center', marginRight: 4 }}>
                Acesso rápido por operador:
              </span>
              {testableOperators.map(op => (
                <button
                  key={op.id}
                  type="button"
                  data-testid={`quick-operator-session-${op.id}`}
                  className="mc-btn"
                  style={{
                    width: 'auto',
                    padding: '5px 11px',
                    fontSize: 11,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                  disabled={startingSessionId !== null}
                  onClick={() => handleLaunchOperatorSession(op)}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: op.color || '#3dd68c',
                      display: 'inline-block',
                    }}
                  />
                  <strong>{op.name}</strong>
                  <span style={{ color: 'var(--text3)' }}>({op.access_profile || 'operador'})</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 1. SOLICITAÇÕES PENDENTES */}
        <div
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 20,
            marginBottom: 24,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>⏳</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>1. Solicitações Pendentes de Aprovação</div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                  Novos cadastros permanecem bloqueados e sem acesso aos dados internos até sua liberação.
                </div>
              </div>
            </div>
            <span
              style={{
                padding: '3px 10px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                background: pendingUsers.length > 0 ? 'rgba(255, 169, 77, 0.18)' : 'var(--bg3)',
                color: pendingUsers.length > 0 ? '#ffa94d' : 'var(--text3)',
              }}
            >
              {pendingUsers.length} pendente{pendingUsers.length !== 1 ? 's' : ''}
            </span>
          </div>

          {pendingUsers.length === 0 ? (
            <div
              style={{
                padding: '20px',
                background: 'var(--bg3)',
                borderRadius: 10,
                textAlign: 'center',
                color: 'var(--text3)',
                fontSize: 13,
              }}
            >
              Nenhuma solicitação de cadastro pendente no momento.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pendingUsers.map(u => {
                const selectedProf = pendingProfiles[u.id] || 'operador'
                return (
                  <div
                    key={u.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 12,
                      padding: '14px 16px',
                      background: 'var(--bg3)',
                      border: '1px solid rgba(255, 169, 77, 0.35)',
                      borderRadius: 10,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 240 }}>
                      <div className="av" style={{ background: u.color || '#4f6ef7' }}>
                        {getInitials(u.name)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{u.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text2)' }}>{u.email}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                          Cargo informado: <strong>{u.role || 'Operador'}</strong> · Pedido em: {formatDateTime(u.created_at)}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase' }}>
                          Perfil ao Aprovar
                        </span>
                        <select
                          className="inp"
                          style={{ height: 34, padding: '4px 10px', fontSize: 12, minWidth: 150 }}
                          value={selectedProf}
                          onChange={e =>
                            setPendingProfiles(prev => ({
                              ...prev,
                              [u.id]: e.target.value as AccessProfile,
                            }))
                          }
                        >
                          <option value="operador">Operador</option>
                          <option value="gestora">Gestora</option>
                        </select>
                      </div>

                      <button
                        type="button"
                        className="btn-primary"
                        style={{ height: 34, padding: '0 14px', fontSize: 12, background: 'var(--green)' }}
                        onClick={() => handleApprove(u)}
                      >
                        ✓ Aprovar
                      </button>

                      <button
                        type="button"
                        className="bcancel"
                        style={{
                          height: 34,
                          padding: '0 14px',
                          fontSize: 12,
                          borderColor: 'var(--red)',
                          color: 'var(--red)',
                        }}
                        onClick={() => handleReject(u)}
                      >
                        ✕ Recusar
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 2, 3 e 4. USUÁRIOS AUTORIZADOS, CONTROLE DE SITUAÇÃO E PERMISSÕES POR USUÁRIO */}
        <div
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 20,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                2. Usuários Cadastrados, Perfis, Situação e Permissões por Módulo
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                Gerencie o perfil (Programador, Gestora, Operador), módulos liberados e situação (Ativo, Pendente, Suspenso).
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(['all', 'active', 'pending', 'suspended', 'rejected'] as const).map(st => (
                <button
                  key={st}
                  type="button"
                  className={`mf${statusFilter === st ? ' active' : ''}`}
                  onClick={() => setStatusFilter(st)}
                >
                  {st === 'all'
                    ? `Todos (${users.length})`
                    : `${STATUS_BADGES[st].label} (${users.filter(u => (u.access_status || 'pending') === st).length})`}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)' }}>Carregando usuários...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredUsers.map(u => {
                const prof = u.access_profile || 'operador'
                const st = u.access_status || 'pending'
                const profMeta = PROFILE_LABELS[prof]
                const stMeta = STATUS_BADGES[st]
                const isPrimaryProg = isPrimaryProgrammerIdentity(u)
                const perms = u.permissions || getDefaultPermissionsForProfile(prof)
                const activeModuleNames = MODULE_METADATA.filter(
                  m => perms[m.key as keyof UserPermissions]
                ).map(m => m.label)

                return (
                  <div
                    key={u.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 14,
                      padding: '14px 16px',
                      background: 'var(--bg3)',
                      border: `1px solid ${isPrimaryProg ? 'rgba(79, 110, 247, 0.45)' : 'var(--border)'}`,
                      borderRadius: 10,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 250, flex: 1 }}>
                      <div className="av" style={{ background: u.color || '#4f6ef7' }}>
                        {getInitials(u.name)}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{u.name}</span>
                          {isPrimaryProg && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 800,
                                padding: '2px 8px',
                                borderRadius: 999,
                                background: 'rgba(79, 110, 247, 0.2)',
                                color: '#74c0fc',
                                border: '1px solid rgba(79, 110, 247, 0.4)',
                              }}
                            >
                              🛡️ Programador Principal · Protegido
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: '2px 9px',
                              borderRadius: 999,
                              background: profMeta.bg,
                              color: profMeta.color,
                            }}
                          >
                            {profMeta.label}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: '2px 9px',
                              borderRadius: 999,
                              background: stMeta.bg,
                              color: stMeta.color,
                            }}
                          >
                            ● {stMeta.label}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>
                          {u.email} · Cargo operacional: {u.role || '—'}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5 }}>
                          <strong>Módulos permitidos:</strong>{' '}
                          {st === 'active' ? (activeModuleNames.join(', ') || 'Nenhum') : 'Bloqueado (conta não ativa)'}
                          {st === 'active' && (
                            <span style={{ marginLeft: 8, color: perms.view_all_tasks ? 'var(--accent)' : 'var(--text3)' }}>
                              · {perms.view_all_tasks ? '👁️ Vê tarefas da equipe' : '🔒 Apenas próprias tarefas'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {!isPrimaryProg && st === 'active' && onStartOperatorSession && (
                        <button
                          type="button"
                          data-testid={`enter-as-operator-${u.id}`}
                          className="mc-btn"
                          style={{
                            width: 'auto',
                            padding: '7px 12px',
                            fontSize: 12,
                            color: '#74c0fc',
                            borderColor: 'rgba(79, 110, 247, 0.45)',
                            background: 'rgba(79, 110, 247, 0.12)',
                          }}
                          disabled={startingSessionId !== null}
                          onClick={() => handleLaunchOperatorSession(u)}
                        >
                          👤 Entrar como Operador
                        </button>
                      )}

                      <button
                        type="button"
                        className="mc-btn"
                        style={{ width: 'auto', padding: '7px 12px', fontSize: 12 }}
                        onClick={() => openPermissionsModal(u)}
                      >
                        ⚙️ Permissões / Perfil
                      </button>

                      {!isPrimaryProg && st === 'active' && (
                        <button
                          type="button"
                          className="mc-btn"
                          style={{
                            width: 'auto',
                            padding: '7px 12px',
                            fontSize: 12,
                            color: 'var(--red)',
                            borderColor: 'rgba(255, 77, 109, 0.35)',
                          }}
                          onClick={() => handleSuspend(u)}
                        >
                          ⏸ Suspender
                        </button>
                      )}

                      {!isPrimaryProg && (st === 'suspended' || st === 'rejected') && (
                        <button
                          type="button"
                          className="mc-btn"
                          style={{
                            width: 'auto',
                            padding: '7px 12px',
                            fontSize: 12,
                            color: 'var(--green)',
                            borderColor: 'rgba(61, 214, 140, 0.35)',
                          }}
                          onClick={() => handleReactivate(u)}
                        >
                          ▶ Reativar
                        </button>
                      )}

                      {!isPrimaryProg && st === 'pending' && (
                        <button
                          type="button"
                          className="mc-btn"
                          style={{
                            width: 'auto',
                            padding: '7px 12px',
                            fontSize: 12,
                            color: 'var(--green)',
                            borderColor: 'rgba(61, 214, 140, 0.35)',
                          }}
                          onClick={() => handleApprove(u)}
                        >
                          ✓ Aprovar
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 5. HISTÓRICO ADMINISTRATIVO (AUDITORIA) */}
        <div
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 18 }}>📋</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>5. Histórico Administrativo de Auditoria</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                Registro de quem aprovou, recusou, suspendeu, reativou ou alterou permissões e quando.
              </div>
            </div>
          </div>

          {auditLogs.length === 0 ? (
            <div
              style={{
                padding: '18px',
                background: 'var(--bg3)',
                borderRadius: 10,
                textAlign: 'center',
                color: 'var(--text3)',
                fontSize: 13,
              }}
            >
              Nenhuma alteração administrativa registrada ainda nesta sessão.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {auditLogs.map(log => {
                const act = ACTION_LABELS[log.action] || { label: log.action, color: 'var(--accent)' }
                return (
                  <div
                    key={log.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 10,
                      padding: '11px 14px',
                      background: 'var(--bg3)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 700, color: act.color, marginRight: 8 }}>[{act.label}]</span>
                      <strong style={{ color: 'var(--text)' }}>{log.target_user_name}</strong>{' '}
                      <span style={{ color: 'var(--text3)' }}>({log.target_user_email})</span>
                      <div style={{ color: 'var(--text2)', marginTop: 3 }}>{log.details}</div>
                    </div>
                    <div style={{ textAlign: 'right', color: 'var(--text3)', fontSize: 11 }}>
                      <div>Por: <strong style={{ color: 'var(--text2)' }}>{log.actor_name}</strong></div>
                      <div>📅 {formatDateTime(log.created_at)}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* MODAL DE PERMISSÕES E PERFIL POR USUÁRIO */}
      {selectedUser && (
        <div
          className="modal-overlay"
          onClick={e => e.target === e.currentTarget && !savingConfig && setSelectedUser(null)}
        >
          <div className="modal" style={{ width: 540, maxWidth: '95vw' }}>
            <div className="modal-title">
              Permissões e Perfil · {selectedUser.name}
            </div>

            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14 }}>
              E-mail: <strong>{selectedUser.email}</strong> · Situação atual:{' '}
              <strong>{STATUS_BADGES[selectedUser.access_status || 'pending'].label}</strong>
            </div>

            {isPrimaryProgrammerIdentity(selectedUser) ? (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 8,
                  background: 'rgba(79, 110, 247, 0.14)',
                  border: '1px solid rgba(79, 110, 247, 0.35)',
                  color: '#a9b8ff',
                  fontSize: 12,
                  marginBottom: 16,
                }}
              >
                🛡️ Esta é a conta do <strong>Programador Principal</strong>. Por segurança, seu perfil e acesso administrativo completo são protegidos contra remoção ou rebaixamento.
              </div>
            ) : (
              <div className="field">
                <label className="label">Perfil de Acesso</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {(['operador', 'gestora'] as AccessProfile[]).map(pKey => {
                    const meta = PROFILE_LABELS[pKey]
                    const active = editProfile === pKey
                    return (
                      <div
                        key={pKey}
                        onClick={() => handleProfileSelectInModal(pKey)}
                        style={{
                          padding: '12px',
                          borderRadius: 10,
                          cursor: 'pointer',
                          background: active ? meta.bg : 'var(--bg3)',
                          border: `1.5px solid ${active ? meta.color : 'var(--border)'}`,
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 13, color: active ? meta.color : 'var(--text)' }}>
                          {meta.label}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, lineHeight: 1.4 }}>
                          {meta.desc}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="field">
              <label className="label">Permissões de Módulos do DCX Flow</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto', paddingRight: 4 }}>
                {MODULE_METADATA.map(m => {
                  const checked = Boolean(editPermissions[m.key as keyof UserPermissions])
                  const locked =
                    isPrimaryProgrammerIdentity(selectedUser) ||
                    m.programmerOnly ||
                    (editProfile === 'operador' && m.key === 'team')

                  return (
                    <label
                      key={m.key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '9px 12px',
                        borderRadius: 8,
                        background: 'var(--bg3)',
                        border: '1px solid var(--border)',
                        opacity: locked ? 0.65 : 1,
                        cursor: locked ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                          {m.label}
                          {m.programmerOnly && (
                            <span style={{ fontSize: 10, color: 'var(--accent)', marginLeft: 6 }}>
                              (Exclusivo Programador)
                            </span>
                          )}
                          {editProfile === 'operador' && m.key === 'team' && (
                            <span style={{ fontSize: 10, color: 'var(--red)', marginLeft: 6 }}>
                              (Bloqueado para Operador)
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>{m.description}</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={locked}
                        onChange={() => toggleModulePermission(m.key as keyof UserPermissions)}
                        style={{ width: 16, height: 16, cursor: locked ? 'not-allowed' : 'pointer' }}
                      />
                    </label>
                  )
                })}

                {/* Permissão de escopo de tarefas */}
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '9px 12px',
                    borderRadius: 8,
                    background: 'var(--bg3)',
                    border: '1px solid var(--border)',
                    opacity: isPrimaryProgrammerIdentity(selectedUser) ? 0.65 : 1,
                    cursor: isPrimaryProgrammerIdentity(selectedUser) ? 'not-allowed' : 'pointer',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                      Consultar Tarefas de Toda a Equipe
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                      Se desmarcado, o usuário consulta e opera exclusivamente as tarefas que lhe pertencem ou foram atribuídas a ele.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(editPermissions.view_all_tasks)}
                    disabled={isPrimaryProgrammerIdentity(selectedUser)}
                    onChange={() => toggleModulePermission('view_all_tasks')}
                    style={{ width: 16, height: 16 }}
                  />
                </label>
              </div>
            </div>

            <div className="modal-footer">
              <button className="bcancel" onClick={() => setSelectedUser(null)} disabled={savingConfig}>
                Cancelar
              </button>
              {!isPrimaryProgrammerIdentity(selectedUser) && (
                <button className="btn-primary" onClick={saveUserPermissions} disabled={savingConfig}>
                  {savingConfig ? 'Salvando...' : '💾 Salvar Permissões'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
