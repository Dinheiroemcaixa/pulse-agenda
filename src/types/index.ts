export type AccessProfile = 'programador' | 'gestora' | 'operador'
export type AccessStatus = 'active' | 'pending' | 'suspended' | 'rejected'
export type AppModule = 'tasks' | 'atrasadas' | 'history' | 'pops' | 'team' | 'meetings' | 'messages' | 'backup' | 'settings'

export interface UserPermissions {
  tasks: boolean
  atrasadas: boolean
  history: boolean
  pops: boolean
  team: boolean
  meetings: boolean
  messages: boolean
  backup: boolean
  settings: boolean
  view_all_tasks: boolean
}

export type AccessAuditAction =
  | 'APPROVE_USER'
  | 'REJECT_USER'
  | 'SUSPEND_USER'
  | 'REACTIVATE_USER'
  | 'UPDATE_PERMISSIONS'
  | 'UPDATE_PROFILE'
  | 'START_OPERATOR_SESSION'
  | 'END_OPERATOR_SESSION'
  | 'REJECT_FORGED_SESSION'

export interface AccessAuditLog {
  id: string
  actor_id: string
  actor_name: string
  actor_email: string
  target_user_id: string
  target_user_name: string
  target_user_email: string
  action: AccessAuditAction
  details: string
  previous_state?: Record<string, unknown>
  new_state?: Record<string, unknown>
  created_at: string
}

export interface OperatorTestSession {
  sessionId: string
  adminId: string
  adminEmail: string
  adminName: string
  adminProof: string
  targetId: string
  targetEmail: string
  targetName: string
  targetProfile: AccessProfile
  startedAt: string
  endedAt?: string
  transitionSignature: string
}


export interface User {
  id: string
  name: string
  role: string
  email: string
  pass_hash: string
  color: string
  is_admin: boolean
  avatar?: string
  access_profile?: AccessProfile
  access_status?: AccessStatus
  permissions?: UserPermissions
  created_at?: string
  approved_by?: string
  approved_at?: string
  status_updated_at?: string
}

export interface TeamMember {
  id: string
  name: string
  role: string
  email: string
  color: string
  is_admin: boolean
}

export interface Subtask {
  text: string
  done: boolean
}

export interface PopStepMedia {
  id?: string
  name: string
  url?: string
  external_url?: string
  storage_bucket?: string
  storage_path?: string
  mime_type?: string
  file_size_bytes?: number
  content_hash?: string
  type: 'image' | 'video' | 'doc'
  size?: string
  extension?: string
}

export interface PopStep {
  id: string
  order: number
  title: string
  instruction: string
  media?: PopStepMedia[]
  tip?: string
  tipType?: 'info' | 'warn'
}

export interface Pop {
  id: string
  title: string
  objective: string
  when_to_use: string
  prerequisites: string
  steps: PopStep[]
  cautions: string
  expected_result: string
  contact_notes?: string
  responsible?: string
  estimated_time?: string
  active: boolean
  version: number
  created_at: string
  updated_at: string
}

export type RecurType = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'custom'
export type Priority = 'Alta' | 'Média' | 'Baixa'
export type TaskStatus = 'Em Aberto' | 'Em Andamento' | 'Concluída' | 'Atrasada'

export interface Task {
  id: string
  descricao: string
  resp: string
  date: string
  prio: Priority
  status: TaskStatus
  all_day: boolean
  time_start?: string
  time_end?: string
  tags?: string[]
  recur: RecurType
  recur_days?: string[]
  recur_start?: string
  recur_group_id?: string   // ID da série recorrente
  subtasks: Subtask[]
  notes?: string
  is_meeting: boolean
  sort_order: number
  completed_at?: string
  moved_at?: string
  created_at?: string
  isVirtual?: boolean       // true = gerada no front-end, não existe no banco ainda
  pop_id?: string | null    // ID do POP associado à tarefa (ou null quando desvinculado)
}

export interface Meeting {
  id: string
  title: string
  date: string
  time: string
  resp: string
  parts: string[]
  notes?: string
  created_at?: string
}

export interface Tag {
  id: string
  name: string
  color: string
  bg: string
}

export interface Backup {
  id: string
  backup_date: string
  backup_label: string
  created_at: string
}

export type Page = 'tasks' | 'team' | 'history' | 'atrasadas' | 'meetings' | 'messages' | 'backup' | 'pops' | 'settings'
export type ViewMode = 'list' | 'kanban' | 'agenda'
export type FilterMode = 'all' | 'open' | 'late' | 'alta'


