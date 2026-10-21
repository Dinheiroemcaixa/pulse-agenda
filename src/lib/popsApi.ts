import { sb } from './supabase'
import { genId } from './utils'
import type { Pop, PopStep, Task } from '../types'

const POPS_LOCAL_STORAGE_KEY = 'pulse_pops_cache_v4'
const TASK_POP_LINKS_KEY = 'pulse_task_pop_links_v1'

// POPs iniciais modelo para a equipe de BPO Financeiro
export const DEFAULT_POPS: Pop[] = [
  {
    id: 'pop_fechamento_caixa',
    title: 'POP — Fechamento Diário de Caixa dos Clientes',
    objective: 'Garantir que todas as entradas e saídas do dia estejam conferidas com os extratos bancários e sem divergências.',
    when_to_use: 'Diariamente ao final do expediente ou no início do dia subsequente para conferência do saldo.',
    prerequisites: 'Acesso ao internet banking dos clientes; Sistema ERP; Extrato consolidado OFX/PDF',
    steps: [
      {
        id: 's1',
        order: 1,
        title: 'Baixar Extratos Bancários',
        instruction: 'Acessar a conta bancária de cada cliente e exportar o extrato diário em formato PDF ou OFX.',
        media: [
          { name: 'Exportar extrato OFX · 1:42', type: 'video' },
          { name: 'Menu Extrato', type: 'image' },
          { name: 'Lista de contas por cliente.xlsx', type: 'doc', size: '48 KB', extension: 'XLSX' }
        ],
        tip: 'Segunda-feira: exporte o período de sexta a domingo.',
        tipType: 'info'
      },
      {
        id: 's2',
        order: 2,
        title: 'Conferir Lançamentos no ERP',
        instruction: 'Verificar se todas as despesas e receitas lançadas no sistema correspondem exatamente aos débitos e créditos do extrato.',
        media: [
          { name: 'Tela de conciliação ERP', type: 'image' },
          { name: 'Sugestões de match', type: 'image' }
        ]
      },
      {
        id: 's3',
        order: 3,
        title: 'Identificar Pendências e DDA',
        instruction: 'Separar quaisquer lançamentos não identificados e consultar o responsável ou cliente pelo canal interno.',
        media: [
          { name: 'Consultar o DDA · 2:10', type: 'video' }
        ]
      },
      {
        id: 's4',
        order: 4,
        title: 'Validar Saldo Final',
        instruction: 'Garantir que o saldo final do sistema coincida até os centavos com o saldo real da conta.',
        media: [
          { name: 'Saldo ERP x extrato', type: 'image' },
          { name: 'Modelo relatório divergências.pdf', type: 'doc', size: '212 KB', extension: 'PDF' }
        ],
        tip: 'Se houver diferença, não feche a tarefa — registre a divergência.',
        tipType: 'warn'
      }
    ],
    cautions: 'Nunca alterar lançamentos de dias anteriores já conciliados sem autorização expressa da coordenação.',
    expected_result: 'Todas as contas bancárias com status "Conciliado" e relatório de divergências zerado.',
    contact_notes: 'Gestora Financeira Raffaela Lima',
    responsible: 'Raffaela Lima',
    estimated_time: '30 min',
    active: true,
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'pop_agendamento_pix_ted',
    title: 'Programação de Pagamentos e PIX/TED',
    objective: 'Efetuar a programação de contas a pagar no internet banking dentro dos prazos de desconto e vencimento.',
    when_to_use: 'Sempre que houver boletos ou pagamentos aprovados para a data presente ou datas futuras.',
    prerequisites: 'Comprovante de autorização de pagamento do cliente; Chave PIX ou código de barras conferido; Acesso ao Internet Banking',
    steps: [
      {
        id: 's1',
        order: 1,
        title: 'Conferir Favorecido e Valor',
        instruction: 'Verificar se o nome do beneficiário e o valor coincidem com o documento fiscal original.',
        media: [
          { name: 'Conferência de boleto x NF', type: 'image' },
          { name: 'Planilha de pagamentos aprovados.xlsx', type: 'doc', size: '64 KB', extension: 'XLSX' }
        ],
        tip: 'Confira sempre o CNPJ do favorecido antes de confirmar o agendamento.',
        tipType: 'info'
      },
      {
        id: 's2',
        order: 2,
        title: 'Agendar no Internet Banking',
        instruction: 'Inserir a data exata de débito e anexar a descrição padronizada da despesa.',
        media: [
          { name: 'Agendar PIX/TED no banco · 1:15', type: 'video' }
        ]
      },
      {
        id: 's3',
        order: 3,
        title: 'Gerar Comprovante de Agendamento',
        instruction: 'Salvar o comprovante em PDF na pasta de pagamentos do cliente e notificar a autorização.',
        media: [
          { name: 'Comprovante_Agendamento.pdf', type: 'doc', size: '128 KB', extension: 'PDF' }
        ],
        tip: 'Se o pagamento exigir dupla aprovação, avise imediatamente o gestor financeiro.',
        tipType: 'warn'
      }
    ],
    cautions: 'Conferir atentamente os dígitos da chave PIX e data de débito para não antecipar saídas indevidamente.',
    expected_result: 'Pagamentos programados com comprovante arquivado e sem encargos por atraso.',
    contact_notes: 'Gestora Financeira Raffaela Lima',
    responsible: 'Raffaela Lima',
    estimated_time: '15 min',
    active: true,
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
]

function hydrateBuiltInPops(list: Pop[]): Pop[] {
  const result = [...list]
  for (const defPop of DEFAULT_POPS) {
    const idx = result.findIndex(p => p.id === defPop.id)
    if (idx === -1) {
      result.push(defPop)
    } else {
      const cur = result[idx]
      const hasValidSteps =
        Array.isArray(cur.steps) &&
        cur.steps.length > 0 &&
        cur.steps.some(s => Boolean(s?.title?.trim() || s?.instruction?.trim()))
      if ((cur.version || 1) <= 1 && !hasValidSteps) {
        result[idx] = {
          ...defPop,
          ...cur,
          estimated_time: cur.estimated_time || defPop.estimated_time || '30 min',
          steps: defPop.steps
        }
      } else {
        result[idx] = {
          ...cur,
          estimated_time: cur.estimated_time || defPop.estimated_time || '30 min'
        }
      }
    }
  }
  return result
}

// Carrega POPs do cache local
export function getLocalPops(): Pop[] {
  try {
    // Limpa caches legados desatualizados para garantir carregamento do layout novo
    localStorage.removeItem('pulse_pops_cache_v1')
    localStorage.removeItem('pulse_pops_cache_v2')
    localStorage.removeItem('pulse_pops_cache_v3')
    const raw = localStorage.getItem(POPS_LOCAL_STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(POPS_LOCAL_STORAGE_KEY, JSON.stringify(DEFAULT_POPS))
      return DEFAULT_POPS
    }
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.setItem(POPS_LOCAL_STORAGE_KEY, JSON.stringify(DEFAULT_POPS))
      return DEFAULT_POPS
    }
    const hydrated = hydrateBuiltInPops(parsed)
    localStorage.setItem(POPS_LOCAL_STORAGE_KEY, JSON.stringify(hydrated))
    return hydrated
  } catch {
    return DEFAULT_POPS
  }
}

