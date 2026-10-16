import { useState, useEffect, useRef } from 'react'
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
  const bodyScrollRef = useRef<HTMLDivElement>(null)
  const stepRefs = useRef<Record<string, HTMLDivElement | null>>({})

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

  const steps = pop?.steps || []
  const doneCount = steps.filter(s => checkedSteps[s.id]).length
  const progressPercent = steps.length ? Math.round((doneCount / steps.length) * 100) : 0
  const isAllDone = steps.length > 0 && doneCount === steps.length

  const handleNextStep = () => {
    if (isAllDone) {
      onClose()
      return
    }
    // Encontra a primeira etapa ainda não marcada
    const nextUnchecked = steps.find(s => !checkedSteps[s.id])
    if (nextUnchecked) {
      setCheckedSteps(prev => ({
        ...prev,
        [nextUnchecked.id]: true
      }))
      const el = stepRefs.current[nextUnchecked.id]
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
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

  const handlePrint = () => {
    if (!pop) return
    const printWindow = window.open('', '_blank', 'width=840,height=900')
    if (!printWindow) {
      window.print()
      return
    }

    const prerequisitesList = parsePrerequisites(pop.prerequisites)

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${pop.title} — POP v${pop.version || 1}</title>
          <style>
            @media print {
              body { margin: 1.5cm; }
              .no-print { display: none !important; }
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              color: #111827;
              line-height: 1.5;
              padding: 24px;
            }
            .header {
              border-bottom: 2px solid #e5e7eb;
              padding-bottom: 16px;
              margin-bottom: 20px;
            }
            .badge {
              display: inline-block;
              background: #e0e7ff;
              color: #3730a3;
              font-size: 11px;
              font-weight: 700;
              padding: 3px 8px;
              border-radius: 4px;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              margin-bottom: 8px;
            }
            h1 {
              font-size: 22px;
              margin: 4px 0 8px;
              color: #111827;
            }
            .meta {
              display: flex;
              gap: 18px;
              font-size: 12px;
              color: #4b5563;
              margin-top: 8px;
            }
            .meta strong { color: #111827; }
            .grid-2 {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 14px;
              margin-bottom: 16px;
            }
            .card {
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              padding: 12px 14px;
              background: #f9fafb;
            }
            .card-title {
              font-size: 10px;
              font-weight: 700;
              color: #6b7280;
              text-transform: uppercase;
              letter-spacing: 0.08em;
              margin-bottom: 4px;
            }
            .card-body {
              font-size: 13px;
              color: #1f2937;
            }
            .steps-section {
              margin-top: 20px;
            }
            .step-card {
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              padding: 14px;
              margin-bottom: 10px;
              page-break-inside: avoid;
            }
            .step-num {
              font-size: 11px;
              font-weight: 700;
              color: #4338ca;
              margin-bottom: 2px;
            }
            .step-title {
              font-size: 14px;
              font-weight: 600;
              color: #111827;
              margin-bottom: 6px;
            }
            .step-inst {
              font-size: 12.5px;
              color: #374151;
            }
            .cautions-box {
              border: 1px solid #fca5a5;
              background: #fef2f2;
              color: #991b1b;
              border-radius: 8px;
              padding: 12px 14px;
              margin-top: 14px;
            }
            .expected-box {
              border: 1px solid #86efac;
              background: #f0fdf4;
              color: #166534;
              border-radius: 8px;
              padding: 12px 14px;
              margin-top: 12px;
            }
            .footer-info {
              margin-top: 24px;
              border-top: 1px solid #e5e7eb;
              padding-top: 12px;
              font-size: 11px;
              color: #6b7280;
              display: flex;
              justify-content: space-between;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="badge">POP · v${pop.version || 1}</div>
            <h1>${pop.title}</h1>
            <div style="font-size: 12px; color: #4b5563; margin-top: 4px;">
              Tarefa vinculada: <strong>${task.descricao}</strong>
            </div>
            <div class="meta">
              ${pop.responsible ? `<span>Responsável: <strong>${pop.responsible}</strong></span>` : ''}
              ${pop.contact_notes ? `<span>Dúvidas: <strong>${pop.contact_notes}</strong></span>` : ''}
              ${pop.estimated_time ? `<span>Tempo estimado: <strong>${pop.estimated_time}</strong></span>` : ''}
            </div>
          </div>

          <div class="grid-2">
            ${pop.objective ? `
              <div class="card">
                <div class="card-title">OBJETIVO</div>
                <div class="card-body">${pop.objective}</div>
              </div>
            ` : ''}
            ${pop.when_to_use ? `
              <div class="card">
                <div class="card-title">QUANDO UTILIZAR</div>
                <div class="card-body">${pop.when_to_use}</div>
              </div>
            ` : ''}
          </div>

          ${prerequisitesList.length > 0 ? `
            <div class="card" style="margin-bottom: 16px;">
              <div class="card-title">PRÉ-REQUISITOS & MATERIAIS</div>
              <div class="card-body" style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;">
                ${prerequisitesList.map(item => `
                  <span style="background: #e5e7eb; padding: 3px 8px; border-radius: 4px; font-size: 12px;">${item}</span>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <div class="steps-section">
            <div class="card-title" style="margin-bottom: 8px;">ETAPAS NUMERADAS (${steps.length})</div>
            ${steps.map((s, idx) => `
              <div class="step-card">
                <div class="step-num">ETAPA ${s.order || idx + 1}</div>
                <div class="step-title">${s.title}</div>
                <div class="step-inst">${s.instruction}</div>
              </div>
            `).join('')}
          </div>

          ${pop.cautions ? `
            <div class="cautions-box">
              <div style="font-weight: 700; margin-bottom: 3px;">⚠️ Cuidados e Atenção</div>
              <div style="font-size: 12.5px;">${pop.cautions}</div>
            </div>
          ` : ''}

          ${pop.expected_result ? `
            <div class="expected-box">
              <div style="font-weight: 700; margin-bottom: 3px;">🎯 Resultado Esperado</div>
              <div style="font-size: 12.5px;">${pop.expected_result}</div>
            </div>
          ` : ''}

          <div class="footer-info">
            <span>Pulse Agenda — Procedimento Operacional Padrão</span>
            <span>Impresso em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>

          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  const handleEditPop = () => {
    if (!pop) return
    onClose()
    if (onOpenPopEdit) {
      onOpenPopEdit(pop)
    } else {
      openLib()
      showToast('Selecione o POP na biblioteca para editar suas instruções.', 'info')
    }
  }

  const handleAttachPlaceholder = () => {
    showToast('O armazenamento em nuvem para anexos de POP está em fase de planejamento de infraestrutura.', 'info')
  }

  // Divisão inteligente dos pré-requisitos para renderização em badges/pills
  function parsePrerequisites(raw?: string): string[] {
    if (!raw || !raw.trim()) return []
    if (raw.includes('\n')) {
      return raw.split('\n').map(s => s.trim().replace(/^[-•*]\s*/, '')).filter(Boolean)
    }
    if (raw.includes(';') || raw.includes(',')) {
      return raw.split(/[;,]/).map(s => s.trim().replace(/^[-•*]\s*/, '')).filter(Boolean)
    }
    return [raw.trim()]
  }

  const prereqList = parsePrerequisites(pop?.prerequisites)

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      {/* ESTILOS ESCOPADOS PARA O MODAL DE RUNNER DO POP */}
      <style>{`
        .pop-runner-container {
          background: #10162a;
          border: 1px solid #26304f;
          border-radius: 14px;
          width: min(840px, calc(100% - 24px));
          height: min(92vh, 880px);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 30px 80px rgba(0, 0, 0, 0.65);
          animation: popRunnerIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        [data-theme="light"] .pop-runner-container {
          background: #ffffff;
          border: 1px solid #dbe2f0;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.15);
        }
        @keyframes popRunnerIn {
          from { opacity: 0; transform: scale(0.97) translateY(-6px); }
          to { opacity: 1; transform: none; }
        }
        .pop-runner-body::-webkit-scrollbar {
          width: 6px;
        }
        .pop-runner-body::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.15);
        }
        .pop-runner-body::-webkit-scrollbar-thumb {
          background: #2a3556;
          border-radius: 3px;
        }
        [data-theme="light"] .pop-runner-body::-webkit-scrollbar-thumb {
          background: #cbd5e1;
        }
        .pop-runner-btn-ghost {
          height: 32px;
          padding: 0 12px;
          border-radius: 7px;
          border: 1px solid #2a3454;
          background: transparent;
          color: #c6cce0;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: all 0.15s ease;
        }
        .pop-runner-btn-ghost:hover {
          background: #1b2550;
          color: #ffffff;
          border-color: #3f4e7a;
        }
        [data-theme="light"] .pop-runner-btn-ghost {
          border-color: #d1d5db;
          color: #374151;
        }
        [data-theme="light"] .pop-runner-btn-ghost:hover {
          background: #f3f4f6;
          color: #111827;
        }
        .pop-runner-close-btn {
          width: 32px;
          height: 32px;
          border-radius: 7px;
          border: 1px solid #2a3454;
          background: transparent;
          color: #c6cce0;
          font-size: 16px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
        }
        .pop-runner-close-btn:hover {
          background: rgba(255, 77, 109, 0.15);
          border-color: #ff4d6d;
          color: #ff4d6d;
        }
        [data-theme="light"] .pop-runner-close-btn {
          border-color: #d1d5db;
          color: #6b7280;
        }
        [data-theme="light"] .pop-runner-close-btn:hover {
          background: rgba(239, 68, 68, 0.1);
          border-color: #ef4444;
          color: #ef4444;
        }
        .pop-step-card {
          transition: border-color 0.2s ease, background 0.2s ease;
        }
        .pop-step-card:hover {
          border-color: #394770 !important;
        }
        [data-theme="light"] .pop-step-card:hover {
          border-color: #cbd5e1 !important;
        }
        @media (max-width: 640px) {
          .pop-grid-2 {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      <div className="pop-runner-container">
        {/* CASO 1: TAREFA SEM POP VINCULADO */}
        {!pop ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header simples sem POP */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 5, background: 'var(--accentbg)', color: 'var(--accent)' }}>
                  POP
                </span>
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                  Procedimento Operacional Padrão
                </span>
              </div>
              <button onClick={onClose} className="pop-runner-close-btn" title="Fechar">✕</button>
            </div>

            {/* Conteúdo central de vinculação */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '36px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
                Nenhum POP associado a esta tarefa
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text2)', maxWidth: 460, lineHeight: 1.55, marginBottom: 24 }}>
                A tarefa <strong style={{ color: 'var(--text)' }}>"{task.descricao}"</strong> ainda não possui um procedimento operacional vinculado para orientar o passo a passo.
              </p>

              {/* Seletor para Administradores */}
              {isAdmin && allPops.length > 0 && (
                <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: 18, maxWidth: 480, width: '100%', textAlign: 'left', marginBottom: 20 }}>
                  <label className="label" style={{ marginBottom: 8 }}>
                    Vincular um POP existente a esta tarefa:
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select
                      className="inp"
                      value={selectedPopIdToLink}
                      onChange={e => setSelectedPopIdToLink(e.target.value)}
                      style={{ flex: 1 }}
                    >
                      <option value="">Selecione um procedimento cadastrado...</option>
                      {allPops.filter(p => p.active).map(p => (
                        <option key={p.id} value={p.id}>{p.title} (v{p.version || 1})</option>
                      ))}
                    </select>
                    <button
                      className="btn-primary"
                      onClick={handleLinkPop}
                      disabled={!selectedPopIdToLink || linking}
                      style={{ padding: '8px 16px', fontSize: 12, whiteSpace: 'nowrap' }}
                    >
                      {linking ? 'Vinculando...' : 'Vincular'}
                    </button>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={() => { onClose(); openLib(); }}
                  style={{ background: 'var(--bg3)', border: '1px solid var(--border)', padding: '9px 18px', borderRadius: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer', fontWeight: 500 }}
                >
                  📚 Acessar Biblioteca de POPs
                </button>
                <button type="button" className="bcancel" onClick={onClose}>
                  Fechar
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* CASO 2: POP VINCULADO — LAYOUT DE EXECUÇÃO MODERNO */
          <>
            {/* CABEÇALHO DA JANELA */}
            <header style={{ padding: '22px 28px 18px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0, background: 'var(--bg2)' }}>
              {/* Linha 1: Versão, Botões de Ação e Fechar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 600, color: 'var(--accent2)', background: 'var(--accentbg)', padding: '4px 9px', borderRadius: 5, letterSpacing: '0.04em' }}>
                  POP · v{pop.version || 1}
                </span>

                <span style={{ flex: 1 }} />

                <button
                  type="button"
                  onClick={handlePrint}
                  className="pop-runner-btn-ghost"
                  title="Imprimir procedimento em folha/PDF"
                >
                  <span style={{ fontSize: 13 }}>🖨</span> Imprimir
                </button>

                {isAdmin && (
                  <button
                    type="button"
                    onClick={handleEditPop}
                    className="pop-runner-btn-ghost"
                    title="Editar informações deste POP"
                  >
                    <span style={{ fontSize: 12 }}>✎</span> Editar POP
                  </button>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  className="pop-runner-close-btn"
                  title="Fechar"
                >
                  ✕
                </button>
              </div>

              {/* Linha 2: Título do POP */}
              <div>
                <h1 style={{ margin: '0 0 4px', fontSize: 21, fontWeight: 700, lineHeight: 1.25, color: 'var(--text)' }}>
                  {pop.title}
                </h1>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                  Tarefa associada: <strong style={{ color: 'var(--text)' }}>{task.descricao}</strong>
                </div>
              </div>

              {/* Linha 3: Identificação do Responsável, Dúvidas e Tempo Estimado */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 22px', fontSize: 12, color: 'var(--text2)', paddingTop: 2 }}>
                {pop.responsible ? (
                  <span>
                    Responsável: <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{pop.responsible}</strong>
                  </span>
                ) : null}

                {pop.contact_notes ? (
                  <span>
                    Dúvidas: <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{pop.contact_notes}</strong>
                  </span>
                ) : null}

                {pop.estimated_time ? (
                  <span>
                    Tempo estimado: <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{pop.estimated_time}</strong>
                  </span>
                ) : null}
              </div>

              {/* Linha 4: Barra de Progresso Interativa */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 2 }}>
                <div style={{ flex: 1, height: 6, background: 'var(--bg4)', borderRadius: 4, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${progressPercent}%`,
                      background: isAllDone ? 'var(--green)' : 'var(--accent)',
                      borderRadius: 4,
                      transition: 'width 0.3s ease, background 0.3s ease'
                    }}
                  />
                </div>
                <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: isAllDone ? 'var(--green)' : 'var(--accent2)', whiteSpace: 'nowrap' }}>
                  {doneCount}/{steps.length} passos
                </span>
              </div>
            </header>

            {/* CORPO ROLÁVEL COM CONTEÚDO DO POP */}
            <div
              ref={bodyScrollRef}
              className="pop-runner-body"
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '22px 28px 28px',
                display: 'flex',
                flexDirection: 'column',
                gap: 16
              }}
            >
              {/* BLOCO: OBJETIVO E QUANDO UTILIZAR */}
              {(pop.objective || pop.when_to_use) && (
                <div className="pop-grid-2" style={{ display: 'grid', gridTemplateColumns: pop.objective && pop.when_to_use ? '1fr 1fr' : '1fr', gap: 12 }}>
                  {pop.objective && (
                    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 9, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 10, letterSpacing: '0.1em', fontWeight: 700, color: 'var(--text3)' }}>
                        OBJETIVO
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text)' }}>
                        {pop.objective}
                      </div>
                    </div>
                  )}

                  {pop.when_to_use && (
                    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 9, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 10, letterSpacing: '0.1em', fontWeight: 700, color: 'var(--text3)' }}>
                        QUANDO UTILIZAR
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text)' }}>
                        {pop.when_to_use}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* BLOCO: PRÉ-REQUISITOS & MATERIAIS */}
              {prereqList.length > 0 && (
                <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 9, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 10, letterSpacing: '0.1em', fontWeight: 700, color: 'var(--text3)' }}>
                    PRÉ-REQUISITOS & MATERIAIS
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {prereqList.map((item, idx) => (
                      <span
                        key={idx}
                        style={{
                          fontSize: 12,
                          padding: '5px 11px',
                          borderRadius: 6,
                          background: 'var(--bg4)',
                          color: 'var(--text)',
                          border: '1px solid var(--border)'
                        }}
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* CABEÇALHO DA SEÇÃO DE ETAPAS */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}>
                <div style={{ fontSize: 10, letterSpacing: '0.1em', fontWeight: 700, color: 'var(--text3)' }}>
                  ETAPAS NUMERADAS ({steps.length})
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                  * Marcar etapas serve para guiar a execução e não altera a tarefa
                </div>
              </div>

              {/* LISTA DE ETAPAS NUMERADAS EM CARTÕES INDIVIDUAIS */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {steps.map((step, idx) => {
                  const isChecked = !!checkedSteps[step.id]
                  return (
                    <div
                      key={step.id || idx}
                      ref={el => { stepRefs.current[step.id] = el }}
                      className="pop-step-card"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '32px minmax(0, 1fr)',
                        gap: 14,
                        padding: 16,
                        borderRadius: 10,
                        background: isChecked ? 'rgba(61, 214, 140, 0.04)' : 'var(--bg3)',
                        border: isChecked ? '1px solid rgba(61, 214, 140, 0.5)' : '1px solid var(--border)'
                      }}
                    >
                      {/* Botão circular de marcação / status */}
                      <button
                        type="button"
                        onClick={() => toggleStep(step.id)}
                        title={isChecked ? 'Clique para desmarcar esta etapa' : 'Clique para marcar esta etapa como concluída'}
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: '50%',
                          border: isChecked ? '1.5px solid var(--green)' : '1.5px solid var(--border)',
                          background: isChecked ? 'rgba(61, 214, 140, 0.2)' : 'transparent',
                          color: isChecked ? 'var(--green)' : 'var(--accent2)',
                          fontFamily: 'monospace',
                          fontSize: isChecked ? 14 : 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease',
                          marginTop: 1
                        }}
                      >
                        {isChecked ? '✓' : String(step.order || idx + 1)}
                      </button>

                      {/* Conteúdo textual da etapa */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
                        <div
                          onClick={() => toggleStep(step.id)}
                          style={{
                            fontSize: 14.5,
                            fontWeight: 600,
                            lineHeight: 1.35,
                            color: 'var(--text)',
                            cursor: 'pointer',
                            opacity: isChecked ? 0.75 : 1,
                            textDecoration: isChecked ? 'line-through' : 'none',
                            transition: 'opacity 0.15s ease'
                          }}
                        >
                          Etapa {step.order || idx + 1}: {step.title}
                        </div>

                        <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text2)', whiteSpace: 'pre-line' }}>
                          {step.instruction}
                        </div>

                        {/* Mídias / Anexos reais cadastrados na etapa */}
                        {step.media && step.media.length > 0 && (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginTop: 4 }}>
                            {step.media.map((m, mIdx) => {
                              const ext = (m.extension || (m.name.split('.').pop() || 'ARQ')).slice(0, 4).toUpperCase()
                              const docColor = {
                                PDF: '#d64545',
                                XLSX: '#1f8a55',
                                XLS: '#1f8a55',
                                CSV: '#1f8a55',
                                DOCX: '#2f62d6',
                                DOC: '#2f62d6',
                                OFX: '#8a5cd6',
                                ZIP: '#7a7f95'
                              }[ext] || '#4f6bff'

                              return (
                                <div
                                  key={m.id || mIdx}
                                  style={{
                                    position: 'relative',
                                    aspectRatio: '4/3',
                                    borderRadius: 8,
                                    border: '1px solid var(--border)',
                                    overflow: 'hidden',
                                    background: 'var(--bg4)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}
                                >
                                  {m.type === 'image' && m.url && (
                                    <img src={m.url} alt={m.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                                  )}
                                  {m.type === 'video' && m.url && (
                                    <video src={m.url} controls style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', background: '#000' }} />
                                  )}
                                  {m.type === 'doc' && (
                                    <a
                                      href={m.url || '#'}
                                      download={m.name}
                                      target="_blank"
                                      rel="noreferrer"
                                      style={{
                                        position: 'absolute',
                                        inset: 0,
                                        background: 'var(--bg3)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 6,
                                        textDecoration: 'none'
                                      }}
                                    >
                                      <span style={{ width: 40, height: 48, borderRadius: 5, background: docColor, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 6, fontFamily: 'monospace', fontSize: 10, fontWeight: 700, color: '#fff' }}>
                                        {ext}
                                      </span>
                                      {m.size && <span style={{ fontSize: 10, color: 'var(--text3)' }}>{m.size}</span>}
                                    </a>
                                  )}
                                  <span style={{ position: 'absolute', left: 6, bottom: 6, right: 6, fontFamily: 'monospace', fontSize: 10, fontWeight: 500, color: '#e6e9f2', background: 'rgba(13,18,32,0.85)', padding: '3px 6px', borderRadius: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {m.name}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {/* Botão preparado para área de anexos (com indicação adequada de integração pendente de storage) */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                          <button
                            type="button"
                            onClick={handleAttachPlaceholder}
                            style={{
                              background: 'transparent',
                              border: '1px dashed var(--border)',
                              borderRadius: 6,
                              padding: '5px 10px',
                              fontSize: 11,
                              color: 'var(--text3)',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              transition: 'all 0.15s ease'
                            }}
                            title="Área de anexos da etapa"
                          >
                            <span>📎</span> Anexos da etapa
                          </button>
                        </div>

                        {/* Dica ou Alerta da Etapa (se houver) */}
                        {step.tip && (
                          <div
                            style={{
                              fontSize: 12.5,
                              lineHeight: 1.5,
                              padding: '10px 12px',
                              borderRadius: 7,
                              background: step.tipType === 'warn' ? 'var(--orangebg)' : 'var(--accentbg)',
                              color: step.tipType === 'warn' ? 'var(--orange)' : 'var(--accent2)',
                              border: step.tipType === 'warn' ? '1px solid rgba(255, 169, 77, 0.3)' : '1px solid rgba(79, 110, 247, 0.3)'
                            }}
                          >
                            <strong>{step.tipType === 'warn' ? 'Atenção:' : 'Dica:'}</strong> {step.tip}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* BLOCO: CUIDADOS E PONTOS DE ATENÇÃO / RESULTADO ESPERADO */}
              {(pop.cautions || pop.expected_result) && (
                <div className="pop-grid-2" style={{ display: 'grid', gridTemplateColumns: pop.cautions && pop.expected_result ? '1fr 1fr' : '1fr', gap: 12, paddingTop: 4 }}>
                  {/* Cuidados e Atenção */}
                  {pop.cautions && (
                    <div
                      style={{
                        border: '1px solid rgba(255, 77, 109, 0.45)',
                        background: 'rgba(255, 77, 109, 0.08)',
                        borderRadius: 9,
                        padding: '14px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>⚠️</span> Cuidados e Atenção
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text)' }}>
                        {pop.cautions}
                      </div>
                    </div>
                  )}

                  {/* Resultado Esperado */}
                  {pop.expected_result && (
                    <div
                      style={{
                        border: '1px solid rgba(61, 214, 140, 0.45)',
                        background: 'rgba(61, 214, 140, 0.08)',
                        borderRadius: 9,
                        padding: '14px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>🎯</span> Resultado Esperado
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text)' }}>
                        {pop.expected_result}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* RODAPÉ DA JANELA */}
            <footer
              style={{
                padding: '16px 28px',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexShrink: 0,
                background: 'var(--bg2)'
              }}
            >
              {/* Informação sobre dúvidas e suporte */}
              <div style={{ fontSize: 12, color: 'var(--text2)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {pop.contact_notes ? (
                  <span>
                    Dúvida na execução? <strong style={{ color: 'var(--text)' }}>{pop.contact_notes}</strong>
                  </span>
                ) : pop.responsible ? (
                  <span>
                    Dúvida na execução? <strong style={{ color: 'var(--text)' }}>Falar com {pop.responsible}</strong>
                  </span>
                ) : (
                  <span>Procedimento operacional de referência para a rotina.</span>
                )}
              </div>

              {/* Botão para desvincular POP (apenas administradores) */}
              {isAdmin && (
                <button
                  type="button"
                  onClick={handleUnlinkPop}
                  disabled={linking}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255, 77, 109, 0.4)',
                    color: 'var(--red)',
                    borderRadius: 7,
                    padding: '8px 12px',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontWeight: 500,
                    transition: 'all 0.15s ease'
                  }}
                  title="Remover o vínculo deste POP com a tarefa"
                >
                  {linking ? 'Desvinculando...' : 'Desvincular POP'}
                </button>
              )}

              {/* Botão de Fechar */}
              <button
                type="button"
                className="bcancel"
                onClick={onClose}
                style={{ padding: '8px 16px', fontSize: 13 }}
              >
                Fechar
              </button>

              {/* Botão Primário de Acompanhamento (não conclui nem modifica a tarefa!) */}
              <button
                type="button"
                className="btn-primary"
                onClick={handleNextStep}
                style={{
                  padding: '8px 20px',
                  fontSize: 13,
                  background: isAllDone ? 'var(--green)' : undefined,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                {isAllDone ? 'Concluir consulta' : 'Avançar próxima etapa'}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  )
}
