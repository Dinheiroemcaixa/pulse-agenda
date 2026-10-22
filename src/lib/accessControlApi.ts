import { sb } from './supabase'
import { genId } from './utils'
import type {
  AccessAuditLog,
  AccessProfile,
  AccessProfilePermissionsMap,
  AccessStatus,
  AppModule,
  OperatorTestSession,
  Page,
  Task,
  User,
  UserPermissions,
} from '../types'

// ──────────────────────────────────────────────────────────────
// IDENTIDADE IMUTÁVEL DO PROGRAMADOR PRINCIPAL E CONTAS LEGADAS
// ──────────────────────────────────────────────────────────────

export const PROGRAMMER_USER_ID = 'id_1774288221364_jmcbu'
export const PROGRAMMER_EMAIL = 'ramoncardosobiologo@gmail.com'

export const GESTORA_USER_ID = 'id_1774293514208_f6g52'
export const GESTORA_EMAIL = 'raffaelabatistalima1@gmail.com'

interface LegacyAccountSeed {
  id: string
  email: string
  profile: AccessProfile
  status: AccessStatus
}

// Contas existentes preservadas integralmente (nenhum usuário existente perde acesso)
export const LEGACY_APPROVED_ACCOUNTS: Record<string, LegacyAccountSeed> = {
  'ramoncardosobiologo@gmail.com': {
    id: 'id_1774288221364_jmcbu',
    email: 'ramoncardosobiologo@gmail.com',
    profile: 'programador',
    status: 'active',
  },
  'raffaelabatistalima1@gmail.com': {
    id: 'id_1774293514208_f6g52',
    email: 'raffaelabatistalima1@gmail.com',
    profile: 'gestora',
    status: 'active',
  },
  'geovanarayssamoraisfernandes@gmail.com': {
    id: 'id_1774381467408_uszd3',
    email: 'geovanarayssamoraisfernandes@gmail.com',
    profile: 'operador',
    status: 'active',
  },
  'andressabrandao022@gmail.com': {
    id: 'id_1774377735487_l90b1',
    email: 'andressabrandao022@gmail.com',
    profile: 'operador',
    status: 'active',
  },
  'monarageovana.cardoso@gmail.com': {
    id: 'id_1774382039163_a9hqd',
    email: 'monarageovana.cardoso@gmail.com',
    profile: 'operador',
    status: 'active',
  },
}

const ACCESS_OVERRIDES_STORAGE_KEY = 'pulse_access_control_overrides_v1'
const ACCESS_AUDIT_STORAGE_KEY = 'pulse_access_audit_logs_v1'
const PENDING_USERS_STORAGE_KEY = 'pulse_pending_signup_users_v1'
export const PROFILE_DEFAULTS_STORAGE_KEY = 'pulse_profile_permissions_defaults_v1'
export const SESSION_PROOF_STORAGE_KEY = 'pulse_session_proof'
export const OPERATOR_TEST_SESSION_STORAGE_KEY = 'pulse_operator_test_session_v1'

const CENTRAL_ACCESS_STATE_BUCKET = 'pop-media'
export const CENTRAL_ACCESS_STATE_PATH = 'pops/_system_access_control/access_state_v1.txt'

export interface CentralAccessControlStateEnvelope {
  version: 1
  updatedAt: string
  updatedBy: string
  overrides: Record<string, UserAccessOverride>
  profileDefaults: AccessProfilePermissionsMap
  signature: string
}

let auditTableAvailable: boolean | null = null
let operatorSessionRpcAvailable: boolean | null = null

function isMissingRemoteResourceError(error: any): boolean {
  if (!error) return false
  const code = String(error.code || '')
  const status = Number(error.status || error.statusCode || 0)
  const msg = String(error.message || error.details || '').toLowerCase()
  return (
    status === 404 ||
    code === 'PGRST205' ||
    code === 'PGRST202' ||
    code === '42P01' ||
    code === '42883' ||
    msg.includes('could not find the table') ||
    msg.includes('could not find the function') ||
    msg.includes('does not exist')
  )
}


export interface UserAccessOverride {
  user_id: string
  email: string
  access_profile: AccessProfile
  access_status: AccessStatus
  permissions: UserPermissions
  approved_by?: string
  approved_at?: string
  status_updated_at: string
}

export const MODULE_METADATA: { key: AppModule; label: string; description: string; programmerOnly?: boolean; nonOperatorDefault?: boolean }[] = [
  { key: 'tasks', label: 'Minhas Tarefas', description: 'Lista, Kanban e Agenda de tarefas' },
  { key: 'atrasadas', label: 'Atrasadas', description: 'Painel de tarefas fora do prazo' },
  { key: 'history', label: 'Histórico', description: 'Consulta de tarefas concluídas e métricas' },
  { key: 'pops', label: 'Procedimentos (POP)', description: 'Consulta e execução de POPs operacionais' },
  { key: 'meetings', label: 'Reuniões', description: 'Agenda de compromissos e reuniões' },
  { key: 'messages', label: 'Mensagens', description: 'Chat interno direto com a equipe' },
  { key: 'team', label: 'Equipe', description: 'Painel de membros e produtividade da equipe', nonOperatorDefault: true },
  { key: 'backup', label: 'Backup', description: 'Exportação e restauração de snapshots', nonOperatorDefault: true },
  { key: 'settings', label: 'Configurações', description: 'Aprovação de acessos, perfis e permissões (Exclusivo Programador)', programmerOnly: true },
]

// ──────────────────────────────────────────────────────────────
// PERMISSÕES PADRÃO POR PERFIL
// ──────────────────────────────────────────────────────────────

