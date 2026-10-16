export interface User {
  id: string
  name: string
  role: string
  email: string
  pass_hash: string
  color: string
  is_admin: boolean
  avatar?: string
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

export interface PopStep {
  id: string
  order: number
  title: string
  instruction: string
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
  pop_id?: string           // ID do POP associado à tarefa
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

export type Page = 'tasks' | 'team' | 'history' | 'atrasadas' | 'meetings' | 'messages' | 'backup' | 'pops'
export type ViewMode = 'list' | 'kanban' | 'agenda'
export type FilterMode = 'all' | 'open' | 'late' | 'alta'

