import { useState, useEffect, useCallback } from 'react'
import { sb } from '../lib/supabase'
import { genId, hashPass } from '../lib/utils'
import {
  OPERATOR_TEST_SESSION_STORAGE_KEY,
  SESSION_PROOF_STORAGE_KEY,
  computeSessionProof,
  endOperatorTestSession,
  getDefaultPermissionsForProfile,
  getLocalPendingUsers,
  hydrateUserAccess,
  isUserActive,
  recordAuditLog,
  sanitizeSelfProfileUpdate,
  saveLocalPendingUsers,
  startOperatorTestSession,
  verifyStoredOperatorTestSession,
} from '../lib/accessControlApi'
import type { OperatorTestSession, User } from '../types'

export function useAuth() {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [operatorTestSession, setOperatorTestSession] = useState<OperatorTestSession | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  /**
   * Busca o registro bruto (incluindo pass_hash apenas em memória interna para verificação de hash/assinatura).
   * O objeto retornado ao estado React passa sempre por hydrateUserAccess, que limpa pass_hash = ''.
   */
  const fetchRawUserByEmail = useCallback(async (email: string): Promise<User | null> => {
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail) return null

    const { data } = await sb.from('users').select('*').eq('email', trimmedEmail).single()
    if (data) {
      return data as User
    }

    const localPending = getLocalPendingUsers().find(
      u => u.email.trim().toLowerCase() === trimmedEmail
    )
    if (localPending) {
      return localPending
    }

    return null
  }, [])

  const clearSessionStorage = useCallback(() => {
    localStorage.removeItem('pulse_session')
    localStorage.removeItem(SESSION_PROOF_STORAGE_KEY)
    localStorage.removeItem(OPERATOR_TEST_SESSION_STORAGE_KEY)
  }, [])

  /**
   * Restaura e valida criptograficamente a sessão salva no localStorage.
   * Bloqueia qualquer tentativa de trocar manualmente o e-mail em pulse_session sem prova válida.
   */
  const restoreVerifiedSession = useCallback(async () => {
    const savedEmail = (localStorage.getItem('pulse_session') || '').trim().toLowerCase()
    const savedProof = localStorage.getItem(SESSION_PROOF_STORAGE_KEY) || ''

    if (!savedEmail) {
      setCurrentUser(null)
      setOperatorTestSession(null)
      return
    }

    const rawUser = await fetchRawUserByEmail(savedEmail)
    if (!rawUser) {
      clearSessionStorage()
      setCurrentUser(null)
      setOperatorTestSession(null)
      return
    }

    // Se o registro possui pass_hash, exige prova criptográfica idêntica
    if (rawUser.pass_hash) {
      const expectedProof = computeSessionProof(rawUser.id, rawUser.email, rawUser.pass_hash, 'session_v1')
      if (!savedProof || savedProof !== expectedProof) {
        clearSessionStorage()
        setCurrentUser(null)
        setOperatorTestSession(null)
        await recordAuditLog({
          actor_id: 'TAMPERED_STORAGE',
          actor_name: 'SESSÃO REJEITADA',
          actor_email: savedEmail,
          target_user_id: rawUser.id,
          target_user_name: rawUser.name,
          target_user_email: rawUser.email,
          action: 'REJECT_FORGED_SESSION',
          details: `Sessão em localStorage rejeitada para "${rawUser.email}": prova criptográfica ausente ou adulterada manualmente.`,
        })
        return
      }
    }

    const verifiedTestSession = await verifyStoredOperatorTestSession(savedEmail)
    setOperatorTestSession(verifiedTestSession)
    setCurrentUser(hydrateUserAccess(rawUser))
  }, [clearSessionStorage, fetchRawUserByEmail])

  useEffect(() => {
    restoreVerifiedSession().finally(() => {
      setAuthLoading(false)
    })
  }, [restoreVerifiedSession])

  const refreshCurrentUser = useCallback(async () => {
    await restoreVerifiedSession()
  }, [restoreVerifiedSession])

  const login = async (email: string, pass: string): Promise<string | null> => {
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail) return 'Preencha o e-mail'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) return 'E-mail inválido. Verifique se digitou corretamente.'
    if (!pass) return 'Preencha a senha'

    const rawUser = await fetchRawUserByEmail(trimmedEmail)
    if (!rawUser) return 'E-mail não encontrado. Verifique o e-mail ou faça o cadastro.'

    // Segurança: comparação estrita com o hash da própria conta (nenhuma senha mestra universal é permitida)
    const inputHash = hashPass(pass)
    if (!rawUser.pass_hash || rawUser.pass_hash !== inputHash) {
      return 'Senha incorreta'
    }

    const sessionProof = computeSessionProof(rawUser.id, rawUser.email, rawUser.pass_hash, 'session_v1')
    localStorage.removeItem(OPERATOR_TEST_SESSION_STORAGE_KEY)
    localStorage.setItem('pulse_session', trimmedEmail)
    localStorage.setItem(SESSION_PROOF_STORAGE_KEY, sessionProof)

    const hydrated = hydrateUserAccess(rawUser)
    setOperatorTestSession(null)
    setCurrentUser(hydrated)
    return null
  }

  const signup = async (name: string, role: string, email: string, pass: string, color: string): Promise<string | null> => {
    if (!name || !name.trim()) return 'Preencha seu nome'
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail) return 'Preencha o e-mail'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) return 'E-mail inválido. Verifique se digitou corretamente.'
    if (pass.length < 4) return 'Senha deve ter ao menos 4 caracteres'

    const existing = await fetchRawUserByEmail(trimmedEmail)
    if (existing) return 'E-mail já cadastrado'

    const id = genId()
    const now = new Date().toISOString()
    const passHash = hashPass(pass)

    // Registro bruto para fila pendente local (mantém pass_hash apenas no armazenamento pendente até aprovação)
    const pendingRecord: User = {
      id,
      name: name.trim(),
      role: (role || 'Operador').trim(),
      email: trimmedEmail,
      pass_hash: passHash,
      color,
      is_admin: false,
      access_profile: 'operador',
      access_status: 'pending',
      permissions: getDefaultPermissionsForProfile('operador'),
      created_at: now,
      status_updated_at: now,
    }

    const currentPending = getLocalPendingUsers()
    saveLocalPendingUsers([pendingRecord, ...currentPending])

    const sessionProof = computeSessionProof(id, trimmedEmail, passHash, 'session_v1')
    localStorage.removeItem(OPERATOR_TEST_SESSION_STORAGE_KEY)
    localStorage.setItem('pulse_session', trimmedEmail)
    localStorage.setItem(SESSION_PROOF_STORAGE_KEY, sessionProof)

    setOperatorTestSession(null)
    setCurrentUser(hydrateUserAccess(pendingRecord))
    return null
  }

  const logout = () => {
    clearSessionStorage()
    setOperatorTestSession(null)
    setCurrentUser(null)
  }

  const startOperatorSession = useCallback(async (targetEmailOrId: string): Promise<User> => {
    const { operatorUser, session } = await startOperatorTestSession(targetEmailOrId)
    setOperatorTestSession(session)
    setCurrentUser(operatorUser)
    return operatorUser
  }, [])

  const endOperatorSession = useCallback(async (): Promise<User> => {
    const restoredAdmin = await endOperatorTestSession()
    setOperatorTestSession(null)
    setCurrentUser(restoredAdmin)
    return restoredAdmin
  }, [])

  const resetPassword = async (email: string, name: string, newPass: string): Promise<string | null> => {
    if (!email) return 'Preencha o e-mail'
    if (!name) return 'Preencha seu nome completo'
    if (newPass.length < 4) return 'A nova senha deve ter ao menos 4 caracteres'

    const trimmedEmail = email.trim().toLowerCase()
    const rawUser = await fetchRawUserByEmail(trimmedEmail)

    if (!rawUser) return 'Dados incorretos. Verifique o e-mail e o nome digitado.'

    if (rawUser.name.trim().toLowerCase() !== name.trim().toLowerCase()) {
      return 'Dados incorretos. Verifique o e-mail e o nome digitado.'
    }

    const hydrated = hydrateUserAccess(rawUser)
    // Bloqueia redefinição de senha para contas suspensas ou recusadas
    if (hydrated.access_status === 'suspended' || hydrated.access_status === 'rejected') {
      return 'Esta conta está com o acesso suspenso ou não autorizado. Contate o administrador.'
    }

    const newHash = hashPass(newPass)
    const pendingList = getLocalPendingUsers()
    const isLocalPending = pendingList.some(u => u.id === rawUser.id)

    if (isLocalPending) {
      saveLocalPendingUsers(
        pendingList.map(u => (u.id === rawUser.id ? { ...u, pass_hash: newHash } : u))
      )
      return null
    }

    const { error: ue } = await sb.from('users').update({ pass_hash: newHash }).eq('id', rawUser.id)
    if (ue) return 'Erro ao redefinir senha: ' + ue.message

    return null
  }

  const updateUser = async (id: string, data: Partial<User>): Promise<boolean> => {
    if (!currentUser || currentUser.id !== id) {
      // Usuários comuns jamais podem editar outro usuário via updateUser
      return false
    }
    if (!isUserActive(currentUser)) {
      return false
    }

    // Whitelist estrita: impede alteração de is_admin, access_profile, access_status ou permissions pelo próprio usuário
    const safeUpdate = sanitizeSelfProfileUpdate(currentUser, data)
    // Impede que uma sessão administrativa de teste altere acidentalmente a senha real do operador no banco
    if (operatorTestSession !== null) {
      delete safeUpdate.pass_hash
    }
    if (Object.keys(safeUpdate).length === 0) return false

    const pendingList = getLocalPendingUsers()
    const isLocal = pendingList.some(u => u.id === id)

    if (isLocal) {
      saveLocalPendingUsers(
        pendingList.map(u => (u.id === id ? { ...u, ...safeUpdate } : u))
      )
      if (safeUpdate.pass_hash) {
        const nextProof = computeSessionProof(currentUser.id, currentUser.email, safeUpdate.pass_hash, 'session_v1')
        localStorage.setItem(SESSION_PROOF_STORAGE_KEY, nextProof)
      }
      setCurrentUser(prev => (prev ? hydrateUserAccess({ ...prev, ...safeUpdate }) : prev))
      return true
    }

    const { error } = await sb.from('users').update(safeUpdate).eq('id', id)
    if (error) return false

    if (safeUpdate.pass_hash) {
      const nextProof = computeSessionProof(currentUser.id, currentUser.email, safeUpdate.pass_hash, 'session_v1')
      localStorage.setItem(SESSION_PROOF_STORAGE_KEY, nextProof)
    }

    const teamSync: Record<string, unknown> = {}
    if (safeUpdate.name !== undefined) teamSync.name = safeUpdate.name.trim()
    if (safeUpdate.role !== undefined) teamSync.role = safeUpdate.role
    if (safeUpdate.color !== undefined) teamSync.color = safeUpdate.color
    if (Object.keys(teamSync).length > 0) {
      await sb.from('team').update(teamSync).eq('id', id)
    }

    setCurrentUser(prev => (prev ? hydrateUserAccess({ ...prev, ...safeUpdate }) : prev))
    return true
  }

  return {
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
  }
}


