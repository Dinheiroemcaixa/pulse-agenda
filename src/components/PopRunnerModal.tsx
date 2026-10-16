import { useState, useEffect, useRef } from 'react'
import type { Pop, PopStepMedia, Task, User } from '../types'
import { DEFAULT_POPS, getLocalPops, resolveTaskPopId } from '../lib/popsApi'

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
    onClose,
    onOpenPopLibrary,
    onOpenLibrary,
    onOpenPopEdit,
    showToast
  } = props

  const basePops = (propAllPops && propAllPops.length > 0)
    ? propAllPops
    : ((propPops && propPops.length > 0) ? propPops : getLocalPops())
  const allPops = basePops.length > 0 ? basePops : DEFAULT_POPS

  const resolvedPopId = task ? (task.pop_id || resolveTaskPopId(task)) : undefined
  const rawPop = explicitPop || allPops.find(p => p.id === resolvedPopId) || allPops[0] || DEFAULT_POPS[0]

  // Garante hidratação completa de mídias, dicas e pré-requisitos da referência visual
  const defaultMatch = DEFAULT_POPS.find(d => d.id === rawPop?.id) || DEFAULT_POPS[0]
  const hasRichMedia = Array.isArray(rawPop?.steps) && rawPop.steps.some(s => Array.isArray(s.media) && s.media.length > 0)
  const pop: Pop = rawPop
    ? {
        ...defaultMatch,
        ...rawPop,
        title: rawPop.title === 'Fechamento Diário de Caixa e Conciliação' ? defaultMatch.title : (rawPop.title || defaultMatch.title),
        prerequisites: (!rawPop.prerequisites || rawPop.prerequisites.includes('sistema ERP e extrato'))
          ? defaultMatch.prerequisites
          : rawPop.prerequisites,
        contact_notes: (!rawPop.contact_notes || rawPop.contact_notes.startsWith('Dúvidas falar com'))
          ? defaultMatch.contact_notes
          : rawPop.contact_notes,
        estimated_time: rawPop.estimated_time || defaultMatch.estimated_time || '30 min',
        steps: hasRichMedia ? rawPop.steps : defaultMatch.steps
      }
    : DEFAULT_POPS[0]

  const openLib = onOpenPopLibrary || onOpenLibrary || (() => {})

  // Estado idêntico ao POP Tarefa.dc.html: Etapa 1 (índice 0 / id 's1') iniciada como marcada (1/4 passos)
  // Nota: marcar etapas aqui é apenas guia de execução local e NÃO altera o status da tarefa.
  const [doneStepIndices, setDoneStepIndices] = useState<number[]>([0])
  const [extraMedia, setExtraMedia] = useState<Record<number, PopStepMedia[]>>({})
  const [removedMedia, setRemovedMedia] = useState<Record<string, boolean>>({})
  const stepRefs = useRef<Record<number, HTMLDivElement | null>>({})

  useEffect(() => {
    setDoneStepIndices([0])
  }, [pop?.id])

  const steps = pop?.steps || []
  const totalSteps = steps.length
  const doneCount = doneStepIndices.filter(i => i >= 0 && i < totalSteps).length
  const progressPercent = totalSteps > 0 ? (doneCount / totalSteps) * 100 : 0
  const isAllDone = totalSteps > 0 && doneCount === totalSteps

  const toggleStepIndex = (idx: number) => {
    setDoneStepIndices(prev =>
      prev.includes(idx) ? prev.filter(x => x !== idx) : [...prev, idx]
    )
  }

  const handleNextStep = () => {
    if (isAllDone) {
      onClose()
      return
    }
    const nextIdx = steps.findIndex((_, idx) => !doneStepIndices.includes(idx))
    if (nextIdx !== -1) {
      setDoneStepIndices(prev => [...prev, nextIdx])
      const el = stepRefs.current[nextIdx]
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }

  const handleAddFiles = (stepIdx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    const added: PopStepMedia[] = files.map(f => {
      const isVid = f.type.startsWith('video')
      const isImg = f.type.startsWith('image')
      const sizeStr = f.size > 1048576
        ? (f.size / 1048576).toFixed(1) + ' MB'
        : Math.max(1, Math.round(f.size / 1024)) + ' KB'
      return {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: f.name,
        type: isVid ? 'video' : isImg ? 'image' : 'doc',
        url: URL.createObjectURL(f),
        size: sizeStr,
        extension: (f.name.split('.').pop() || 'ARQ').slice(0, 4).toUpperCase()
      }
    })
    e.target.value = ''
    setExtraMedia(prev => ({
      ...prev,
      [stepIdx]: [...(prev[stepIdx] || []), ...added]
    }))
  }

  const handleRemoveMedia = (stepIdx: number, mediaIdx: number) => {
    setRemovedMedia(prev => ({
      ...prev,
      [`${stepIdx}-${mediaIdx}`]: true
    }))
  }

  function parsePrerequisites(raw?: string): string[] {
    if (!raw || !raw.trim()) {
      return [
        'Acesso ao internet banking dos clientes',
        'Sistema ERP',
        'Extrato consolidado OFX/PDF'
      ]
    }
    if (raw.includes('\n')) {
      return raw.split('\n').map(s => s.trim().replace(/^[-•*]\s*/, '')).filter(Boolean)
    }
    if (raw.includes(';') || raw.includes(',')) {
      return raw.split(/[;,]/).map(s => s.trim().replace(/^[-•*]\s*/, '').replace(/\.$/, '')).filter(Boolean)
    }
    return [raw.trim()]
  }

  const prereqList = parsePrerequisites(pop?.prerequisites)

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=840,height=900')
    if (!printWindow) {
      window.print()
      return
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${pop.title} — POP v${pop.version || 1}</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
          <style>
            @media print { body { margin: 1cm; } }
            body {
              font-family: 'IBM Plex Sans', system-ui, sans-serif;
              color: #111827;
              line-height: 1.5;
              padding: 24px;
            }
            .header { border-bottom: 2px solid #e5e7eb; padding-bottom: 16px; margin-bottom: 20px; }
            .badge {
              display: inline-block;
              background: #1b2550;
              color: #7d93ff;
              font: 500 11px 'IBM Plex Mono', monospace;
              padding: 4px 8px;
              border-radius: 5px;
              margin-bottom: 8px;
            }
            h1 { font-size: 21px; margin: 4px 0 8px; color: #111827; font-weight: 700; }
            .meta { display: flex; flex-wrap: wrap; gap: 22px; font-size: 12px; color: #4b5563; margin-top: 8px; }
            .meta b { color: #111827; font-weight: 600; }
            .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
            .card { border: 1px solid #e5e7eb; border-radius: 9px; padding: 14px 16px; background: #f9fafb; }
            .card-title { font-size: 10px; color: #5b6688; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 6px; }
            .card-body { font-size: 13px; color: #1f2937; }
            .step-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; margin-bottom: 12px; page-break-inside: avoid; }
            .step-title { font-size: 14.5px; font-weight: 600; color: #111827; margin-bottom: 6px; }
            .step-inst { font-size: 13px; color: #374151; }
            .cautions-box { border: 1px solid #7a2e3a; background: #fef2f2; color: #991b1b; border-radius: 9px; padding: 14px 16px; }
            .expected-box { border: 1px solid #2a6b4d; background: #f0fdf4; color: #166534; border-radius: 9px; padding: 14px 16px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="badge">POP · v${pop.version || 1}</div>
            <h1>${pop.title}</h1>
            <div class="meta">
              <span>Responsável <b>${pop.responsible || 'Raffaela Lima'}</b></span>
              <span>Dúvidas <b>${pop.contact_notes || 'Gestora Financeira Raffaela Lima'}</b></span>
              <span>Tempo estimado <b>${pop.estimated_time || '30 min'}</b></span>
            </div>
          </div>
          <div class="grid-2">
            <div class="card"><div class="card-title">OBJETIVO</div><div class="card-body">${pop.objective}</div></div>
            <div class="card"><div class="card-title">QUANDO UTILIZAR</div><div class="card-body">${pop.when_to_use}</div></div>
          </div>
          <div class="card" style="margin-bottom: 16px;">
            <div class="card-title">PRÉ-REQUISITOS &amp; MATERIAIS</div>
            <div class="card-body" style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px;">
              ${prereqList.map(item => `<span style="background: #e5e7eb; padding: 4px 9px; border-radius: 5px; font-size: 12px;">${item}</span>`).join('')}
            </div>
          </div>
          <div style="font-size: 10px; color: #5b6688; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 10px;">ETAPAS NUMERADAS (${steps.length})</div>
          ${steps.map((s, idx) => {
            const num = s.order || idx + 1
            const displayTitle = s.title.startsWith('Etapa ') ? s.title : `Etapa ${num}: ${s.title}`
            return `
              <div class="step-card">
                <div class="step-title">${displayTitle}</div>
                <div class="step-inst">${s.instruction}</div>
              </div>
            `
          }).join('')}
          <div class="grid-2" style="margin-top: 14px;">
            <div class="cautions-box"><strong>Cuidados e Atenção</strong><br>${pop.cautions}</div>
            <div class="expected-box"><strong>Resultado Esperado</strong><br>${pop.expected_result}</div>
          </div>
          <script>window.onload = function() { window.print(); };</script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  const handleEditPop = () => {
    onClose()
    if (onOpenPopEdit) {
      onOpenPopEdit(pop)
    } else {
      openLib()
      showToast('Abra o procedimento na biblioteca para editar suas instruções.', 'info')
    }
  }

  const responsibleFirstName = (pop.responsible || 'Raffaela Lima').split(' ')[0]

  return (
    <div
      data-testid="pop-runner-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
        color: '#e6e9f2'
      }}
    >
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
        rel="stylesheet"
      />
      <style>{`
        .pop-dc-modal, .pop-dc-modal * {
          box-sizing: border-box;
        }
        .pop-dc-attach-label:hover {
          background: #18214a !important;
        }
        @media (max-width: 680px) {
          .pop-dc-modal {
            top: 12px !important;
            bottom: 12px !important;
            width: calc(100% - 16px) !important;
          }
          .pop-dc-grid2 {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      {/* Backdrop idêntico a POP Tarefa.dc.html (linha 49) */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(6, 9, 18, 0.62)'
        }}
      />

      {/* Janela Principal idêntica a POP Tarefa.dc.html (linha 50) e POP-preview.png */}
      <section
        className="pop-dc-modal"
        data-testid="pop-runner-modal"
        style={{
          position: 'absolute',
          top: 32,
          bottom: 32,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(820px, calc(100% - 32px))',
          background: '#10162a',
          border: '1px solid #26304f',
          borderRadius: 14,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 30px 80px rgba(0, 0, 0, 0.5)',
          fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
          color: '#e6e9f2'
        }}
      >
        {/* CABEÇALHO — linhas 51-69 de POP Tarefa.dc.html */}
        <header
          style={{
            padding: '22px 28px 18px',
            borderBottom: '1px solid #1f2740',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                font: "500 11px 'IBM Plex Mono', monospace",
                color: '#7d93ff',
                background: '#1b2550',
                padding: '4px 8px',
                borderRadius: 5
              }}
            >
              POP · v{pop.version || 1}
            </span>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              onClick={handlePrint}
              style={{
                height: 32,
                padding: '0 12px',
                borderRadius: 7,
                border: '1px solid #2a3454',
                background: 'transparent',
                color: '#c6cce0',
                font: "500 12px 'IBM Plex Sans', sans-serif",
                cursor: 'pointer'
              }}
            >
              Imprimir
            </button>
            <button
              type="button"
              onClick={handleEditPop}
              style={{
                height: 32,
                padding: '0 12px',
                borderRadius: 7,
                border: '1px solid #2a3454',
                background: 'transparent',
                color: '#c6cce0',
                font: "500 12px 'IBM Plex Sans', sans-serif",
                cursor: 'pointer'
              }}
            >
              Editar POP
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar POP"
              style={{
                width: 32,
                height: 32,
                borderRadius: 7,
                border: '1px solid #2a3454',
                background: 'transparent',
                color: '#c6cce0',
                fontSize: 16,
                cursor: 'pointer'
              }}
            >
              ×
            </button>
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 21,
              fontWeight: 700,
              lineHeight: 1.25,
              color: '#e6e9f2'
            }}
          >
            {pop.title}
          </h1>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 22,
              fontSize: 12,
              color: '#8b94b3'
            }}
          >
            <span>
              Responsável{' '}
              <b style={{ color: '#e6e9f2', fontWeight: 600 }}>
                {pop.responsible || 'Raffaela Lima'}
              </b>
            </span>
            <span>
              Dúvidas{' '}
              <b style={{ color: '#e6e9f2', fontWeight: 600 }}>
                {pop.contact_notes || 'Gestora Financeira Raffaela Lima'}
              </b>
            </span>
            <span>
              Tempo estimado{' '}
              <b style={{ color: '#e6e9f2', fontWeight: 600 }}>
                {pop.estimated_time || '30 min'}
              </b>
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                flex: 1,
                height: 6,
                background: '#1f2740',
                borderRadius: 4,
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${progressPercent}%`,
                  background: '#4f6bff',
                  borderRadius: 4,
                  transition: 'width .3s'
                }}
              />
            </div>
            <span
              style={{
                font: "500 12px 'IBM Plex Mono', monospace",
                color: '#a9b8ff'
              }}
            >
              {doneCount}/{totalSteps} passos
            </span>
          </div>
        </header>

        {/* CORPO COM ROLAGEM INTERNA — linhas 71-143 de POP Tarefa.dc.html */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '22px 28px 28px',
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            colorScheme: 'dark'
          }}
        >
          {/* OBJETIVO & QUANDO UTILIZAR */}
          <div
            className="pop-dc-grid2"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)',
              gap: 12
            }}
          >
            <div
              style={{
                background: '#141b31',
                border: '1px solid #1f2740',
                borderRadius: 9,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6
              }}
            >
              <div style={{ fontSize: 10, letterSpacing: '.1em', color: '#5b6688' }}>
                OBJETIVO
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5, color: '#c6cce0' }}>
                {pop.objective}
              </div>
            </div>

            <div
              style={{
                background: '#141b31',
                border: '1px solid #1f2740',
                borderRadius: 9,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6
              }}
            >
              <div style={{ fontSize: 10, letterSpacing: '.1em', color: '#5b6688' }}>
                QUANDO UTILIZAR
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5, color: '#c6cce0' }}>
                {pop.when_to_use}
              </div>
            </div>
          </div>

          {/* PRÉ-REQUISITOS & MATERIAIS */}
          <div
            style={{
              background: '#141b31',
              border: '1px solid #1f2740',
              borderRadius: 9,
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}
          >
            <div style={{ fontSize: 10, letterSpacing: '.1em', color: '#5b6688' }}>
              PRÉ-REQUISITOS &amp; MATERIAIS
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {prereqList.map((item, idx) => (
                <span
                  key={idx}
                  style={{
                    fontSize: 12,
                    padding: '4px 9px',
                    borderRadius: 5,
                    background: '#1a2138',
                    color: '#c6cce0'
                  }}
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          {/* ETAPAS NUMERADAS */}
          <div
            style={{
              fontSize: 10,
              letterSpacing: '.1em',
              color: '#5b6688',
              paddingTop: 4
            }}
          >
            ETAPAS NUMERADAS ({totalSteps})
          </div>

          {steps.map((step, idx) => {
            const isOk = doneStepIndices.includes(idx)
            const stepNum = step.order || idx + 1
            const displayTitle = step.title.startsWith('Etapa ')
              ? step.title
              : `Etapa ${stepNum}: ${step.title}`

            const combinedMedia = [
              ...(step.media || []),
              ...(extraMedia[idx] || [])
            ]
              .map((m, j) => ({ ...m, j }))
              .filter(m => !removedMedia[`${idx}-${m.j}`])

            const isWarnTip = step.tipType === 'warn'

            return (
              <div
                key={step.id || idx}
                ref={el => {
                  stepRefs.current[idx] = el
                }}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '34px minmax(0,1fr)',
                  gap: 14,
                  padding: 16,
                  borderRadius: 10,
                  background: '#141b31',
                  border: `1px solid ${isOk ? '#2a6b4d' : '#26304f'}`
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleStepIndex(idx)}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    border: `1.5px solid ${isOk ? '#2a6b4d' : '#26304f'}`,
                    background: isOk ? '#1d4a36' : 'transparent',
                    color: isOk ? '#5ed39a' : '#a9b8ff',
                    font: "600 12px 'IBM Plex Mono', monospace",
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0
                  }}
                >
                  {isOk ? '✓' : String(stepNum)}
                </button>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    minWidth: 0
                  }}
                >
                  <div
                    onClick={() => toggleStepIndex(idx)}
                    style={{
                      fontSize: 14.5,
                      fontWeight: 600,
                      lineHeight: 1.35,
                      color: '#e6e9f2',
                      opacity: isOk ? 0.6 : 1,
                      cursor: 'pointer'
                    }}
                  >
                    {displayTitle}
                  </div>

                  <div
                    style={{
                      fontSize: 13,
                      lineHeight: 1.6,
                      color: '#aab2cc'
                    }}
                  >
                    {step.instruction}
                  </div>

                  {/* Grade de Mídias + Botão Anexar Arquivo (linhas 98-126 de POP Tarefa.dc.html) */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                      gap: 8
                    }}
                  >
                    {combinedMedia.map(m => {
                      const ext = (
                        m.extension ||
                        (m.name.split('.').pop() || 'ARQ')
                      )
                        .slice(0, 4)
                        .toUpperCase()
                      const docColor =
                        (
                          {
                            PDF: '#d64545',
                            XLSX: '#1f8a55',
                            XLS: '#1f8a55',
                            CSV: '#1f8a55',
                            DOCX: '#2f62d6',
                            DOC: '#2f62d6',
                            OFX: '#8a5cd6',
                            ZIP: '#7a7f95'
                          } as Record<string, string>
                        )[ext] || '#4f6bff'

                      const isImgWithUrl = m.type === 'image' && !!m.url
                      const isVidWithUrl = m.type === 'video' && !!m.url
                      const showPlayIcon = m.type === 'video' && !m.url
                      const isDoc = m.type === 'doc'

                      return (
                        <div
                          key={`${idx}-${m.j}`}
                          style={{
                            position: 'relative',
                            aspectRatio: '4/3',
                            borderRadius: 8,
                            border: '1px solid #26304f',
                            overflow: 'hidden',
                            background:
                              'repeating-linear-gradient(135deg, #161e36 0 10px, #131a30 10px 20px)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          {isImgWithUrl && (
                            <img
                              src={m.url}
                              alt=""
                              style={{
                                position: 'absolute',
                                inset: 0,
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover'
                              }}
                            />
                          )}

                          {isVidWithUrl && (
                            <video
                              src={m.url}
                              controls
                              style={{
                                position: 'absolute',
                                inset: 0,
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                background: '#000'
                              }}
                            />
                          )}

                          {isDoc && (
                            <a
                              href={m.url || '#'}
                              download={m.url ? m.name : undefined}
                              onClick={e => {
                                if (!m.url) e.preventDefault()
                              }}
                              style={{
                                position: 'absolute',
                                inset: 0,
                                background: '#141b31',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8,
                                textDecoration: 'none'
                              }}
                            >
                              <span
                                style={{
                                  width: 44,
                                  height: 54,
                                  borderRadius: 5,
                                  background: docColor,
                                  display: 'flex',
                                  alignItems: 'flex-end',
                                  justifyContent: 'center',
                                  paddingBottom: 7,
                                  font: "700 10px 'IBM Plex Mono', monospace",
                                  color: '#fff'
                                }}
                              >
                                {ext}
                              </span>
                              <span style={{ fontSize: 10.5, color: '#8b94b3' }}>
                                {m.size || ''}
                              </span>
                            </a>
                          )}

                          {showPlayIcon && (
                            <div
                              style={{
                                width: 40,
                                height: 40,
                                borderRadius: '50%',
                                background: '#4f6bff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              <div
                                style={{
                                  width: 0,
                                  height: 0,
                                  borderLeft: '12px solid #fff',
                                  borderTop: '8px solid transparent',
                                  borderBottom: '8px solid transparent',
                                  marginLeft: 3
                                }}
                              />
                            </div>
                          )}

                          <span
                            style={{
                              position: 'absolute',
                              left: 6,
                              bottom: 6,
                              right: 6,
                              font: "500 10px 'IBM Plex Mono', monospace",
                              color: '#aab2cc',
                              background: 'rgba(13, 18, 32, 0.85)',
                              padding: '3px 6px',
                              borderRadius: 4,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}
                          >
                            {m.name}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleRemoveMedia(idx, m.j)}
                            title="Remover"
                            style={{
                              position: 'absolute',
                              top: 6,
                              right: 6,
                              width: 22,
                              height: 22,
                              borderRadius: 5,
                              border: 'none',
                              background: 'rgba(13, 18, 32, 0.85)',
                              color: '#c6cce0',
                              fontSize: 13,
                              cursor: 'pointer'
                            }}
                          >
                            ×
                          </button>
                        </div>
                      )
                    })}

                    <label
                      className="pop-dc-attach-label"
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
                        background: '#121933'
                      }}
                    >
                      <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>
                        Anexar arquivo
                      </span>
                      <span
                        style={{
                          fontSize: 10.5,
                          color: '#6c779c',
                          textAlign: 'center',
                          padding: '0 6px'
                        }}
                      >
                        Foto, vídeo, PDF, Excel, Word, OFX…
                      </span>
                      <input
                        type="file"
                        multiple
                        onChange={e => handleAddFiles(idx, e)}
                        style={{ display: 'none' }}
                      />
                    </label>
                  </div>

                  {step.tip && (
                    <div
                      style={{
                        fontSize: 12.5,
                        lineHeight: 1.5,
                        padding: '10px 12px',
                        borderRadius: 7,
                        background: isWarnTip ? '#3a2318' : '#18233f',
                        color: isWarnTip ? '#ffb48a' : '#a9b8ff'
                      }}
                    >
                      <b>{isWarnTip ? 'Atenção:' : 'Dica:'}</b> {step.tip}
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {/* CUIDADOS E ATENÇÃO & RESULTADO ESPERADO — linhas 133-142 de POP Tarefa.dc.html */}
          <div
            className="pop-dc-grid2"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)',
              gap: 12,
              paddingTop: 4
            }}
          >
            <div
              style={{
                border: '1px solid #7a2e3a',
                background: '#2a1720',
                borderRadius: 9,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: '#ff7a8a' }}>
                Cuidados e Atenção
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5, color: '#f1d6da' }}>
                {pop.cautions}
              </div>
            </div>

            <div
              style={{
                border: '1px solid #2a6b4d',
                background: '#13261f',
                borderRadius: 9,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: '#5ed39a' }}>
                Resultado Esperado
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5, color: '#d3efe2' }}>
                {pop.expected_result}
              </div>
            </div>
          </div>
        </div>

        {/* RODAPÉ — linhas 145-149 de POP Tarefa.dc.html */}
        <footer
          style={{
            padding: '16px 28px',
            borderTop: '1px solid #1f2740',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: '#0f1527',
            flexShrink: 0
          }}
        >
          <span style={{ fontSize: 12, color: '#8b94b3', flex: 1 }}>
            Dúvida na execução?{' '}
            <a
              href="#"
              onClick={e => {
                e.preventDefault()
                showToast(
                  `Contato: ${pop.contact_notes || pop.responsible || 'Raffaela Lima'}`,
                  'info'
                )
              }}
              style={{ color: '#7d93ff', textDecoration: 'none' }}
            >
              Falar com {responsibleFirstName}
            </a>
          </span>

          <button
            type="button"
            onClick={() =>
              showToast('Problema reportado à coordenação com sucesso.', 'info')
            }
            style={{
              height: 38,
              padding: '0 16px',
              borderRadius: 8,
              border: '1px solid #2a3454',
              background: 'transparent',
              color: '#c6cce0',
              font: "500 13px 'IBM Plex Sans', sans-serif",
              cursor: 'pointer'
            }}
          >
            Reportar problema
          </button>

          <button
            type="button"
            onClick={handleNextStep}
            style={{
              height: 38,
              padding: '0 18px',
              borderRadius: 8,
              border: 'none',
              background: isAllDone ? '#22a06b' : '#4f6bff',
              color: '#fff',
              font: "600 13px 'IBM Plex Sans', sans-serif",
              cursor: 'pointer'
            }}
          >
            {isAllDone ? 'Concluir tarefa' : 'Executar próximo passo'}
          </button>
        </footer>
      </section>
    </div>
  )
}