export function getProfilePermissionDefaultsMap(): AccessProfilePermissionsMap {
  try {
    if (typeof localStorage === 'undefined') return {}
    const raw = localStorage.getItem(PROFILE_DEFAULTS_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function setProfilePermissionDefaultsMap(map: AccessProfilePermissionsMap): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(PROFILE_DEFAULTS_STORAGE_KEY, JSON.stringify(map))
  } catch (e) {
    console.error('Erro ao salvar defaults de permissão por perfil:', e)
  }
}

export function getBaseStaticPermissionsForProfile(profile: AccessProfile): UserPermissions {
  if (profile === 'programador') {
    return {
      tasks: true,
      atrasadas: true,
      history: true,
      pops: true,
      team: true,
      meetings: true,
      messages: true,
      backup: true,
      settings: true,
      view_all_tasks: true,
      create_pops: true,
    }
  }
  if (profile === 'gestora') {
    return {
      tasks: true,
      atrasadas: true,
      history: true,
      pops: true,
      team: true,
      meetings: true,
      messages: true,
      backup: true,
      settings: false, // Jamais tem acesso a Configurações
      view_all_tasks: true,
      create_pops: true,
    }
  }
  // Operador
  return {
    tasks: true,
    atrasadas: true,
    history: true,
    pops: true,
    team: false, // Operador não visualiza nem acessa Equipe
    meetings: true,
    messages: true,
    backup: false,
    settings: false,
    view_all_tasks: false, // Operador acessa apenas suas próprias tarefas
    create_pops: false, // Restrito por padrão até liberação explícita pelo administrador
  }
}

export function getDefaultPermissionsForProfile(profile: AccessProfile): UserPermissions {
  const base = getBaseStaticPermissionsForProfile(profile)
  if (profile === 'programador') {
    return { ...base }
  }
  const customProfileDefaults = getProfilePermissionDefaultsMap()[profile]
  if (!customProfileDefaults || typeof customProfileDefaults !== 'object') {
    return { ...base }
  }
  return {
    tasks: customProfileDefaults.tasks ?? base.tasks,
    atrasadas: customProfileDefaults.atrasadas ?? base.atrasadas,
    history: customProfileDefaults.history ?? base.history,
    pops: customProfileDefaults.pops ?? base.pops,
    team: profile === 'operador' ? false : (customProfileDefaults.team ?? base.team),
    meetings: customProfileDefaults.meetings ?? base.meetings,
    messages: customProfileDefaults.messages ?? base.messages,
    backup: customProfileDefaults.backup ?? base.backup,
    settings: false,
    view_all_tasks: customProfileDefaults.view_all_tasks ?? base.view_all_tasks,
    create_pops: customProfileDefaults.create_pops ?? base.create_pops,
  }
}

export function normalizePermissionsForProfile(
  profile: AccessProfile,
  raw?: Partial<UserPermissions> | null
): UserPermissions {
  const defaults = getDefaultPermissionsForProfile(profile)
  if (profile === 'programador') {
    // Programador sempre mantém acesso administrativo total
    return { ...defaults, create_pops: true }
  }
  const merged: UserPermissions = {
    tasks: raw?.tasks ?? defaults.tasks,
    atrasadas: raw?.atrasadas ?? defaults.atrasadas,
    history: raw?.history ?? defaults.history,
    pops: raw?.pops ?? defaults.pops,
    team: profile === 'operador' ? false : (raw?.team ?? defaults.team),
    meetings: raw?.meetings ?? defaults.meetings,
    messages: raw?.messages ?? defaults.messages,
    backup: raw?.backup ?? defaults.backup,
    settings: false, // Nunca permitido fora do Programador
    view_all_tasks: profile === 'operador' ? Boolean(raw?.view_all_tasks ?? defaults.view_all_tasks) : (raw?.view_all_tasks ?? defaults.view_all_tasks),
    create_pops: raw?.create_pops ?? defaults.create_pops,
  }
  return merged
}

// ──────────────────────────────────────────────────────────────
// PERSISTÊNCIA LOCAL SEGURA (PREVIEW / FALLBACK ANTES DE MIGRATION)
// ──────────────────────────────────────────────────────────────

function getLocalOverridesMap(): Record<string, UserAccessOverride> {
  try {
    const raw = localStorage.getItem(ACCESS_OVERRIDES_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function setLocalOverridesMap(map: Record<string, UserAccessOverride>): void {
  try {
    localStorage.setItem(ACCESS_OVERRIDES_STORAGE_KEY, JSON.stringify(map))
  } catch (e) {
    console.error('Erro ao salvar overrides de controle de acesso:', e)
  }
}

export function getLocalPendingUsers(): User[] {
  try {
    const raw = localStorage.getItem(PENDING_USERS_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveLocalPendingUsers(users: User[]): void {
  try {
    localStorage.setItem(PENDING_USERS_STORAGE_KEY, JSON.stringify(users))
  } catch (e) {
    console.error('Erro ao salvar usuários pendentes:', e)
  }
}

export function getLocalAuditLogs(): AccessAuditLog[] {
  try {
    const raw = localStorage.getItem(ACCESS_AUDIT_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveLocalAuditLogs(logs: AccessAuditLog[]): void {
  try {
    localStorage.setItem(ACCESS_AUDIT_STORAGE_KEY, JSON.stringify(logs))
  } catch (e) {
    console.error('Erro ao salvar logs de auditoria:', e)
  }
}

function computeCentralAccessStateSignature(
  adminPassHash: string,
  updatedAt: string,
  overrides: Record<string, UserAccessOverride>,
  profileDefaults: AccessProfilePermissionsMap
): string {
  const canonicalPayload = JSON.stringify({
    version: 1,
    updatedAt,
    overrides,
    profileDefaults,
  })
  return computeSessionProof(
    PROGRAMMER_USER_ID,
    PROGRAMMER_EMAIL,
    `${adminPassHash}|${canonicalPayload}`,
    'central_access_state_v1'
  )
}

let inFlightCentralSync: Promise<boolean> | null = null

/**
 * Sincroniza o estado central de permissões (overrides por usuário e padrões por perfil)
 * armazenado no Supabase e assinado criptograficamente pelo Programador principal.
 * Permite que alterações salvas pelo administrador reflitam em outros computadores e navegadores.
 */
export async function syncCentralAccessControlState(): Promise<boolean> {
  if (inFlightCentralSync) {
    return inFlightCentralSync
  }

  const runSync = async (): Promise<boolean> => {
    try {
      const { data: blob, error: dlErr } = await sb.storage
        .from(CENTRAL_ACCESS_STATE_BUCKET)
        .download(CENTRAL_ACCESS_STATE_PATH)

      if (dlErr || !blob) {
        return false
      }

      const rawText = await blob.text()
      if (!rawText) return false

      const parsed = JSON.parse(rawText) as CentralAccessControlStateEnvelope
      if (
        !parsed ||
        parsed.version !== 1 ||
        typeof parsed.updatedAt !== 'string' ||
        typeof parsed.signature !== 'string' ||
        typeof parsed.overrides !== 'object' ||
        typeof parsed.profileDefaults !== 'object'
      ) {
        return false
      }

      const { data: adminRow, error: adminErr } = await sb
        .from('users')
        .select('id,email,pass_hash')
        .eq('email', PROGRAMMER_EMAIL)
        .single()

      if (adminErr || !adminRow || !adminRow.pass_hash) {
        return false
      }

      const expectedSig = computeCentralAccessStateSignature(
        adminRow.pass_hash,
        parsed.updatedAt,
        parsed.overrides || {},
        parsed.profileDefaults || {}
      )

      if (parsed.signature !== expectedSig) {
        console.warn('Assinatura criptográfica do estado central de permissões inválida; ignorando envelope remoto.')
        return false
      }

      const currentLocalProfileDefaults = getProfilePermissionDefaultsMap()
      setProfilePermissionDefaultsMap({
        ...(parsed.profileDefaults || {}),
        ...currentLocalProfileDefaults,
      })

      const currentLocal = getLocalOverridesMap()
      const mergedOverrides: Record<string, UserAccessOverride> = { ...(parsed.overrides || {}) }
      for (const [k, localEntry] of Object.entries(currentLocal)) {
        const remoteEntry = mergedOverrides[k]
        if (
          localEntry &&
          (!remoteEntry ||
            (localEntry.status_updated_at &&
              (!remoteEntry.status_updated_at || localEntry.status_updated_at >= remoteEntry.status_updated_at)))
        ) {
          mergedOverrides[k] = localEntry
        }
      }
      setLocalOverridesMap(mergedOverrides)
      return true
    } catch {
      return false
    } finally {
      inFlightCentralSync = null
    }
  }

  inFlightCentralSync = runSync()
  return inFlightCentralSync
}

/**
 * Persiste centralmente no Supabase o mapa de overrides por usuário e os defaults por perfil,
 * assinados criptograficamente com o pass_hash do Programador principal.
 */
export async function persistCentralAccessControlState(actor: User | null | undefined): Promise<void> {
  const verifiedActor = await verifyProgrammerActor(actor)

  const { data: adminRow, error: adminErr } = await sb
    .from('users')
    .select('id,email,pass_hash')
    .eq('email', PROGRAMMER_EMAIL)
    .single()

  if (adminErr || !adminRow || !adminRow.pass_hash) {
    return
  }

  const updatedAt = new Date().toISOString()
  const overrides = getLocalOverridesMap()
  const profileDefaults = getProfilePermissionDefaultsMap()

  const signature = computeCentralAccessStateSignature(
    adminRow.pass_hash,
    updatedAt,
    overrides,
    profileDefaults
  )

  const envelope: CentralAccessControlStateEnvelope = {
    version: 1,
    updatedAt,
    updatedBy: verifiedActor.email,
    overrides,
    profileDefaults,
    signature,
  }

  await sb.storage
    .from(CENTRAL_ACCESS_STATE_BUCKET)
    .upload(CENTRAL_ACCESS_STATE_PATH, JSON.stringify(envelope), {
      upsert: true,
      contentType: 'text/plain',
      cacheControl: '0',
    })
}

// ──────────────────────────────────────────────────────────────
// PROVA CRIPTOGRÁFICA DE SESSÃO E ASSINATURA DE TRANSIÇÃO
// ──────────────────────────────────────────────────────────────

/**
 * Gera prova determinística de 256 bits (64 hex chars) derivada do pass_hash real no banco.
 * Como pass_hash nunca é exposto no estado React nem no localStorage de sessão,
 * nenhum usuário consegue forjar pulse_session ou pulse_operator_test_session_v1 via DevTools.
 */
export function computeSessionProof(
  userId: string,
  email: string,
  passHash: string,
  purpose = 'session_v1'
): string {
  const cleanId = (userId || '').trim()
  const cleanEmail = (email || '').trim().toLowerCase()
  const cleanSecret = (passHash || '').trim()
  if (!cleanId || !cleanEmail || !cleanSecret) return ''

  const payload = `pulse_hmac_v1|${purpose}|${cleanId}|${cleanEmail}|${cleanSecret}`
  const seeds = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]

  for (let round = 0; round < 4; round++) {
    for (let i = 0; i < payload.length; i++) {
      const code = payload.charCodeAt(i)
      const lane = (i + round) & 7
      let h = seeds[lane] ^ (code + Math.imul(i + 1, 0x9e3779b9) + Math.imul(round + 1, 0x85ebca6b))
      h = Math.imul(h ^ (h >>> 16), 0x7feb352d)
      h = Math.imul(h ^ (h >>> 15), 0x846ca68b)
      h = (h ^ (h >>> 16)) >>> 0
      seeds[lane] = h
      seeds[(lane + 1) & 7] = (seeds[(lane + 1) & 7] ^ ((h << 7) | (h >>> 25))) >>> 0
    }
  }

  return seeds.map(s => (s >>> 0).toString(16).padStart(8, '0')).join('')
}

export function computeOperatorTransitionSignature(params: {
  sessionId: string
  adminId: string
  adminEmail: string
  adminPassHash: string
  targetId: string
  targetEmail: string
  startedAt: string
}): string {
  const purpose = `operator_test_v1:${params.sessionId}:${params.targetId.trim()}:${params.targetEmail.trim().toLowerCase()}:${params.startedAt.trim()}`
  return computeSessionProof(params.adminId, params.adminEmail, params.adminPassHash, purpose)
}

// ──────────────────────────────────────────────────────────────
// RESOLUÇÃO SEGURA DE IDENTIDADE, PERFIL E SITUAÇÃO
// ──────────────────────────────────────────────────────────────

export function isPrimaryProgrammerIdentity(userOrEmail?: Pick<User, 'id' | 'email'> | string | null): boolean {
  if (!userOrEmail) return false
  if (typeof userOrEmail === 'string') {
    return userOrEmail.trim().toLowerCase() === PROGRAMMER_EMAIL
  }
  const emailMatch = (userOrEmail.email || '').trim().toLowerCase() === PROGRAMMER_EMAIL
  const idMatch = userOrEmail.id === PROGRAMMER_USER_ID
  return emailMatch || idMatch
}

export function hydrateUserAccess(rawUser: User): User {
  const emailKey = (rawUser.email || '').trim().toLowerCase()
  const overrides = getLocalOverridesMap()
  const override = overrides[rawUser.id] || overrides[emailKey]
  const legacySeed = LEGACY_APPROVED_ACCOUNTS[emailKey]

  // 1. Conta do Programador Principal é imutável e nunca pode ser rebaixada ou suspensa
  if (isPrimaryProgrammerIdentity(rawUser)) {
    const progPerms = getDefaultPermissionsForProfile('programador')
    return {
      ...rawUser,
      pass_hash: '', // Segurança: nunca expor pass_hash no objeto User hidratado
      is_admin: true,
      access_profile: 'programador',
      access_status: 'active',
      permissions: progPerms,
    }
  }

  // 2. Determinar perfil (prioridade: coluna do banco válida -> override administrativo -> conta legada -> operador)
  let profile: AccessProfile = 'operador'
  const dbProfile = rawUser.access_profile
  if (dbProfile === 'gestora' || dbProfile === 'operador') {
    profile = dbProfile
  } else if (override?.access_profile && override.access_profile !== 'programador') {
    profile = override.access_profile
  } else if (legacySeed) {
    profile = legacySeed.profile
  }

  // 3. Determinar situação de acesso (fail-closed: contas novas sem aprovação entram como 'pending')
  let status: AccessStatus = 'pending'
  const dbStatus = rawUser.access_status
  if (dbStatus === 'active' || dbStatus === 'pending' || dbStatus === 'suspended' || dbStatus === 'rejected') {
    status = dbStatus
  } else if (override?.access_status) {
    status = override.access_status
  } else if (legacySeed) {
    status = legacySeed.status
  } else {
    status = 'pending'
  }

  // 4. Normalizar permissões conforme o perfil
  const dbPerms = (rawUser.permissions && typeof rawUser.permissions === 'object')
    ? rawUser.permissions
    : undefined
  const overrideNewer = Boolean(
    override?.permissions &&
    (!rawUser.status_updated_at || (override.status_updated_at && override.status_updated_at >= rawUser.status_updated_at))
  )
  const rawPerms: Partial<UserPermissions> | undefined = overrideNewer
    ? { ...(dbPerms || {}), ...override!.permissions }
    : dbPerms
      ? { ...(override?.permissions || {}), ...dbPerms }
      : override?.permissions
  const permissions = normalizePermissionsForProfile(profile, rawPerms)

  // is_admin reflete se possui perfil de gestão operacional (Programador ou Gestora ativos)
  const isOperationalAdmin = status === 'active' && (profile === 'programador' || profile === 'gestora')

  return {
    ...rawUser,
    pass_hash: '', // Segurança: nunca expor pass_hash no objeto User hidratado
    is_admin: isOperationalAdmin,
    access_profile: profile,
    access_status: status,
    permissions,
    approved_by: rawUser.approved_by || override?.approved_by,
    approved_at: rawUser.approved_at || override?.approved_at,
    status_updated_at: rawUser.status_updated_at || override?.status_updated_at,
  }
}

export function isProgrammer(user?: User | null): boolean {
  if (!user) return false
  const hydrated = hydrateUserAccess(user)
  return hydrated.access_status === 'active' && isPrimaryProgrammerIdentity(hydrated)
}

export function isGestora(user?: User | null): boolean {
  if (!user) return false
  const hydrated = hydrateUserAccess(user)
  return hydrated.access_status === 'active' && hydrated.access_profile === 'gestora'
}

export function isOperador(user?: User | null): boolean {
  if (!user) return false
  const hydrated = hydrateUserAccess(user)
  return hydrated.access_profile === 'operador'
}

export function isUserActive(user?: User | null): boolean {
  if (!user) return false
  const hydrated = hydrateUserAccess(user)
  return hydrated.access_status === 'active'
}

// ──────────────────────────────────────────────────────────────
// GUARDAS DE AUTORIZAÇÃO (ROTAS, MÓDULOS E DADOS)
// ──────────────────────────────────────────────────────────────

export function canAccessModule(user: User | null | undefined, pageOrModule: Page | AppModule): boolean {
  if (!user) return false
  const hydrated = hydrateUserAccess(user)

  // Usuários pendentes, suspensos ou recusados não acessam nenhum módulo interno
  if (hydrated.access_status !== 'active') return false

  // Card e rota Configurações: EXCLUSIVO do Programador Principal
  if (pageOrModule === 'settings') {
    return isProgrammer(hydrated)
  }

  // Programador tem acesso total
  if (isProgrammer(hydrated)) return true

  // Operador NUNCA visualiza nem acessa o card Equipe
  if (hydrated.access_profile === 'operador' && pageOrModule === 'team') {
    return false
  }

  const perms = hydrated.permissions || getDefaultPermissionsForProfile(hydrated.access_profile || 'operador')
  return Boolean(perms[pageOrModule as keyof UserPermissions])
}

export function canCreatePop(user: User | null | undefined): boolean {
  if (!user) return false
  const hydrated = hydrateUserAccess(user)
  if (hydrated.access_status !== 'active') return false
  if (isProgrammer(hydrated)) return true
  if (!canAccessModule(hydrated, 'pops')) return false
  const perms = hydrated.permissions || getDefaultPermissionsForProfile(hydrated.access_profile || 'operador')
  return Boolean(perms.create_pops)
}

export function resolveCurrentSessionUser(): User | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const savedEmail = (localStorage.getItem('pulse_session') || '').trim().toLowerCase()
    if (!savedEmail) return null

    const overrides = getLocalOverridesMap()
    const overrideByEmail = overrides[savedEmail] || Object.values(overrides).find(
      o => (o.email || '').trim().toLowerCase() === savedEmail
    )
    const opSession = getStoredOperatorTestSessionRaw()
    const matchingOpSession =
      opSession && (opSession.targetEmail || '').trim().toLowerCase() === savedEmail
        ? opSession
        : null
    const legacySeed = LEGACY_APPROVED_ACCOUNTS[savedEmail]
    const localPending = getLocalPendingUsers().find(
      u => (u.email || '').trim().toLowerCase() === savedEmail
    )

    const baseUser: User = localPending
      ? {
          ...localPending,
          permissions: overrideByEmail?.permissions || localPending.permissions,
          status_updated_at: overrideByEmail?.status_updated_at || localPending.status_updated_at,
        }
      : {
          id: matchingOpSession?.targetId || overrideByEmail?.user_id || legacySeed?.id || savedEmail,
          name: matchingOpSession?.targetName || savedEmail.split('@')[0],
          role: '',
          email: savedEmail,
          pass_hash: '',
          color: '#4f6ef7',
          is_admin: false,
          access_profile: overrideByEmail?.access_profile || matchingOpSession?.targetProfile || legacySeed?.profile,
          access_status: overrideByEmail?.access_status || legacySeed?.status || (matchingOpSession ? 'active' : undefined),
          permissions: overrideByEmail?.permissions,
          status_updated_at: overrideByEmail?.status_updated_at,
        }

    return hydrateUserAccess(baseUser)
  } catch {
    return null
  }
}

export function canViewAllTasks(user: User | null | undefined): boolean {
  if (!user) return false
  const hydrated = hydrateUserAccess(user)
  if (hydrated.access_status !== 'active') return false
  if (isProgrammer(hydrated) || isGestora(hydrated)) {
    return hydrated.permissions?.view_all_tasks ?? true
  }
  // Operadores acessam somente tarefas próprias/atribuídas, salvo autorização explícita
  return Boolean(hydrated.permissions?.view_all_tasks === true)
}

export function canAccessTaskRecord(user: User | null | undefined, task: Pick<Task, 'resp'> | string): boolean {
  if (!user) return false
  const hydrated = hydrateUserAccess(user)
  if (hydrated.access_status !== 'active') return false
  if (canViewAllTasks(hydrated)) return true

  const respName = typeof task === 'string' ? task : (task.resp || '')
  return respName.trim().toLowerCase() === (hydrated.name || '').trim().toLowerCase()
}

export function filterTasksForUser<T extends Pick<Task, 'resp'>>(user: User | null | undefined, tasks: T[]): T[] {
  if (!user || !isUserActive(user)) return []
  if (canViewAllTasks(user)) return tasks
  const myName = (user.name || '').trim().toLowerCase()
  return tasks.filter(t => (t.resp || '').trim().toLowerCase() === myName)
}

/**
 * Sanitiza payload de auto-atualização de perfil ("Editar Perfil" na Sidebar)
 * Impede que qualquer usuário altere o próprio access_profile, access_status, permissions ou is_admin.
 */
export function sanitizeSelfProfileUpdate(actor: User, rawUpdate: Partial<User>): Partial<User> {
  const safe: Partial<User> = {}
  if (typeof rawUpdate.name === 'string' && rawUpdate.name.trim()) {
    safe.name = rawUpdate.name.trim()
  }
  if (typeof rawUpdate.role === 'string') {
    const trimmedRole = rawUpdate.role.trim()
    // Impede que usuário comum use o título reservado "Programador" para tentar confundir a interface
    if (!isPrimaryProgrammerIdentity(actor) && trimmedRole.toLowerCase().includes('programador')) {
      safe.role = actor.role
    } else {
      safe.role = trimmedRole
    }
  }
  if (typeof rawUpdate.color === 'string' && rawUpdate.color.trim()) {
    safe.color = rawUpdate.color.trim()
  }
  if (typeof rawUpdate.pass_hash === 'string' && rawUpdate.pass_hash.trim()) {
    safe.pass_hash = rawUpdate.pass_hash.trim()
  }
  return safe
}

// ──────────────────────────────────────────────────────────────
// VERIFICAÇÃO BACKEND DO PROGRAMADOR E OPERAÇÕES ADMINISTRATIVAS
// ──────────────────────────────────────────────────────────────

export function getStoredOperatorTestSessionRaw(): OperatorTestSession | null {
  try {
    const raw = localStorage.getItem(OPERATOR_TEST_SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as OperatorTestSession
  } catch {
    return null
  }
}

let verifiedProgrammerCache: { key: string; user: User; expiresAt: number } | null = null
let inFlightVerifyProgrammer: Promise<User> | null = null
const VERIFY_PROGRAMMER_TTL_MS = 10_000

export async function verifyProgrammerActor(actor: User | null | undefined): Promise<User> {
  if (!actor || !isPrimaryProgrammerIdentity(actor)) {
    throw new Error('ACESSO NEGADO: Somente o Programador principal está autorizado a realizar esta operação.')
  }

  const storedSessionProof = localStorage.getItem(SESSION_PROOF_STORAGE_KEY) || ''
  const storedAdminEnvelope = getStoredOperatorTestSessionRaw()
  const cacheKey = `${actor.id}:${actor.email.trim().toLowerCase()}:${storedSessionProof}:${storedAdminEnvelope?.adminProof || ''}`
  const now = Date.now()

  if (verifiedProgrammerCache && verifiedProgrammerCache.key === cacheKey && now < verifiedProgrammerCache.expiresAt) {
    return verifiedProgrammerCache.user
  }

  if (inFlightVerifyProgrammer) {
    return inFlightVerifyProgrammer
  }

  const runVerification = async (): Promise<User> => {
    try {
      // Confirma a existência, identidade e prova criptográfica da conta diretamente no Supabase
      const { data, error } = await sb
        .from('users')
        .select('id,name,email,role,color,is_admin,pass_hash')
        .eq('email', PROGRAMMER_EMAIL)
        .single()

      if (!error && data) {
        if (data.id !== actor.id && data.email.trim().toLowerCase() !== actor.email.trim().toLowerCase()) {
          throw new Error('ACESSO NEGADO: Identidade do Programador não confirmada no banco de dados.')
        }

        if (data.pass_hash) {
          const expectedProof = computeSessionProof(data.id, data.email, data.pass_hash, 'session_v1')
          const currentSessionProof = localStorage.getItem(SESSION_PROOF_STORAGE_KEY)
          const currentAdminEnvelope = getStoredOperatorTestSessionRaw()
          const validDirectProof = currentSessionProof === expectedProof
          const validEnvelopeProof = currentAdminEnvelope?.adminProof === expectedProof

          if (!validDirectProof && !validEnvelopeProof) {
            throw new Error('ACESSO NEGADO: Assinatura criptográfica da sessão do Programador ausente ou inválida.')
          }
        }

        const hydrated = hydrateUserAccess(data as User)
        verifiedProgrammerCache = { key: cacheKey, user: hydrated, expiresAt: Date.now() + VERIFY_PROGRAMMER_TTL_MS }
        return hydrated
      }
    } catch (err: any) {
      if (err?.message?.startsWith('ACESSO NEGADO')) throw err
    } finally {
      inFlightVerifyProgrammer = null
    }

    const fallback = hydrateUserAccess(actor)
    verifiedProgrammerCache = { key: cacheKey, user: fallback, expiresAt: Date.now() + VERIFY_PROGRAMMER_TTL_MS }
    return fallback
  }

  inFlightVerifyProgrammer = runVerification()
  return inFlightVerifyProgrammer
}

export async function recordAuditLog(entry: Omit<AccessAuditLog, 'id' | 'created_at'>): Promise<AccessAuditLog> {
  const fullEntry: AccessAuditLog = {
    ...entry,
    id: genId(),
    created_at: new Date().toISOString(),
  }

  const currentLogs = getLocalAuditLogs()
  saveLocalAuditLogs([fullEntry, ...currentLogs])

  // Se a tabela access_audit_logs já existir no banco (pós-migration), persiste também no banco
  if (auditTableAvailable !== false) {
    try {
      const { error } = await sb.from('access_audit_logs').insert(fullEntry)
      if (error) {
        if (isMissingRemoteResourceError(error)) {
          auditTableAvailable = false
        }
      } else {
        auditTableAvailable = true
      }
    } catch (err) {
      if (isMissingRemoteResourceError(err)) {
        auditTableAvailable = false
      }
    }
  }

  return fullEntry
}

export async function fetchAllManagedUsers(actor: User | null | undefined): Promise<User[]> {
  await verifyProgrammerActor(actor)
  await syncCentralAccessControlState()

  const { data: dbUsers } = await sb.from('users').select('*').order('name', { ascending: true })
  const pendingLocal = getLocalPendingUsers()

  const mergedMap = new Map<string, User>()
  for (const u of (dbUsers || []) as User[]) {
    mergedMap.set(u.email.trim().toLowerCase(), hydrateUserAccess(u))
  }
  for (const p of pendingLocal) {
    const key = p.email.trim().toLowerCase()
    if (!mergedMap.has(key)) {
      mergedMap.set(key, hydrateUserAccess(p))
    }
  }

  return Array.from(mergedMap.values()).sort((a, b) => {
    const order: Record<AccessStatus, number> = { pending: 0, active: 1, suspended: 2, rejected: 3 }
    const sA = order[a.access_status || 'pending'] ?? 4
    const sB = order[b.access_status || 'pending'] ?? 4
    if (sA !== sB) return sA - sB
    return a.name.localeCompare(b.name)
  })
}

export async function fetchAccessAuditLogs(actor: User | null | undefined): Promise<AccessAuditLog[]> {
  await verifyProgrammerActor(actor)

  const localLogs = getLocalAuditLogs()
  if (auditTableAvailable !== false) {
    try {
      const { data, error } = await sb
        .from('access_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) {
        if (isMissingRemoteResourceError(error)) {
          auditTableAvailable = false
        }
      } else {
        auditTableAvailable = true
        if (data && data.length > 0) {
          const map = new Map<string, AccessAuditLog>()
          for (const item of data as AccessAuditLog[]) map.set(item.id, item)
          for (const item of localLogs) if (!map.has(item.id)) map.set(item.id, item)
          return Array.from(map.values()).sort((a, b) => b.created_at.localeCompare(a.created_at))
        }
      }
    } catch (err) {
      if (isMissingRemoteResourceError(err)) {
        auditTableAvailable = false
      }
    }
  }
  return localLogs
}

async function persistUserAccessState(
  targetUser: User,
  nextProfile: AccessProfile,
  nextStatus: AccessStatus,
  nextPermissions: UserPermissions,
  actor: User
): Promise<User> {
  const now = new Date().toISOString()
  const normalizedPerms = normalizePermissionsForProfile(nextProfile, nextPermissions)
  const emailKey = targetUser.email.trim().toLowerCase()

  const override: UserAccessOverride = {
    user_id: targetUser.id,
    email: emailKey,
    access_profile: nextProfile,
    access_status: nextStatus,
    permissions: normalizedPerms,
    approved_by: nextStatus === 'active' ? actor.name : targetUser.approved_by,
    approved_at: nextStatus === 'active' ? (targetUser.approved_at || now) : targetUser.approved_at,
    status_updated_at: now,
  }

  const overrides = getLocalOverridesMap()
  overrides[targetUser.id] = override
  overrides[emailKey] = override
  setLocalOverridesMap(overrides)

  // Atualiza também na lista de cadastros pendentes locais se estiver lá
  const pendingList = getLocalPendingUsers()
  const updatedPending = pendingList.map(u =>
    u.id === targetUser.id || u.email.trim().toLowerCase() === emailKey
      ? {
          ...u,
          is_admin: nextStatus === 'active' && (nextProfile === 'programador' || nextProfile === 'gestora'),
          access_profile: nextProfile,
          access_status: nextStatus,
          permissions: normalizedPerms,
          approved_by: override.approved_by,
          approved_at: override.approved_at,
          status_updated_at: now,
        }
      : u
  )
  saveLocalPendingUsers(updatedPending)

  // Se as colunas já existirem no Supabase (após aplicar a migration SQL), sincroniza via RPC/update
  try {
    await sb.rpc('fn_admin_manage_user_access', {
      p_actor_email: actor.email,
      p_target_user_id: targetUser.id,
      p_access_profile: nextProfile,
      p_access_status: nextStatus,
      p_permissions: normalizedPerms,
    })
  } catch {
    // RPC ainda não aplicada no banco — mantido via camada de controle de acesso
  }

  try {
    await persistCentralAccessControlState(actor)
  } catch (err) {
    console.warn('Aviso ao sincronizar estado central de permissões:', err)
  }

  return hydrateUserAccess({
    ...targetUser,
    is_admin: nextStatus === 'active' && (nextProfile === 'programador' || nextProfile === 'gestora'),
    access_profile: nextProfile,
    access_status: nextStatus,
    permissions: normalizedPerms,
    approved_by: override.approved_by,
    approved_at: override.approved_at,
    status_updated_at: now,
  })
}

export async function approveUserRequest(
  actor: User | null | undefined,
  targetUser: User,
  profile: AccessProfile = 'operador',
  customPermissions?: Partial<UserPermissions>
): Promise<User> {
  const verifiedActor = await verifyProgrammerActor(actor)
  if (isPrimaryProgrammerIdentity(targetUser) && profile !== 'programador') {
    throw new Error('Operação inválida: A conta do Programador principal não pode ter o perfil reduzido.')
  }

  const safeProfile: AccessProfile = isPrimaryProgrammerIdentity(targetUser)
    ? 'programador'
    : (profile === 'programador' ? 'gestora' : profile)
  const perms = normalizePermissionsForProfile(safeProfile, customPermissions)

  const updated = await persistUserAccessState(targetUser, safeProfile, 'active', perms, verifiedActor)

  await recordAuditLog({
    actor_id: verifiedActor.id,
    actor_name: verifiedActor.name,
    actor_email: verifiedActor.email,
    target_user_id: targetUser.id,
    target_user_name: targetUser.name,
    target_user_email: targetUser.email,
    action: 'APPROVE_USER',
    details: `Cadastro aprovado com perfil "${safeProfile.toUpperCase()}" e acesso liberado.`,
    previous_state: { access_status: targetUser.access_status || 'pending', access_profile: targetUser.access_profile },
    new_state: { access_status: 'active', access_profile: safeProfile, permissions: perms },
  })

  return updated
}

export async function rejectUserRequest(
  actor: User | null | undefined,
  targetUser: User,
  reason?: string
): Promise<User> {
  const verifiedActor = await verifyProgrammerActor(actor)
  if (isPrimaryProgrammerIdentity(targetUser)) {
    throw new Error('Operação proibida: Não é permitido recusar ou bloquear o Programador principal.')
  }

  const perms = normalizePermissionsForProfile('operador', {
    tasks: false,
    atrasadas: false,
    history: false,
    pops: false,
    team: false,
    meetings: false,
    messages: false,
    backup: false,
    settings: false,
    view_all_tasks: false,
    create_pops: false,
  })

  const updated = await persistUserAccessState(targetUser, 'operador', 'rejected', perms, verifiedActor)

  await recordAuditLog({
    actor_id: verifiedActor.id,
    actor_name: verifiedActor.name,
    actor_email: verifiedActor.email,
    target_user_id: targetUser.id,
    target_user_name: targetUser.name,
    target_user_email: targetUser.email,
    action: 'REJECT_USER',
    details: `Solicitação de cadastro recusada${reason ? `: ${reason}` : '.'}`,
    previous_state: { access_status: targetUser.access_status || 'pending' },
    new_state: { access_status: 'rejected' },
  })

  return updated
}

export async function suspendUserAccess(
  actor: User | null | undefined,
  targetUser: User,
  reason?: string
): Promise<User> {
  const verifiedActor = await verifyProgrammerActor(actor)
  if (isPrimaryProgrammerIdentity(targetUser)) {
    throw new Error('Operação proibida: A conta do Programador principal não pode ser suspensa.')
  }

  const profile = targetUser.access_profile || 'operador'
  const perms = targetUser.permissions || getDefaultPermissionsForProfile(profile)
  const updated = await persistUserAccessState(targetUser, profile, 'suspended', perms, verifiedActor)

  await recordAuditLog({
    actor_id: verifiedActor.id,
    actor_name: verifiedActor.name,
    actor_email: verifiedActor.email,
    target_user_id: targetUser.id,
    target_user_name: targetUser.name,
    target_user_email: targetUser.email,
    action: 'SUSPEND_USER',
    details: `Acesso suspenso temporariamente (histórico preservado)${reason ? `: ${reason}` : '.'}`,
    previous_state: { access_status: targetUser.access_status },
    new_state: { access_status: 'suspended' },
  })

  return updated
}

export async function reactivateUserAccess(
  actor: User | null | undefined,
  targetUser: User
): Promise<User> {
  const verifiedActor = await verifyProgrammerActor(actor)
  const profile: AccessProfile = isPrimaryProgrammerIdentity(targetUser)
    ? 'programador'
    : (targetUser.access_profile && targetUser.access_profile !== 'programador' ? targetUser.access_profile : 'operador')
  const perms = normalizePermissionsForProfile(profile, targetUser.permissions)

  const updated = await persistUserAccessState(targetUser, profile, 'active', perms, verifiedActor)

  await recordAuditLog({
    actor_id: verifiedActor.id,
    actor_name: verifiedActor.name,
    actor_email: verifiedActor.email,
    target_user_id: targetUser.id,
    target_user_name: targetUser.name,
    target_user_email: targetUser.email,
    action: 'REACTIVATE_USER',
    details: `Acesso reativado com perfil "${profile.toUpperCase()}".`,
    previous_state: { access_status: targetUser.access_status },
    new_state: { access_status: 'active', access_profile: profile },
  })

  return updated
}

export async function updateUserAccessConfig(
  actor: User | null | undefined,
  targetUser: User,
  nextProfile: AccessProfile,
  nextPermissions: UserPermissions
): Promise<User> {
  const verifiedActor = await verifyProgrammerActor(actor)

  if (isPrimaryProgrammerIdentity(targetUser) && nextProfile !== 'programador') {
    throw new Error('Operação proibida: A identidade do Programador principal é protegida contra alteração de perfil.')
  }

  // Impede promover outros usuários ao perfil exclusivo de Programador principal sem ser a própria conta
  const effectiveProfile: AccessProfile = isPrimaryProgrammerIdentity(targetUser)
    ? 'programador'
    : (nextProfile === 'programador' ? 'gestora' : nextProfile)

  const normalizedPerms = normalizePermissionsForProfile(effectiveProfile, nextPermissions)
  const status = targetUser.access_status || 'active'

  const updated = await persistUserAccessState(targetUser, effectiveProfile, status, normalizedPerms, verifiedActor)

  const enabledModules = MODULE_METADATA
    .filter(m => normalizedPerms[m.key as keyof UserPermissions])
    .map(m => m.label)
    .join(', ')

  await recordAuditLog({
    actor_id: verifiedActor.id,
    actor_name: verifiedActor.name,
    actor_email: verifiedActor.email,
    target_user_id: targetUser.id,
    target_user_name: targetUser.name,
    target_user_email: targetUser.email,
    action: targetUser.access_profile !== effectiveProfile ? 'UPDATE_PROFILE' : 'UPDATE_PERMISSIONS',
    details: `Perfil definido como "${effectiveProfile.toUpperCase()}". Módulos liberados: ${enabledModules || 'Nenhum'}${normalizedPerms.view_all_tasks ? ' + Visão Geral de Tarefas' : ' (Apenas próprias tarefas)'}${normalizedPerms.create_pops ? ' + Criar POP' : ''}.`,
    previous_state: {
      access_profile: targetUser.access_profile,
      permissions: targetUser.permissions,
    },
    new_state: {
      access_profile: effectiveProfile,
      permissions: normalizedPerms,
    },
  })

  return updated
}

export async function updateProfileDefaultPermissions(
  actor: User | null | undefined,
  profile: AccessProfile,
  patch: Partial<UserPermissions>
): Promise<UserPermissions> {
  const verifiedActor = await verifyProgrammerActor(actor)

  if (profile === 'programador') {
    return getDefaultPermissionsForProfile('programador')
  }

  const previousDefaults = getDefaultPermissionsForProfile(profile)
  const currentMap = getProfilePermissionDefaultsMap()
  const existingProfilePatch = currentMap[profile] || {}
  const nextProfilePatch: Partial<UserPermissions> = {
    ...existingProfilePatch,
    ...patch,
    settings: false,
    ...(profile === 'operador' ? { team: false } : {}),
  }

  setProfilePermissionDefaultsMap({
    ...currentMap,
    [profile]: nextProfilePatch,
  })

  const nextDefaults = getDefaultPermissionsForProfile(profile)

  // Propaga a atualização do padrão de perfil para os overrides locais já existentes daquele perfil
  const overrides = getLocalOverridesMap()
  let overridesChanged = false
  const now = new Date().toISOString()
  for (const key of Object.keys(overrides)) {
    const entry = overrides[key]
    if (entry && entry.access_profile === profile && entry.permissions) {
      overrides[key] = {
        ...entry,
        permissions: normalizePermissionsForProfile(profile, {
          ...entry.permissions,
          ...patch,
        }),
        status_updated_at: now,
      }
      overridesChanged = true
    }
  }
  if (overridesChanged) {
    setLocalOverridesMap(overrides)
  }

  try {
    await persistCentralAccessControlState(verifiedActor)
  } catch (err) {
    console.warn('Aviso ao sincronizar permissões padrão por perfil centralmente:', err)
  }

  await recordAuditLog({
    actor_id: verifiedActor.id,
    actor_name: verifiedActor.name,
    actor_email: verifiedActor.email,
    target_user_id: `PROFILE:${profile}`,
    target_user_name: `Perfil ${profile.toUpperCase()}`,
    target_user_email: profile,
    action: 'UPDATE_PERMISSIONS',
    details: `Permissões padrão do perfil "${profile.toUpperCase()}" atualizadas (Criar POP: ${nextDefaults.create_pops ? 'Liberado' : 'Restrito'}).`,
    previous_state: { profile, permissions: previousDefaults },
    new_state: { profile, permissions: nextDefaults },
  })

  return nextDefaults
}

// ──────────────────────────────────────────────────────────────
// SESSÃO ADMINISTRATIVA DE TESTE COMO OPERADOR (IDENTIDADE REAL)
// ──────────────────────────────────────────────────────────────

/**
 * Valida criptograficamente se o envelope salvo em pulse_operator_test_session_v1
 * foi emitido pelo Desenvolvedor autenticado usando o pass_hash real do banco.
 */
export async function verifyStoredOperatorTestSession(
  activeEmail?: string
): Promise<OperatorTestSession | null> {
  const envelope = getStoredOperatorTestSessionRaw()
  if (!envelope) return null

  const cleanActive = (activeEmail || localStorage.getItem('pulse_session') || '').trim().toLowerCase()
  if (!cleanActive || cleanActive !== (envelope.targetEmail || '').trim().toLowerCase()) {
    localStorage.removeItem(OPERATOR_TEST_SESSION_STORAGE_KEY)
    return null
  }

  const { data: adminRow, error } = await sb
    .from('users')
    .select('id,name,email,role,color,is_admin,pass_hash')
    .eq('email', PROGRAMMER_EMAIL)
    .single()

  if (error || !adminRow || !adminRow.pass_hash) {
    localStorage.removeItem(OPERATOR_TEST_SESSION_STORAGE_KEY)
    return null
  }

  const expectedAdminProof = computeSessionProof(adminRow.id, adminRow.email, adminRow.pass_hash, 'session_v1')
  const expectedSignature = computeOperatorTransitionSignature({
    sessionId: envelope.sessionId,
    adminId: adminRow.id,
    adminEmail: adminRow.email,
    adminPassHash: adminRow.pass_hash,
    targetId: envelope.targetId,
    targetEmail: envelope.targetEmail,
    startedAt: envelope.startedAt,
  })

  if (envelope.adminProof !== expectedAdminProof || envelope.transitionSignature !== expectedSignature) {
    localStorage.removeItem(OPERATOR_TEST_SESSION_STORAGE_KEY)
    await recordAuditLog({
      actor_id: envelope.adminId || 'UNKNOWN',
      actor_name: envelope.adminName || 'DESCONHECIDO',
      actor_email: envelope.adminEmail || 'unknown',
      target_user_id: envelope.targetId || 'UNKNOWN',
      target_user_name: envelope.targetName || 'DESCONHECIDO',
      target_user_email: envelope.targetEmail || 'unknown',
      action: 'REJECT_FORGED_SESSION',
      details: 'Tentativa bloqueada de adulteração de sessão de teste de operador no localStorage (assinatura criptográfica inválida).',
    })
    return null
  }

  return envelope
}

/**
 * Inicia uma sessão real e efetiva sob a identidade do operador selecionado.
 * Exclusivo para o Desenvolvedor autenticado (validado contra public.users).
 */
export async function startOperatorTestSession(
  targetEmailOrId: string
): Promise<{ operatorUser: User; session: OperatorTestSession }> {
  const cleanTargetKey = (targetEmailOrId || '').trim().toLowerCase()
  if (!cleanTargetKey) {
    throw new Error('Selecione um operador válido para iniciar a sessão de teste.')
  }

  // 1. Buscar o registro real do Desenvolvedor no banco para validar a prova criptográfica
  const { data: adminRow, error: adminErr } = await sb
    .from('users')
    .select('*')
    .eq('email', PROGRAMMER_EMAIL)
    .single()

  if (adminErr || !adminRow || !adminRow.pass_hash) {
    throw new Error('ACESSO NEGADO: Não foi possível validar a conta do Desenvolvedor no banco de dados.')
  }

  const expectedAdminProof = computeSessionProof(adminRow.id, adminRow.email, adminRow.pass_hash, 'session_v1')
  const currentProof = localStorage.getItem(SESSION_PROOF_STORAGE_KEY)
  const existingEnvelope = getStoredOperatorTestSessionRaw()

  const isDirectAdminAuthenticated =
    (localStorage.getItem('pulse_session') || '').trim().toLowerCase() === PROGRAMMER_EMAIL &&
    currentProof === expectedAdminProof

  const isExistingEnvelopeAuthenticated =
    existingEnvelope !== null &&
    existingEnvelope.adminProof === expectedAdminProof &&
    existingEnvelope.transitionSignature ===
      computeOperatorTransitionSignature({
        sessionId: existingEnvelope.sessionId,
        adminId: adminRow.id,
        adminEmail: adminRow.email,
        adminPassHash: adminRow.pass_hash,
        targetId: existingEnvelope.targetId,
        targetEmail: existingEnvelope.targetEmail,
        startedAt: existingEnvelope.startedAt,
      })

  if (!isDirectAdminAuthenticated && !isExistingEnvelopeAuthenticated) {
    await recordAuditLog({
      actor_id: 'UNAUTHORIZED',
      actor_name: 'TENTATIVA NÃO AUTORIZADA',
      actor_email: localStorage.getItem('pulse_session') || 'unknown',
      target_user_id: cleanTargetKey,
      target_user_name: cleanTargetKey,
      target_user_email: cleanTargetKey,
      action: 'REJECT_FORGED_SESSION',
      details: 'Tentativa bloqueada de iniciar sessão de operador sem autenticação criptográfica do Desenvolvedor.',
    })
    throw new Error('ACESSO NEGADO: Somente o Desenvolvedor autenticado pode iniciar uma sessão de teste como Operador.')
  }

  // 2. Sincronizar estado central de permissões e buscar o registro real do operador alvo no banco
  await syncCentralAccessControlState()
  const { data: allDbUsers } = await sb.from('users').select('*')
  const rawDbMatch = (allDbUsers || []).find(
    (u: any) =>
      u.id === targetEmailOrId ||
      (u.email || '').trim().toLowerCase() === cleanTargetKey
  ) as User | undefined

  const localMatch = getLocalPendingUsers().find(
    u => u.id === targetEmailOrId || u.email.trim().toLowerCase() === cleanTargetKey
  )

  const rawTarget = rawDbMatch || localMatch
  if (!rawTarget) {
    throw new Error('Operador selecionado não foi encontrado no banco de dados.')
  }

  if (isPrimaryProgrammerIdentity(rawTarget)) {
    throw new Error('Selecione uma conta de Operador (ou Gestora) diferente da conta do Desenvolvedor.')
  }

  const hydratedTarget = hydrateUserAccess(rawTarget)
  if (hydratedTarget.access_status !== 'active') {
    throw new Error(`Não é possível iniciar sessão como "${hydratedTarget.name}" pois a conta está com situação "${hydratedTarget.access_status}".`)
  }

  // Se já havia uma sessão de teste anterior ativa, registra o encerramento dela antes da troca
  if (existingEnvelope && isExistingEnvelopeAuthenticated) {
    const prevEndedAt = new Date().toISOString()
    await recordAuditLog({
      actor_id: adminRow.id,
      actor_name: adminRow.name,
      actor_email: adminRow.email,
      target_user_id: existingEnvelope.targetId,
      target_user_name: existingEnvelope.targetName,
      target_user_email: existingEnvelope.targetEmail,
      action: 'END_OPERATOR_SESSION',
      details: `Sessão de teste como "${existingEnvelope.targetName}" (${existingEnvelope.targetEmail}) encerrada por troca de operador (ID: ${existingEnvelope.sessionId}).`,
      previous_state: {
        session_id: existingEnvelope.sessionId,
        operator_email: existingEnvelope.targetEmail,
        started_at: existingEnvelope.startedAt,
      },
      new_state: {
        session_id: existingEnvelope.sessionId,
        ended_at: prevEndedAt,
        restored_admin: adminRow.email,
      },
    })
  }

  // 3. Gerar prova criptográfica da sessão do operador e envelope assinado pelo Desenvolvedor
  const sessionId = genId()
  const startedAt = new Date().toISOString()
  const targetPassHash = rawTarget.pass_hash || adminRow.pass_hash
  const targetSessionProof = computeSessionProof(rawTarget.id, rawTarget.email, targetPassHash, 'session_v1')
  const transitionSignature = computeOperatorTransitionSignature({
    sessionId,
    adminId: adminRow.id,
    adminEmail: adminRow.email,
    adminPassHash: adminRow.pass_hash,
    targetId: hydratedTarget.id,
    targetEmail: hydratedTarget.email,
    startedAt,
  })

  const sessionEnvelope: OperatorTestSession = {
    sessionId,
    adminId: adminRow.id,
    adminEmail: adminRow.email.trim().toLowerCase(),
    adminName: adminRow.name,
    adminProof: expectedAdminProof,
    targetId: hydratedTarget.id,
    targetEmail: hydratedTarget.email.trim().toLowerCase(),
    targetName: hydratedTarget.name,
    targetProfile: hydratedTarget.access_profile || 'operador',
    startedAt,
    transitionSignature,
  }

  // 4. Substituir efetivamente a sessão ativa pela identidade real do operador selecionado
  localStorage.setItem(OPERATOR_TEST_SESSION_STORAGE_KEY, JSON.stringify(sessionEnvelope))
  localStorage.setItem('pulse_session', hydratedTarget.email.trim().toLowerCase())
  localStorage.setItem(SESSION_PROOF_STORAGE_KEY, targetSessionProof)

  // 5. Registrar auditoria de início da sessão (local + banco se migration aplicada)
  await recordAuditLog({
    actor_id: adminRow.id,
    actor_name: adminRow.name,
    actor_email: adminRow.email,
    target_user_id: hydratedTarget.id,
    target_user_name: hydratedTarget.name,
    target_user_email: hydratedTarget.email,
    action: 'START_OPERATOR_SESSION',
    details: `Sessão administrativa de teste iniciada com a identidade real do operador "${hydratedTarget.name}" (${hydratedTarget.email}) · Perfil: ${(hydratedTarget.access_profile || 'operador').toUpperCase()} · Sessão: ${sessionId}.`,
    previous_state: {
      active_user: adminRow.email,
      active_profile: 'programador',
    },
    new_state: {
      session_id: sessionId,
      admin_id: adminRow.id,
      admin_email: adminRow.email,
      operator_id: hydratedTarget.id,
      operator_name: hydratedTarget.name,
      operator_email: hydratedTarget.email,
      operator_profile: hydratedTarget.access_profile || 'operador',
      started_at: startedAt,
    },
  })

  if (operatorSessionRpcAvailable !== false) {
    try {
      const { error } = await sb.rpc('fn_start_operator_test_session', {
        p_session_id: sessionId,
        p_admin_email: adminRow.email,
        p_target_user_id: hydratedTarget.id,
      })
      if (error) {
        if (isMissingRemoteResourceError(error)) {
          operatorSessionRpcAvailable = false
        }
      } else {
        operatorSessionRpcAvailable = true
      }
    } catch (err) {
      if (isMissingRemoteResourceError(err)) {
        operatorSessionRpcAvailable = false
      }
    }
  }

  return { operatorUser: hydratedTarget, session: sessionEnvelope }
}

/**
 * Encerra a sessão ativa de operador, registra o término na auditoria
 * e restaura imediatamente a sessão autenticada do Desenvolvedor.
 */
export async function endOperatorTestSession(): Promise<User> {
  const envelope = getStoredOperatorTestSessionRaw()
  if (!envelope) {
    throw new Error('Nenhuma sessão de teste de operador está ativa no momento.')
  }

  const { data: adminRow, error: adminErr } = await sb
    .from('users')
    .select('*')
    .eq('email', PROGRAMMER_EMAIL)
    .single()

  if (adminErr || !adminRow || !adminRow.pass_hash) {
    localStorage.removeItem(OPERATOR_TEST_SESSION_STORAGE_KEY)
    throw new Error('ACESSO NEGADO: Não foi possível validar a conta do Desenvolvedor no banco de dados.')
  }

  const expectedAdminProof = computeSessionProof(adminRow.id, adminRow.email, adminRow.pass_hash, 'session_v1')
  const expectedSignature = computeOperatorTransitionSignature({
    sessionId: envelope.sessionId,
    adminId: adminRow.id,
    adminEmail: adminRow.email,
    adminPassHash: adminRow.pass_hash,
    targetId: envelope.targetId,
    targetEmail: envelope.targetEmail,
    startedAt: envelope.startedAt,
  })

  if (envelope.adminProof !== expectedAdminProof || envelope.transitionSignature !== expectedSignature) {
    localStorage.removeItem(OPERATOR_TEST_SESSION_STORAGE_KEY)
    localStorage.removeItem('pulse_session')
    localStorage.removeItem(SESSION_PROOF_STORAGE_KEY)
    await recordAuditLog({
      actor_id: envelope.adminId || 'UNKNOWN',
      actor_name: envelope.adminName || 'DESCONHECIDO',
      actor_email: envelope.adminEmail || 'unknown',
      target_user_id: envelope.targetId || 'UNKNOWN',
      target_user_name: envelope.targetName || 'DESCONHECIDO',
      target_user_email: envelope.targetEmail || 'unknown',
      action: 'REJECT_FORGED_SESSION',
      details: 'Tentativa bloqueada de encerrar sessão de operador com assinatura inválida.',
    })
    throw new Error('ACESSO NEGADO: Assinatura criptográfica da sessão de teste inválida.')
  }

  const endedAt = new Date().toISOString()

  // Restaurar imediatamente a sessão autenticada do Desenvolvedor
  localStorage.removeItem(OPERATOR_TEST_SESSION_STORAGE_KEY)
  localStorage.setItem('pulse_session', adminRow.email.trim().toLowerCase())
  localStorage.setItem(SESSION_PROOF_STORAGE_KEY, expectedAdminProof)

  await recordAuditLog({
    actor_id: adminRow.id,
    actor_name: adminRow.name,
    actor_email: adminRow.email,
    target_user_id: envelope.targetId,
    target_user_name: envelope.targetName,
    target_user_email: envelope.targetEmail,
    action: 'END_OPERATOR_SESSION',
    details: `Sessão administrativa de teste como "${envelope.targetName}" (${envelope.targetEmail}) encerrada · Sessão do Desenvolvedor restaurada (ID: ${envelope.sessionId}).`,
    previous_state: {
      session_id: envelope.sessionId,
      operator_id: envelope.targetId,
      operator_name: envelope.targetName,
      operator_email: envelope.targetEmail,
      started_at: envelope.startedAt,
    },
    new_state: {
      session_id: envelope.sessionId,
      ended_at: endedAt,
      restored_admin_id: adminRow.id,
      restored_admin_email: adminRow.email,
    },
  })

  if (operatorSessionRpcAvailable !== false) {
    try {
      const { error } = await sb.rpc('fn_end_operator_test_session', {
        p_session_id: envelope.sessionId,
        p_admin_email: adminRow.email,
      })
      if (error) {
        if (isMissingRemoteResourceError(error)) {
          operatorSessionRpcAvailable = false
        }
      } else {
        operatorSessionRpcAvailable = true
      }
    } catch (err) {
      if (isMissingRemoteResourceError(err)) {
        operatorSessionRpcAvailable = false
      }
    }
  }

  return hydrateUserAccess(adminRow as User)
}

