import { useState } from 'react'
import type { Pop, PopStep, User } from '../types'
import { savePopApi, togglePopActiveApi, deletePopApi } from '../lib/popsApi'
import { genId } from '../lib/utils'
import { PopRunnerModal } from '../components/PopRunnerModal'

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
  showToast,
  onOpenPopRunner
}: Props) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingPop, setEditingPop] = useState<Pop | null>(null)
  const [viewingPop, setViewingPop] = useState<Pop | null>(null)
  const [confirmDel, setConfirmDel] = useState<Pop | null>(null)

  // Campos do formulário
  const [fTitle, setFTitle] = useState('')
  const [fObjective, setFObjective] = useState('')
  const [fWhenToUse, setFWhenToUse] = useState('')
  const [fPrerequisites, setFPrerequisites] = useState('')
  const [fCautions, setFCautions] = useState('')
  const [fExpectedResult, setFExpectedResult] = useState('')
  const [fContactNotes, setFContactNotes] = useState('')
  const [fResponsible, setFResponsible] = useState(currentUser.name)
  const [fSteps, setFSteps] = useState<PopStep[]>([])

  const openNewPop = () => {
    setEditingPop(null)
    setFTitle('')
    setFObjective('')
    setFWhenToUse('')
    setFPrerequisites('')
    setFCautions('')
    setFExpectedResult('')
    setFContactNotes('')
    setFResponsible(currentUser.name)
    setFSteps([
      { id: genId(), order: 1, title: '', instruction: '' }
    ])
    setModalOpen(true)
  }

  const openEditPop = (pop: Pop) => {
    setEditingPop(pop)
    setFTitle(pop.title)
    setFObjective(pop.objective)
    setFWhenToUse(pop.when_to_use)
    setFPrerequisites(pop.prerequisites || '')
    setFCautions(pop.cautions || '')
    setFExpectedResult(pop.expected_result || '')
    setFContactNotes(pop.contact_notes || '')
    setFResponsible(pop.responsible || currentUser.name)
    setFSteps(pop.steps && pop.steps.length > 0 ? pop.steps : [{ id: genId(), order: 1, title: '', instruction: '' }])
    setModalOpen(true)
  }

  // Manipulação de etapas
  const addStep = () => {
    setFSteps(prev => [
      ...prev,
      { id: genId(), order: prev.length + 1, title: '', instruction: '' }
    ])
  }

  const updateStep = (idx: number, field: 'title' | 'instruction', val: string) => {
    setFSteps(prev => {
      const copy = [...prev]
      copy[idx] = { ...copy[idx], [field]: val }
      return copy
    })
  }

  const removeStep = (idx: number) => {
    setFSteps(prev => {
      const filtered = prev.filter((_, i) => i !== idx)
      return filtered.map((s, i) => ({ ...s, order: i + 1 }))
    })
  }

  const moveStep = (idx: number, dir: -1 | 1) => {
    const targetIdx = idx + dir
    if (targetIdx < 0 || targetIdx >= fSteps.length) return
    setFSteps(prev => {
      const copy = [...prev]
      const [item] = copy.splice(idx, 1)
      copy.splice(targetIdx, 0, item)
      return copy.map((s, i) => ({ ...s, order: i + 1 }))
    })
  }

  const handleSave = async () => {
    if (!fTitle.trim()) {
      showToast('⚠ Preencha o título do POP', 'warn')
      return
    }
    if (!fObjective.trim()) {
      showToast('⚠ Preencha o objetivo do procedimento', 'warn')
      return
    }
    if (!fWhenToUse.trim()) {
      showToast('⚠ Informe quando utilizar este procedimento', 'warn')
      return
    }

    const validSteps = fSteps.filter(s => s.title.trim() || s.instruction.trim())
    if (validSteps.length === 0) {
      showToast('⚠ Adicione ao menos 1 etapa ao procedimento', 'warn')
      return
    }

    const payload: Partial<Pop> = {
      title: fTitle.trim(),
      objective: fObjective.trim(),
      when_to_use: fWhenToUse.trim(),
      prerequisites: fPrerequisites.trim(),
      cautions: fCautions.trim(),
      expected_result: fExpectedResult.trim(),
      contact_notes: fContactNotes.trim(),
      responsible: fResponsible.trim(),
      steps: validSteps.map((s, i) => ({ ...s, order: i + 1 })),
      active: editingPop ? editingPop.active : true
    }

    await savePopApi(payload, editingPop?.id)
    await onRefreshPops()
    setModalOpen(false)
    showToast(editingPop ? '✅ POP atualizado (nova versão registrada)!' : '✅ Novo POP cadastrado com sucesso!', 'success')
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
          <div className="brand-text">Pulse <span>Agenda</span></div>
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
            {filteredPops.map(p => (
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
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', lineHeight: 1.3 }}>
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
                <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.45, flex: 1, marginBottom: 12 }}>
                  {p.objective}
                </div>

                {/* Metadados */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--text3)', borderTop: '1px solid var(--border)', paddingTop: 10, marginBottom: 12 }}>
                  <div>📋 {p.steps?.length || 0} etapas</div>
                  <div>👤 {p.responsible || 'Equipe'}</div>
                </div>

                {/* Ações do Card */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button
                    className="fb"
                    style={{ flex: 1, textAlign: 'center', background: 'var(--accentbg)', borderColor: 'var(--accent)', color: 'var(--accent)', padding: '6px 10px', fontSize: 12 }}
                    onClick={() => setViewingPop(p)}
                  >
                    👁 Ver Detalhes
                  </button>

                  {isAdmin && (
                    <>
                      <button
                        className="act edt"
                        title="Editar procedimento"
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
            ))}
          </div>
        )}
      </div>

      {/* MODAL DE CRIAÇÃO / EDIÇÃO */}
      {modalOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal" style={{ width: 680, maxWidth: '96%', maxHeight: '92vh' }}>
            <div className="modal-title">
              {editingPop ? `Editar POP (v${editingPop.version})` : 'Novo Procedimento Operacional Padrão (POP)'}
            </div>

            <div className="field">
              <label className="label">Título do Procedimento *</label>
              <input
                className="inp"
                placeholder="Ex: Conciliação Diária de Caixa..."
                value={fTitle}
                onChange={e => setFTitle(e.target.value)}
                autoFocus
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label className="label">Objetivo *</label>
                <textarea
                  className="inp"
                  rows={2}
                  placeholder="Qual o objetivo deste procedimento?"
                  value={fObjective}
                  onChange={e => setFObjective(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="label">Quando Utilizar *</label>
                <textarea
                  className="inp"
                  rows={2}
                  placeholder="Em que momentos esta rotina deve ser executada?"
                  value={fWhenToUse}
                  onChange={e => setFWhenToUse(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label className="label">Pré-requisitos e Materiais Necessários</label>
              <input
                className="inp"
                placeholder="Ex: Extrato OFX, Acesso ao ERP, Senha bancária..."
                value={fPrerequisites}
                onChange={e => setFPrerequisites(e.target.value)}
              />
            </div>

            {/* SEÇÃO DE ETAPAS REORDENÁVEIS */}
            <div style={{ margin: '18px 0', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span className="label" style={{ marginBottom: 0 }}>Etapas Numeradas * ({fSteps.length})</span>
                <button
                  type="button"
                  onClick={addStep}
                  style={{ background: 'var(--accentbg)', border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: 6, padding: '4px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                >
                  + Adicionar Etapa
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {fSteps.map((step, idx) => (
                  <div
                    key={step.id || idx}
                    style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', minWidth: 55 }}>
                        ETAPA {idx + 1}
                      </span>
                      <input
                        className="inp"
                        style={{ padding: '6px 10px', fontSize: 13, flex: 1 }}
                        placeholder="Título da etapa (Ex: Baixar extratos bancários)"
                        value={step.title}
                        onChange={e => updateStep(idx, 'title', e.target.value)}
                      />
                      <button
                        type="button"
                        className="act"
                        disabled={idx === 0}
                        onClick={() => moveStep(idx, -1)}
                        title="Subir etapa"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        className="act"
                        disabled={idx === fSteps.length - 1}
                        onClick={() => moveStep(idx, 1)}
                        title="Descer etapa"
                      >
                        ▼
                      </button>
                      {fSteps.length > 1 && (
                        <button
                          type="button"
                          className="act del"
                          onClick={() => removeStep(idx)}
                          title="Remover etapa"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <textarea
                      className="inp"
                      rows={2}
                      placeholder="Instrução detalhada de como executar esta etapa com segurança..."
                      value={step.instruction}
                      onChange={e => updateStep(idx, 'instruction', e.target.value)}
                      style={{ fontSize: 12 }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label className="label">Cuidados e Pontos de Atenção</label>
                <textarea
                  className="inp"
                  rows={2}
                  placeholder="Erros comuns a evitar ou cuidados críticos..."
                  value={fCautions}
                  onChange={e => setFCautions(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="label">Resultado Esperado</label>
                <textarea
                  className="inp"
                  rows={2}
                  placeholder="Qual o resultado ao concluir com sucesso?"
                  value={fExpectedResult}
                  onChange={e => setFExpectedResult(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label className="label">Responsável pela Manutenção</label>
                <input
                  className="inp"
                  value={fResponsible}
                  onChange={e => setFResponsible(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="label">Dúvidas / Contato de Referência</label>
                <input
                  className="inp"
                  placeholder="Ex: Falar com Raffaela Lima ou Canal Geral"
                  value={fContactNotes}
                  onChange={e => setFContactNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="bcancel" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSave}>
                {editingPop ? 'Salvar Nova Versão' : 'Criar Procedimento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE VISUALIZAÇÃO DE DETALHES DO POP — UNIFICADO COM PopRunnerModal */}
      {viewingPop && (
        <PopRunnerModal
          pop={viewingPop}
          allPops={pops}
          isAdmin={isAdmin}
          onClose={() => setViewingPop(null)}
          onOpenPopEdit={openEditPop}
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
