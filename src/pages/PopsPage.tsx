import { useState } from 'react'
import type { Pop, User } from '../types'
import { togglePopActiveApi, deletePopApi } from '../lib/popsApi'
import { PopRunnerModal } from '../components/PopRunnerModal'
import { DcxFlowBrand } from '../components/DcxFlowLogo'

interface Props {
  pops: Pop[]
  currentUser: User
  isAdmin: boolean
  onRefreshPops: () => Promise<void>
  showToast: (msg: string, type?: string) => void
  onOpenPopRunner?: (pop: Pop) => void
}

export function PopsPage({
  pops,
  currentUser,
  isAdmin,
  onRefreshPops,
  showToast
}: Props) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active')
  const [runnerModalState, setRunnerModalState] = useState<{
    pop?: Pop
    initialMode: 'view' | 'edit'
    createNew?: boolean
  } | null>(null)
  const [confirmDel, setConfirmDel] = useState<Pop | null>(null)

  const openNewPop = () => {
    setRunnerModalState({
      initialMode: 'edit',
      createNew: true
    })
  }

  const openEditPop = (pop: Pop) => {
    setRunnerModalState({
      pop,
      initialMode: 'edit',
      createNew: false
    })
  }

  const openViewPop = (pop: Pop) => {
    setRunnerModalState({
      pop,
      initialMode: 'view',
      createNew: false
    })
  }

  const handleToggleActive = async (pop: Pop) => {
    await togglePopActiveApi(pop.id, pop.active)
    await onRefreshPops()
    showToast(pop.active ? 'POP inativado' : 'POP ativado', 'info')
  }

  const handleDelete = async (pop: Pop) => {
    await deletePopApi(pop.id)
    await onRefreshPops()
    setConfirmDel(null)
    showToast('🗑 POP excluído', 'warn')
  }

  // Filtragem
  const filteredPops = pops.filter(p => {
    const matchStatus = statusFilter === 'all' ? true : statusFilter === 'active' ? p.active : !p.active
    const q = search.toLowerCase().trim()
    const matchSearch = !q || p.title.toLowerCase().includes(q) || p.objective.toLowerCase().includes(q) || (p.responsible || '').toLowerCase().includes(q)
    return matchStatus && matchSearch
  })

  return (
    <>
      {/* TOPBAR */}
      <div className="topbar">
        <div className="topbar-brand">
          <DcxFlowBrand variant="compact" />
        </div>
        <div>
          <div className="pt">Procedimentos (POP)</div>
          <div className="ps">Padronização e instruções de execução</div>
        </div>

        <div className="sw">
          <span className="si">🔍</span>
          <input
            className="search"
            placeholder="Buscar procedimento..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="fg">
          <button className={`fb${statusFilter === 'active' ? ' active' : ''}`} onClick={() => setStatusFilter('active')}>
            Ativos ({pops.filter(p => p.active).length})
          </button>
          <button className={`fb${statusFilter === 'all' ? ' active' : ''}`} onClick={() => setStatusFilter('all')}>
            Todos ({pops.length})
          </button>
          <button className={`fb${statusFilter === 'inactive' ? ' active' : ''}`} onClick={() => setStatusFilter('inactive')}>
            Inativos ({pops.filter(p => !p.active).length})
          </button>
        </div>

        {isAdmin && (
          <button className="add-btn" onClick={openNewPop}>
            + Novo POP
          </button>
        )}
      </div>

      {/* CONTEÚDO PRINCIPAL */}
      <div className="content">
        {filteredPops.length === 0 ? (
          <div className="es">
            <div className="ei">📘</div>
            <div className="et">Nenhum procedimento encontrado</div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>
              {search ? 'Tente buscar por outro termo' : 'Crie o primeiro POP para padronizar as tarefas da equipe'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
            {filteredPops.map(p => {
              const totalAttachments = (p.steps || []).reduce(
                (acc, step) => acc + (step.media?.length || 0),
                0
              )
              return (
                <div
                  key={p.id}
                  style={{
                    background: 'var(--bg2)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'all 0.15s ease',
                    position: 'relative'
                  }}
                >
                  {/* Cabeçalho do Card */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                    <div
                      onClick={() => openViewPop(p)}
                      style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', lineHeight: 1.3, cursor: 'pointer' }}
                    >
                      {p.title}
                    </div>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: 10,
                        background: p.active ? 'var(--greenbg)' : 'var(--bg3)',
                        color: p.active ? 'var(--green)' : 'var(--text3)',
                        border: p.active ? '1px solid var(--green)' : '1px solid var(--border)',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {p.active ? `Ativo • v${p.version || 1}` : `Inativo • v${p.version || 1}`}
                    </span>
                  </div>

                  {/* Resumo do Objetivo */}
                  <div
                    onClick={() => openViewPop(p)}
                    style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.45, flex: 1, marginBottom: 12, cursor: 'pointer' }}
                  >
                    {p.objective}
                  </div>

                  {/* Metadados */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, fontSize: 11, color: 'var(--text3)', borderTop: '1px solid var(--border)', paddingTop: 10, marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span>📋 {p.steps?.length || 0} etapas</span>
                      <span>📎 {totalAttachments} anexos</span>
                      <span>⏱ {p.estimated_time || '30 min'}</span>
                    </div>
                    <div>👤 {p.responsible || 'Equipe'}</div>
                  </div>

                  {/* Ações do Card */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button
                      className="fb"
                      style={{ flex: 1, textAlign: 'center', background: 'var(--accentbg)', borderColor: 'var(--accent)', color: 'var(--accent)', padding: '6px 10px', fontSize: 12 }}
                      onClick={() => openViewPop(p)}
                    >
                      👁 Ver Detalhes
                    </button>

                    {isAdmin && (
                      <>
                        <button
                          className="act edt"
                          title="Editar procedimento (POP completo)"
                          onClick={() => openEditPop(p)}
                        >
                          ✎
                        </button>
                        <button
                          className="act"
                          title={p.active ? 'Inativar procedimento' : 'Ativar procedimento'}
                          onClick={() => handleToggleActive(p)}
                          style={{ color: p.active ? 'var(--orange)' : 'var(--green)' }}
                        >
                          {p.active ? '⏸' : '▶'}
                        </button>
                        <button
                          className="act del"
                          title="Excluir procedimento"
                          onClick={() => setConfirmDel(p)}
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* MODAL UNIFICADO DE DETALHES / EDIÇÃO / CRIAÇÃO — PopRunnerModal */}
      {runnerModalState && (
        <PopRunnerModal
          pop={runnerModalState.pop}
          allPops={pops}
          currentUser={currentUser}
          isAdmin={isAdmin}
          initialMode={runnerModalState.initialMode}
          createNew={runnerModalState.createNew}
          onClose={() => setRunnerModalState(null)}
          onRefreshPops={onRefreshPops}
          showToast={showToast}
        />
      )}

      {/* CONFIRMAÇÃO DE EXCLUSÃO */}
      {confirmDel && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmDel(null)}>
          <div className="modal confirm-modal">
            <div className="confirm-title">Excluir Procedimento (POP)</div>
            <div className="confirm-body">
              Tem certeza que deseja excluir o procedimento <strong>"{confirmDel.title}"</strong>?
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
                Recomendamos inativar o POP em vez de excluir, para preservar o histórico operacional.
              </div>
            </div>
            <div className="modal-footer">
              <button className="bcancel" onClick={() => setConfirmDel(null)}>Cancelar</button>
              <button
                style={{ background: 'var(--redbg)', border: '1px solid var(--red)', borderRadius: 7, padding: '8px 14px', color: 'var(--red)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
                onClick={() => handleDelete(confirmDel)}
              >
                Sim, excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
