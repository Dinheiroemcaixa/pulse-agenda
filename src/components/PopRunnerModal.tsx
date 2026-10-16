import { useState, useEffect, useRef } from 'react'
import type { Pop, Task, User } from '../types'
import { linkTaskToPopApi, resolveTaskPopId } from '../lib/popsApi'

interface Props {
  pop?: Pop
  task?: Task
  allPops?: Pop[]
  pops?: Pop[]
  currentUser?: User
  isAdmin?: boolean
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
    isAdmin = false,
    onClose,
    onOpenPopLibrary,
    onOpenLibrary,
    onOpenPopEdit,
    onPopLinked,
    onRefreshPops,
    showToast
  } = props

  const allPops = propAllPops || propPops || []
  const resolvedPopId = task ? (task.pop_id || resolveTaskPopId(task)) : undefined
  const pop = explicitPop || allPops.find(p => p.id === resolvedPopId) || (allPops.length > 0 ? allPops[0] : undefined)
  const openLib = onOpenPopLibrary || onOpenLibrary || (() => {})

  // Checklist local interativo para acompanhamento de execução (não altera o status da tarefa)
  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({ s1: true })
  const [selectedPopIdToLink, setSelectedPopIdToLink] = useState<string>(pop?.id || '')
  const [linking, setLinking] = useState(false)
  const bodyScrollRef = useRef<HTMLDivElement>(null)
  const stepRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Sincronizar checklist ao trocar de POP
  useEffect(() => {
    if (pop?.id) {
      setSelectedPopIdToLink(pop.id)
    }
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
    // Encontra a primeira etapa não marcada
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
    if (!task || !selectedPopIdToLink) return
    setLinking(true)
    await linkTaskToPopApi(task.id, selectedPopIdToLink)
    if (onRefreshPops) await onRefreshPops()
    setLinking(false)
    showToast('✅ POP vinculado à tarefa com sucesso!', 'success')
    if (onPopLinked) onPopLinked(task.id, selectedPopIdToLink)
  }

  const handleUnlinkPop = async () => {
    if (!task) return
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
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
          <style>
            @media print {
              body { margin: 1cm; }
              .no-print { display: none !important; }
            }
            body {
              font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
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
              font-family: 'IBM Plex Mono', monospace;
              font-size: 11px;
              font-weight: 600;
              padding: 4px 8px;
              border-radius: 4px;
              margin-bottom: 8px;
            }
            h1 { font-size: 22px; margin: 4px 0 8px; color: #111827; font-weight: 700; }
            .meta { display: flex; flex-wrap: wrap; gap: 18px; font-size: 12px; color: #4b5563; margin-top: 8px; }
            .meta b { color: #111827; font-weight: 600; }
            .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px; }
            .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; background: #f9fafb; }
            .card-title { font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }
            .card-body { font-size: 13px; color: #1f2937; }
            .step-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; margin-bottom: 10px; page-break-inside: avoid; }
            .step-num { font-family: 'IBM Plex Mono', monospace; font-size: 11px; font-weight: 700; color: #4338ca; margin-bottom: 3px; }
            .step-title { font-size: 14.5px; font-weight: 600; color: #111827; margin-bottom: 6px; }
            .step-inst { font-size: 13px; color: #374151; }
            .cautions-box { border: 1px solid #fca5a5; background: #fef2f2; color: #991b1b; border-radius: 8px; padding: 14px; margin-top: 14px; }
            .expected-box { border: 1px solid #86efac; background: #f0fdf4; color: #166534; border-radius: 8px; padding: 14px; margin-top: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="badge">POP · v${pop.version || 1}</div>
            <h1>${pop.title}</h1>
            ${task ? `<div style="font-size: 12px; color: #4b5563; margin-top: 4px;">Tarefa vinculada: <strong>${task.descricao}</strong></div>` : ''}
            <div class="meta">
              <span>Responsável: <b>${pop.responsible || 'Raffaela Lima'}</b></span>
              <span>Dúvidas: <b>${pop.contact_notes || 'Gestora Financeira Raffaela Lima'}</b></span>
              <span>Tempo estimado: <b>${pop.estimated_time || '30 min'}</b></span>
            </div>
          </div>
          <div class="grid-2">
            ${pop.objective ? `<div class="card"><div class="card-title">OBJETIVO</div><div class="card-body">${pop.objective}</div></div>` : ''}
            ${pop.when_to_use ? `<div class="card"><div class="card-title">QUANDO UTILIZAR</div><div class="card-body">${pop.when_to_use}</div></div>` : ''}
          </div>
          ${prerequisitesList.length > 0 ? `
            <div class="card" style="margin-bottom: 16px;">
              <div class="card-title">PRÉ-REQUISITOS & MATERIAIS</div>
              <div class="card-body" style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;">
                ${prerequisitesList.map(item => `<span style="background: #e5e7eb; padding: 3px 8px; border-radius: 4px; font-size: 12px;">${item}</span>`).join('')}
              </div>
            </div>
          ` : ''}
          <div style="font-size: 10px; font-weight: 700; color: #6b7280; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 8px;">ETAPAS NUMERADAS (${steps.length})</div>
          ${steps.map((s, idx) => `
            <div class="step-card">
              <div class="step-num">ETAPA ${s.order || idx + 1}</div>
              <div class="step-title">${s.title}</div>
              <div class="step-inst">${s.instruction}</div>
            </div>
          `).join('')}
          ${pop.cautions ? `<div class="cautions-box"><strong>Cuidados e Atenção:</strong><br>${pop.cautions}</div>` : ''}
          ${pop.expected_result ? `<div class="expected-box"><strong>Resultado Esperado:</strong><br>${pop.expected_result}</div>` : ''}
          <script>
            window.onload = function() { window.print(); };
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
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(6, 9, 18, 0.65)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16
      }}
    >
      {/* FONTES E ESTILOS IDÊNTICOS À REFERÊNCIA VISUAL */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />

      <style>{`
        .pop-preview-modal {
          font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #e6e9f2;
          background: #10162a;
          border: 1px solid #26304f;
          border-radius: 14px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 30px 80px rgba(0, 0, 0, 0.65);
          width: min(840px, calc(100% - 24px));
          height: min(92vh, 880px);
          max-height: calc(100vh - 36px);
          animation: popPreviewFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes popPreviewFadeIn {
          from { opacity: 0; transform: scale(0.98) translateY(-6px); }
          to { opacity: 1; transform: none; }
        }
        .pop-preview-modal * {
          box-sizing: border-box;
        }
        .pop-preview-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .pop-preview-scroll::-webkit-scrollbar-track {
          background: #10162a;
        }
        .pop-preview-scroll::-webkit-scrollbar-thumb {
          background: #232c47;
          border-radius: 3px;
        }
        .pop-preview-scroll::-webkit-scrollbar-thumb:hover {
          background: #34407a;
        }
        .pop-preview-btn {
          height: 32px;
          padding: 0 12px;
          border-radius: 7px;
          border: 1px solid #2a3454;
          background: transparent;
          color: #c6cce0;
          font: 500 12px 'IBM Plex Sans', sans-serif;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: all 0.15s ease;
        }
        .pop-preview-btn:hover {
          background: #18214a;
          color: #ffffff;
          border-color: #3b52d6;
        }
        .pop-preview-close {
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
        .pop-preview-close:hover {
          background: rgba(255, 77, 109, 0.15);
          color: #ff7a8a;
          border-color: #7a2e3a;
        }
        .pop-step-box {
          transition: border-color 0.2s ease, background-color 0.2s ease;
        }
        .pop-step-box:hover {
          border-color: #34407a !important;
        }
        @media (max-width: 640px) {
          .pop-preview-modal {
            width: 100% !important;
            height: 96vh !important;
          }
          .pop-preview-header {
            padding: 16px !important;
          }
          .pop-preview-scroll {
            padding: 16px !important;
          }
          .pop-preview-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      <section className="pop-preview-modal">
        {/* CASO: TAREFA SEM POP */}
        {!pop ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#10162a' }}>
            <header style={{ padding: '22px 28px 18px', borderBottom: '1px solid #1f2740', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ font: "500 11px 'IBM Plex Mono', monospace", color: '#7d93ff', background: '#1b2550', padding: '4px 8px', borderRadius: 5 }}>
                  POP
                </span>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Procedimento Operacional Padrão</span>
              </div>
              <button onClick={onClose} className="pop-preview-close">×</button>
            </header>

            <div style={{ flex: 1, padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 8 }}>
                Nenhum POP associado a esta tarefa
              </div>
              <div style={{ fontSize: 13, color: '#8b94b3', maxWidth: 440, lineHeight: 1.5, marginBottom: 24 }}>
                {task ? `A rotina "${task.descricao}" ainda não tem um procedimento vinculado.` : 'Selecione um procedimento para consultar o passo a passo.'}
              </div>

              {isAdmin && allPops.length > 0 && task && (
                <div style={{ background: '#141b31', border: '1px solid #1f2740', borderRadius: 9, padding: 16, maxWidth: 460, width: '100%', textAlign: 'left', marginBottom: 20 }}>
                  <label style={{ fontSize: 10, letterSpacing: '.1em', color: '#5b6688', fontWeight: 700, display: 'block', marginBottom: 6 }}>
                    VINCULAR UM POP EXISTENTE:
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select
                      value={selectedPopIdToLink}
                      onChange={e => setSelectedPopIdToLink(e.target.value)}
                      style={{ flex: 1, background: '#121933', border: '1px solid #232c47', borderRadius: 7, padding: '8px 12px', color: '#e6e9f2', fontSize: 13 }}
                    >
                      <option value="">Selecione um procedimento...</option>
                      {allPops.filter(p => p.active).map(p => (
                        <option key={p.id} value={p.id}>{p.title} (v{p.version || 1})</option>
                      ))}
                    </select>
                    <button
                      onClick={handleLinkPop}
                      disabled={!selectedPopIdToLink || linking}
                      style={{ height: 34, padding: '0 14px', borderRadius: 7, border: 'none', background: '#4f6bff', color: '#fff', font: "600 12px 'IBM Plex Sans'", cursor: 'pointer' }}
                    >
                      {linking ? '...' : 'Vincular'}
                    </button>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => { onClose(); openLib(); }}
                  style={{ height: 34, padding: '0 16px', borderRadius: 7, border: '1px solid #2a3454', background: '#141b31', color: '#c6cce0', font: "500 12px 'IBM Plex Sans'", cursor: 'pointer' }}
                >
                  📚 Biblioteca de POPs
                </button>
                <button
                  onClick={onClose}
                  style={{ height: 34, padding: '0 16px', borderRadius: 7, border: '1px solid #2a3454', background: 'transparent', color: '#8b94b3', font: "500 12px 'IBM Plex Sans'", cursor: 'pointer' }}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* CASO: POP VINCULADO — 100% IDÊNTICO À REFERÊNCIA VISUAL */
          <>
            {/* CABEÇALHO */}
            <header className="pop-preview-header" style={{ padding: '22px 28px 18px', borderBottom: '1px solid #1f2740', display: 'flex', flexDirection: 'column', gap: 14, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ font: "500 11px 'IBM Plex Mono', monospace", color: '#7d93ff', background: '#1b2550', padding: '4px 8px', borderRadius: 5 }}>
                  POP · v{pop.version || 1}
                </span>

                <span style={{ flex: 1 }} />

                <button onClick={handlePrint} className="pop-preview-btn">
                  Imprimir
                </button>

                {isAdmin && (
                  <button onClick={handleEditPop} className="pop-preview-btn">
                    Editar POP
                  </button>
                )}

                <button onClick={onClose} className="pop-preview-close">
                  ×
                </button>
              </div>

              <div>
                <h1 style={{ margin: 0, fontSize: 21, fontWeight: 700, lineHeight: 1.25, color: '#fff' }}>
                  {pop.title}
                </h1>
                {task && (
                  <div style={{ fontSize: 11.5, color: '#5b6688', marginTop: 4 }}>
                    Tarefa vinculada: <span style={{ color: '#aab2cc' }}>{task.descricao}</span>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22, fontSize: 12, color: '#8b94b3' }}>
                <span>Responsável <b style={{ color: '#e6e9f2', fontWeight: 600 }}>{pop.responsible || 'Raffaela Lima'}</b></span>
                <span>Dúvidas <b style={{ color: '#e6e9f2', fontWeight: 600 }}>{pop.contact_notes || 'Gestora Financeira Raffaela Lima'}</b></span>
                <span>Tempo estimado <b style={{ color: '#e6e9f2', fontWeight: 600 }}>{pop.estimated_time || '30 min'}</b></span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, height: 6, background: '#1f2740', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progressPercent}%`, background: isAllDone ? '#22a06b' : '#4f6bff', borderRadius: 4, transition: 'width .3s ease' }} />
                </div>
                <span style={{ font: "500 12px 'IBM Plex Mono', monospace", color: isAllDone ? '#5ed39a' : '#a9b8ff', whiteSpace: 'nowrap' }}>
                  {doneCount}/{steps.length} passos
                </span>
              </div>
            </header>

            {/* CORPO COM ROLAGEM INTERNA */}
            <div
              ref={bodyScrollRef}
              className="pop-preview-scroll"
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '22px 28px 28px',
                display: 'flex',
                flexDirection: 'column',
                gap: 18
              }}
            >
              {/* OBJETIVO E QUANDO UTILIZAR */}
              <div className="pop-preview-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>
                <div style={{ background: '#141b31', border: '1px solid #1f2740', borderRadius: 9, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 10, letterSpacing: '.1em', color: '#5b6688', fontWeight: 700 }}>OBJETIVO</div>
                  <div style={{ fontSize: 13, lineHeight: 1.5, color: '#c6cce0' }}>
                    {pop.objective || 'Garantir que todas as etapas do procedimento sejam executadas sem divergências.'}
                  </div>
                </div>

                <div style={{ background: '#141b31', border: '1px solid #1f2740', borderRadius: 9, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 10, letterSpacing: '.1em', color: '#5b6688', fontWeight: 700 }}>QUANDO UTILIZAR</div>
                  <div style={{ fontSize: 13, lineHeight: 1.5, color: '#c6cce0' }}>
                    {pop.when_to_use || 'Diariamente ao final do expediente ou no início do dia subsequente para conferência.'}
                  </div>
                </div>
              </div>

              {/* PRÉ-REQUISITOS & MATERIAIS */}
              {prereqList.length > 0 && (
                <div style={{ background: '#141b31', border: '1px solid #1f2740', borderRadius: 9, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 10, letterSpacing: '.1em', color: '#5b6688', fontWeight: 700 }}>PRÉ-REQUISITOS &amp; MATERIAIS</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {prereqList.map((item, idx) => (
                      <span key={idx} style={{ fontSize: 12, padding: '4px 9px', borderRadius: 5, background: '#1a2138', color: '#c6cce0', border: '1px solid #232c47' }}>
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* ETAPAS NUMERADAS */}
              <div style={{ fontSize: 10, letterSpacing: '.1em', color: '#5b6688', paddingTop: 4, fontWeight: 700 }}>
                ETAPAS NUMERADAS ({steps.length})
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {steps.map((step, idx) => {
                  const isChecked = !!checkedSteps[step.id]
                  return (
                    <div
                      key={step.id || idx}
                      ref={el => { stepRefs.current[step.id] = el }}
                      className="pop-step-box"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '34px minmax(0,1fr)',
                        gap: 14,
                        padding: 16,
                        borderRadius: 10,
                        background: '#141b31',
                        border: isChecked ? '1px solid #2a6b4d' : '1px solid #26304f'
                      }}
                    >
                      {/* Botão de Status Circular */}
                      <button
                        type="button"
                        onClick={() => toggleStep(step.id)}
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: '50%',
                          border: isChecked ? '1.5px solid #2a6b4d' : '1.5px solid #26304f',
                          background: isChecked ? '#1d4a36' : 'transparent',
                          color: isChecked ? '#5ed39a' : '#a9b8ff',
                          font: "600 12px 'IBM Plex Mono', monospace",
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all .15s ease',
                          marginTop: 2
                        }}
                      >
                        {isChecked ? '✓' : String(step.order || idx + 1)}
                      </button>

                      {/* Informações da Etapa */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
                        <div
                          onClick={() => toggleStep(step.id)}
                          style={{
                            fontSize: 14.5,
                            fontWeight: 600,
                            lineHeight: 1.35,
                            color: '#fff',
                            cursor: 'pointer',
                            opacity: isChecked ? 0.6 : 1,
                            textDecoration: isChecked ? 'line-through' : 'none'
                          }}
                        >
                          Etapa {step.order || idx + 1}: {step.title}
                        </div>

                        <div style={{ fontSize: 13, lineHeight: 1.6, color: '#aab2cc' }}>
                          {step.instruction}
                        </div>

                        {/* Grade de Mídias e Botão de Anexar */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                          {step.media?.map((m, j) => {
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
                                key={m.id || j}
                                style={{
                                  position: 'relative',
                                  aspectRatio: '4/3',
                                  borderRadius: 8,
                                  border: '1px solid #26304f',
                                  overflow: 'hidden',
                                  background: 'repeating-linear-gradient(135deg, #161e36 0 10px, #131a30 10px 20px)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                              >
                                {m.type === 'image' && m.url && (
                                  <img src={m.url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                                )}

                                {m.type === 'video' && (
                                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#4f6bff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <div style={{ width: 0, height: 0, borderLeft: '12px solid #fff', borderTop: '8px solid transparent', borderBottom: '8px solid transparent', marginLeft: 3 }} />
                                  </div>
                                )}

                                {m.type === 'doc' && (
                                  <div style={{ position: 'absolute', inset: 0, background: '#141b31', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                    <span style={{ width: 44, height: 54, borderRadius: 5, background: docColor, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 7, font: "700 10px 'IBM Plex Mono'", color: '#fff' }}>
                                      {ext}
                                    </span>
                                    <span style={{ fontSize: 10.5, color: '#8b94b3' }}>{m.size || 'Arquivo'}</span>
                                  </div>
                                )}

                                <span style={{ position: 'absolute', left: 6, bottom: 6, right: 6, font: "500 10px 'IBM Plex Mono'", color: '#aab2cc', background: 'rgba(13, 18, 32, 0.85)', padding: '3px 6px', borderRadius: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {m.name}
                                </span>
                              </div>
                            )
                          })}

                          {/* Botão de Anexar Arquivo da Referência */}
                          <div
                            onClick={handleAttachPlaceholder}
                            style={{
                              aspectRatio: '4/3',
                              borderRadius: 8,
                              border: '1.5px dashed #34407a',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 4,
                              cursor: 'pointer',
                              color: '#a9b8ff',
                              background: '#121933',
                              transition: 'background .15s ease'
                            }}
                          >
                            <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>
                            <span style={{ fontSize: 12, fontWeight: 600 }}>Anexar arquivo</span>
                            <span style={{ fontSize: 10.5, color: '#6c779c', textAlign: 'center', padding: '0 8px' }}>Foto, vídeo, PDF, Excel, Word, OFX…</span>
                          </div>
                        </div>

                        {/* Dica / Alerta da Etapa */}
                        {step.tip && (
                          <div
                            style={{
                              fontSize: 12.5,
                              lineHeight: 1.5,
                              padding: '10px 12px',
                              borderRadius: 7,
                              background: step.tipType === 'warn' ? '#3a2318' : '#18233f',
                              color: step.tipType === 'warn' ? '#ffb48a' : '#a9b8ff',
                              border: step.tipType === 'warn' ? '1px solid rgba(255,180,138,0.2)' : '1px solid rgba(169,184,255,0.2)'
                            }}
                          >
                            <b>{step.tipType === 'warn' ? 'Atenção:' : 'Dica:'}</b> {step.tip}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* CUIDADOS & RESULTADO ESPERADO */}
              <div className="pop-preview-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12, paddingTop: 4 }}>
                <div style={{ border: '1px solid #7a2e3a', background: '#2a1720', borderRadius: 9, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#ff7a8a' }}>Cuidados e Atenção</div>
                  <div style={{ fontSize: 13, lineHeight: 1.5, color: '#f1d6da' }}>
                    {pop.cautions || 'Nunca alterar lançamentos de dias anteriores já conciliados sem autorização expressa da coordenação.'}
                  </div>
                </div>

                <div style={{ border: '1px solid #2a6b4d', background: '#13261f', borderRadius: 9, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#5ed39a' }}>Resultado Esperado</div>
                  <div style={{ fontSize: 13, lineHeight: 1.5, color: '#d3efe2' }}>
                    {pop.expected_result || 'Todas as contas bancárias com status "Conciliado" e relatório de divergências zerado.'}
                  </div>
                </div>
              </div>
            </div>

            {/* RODAPÉ */}
            <footer style={{ padding: '16px 28px', borderTop: '1px solid #1f2740', display: 'flex', alignItems: 'center', gap: 12, background: '#0f1527', flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: '#8b94b3', flex: 1 }}>
                Dúvida na execução? <a href="#" onClick={e => { e.preventDefault(); showToast(`Dúvidas: entrar em contato com ${pop.responsible || 'Raffaela Lima'}.`, 'info') }} style={{ color: '#7d93ff', textDecoration: 'none', fontWeight: 600 }}>Falar com {pop.responsible || 'Raffaela'}</a>
              </span>

              {isAdmin && task && (
                <button
                  type="button"
                  onClick={handleUnlinkPop}
                  disabled={linking}
                  style={{ height: 38, padding: '0 14px', borderRadius: 8, border: '1px solid rgba(255, 77, 109, 0.4)', background: 'transparent', color: '#ff7a8a', font: "500 13px 'IBM Plex Sans'", cursor: 'pointer' }}
                >
                  {linking ? 'Desvinculando...' : 'Desvincular'}
                </button>
              )}

              <button
                type="button"
                onClick={() => showToast('Problema reportado à coordenação com sucesso.', 'info')}
                style={{ height: 38, padding: '0 16px', borderRadius: 8, border: '1px solid #2a3454', background: 'transparent', color: '#c6cce0', font: "500 13px 'IBM Plex Sans'", cursor: 'pointer' }}
              >
                Reportar problema
              </button>

              <button
                type="button"
                onClick={handleNextStep}
                style={{ height: 38, padding: '0 18px', borderRadius: 8, border: 'none', background: isAllDone ? '#22a06b' : '#4f6bff', color: '#fff', font: "600 13px 'IBM Plex Sans'", cursor: 'pointer', transition: 'background .2s ease' }}
              >
                {isAllDone ? 'Concluir consulta' : 'Executar próximo passo'}
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
  )
}
