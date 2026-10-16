import { useState, useEffect } from 'react'
import type { Pop, Task, User } from '../types'
import { linkTaskToPopApi, resolveTaskPopId } from '../lib/popsApi'

interface Props {
  pop?: Pop
  task: Task
  allPops?: Pop[]
  pops?: Pop[]
  currentUser?: User
  isAdmin: boolean
  onClose: () => void
  onOpenPopLibrary?: () => void
  onOpenLibrary?: () => void
  onOpenPopEdit?: (pop: Pop) => void
  onPopLinked?: (taskId: string, popId: string | null) => void
  onRefreshPops?: () => Promise<void>
  showToast: (msg: string, type?: string) => void
}

export function PopRunnerModal(props: Props) {
  const {
    pop: explicitPop,
    task,
    allPops: propAllPops,
    pops: propPops,
    isAdmin,
    onClose,
    onOpenPopLibrary,
    onOpenLibrary,
    onOpenPopEdit,
    onPopLinked,
    onRefreshPops,
    showToast
  } = props

  const allPops = propAllPops || propPops || []
  const resolvedPopId = task.pop_id || resolveTaskPopId(task)
  const pop = explicitPop || allPops.find(p => p.id === resolvedPopId)
  const openLib = onOpenPopLibrary || onOpenLibrary || (() => {})

  // Checklist local interativo para acompanhamento de execução (não altera o status da tarefa)
  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({})
  const [selectedPopIdToLink, setSelectedPopIdToLink] = useState<string>(pop?.id || '')
  const [linking, setLinking] = useState(false)

  // Resetar checklist ao trocar de POP
  useEffect(() => {
    setCheckedSteps({})
    setSelectedPopIdToLink(pop?.id || '')
  }, [pop?.id])

  const toggleStep = (stepId: string) => {
    setCheckedSteps(prev => ({
      ...prev,
      [stepId]: !prev[stepId]
    }))
  }

  const handleLinkPop = async () => {
    if (!selectedPopIdToLink) return
    setLinking(true)
    await linkTaskToPopApi(task.id, selectedPopIdToLink)
    if (onRefreshPops) await onRefreshPops()
    setLinking(false)
    showToast('✅ POP vinculado à tarefa com sucesso!', 'success')
    if (onPopLinked) onPopLinked(task.id, selectedPopIdToLink)
  }

  const handleUnlinkPop = async () => {
    setLinking(true)
    await linkTaskToPopApi(task.id, null)
    if (onRefreshPops) await onRefreshPops()
    setLinking(false)
    showToast('🗑 Vínculo de POP removido', 'warn')
    if (onPopLinked) onPopLinked(task.id, null)
  }

  const steps = pop?.steps || []
  const doneCount = steps.filter(s => checkedSteps[s.id]).length
  const progressPercent = steps.length ? Math.round((doneCount / steps.length) * 100) : 0

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 680, maxWidth: '96%', maxHeight: '92vh' }}>
        {/* CABEÇALHO */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 14, marginBottom: 18 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 18 }}>📘</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>
                {pop ? pop.title : 'Procedimento Operacional Padrão (POP)'}
              </span>
              {pop && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: 'var(--accentbg)', color: 'var(--accent)', border: '1px solid var(--accent)' }}>
                  v{pop.version || 1}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>
              Tarefa associada: <strong style={{ color: 'var(--text)' }}>{task.descricao}</strong>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text3)', fontSize: 18, cursor: 'pointer', padding: '0 4px' }}
            title="Fechar"
          >
            ✕
          </button>
        </div>

        {/* CASO: TAREFA SEM POP VINCULADO */}
        {!pop ? (
          <div style={{ textAlign: 'center', padding: '28px 12px' }}>
            <div style={{ fontSize: 42, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
              Nenhum POP associado a esta tarefa
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', maxWidth: 440, margin: '0 auto 20px', lineHeight: 1.5 }}>
              Os Procedimentos Operacionais Padrão orientam o passo a passo seguro para qualquer colaborador executar a rotina com precisão.
            </div>

            {/* SELETOR DE VÍNCULO PARA ADMINISTRADORES */}
            {isAdmin && allPops.length > 0 && (
              <div style={{ background: 'var(--bg3)', padding: 16, borderRadius: 10, border: '1px solid var(--border)', maxWidth: 460, margin: '0 auto 18px', textAlign: 'left' }}>
                <label className="label">Vincular um POP existente a esta tarefa:</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <select
                    className="inp"
                    value={selectedPopIdToLink}
                    onChange={e => setSelectedPopIdToLink(e.target.value)}
                    style={{ flex: 1 }}
                  >
                    <option value="">Selecione um procedimento...</option>
                    {allPops.filter(p => p.active).map(p => (
                      <option key={p.id} value={p.id}>{p.title} (v{p.version})</option>
                    ))}
                  </select>
                  <button
                    className="btn-primary"
                    onClick={handleLinkPop}
                    disabled={!selectedPopIdToLink || linking}
                    style={{ padding: '8px 14px', fontSize: 12 }}
                  >
                    Vincular
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 10 }}>
              <button
                className="fb"
                onClick={() => { onClose(); openLib(); }}
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', padding: '8px 16px', borderRadius: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}
              >
                📚 Acessar Biblioteca de POPs
              </button>
              <button className="bcancel" onClick={onClose}>
                Fechar
              </button>
            </div>
          </div>
        ) : (
          /* CASO: POP VINCULADO — VISUALIZAÇÃO E CHECKLIST */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* INFORMAÇÕES GERAIS */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: 'var(--bg3)', padding: 12, borderRadius: 9, border: '1px solid var(--border)' }}>
              <div>
                <span className="label" style={{ marginBottom: 2 }}>🎯 Objetivo</span>
                <div style={{ fontSize: 12.5, color: 'var(--text)' }}>{pop.objective}</div>
              </div>
              <div>
                <span className="label" style={{ marginBottom: 2 }}>⏱ Quando Utilizar</span>
                <div style={{ fontSize: 12.5, color: 'var(--text)' }}>{pop.when_to_use}</div>
              </div>
            </div>

            {/* PRÉ-REQUISITOS */}
            {pop.prerequisites && (
              <div style={{ background: 'var(--bg3)', padding: 12, borderRadius: 9, border: '1px solid var(--border)' }}>
                <span className="label" style={{ marginBottom: 2 }}>📦 Pré-requisitos & Materiais</span>
                <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>{pop.prerequisites}</div>
              </div>
            )}

            {/* BARRA DE PROGRESSO DO CHECKLIST DE EXECUÇÃO */}
            <div style={{ background: 'var(--bg3)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                <span>Progresso do procedimento:</span>
                <span style={{ color: doneCount === steps.length && steps.length > 0 ? 'var(--green)' : 'var(--accent)' }}>
                  {doneCount} de {steps.length} etapas ({progressPercent}%)
                </span>
              </div>
              <div style={{ width: 140, height: 6, background: 'var(--bg4)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${progressPercent}%`, height: '100%', background: doneCount === steps.length && steps.length > 0 ? 'var(--green)' : 'var(--accent)', transition: 'width 0.25s ease' }} />
              </div>
            </div>

            {/* ETAPAS NUMERADAS COM CHECKLIST */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="label" style={{ marginBottom: 0 }}>📋 Etapas de Execução</span>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                  * Marcar etapas ajuda no acompanhamento e não altera o status da tarefa
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {steps.map((step, idx) => {
                  const isChecked = !!checkedSteps[step.id]
                  return (
                    <div
                      key={step.id || idx}
                      onClick={() => toggleStep(step.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 12,
                        padding: '10px 12px',
                        borderRadius: 8,
                        background: isChecked ? 'rgba(61, 214, 140, 0.08)' : 'var(--bg3)',
                        border: isChecked ? '1px solid var(--green)' : '1px solid var(--border)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {/* Checkbox da etapa */}
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 5,
                          border: isChecked ? '2px solid var(--green)' : '2px solid var(--text3)',
                          background: isChecked ? 'var(--green)' : 'transparent',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12,
                          fontWeight: 800,
                          flexShrink: 0,
                          marginTop: 2
                        }}
                      >
                        {isChecked ? '✓' : ''}
                      </div>

                      {/* Conteúdo da etapa */}
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: isChecked ? 'var(--green)' : 'var(--accent)' }}>
                            ETAPA {step.order || idx + 1}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', textDecoration: isChecked ? 'line-through' : 'none', opacity: isChecked ? 0.75 : 1 }}>
                            {step.title}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.45 }}>
                          {step.instruction}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* CUIDADOS E PONTOS DE ATENÇÃO */}
            {pop.cautions && (
              <div style={{ background: 'var(--redbg)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--red)', color: 'var(--red)' }}>
                <div style={{ fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span>⚠</span> Cuidados e Pontos de Atenção
                </div>
                <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.4 }}>
                  {pop.cautions}
                </div>
              </div>
            )}

            {/* RESULTADO ESPERADO */}
            {pop.expected_result && (
              <div style={{ background: 'var(--greenbg)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--green)', color: 'var(--green)' }}>
                <div style={{ fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span>🎯</span> Resultado Esperado
                </div>
                <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.4 }}>
                  {pop.expected_result}
                </div>
              </div>
            )}

            {/* RESPONSÁVEL E CONTATOS */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--text3)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              <div>
                {pop.responsible && <span>Manutenção: <strong style={{ color: 'var(--text2)' }}>{pop.responsible}</strong></span>}
                {pop.contact_notes && <span style={{ marginLeft: 12 }}>Dúvidas: <strong style={{ color: 'var(--text2)' }}>{pop.contact_notes}</strong></span>}
              </div>
              <div>
                Atualizado em: {new Date(pop.updated_at).toLocaleDateString('pt-BR')}
              </div>
            </div>

            {/* RODAPÉ DO MODAL */}
            <div className="modal-footer" style={{ marginTop: 6 }}>
              {isAdmin && (
                <button
                  type="button"
                  onClick={handleUnlinkPop}
                  disabled={linking}
                  style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--red)', borderRadius: 7, padding: '7px 12px', fontSize: 12, cursor: 'pointer', marginRight: 'auto' }}
                >
                  Desvincular POP
                </button>
              )}
              {isAdmin && onOpenPopEdit && (
                <button
                  type="button"
                  onClick={() => { onClose(); onOpenPopEdit(pop); }}
                  style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 7, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }}
                >
                  ✎ Editar POP
                </button>
              )}
              <button
                type="button"
                className="btn-primary"
                onClick={onClose}
                style={{ padding: '8px 20px', fontSize: 13 }}
              >
                Concluir Consulta
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