// Salva POPs no cache local com proteção contra estouro de quota (Data URLs grandes)
function setLocalPops(pops: Pop[]): void {
  try {
    localStorage.setItem(POPS_LOCAL_STORAGE_KEY, JSON.stringify(pops))
  } catch (e) {
    console.warn('Limite de localStorage atingido para POPs; salvando versão compacta sem Data URLs pesadas:', e)
    try {
      const compactPops = pops.map(p => ({
        ...p,
        steps: (p.steps || []).map(s => ({
          ...s,
          media: (s.media || []).map(m => ({
            ...m,
            url:
              m.url && m.url.startsWith('data:') && m.url.length > 131072
                ? undefined
                : m.url
          }))
        }))
      }))
      localStorage.setItem(POPS_LOCAL_STORAGE_KEY, JSON.stringify(compactPops))
    } catch (innerErr) {
      console.error('Erro ao salvar POPs no localStorage:', innerErr)
    }
  }
}

// Mapa de vínculos Tarefa <-> POP (fallback quando a coluna ainda não existe no Supabase)
export function getLocalTaskPopLinks(): Record<string, string> {
  try {
    const raw = localStorage.getItem(TASK_POP_LINKS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function setLocalTaskPopLink(taskId: string, popId: string | null): void {
  try {
    const links = getLocalTaskPopLinks()
    if (!popId) {
      delete links[taskId]
    } else {
      links[taskId] = popId
    }
    localStorage.setItem(TASK_POP_LINKS_KEY, JSON.stringify(links))
  } catch (e) {
    console.error('Erro ao salvar vínculo de POP:', e)
  }
}

// ──────────────────────────────────────────────────────────────
// API DE POPS COM GRACEFUL DEGRADATION
// ──────────────────────────────────────────────────────────────

export async function fetchPopsApi(): Promise<Pop[]> {
  try {
    const { data, error } = await sb.from('pops').select('*').order('title', { ascending: true })
    if (error || !data || data.length === 0) {
      // Tabela ainda não existe ou está vazia no Supabase — fallback suave para local hidratado
      return getLocalPops()
    }
    const localSnapshot = getLocalPops()
    const remoteFormatted = data.map((p: any) => {
      const localMatch = localSnapshot.find(lp => lp.id === p.id)
      const parsedSteps = typeof p.steps === 'string' ? JSON.parse(p.steps) : (p.steps || [])
      if (localMatch && (localMatch.version || 1) > (p.version || 1)) {
        return localMatch
      }
      return {
        ...p,
        estimated_time: p.estimated_time || localMatch?.estimated_time || '30 min',
        steps: parsedSteps
      }
    }) as Pop[]
    // Preserva POPs locais que ainda não tenham sido sincronizados no banco
    for (const lp of localSnapshot) {
      if (!remoteFormatted.some(rp => rp.id === lp.id)) {
        remoteFormatted.push(lp)
      }
    }
    const formatted = hydrateBuiltInPops(remoteFormatted)
    setLocalPops(formatted)
    return formatted
  } catch {
    return getLocalPops()
  }
}

export async function savePopApi(popData: Partial<Pop>, editId?: string): Promise<Pop> {
  const localList = getLocalPops()
  const now = new Date().toISOString()

  let finalPop: Pop

  if (editId) {
    const existing = localList.find(p => p.id === editId)
    finalPop = {
      ...existing,
      ...popData,
      id: editId,
      estimated_time: (popData.estimated_time || existing?.estimated_time || '30 min').trim(),
      version: (existing?.version || 1) + 1,
      created_at: existing?.created_at || now,
      updated_at: now
    } as Pop
  } else {
    finalPop = {
      id: genId(),
      title: (popData.title || '').trim(),
      objective: (popData.objective || '').trim(),
      when_to_use: (popData.when_to_use || '').trim(),
      prerequisites: (popData.prerequisites || '').trim(),
      steps: popData.steps || [],
      cautions: (popData.cautions || '').trim(),
      expected_result: (popData.expected_result || '').trim(),
      contact_notes: (popData.contact_notes || '').trim(),
      responsible: (popData.responsible || '').trim(),
      estimated_time: (popData.estimated_time || '30 min').trim(),
      active: popData.active !== undefined ? popData.active : true,
      version: 1,
      created_at: now,
      updated_at: now
    }
  }

  // Tenta persistir no Supabase (compatível com as colunas da tabela pops e JSONB de steps)
  try {
    const sanitizedSteps = (finalPop.steps || []).map(s => ({
      ...s,
      media: (s.media || []).map(m => ({
        ...m,
        url: m.url && m.url.startsWith('blob:') ? undefined : m.url
      }))
    }))
    const payload = {
      id: finalPop.id,
      title: finalPop.title,
      objective: finalPop.objective,
      when_to_use: finalPop.when_to_use,
      prerequisites: finalPop.prerequisites,
      steps: sanitizedSteps,
      cautions: finalPop.cautions,
      expected_result: finalPop.expected_result,
      contact_notes: finalPop.contact_notes || '',
      responsible: finalPop.responsible || '',
      active: finalPop.active,
      version: finalPop.version,
      created_at: finalPop.created_at,
      updated_at: finalPop.updated_at
    }
    await sb.from('pops').upsert(payload, { onConflict: 'id' })
  } catch (err) {
    console.warn('Persistindo POP localmente (aguardando migração do banco):', err)
  }

  // Salva no cache local
  const existsInLocal = editId && localList.some(p => p.id === editId)
  const updatedList = existsInLocal
    ? localList.map(p => p.id === editId ? finalPop : p)
    : [finalPop, ...localList]
  setLocalPops(updatedList)

  return finalPop
}

export async function togglePopActiveApi(id: string, currentActive: boolean): Promise<boolean> {
  const localList = getLocalPops()
  const nextActive = !currentActive
  const now = new Date().toISOString()

  try {
    await sb.from('pops').update({ active: nextActive, updated_at: now }).eq('id', id)
  } catch (err) {
    console.warn('Atualizando status ativo localmente:', err)
  }

  const updated = localList.map(p => p.id === id ? { ...p, active: nextActive, updated_at: now } : p)
  setLocalPops(updated)
  return true
}

export async function deletePopApi(id: string): Promise<boolean> {
  const localList = getLocalPops()

  try {
    await sb.from('pops').delete().eq('id', id)
  } catch (err) {
    console.warn('Excluindo POP localmente:', err)
  }

  const updated = localList.filter(p => p.id !== id)
  setLocalPops(updated)
  return true
}

// Vincula POP a uma tarefa
export async function linkTaskToPopApi(taskId: string, popId: string | null): Promise<void> {
  // Salva no mapa local para persistência garantida
  setLocalTaskPopLink(taskId, popId)

  // Se a tarefa não for virtual, tenta atualizar no Supabase
  if (!taskId.startsWith('virtual_')) {
    try {
      await sb.from('tasks').update({ pop_id: popId }).eq('id', taskId)
    } catch {
      // Coluna pop_id pode ainda não ter sido adicionada pelo admin no Supabase
    }
  }
}

// Resolve o pop_id de uma tarefa (objeto ou mapa local)
export function resolveTaskPopId(taskOrId: Task | string | undefined | null, localLinks?: Record<string, string>): string | undefined {
  if (!taskOrId) return undefined
  const links = localLinks || getLocalTaskPopLinks()
  if (typeof taskOrId === 'object') {
    if (taskOrId.pop_id) return taskOrId.pop_id
    if (links[taskOrId.id]) return links[taskOrId.id]
    if (taskOrId.descricao && links[taskOrId.descricao.trim()]) return links[taskOrId.descricao.trim()]

    const desc = (taskOrId.descricao || '').toLowerCase()
    if (desc.includes('pagamento') || desc.includes('pix') || desc.includes('ted') || desc.includes('boleto') || desc.includes('agendamento')) {
      return 'pop_agendamento_pix_ted'
    }
    return 'pop_fechamento_caixa'
  }
  if (links[taskOrId]) return links[taskOrId]
  return 'pop_fechamento_caixa'
}
