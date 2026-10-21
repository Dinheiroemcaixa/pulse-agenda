import { useState, useEffect, useRef } from 'react'
import type { Pop, PopStep, PopStepMedia, Task, User } from '../types'
import {
  DEFAULT_POPS,
  getLocalPops,
  resolveTaskPopId,
  savePopApi,
  linkTaskToPopApi
} from '../lib/popsApi'
import { genId } from '../lib/utils'

interface Props {
  pop?: Pop
  task?: Task
  allPops?: Pop[]
  pops?: Pop[]
  currentUser?: User
  isAdmin?: boolean
  initialMode?: 'view' | 'edit'
  createNew?: boolean
  onClose: () => void
  onSaved?: (savedPop: Pop) => void
  onOpenPopLibrary?: () => void
  onOpenLibrary?: () => void
  onOpenPopEdit?: (pop: Pop) => void
  onPopLinked?: (taskId: string, popId: string | null) => void
  onRefreshPops?: () => Promise<void>
  showToast: (msg: string, type?: string) => void
}

function readFileToMediaItem(f: File): Promise<PopStepMedia> {
  return new Promise(resolve => {
    const isVid = f.type.startsWith('video') || /\.(mp4|webm|mov|avi|mkv)$/i.test(f.name)
    const isImg = f.type.startsWith('image') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(f.name)
    const sizeStr =
      f.size > 1048576
        ? (f.size / 1048576).toFixed(1) + ' MB'
        : Math.max(1, Math.round(f.size / 1024)) + ' KB'
    const ext = (f.name.split('.').pop() || 'ARQ').slice(0, 4).toUpperCase()
    const baseItem: PopStepMedia = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: f.name,
      type: isVid ? 'video' : isImg ? 'image' : 'doc',
      size: sizeStr,
      extension: ext
    }

    // Até 1.5 MB converte para Data URL para persistir em localStorage/Supabase após recarregar
    if (f.size <= 1572864) {
      const reader = new FileReader()
      reader.onload = () => {
        resolve({
          ...baseItem,
          url: typeof reader.result === 'string' ? reader.result : URL.createObjectURL(f)
        })
      }
      reader.onerror = () => {
        resolve({
          ...baseItem,
          url: URL.createObjectURL(f)
        })
      }
      reader.readAsDataURL(f)
    } else {
      resolve({
        ...baseItem,
        url: URL.createObjectURL(f)
      })
    }
  })
}

export function PopRunnerModal(props: Props) {
  const {
    pop: explicitPop,
    task,
    allPops: propAllPops,
    pops: propPops,
    currentUser,
    isAdmin,
    initialMode = 'view',
    createNew = false,
    onClose,
    onSaved,
    onPopLinked,
    onRefreshPops,
    showToast
  } = props

  const canEdit = Boolean(isAdmin)

  const basePops =
    propAllPops && propAllPops.length > 0
      ? propAllPops
      : propPops && propPops.length > 0
        ? propPops
        : getLocalPops()
  const allPops = basePops.length > 0 ? basePops : DEFAULT_POPS

  const initialLinkedPopId = task ? task.pop_id || resolveTaskPopId(task) : explicitPop?.id
  const [selectedTaskPopId, setSelectedTaskPopId] = useState<string | undefined>(initialLinkedPopId)
  const [currentPopOverride, setCurrentPopOverride] = useState<Pop | null>(null)

  const emptyPopTemplate: Pop = {
    id: '',
    title: '',
    objective: '',
    when_to_use: '',
    prerequisites: '',
    steps: [
      {
        id: genId(),
        order: 1,
        title: '',
        instruction: '',
        media: [],
        tip: '',
        tipType: 'info'
      }
    ],
    cautions: '',
    expected_result: '',
    contact_notes: '',
    responsible: currentUser?.name || 'Raffaela Lima',
    estimated_time: '30 min',
    active: true,
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  // Resolução unificada: busca sempre a versão mais atualizada em allPops
  const resolvedPopId = task
    ? selectedTaskPopId || task.pop_id || resolveTaskPopId(task)
    : explicitPop?.id

  const rawPop: Pop | undefined =
    createNew && !currentPopOverride
      ? emptyPopTemplate
      : currentPopOverride
        ? allPops.find(p => p.id === currentPopOverride.id) || currentPopOverride
        : explicitPop
          ? allPops.find(p => p.id === explicitPop.id) || explicitPop
          : allPops.find(p => p.id === resolvedPopId) || allPops[0] || DEFAULT_POPS[0]

  // Hidratação segura: só usa defaultMatch se o ID realmente pertencer a DEFAULT_POPS
  // e nunca sobrescreve steps quando rawPop já possui etapas válidas.
  const defaultMatch = DEFAULT_POPS.find(d => d.id === rawPop?.id)
  const hasRawSteps = Array.isArray(rawPop?.steps) && rawPop.steps.length > 0

  const pop: Pop =
    createNew && !currentPopOverride
      ? emptyPopTemplate
      : rawPop
        ? {
            ...(defaultMatch || {}),
            ...rawPop,
            title: rawPop.title || defaultMatch?.title || '',
            prerequisites:
              rawPop.prerequisites !== undefined && rawPop.prerequisites !== ''
                ? rawPop.prerequisites
                : defaultMatch?.prerequisites || '',
            contact_notes:
              rawPop.contact_notes !== undefined && rawPop.contact_notes !== ''
                ? rawPop.contact_notes
                : defaultMatch?.contact_notes || '',
            estimated_time: rawPop.estimated_time || defaultMatch?.estimated_time || '30 min',
            steps: hasRawSteps ? rawPop.steps : defaultMatch?.steps || []
          }
        : DEFAULT_POPS[0]

  // Modo de visualização vs edição interna unificada
  const [isEditing, setIsEditing] = useState<boolean>(
    Boolean((createNew || initialMode === 'edit') && canEdit)
  )
  const [isSaving, setIsSaving] = useState(false)

  // Estados do formulário de edição completa no PopRunnerModal
  const [fTitle, setFTitle] = useState(pop.title || '')
  const [fResponsible, setFResponsible] = useState(
    pop.responsible || currentUser?.name || 'Raffaela Lima'
  )
  const [fContactNotes, setFContactNotes] = useState(
    pop.contact_notes || 'Gestora Financeira Raffaela Lima'
  )
  const [fEstimatedTime, setFEstimatedTime] = useState(pop.estimated_time || '30 min')
  const [fObjective, setFObjective] = useState(pop.objective || '')
  const [fWhenToUse, setFWhenToUse] = useState(pop.when_to_use || '')
  const [fPrerequisites, setFPrerequisites] = useState(pop.prerequisites || '')
  const [fCautions, setFCautions] = useState(pop.cautions || '')
  const [fExpectedResult, setFExpectedResult] = useState(pop.expected_result || '')
  const [fSteps, setFSteps] = useState<PopStep[]>(() =>
    pop.steps && pop.steps.length > 0
      ? pop.steps.map((s, i) => ({
          ...s,
          order: i + 1,
          media: [...(s.media || [])],
          tip: s.tip || '',
          tipType: s.tipType || 'info'
        }))
      : [
          {
            id: genId(),
            order: 1,
            title: '',
            instruction: '',
            media: [],
            tip: '',
            tipType: 'info'
          }
        ]
  )

  // Mini-painel inline para adicionar vídeo/planilha/documento/imagem rapidamente em uma etapa
  const [quickMediaStepIdx, setQuickMediaStepIdx] = useState<number | null>(null)
  const [qmKind, setQmKind] = useState<'video' | 'xlsx' | 'pdf' | 'image'>('video')
  const [qmName, setQmName] = useState('')
  const [qmUrl, setQmUrl] = useState('')

  const populateForm = (source: Pop) => {
    setFTitle(source.title || '')
    setFResponsible(source.responsible || currentUser?.name || 'Raffaela Lima')
    setFContactNotes(source.contact_notes || '')
    setFEstimatedTime(source.estimated_time || '30 min')
    setFObjective(source.objective || '')
    setFWhenToUse(source.when_to_use || '')
    setFPrerequisites(source.prerequisites || '')
    setFCautions(source.cautions || '')
    setFExpectedResult(source.expected_result || '')
    setFSteps(
      source.steps && source.steps.length > 0
        ? source.steps.map((s, i) => ({
            ...s,
            order: i + 1,
            media: [...(s.media || [])],
            tip: s.tip || '',
            tipType: s.tipType || 'info'
          }))
        : [
            {
              id: genId(),
              order: 1,
              title: '',
              instruction: '',
              media: [],
              tip: '',
              tipType: 'info'
            }
          ]
    )
  }

  // Estado de execução de etapas no modo visualização
  const [doneStepIndices, setDoneStepIndices] = useState<number[]>([0])
  const stepRefs = useRef<Record<number, HTMLDivElement | null>>({})

  useEffect(() => {
    setDoneStepIndices([0])
  }, [pop?.id])

  const steps = isEditing ? fSteps : pop?.steps || []
  const totalSteps = steps.length
  const doneCount = doneStepIndices.filter(i => i >= 0 && i < totalSteps).length
  const progressPercent = totalSteps > 0 ? (doneCount / totalSteps) * 100 : 0
  const isAllDone = totalSteps > 0 && doneCount === totalSteps

  const toggleStepIndex = (idx: number) => {
    if (isEditing) return
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

  // Persistência real de mídias no modo visualização
  const persistViewModeSteps = async (updatedSteps: PopStep[], toastMsg?: string) => {
    if (!pop.id) return
    const saved = await savePopApi(
      {
        ...pop,
        steps: updatedSteps.map((s, i) => ({ ...s, order: i + 1 }))
      },
      pop.id
    )
    setCurrentPopOverride(saved)
    await onRefreshPops?.()
    if (toastMsg) showToast(toastMsg, 'success')
  }

  const handleAddFiles = async (stepIdx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length === 0) return

    const hasOversized = files.some(f => f.size > 1572864)
    const added = await Promise.all(files.map(readFileToMediaItem))

    if (isEditing) {
      setFSteps(prev =>
        prev.map((s, idx) =>
          idx === stepIdx ? { ...s, media: [...(s.media || []), ...added] } : s
        )
      )
      if (hasOversized) {
        showToast(
          '⚠️ Arquivo acima de 1,5 MB: referência incluída na etapa. Para vídeos/arquivos grandes permanentes, informe o link em "+ Vídeo / Planilha".',
          'info'
        )
      } else {
        showToast('📎 Arquivo(s) incluído(s) na etapa!', 'info')
      }
    } else {
      const updatedSteps = (pop.steps || []).map((s, idx) =>
        idx === stepIdx ? { ...s, media: [...(s.media || []), ...added] } : s
      )
      await persistViewModeSteps(
        updatedSteps,
        hasOversized
          ? '⚠️ Arquivo > 1,5 MB: referência salva. Para arquivos grandes, use "+ Vídeo / Planilha" com link.'
          : '📎 Anexo salvo no POP!'
      )
    }
  }

  const handleRemoveMedia = async (stepIdx: number, mediaIdx: number) => {
    if (isEditing) {
      setFSteps(prev =>
        prev.map((s, idx) =>
          idx === stepIdx
            ? { ...s, media: (s.media || []).filter((_, mIdx) => mIdx !== mediaIdx) }
            : s
        )
      )
    } else {
      const updatedSteps = (pop.steps || []).map((s, idx) =>
        idx === stepIdx
          ? { ...s, media: (s.media || []).filter((_, mIdx) => mIdx !== mediaIdx) }
          : s
      )
      await persistViewModeSteps(updatedSteps, '🗑 Anexo removido do POP.')
    }
  }

  const handleConfirmQuickMedia = async (stepIdx: number) => {
    const trimmedName = qmName.trim()
    const defaultNameByKind: Record<'video' | 'xlsx' | 'pdf' | 'image', string> = {
      video: 'video-tutorial-etapa.mp4',
      xlsx: 'planilha-apoio-etapa.xlsx',
      pdf: 'manual-referencia.pdf',
      image: 'captura-tela-etapa.png'
    }
    const finalName = trimmedName || defaultNameByKind[qmKind]
    const extFromName = finalName.includes('.')
      ? (finalName.split('.').pop() || '').slice(0, 4).toUpperCase()
      : ''
    const extByKind: Record<'video' | 'xlsx' | 'pdf' | 'image', string> = {
      video: 'MP4',
      xlsx: 'XLSX',
      pdf: 'PDF',
      image: 'PNG'
    }
    const newMedia: PopStepMedia = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: finalName,
      type: qmKind === 'video' ? 'video' : qmKind === 'image' ? 'image' : 'doc',
      url: qmUrl.trim() || undefined,
      extension: extFromName || extByKind[qmKind],
      size: qmKind === 'video' ? 'Vídeo' : qmKind === 'xlsx' ? 'Planilha' : qmKind === 'pdf' ? 'Documento' : 'Imagem'
    }

    setQuickMediaStepIdx(null)
    setQmName('')
    setQmUrl('')

    if (isEditing) {
      setFSteps(prev =>
        prev.map((s, idx) =>
          idx === stepIdx ? { ...s, media: [...(s.media || []), newMedia] } : s
        )
      )
      showToast('📎 Item adicionado à etapa!', 'info')
    } else {
      const updatedSteps = (pop.steps || []).map((s, idx) =>
        idx === stepIdx ? { ...s, media: [...(s.media || []), newMedia] } : s
      )
      await persistViewModeSteps(updatedSteps, '📎 Item salvo no POP!')
    }
  }

  // Manipulação de etapas no modo de edição
  const addStep = () => {
    setFSteps(prev => [
      ...prev,
      {
        id: genId(),
        order: prev.length + 1,
        title: '',
        instruction: '',
        media: [],
        tip: '',
        tipType: 'info'
      }
    ])
  }

  const updateStepField = <K extends keyof PopStep>(idx: number, field: K, val: PopStep[K]) => {
    setFSteps(prev => {
      const copy = [...prev]
      copy[idx] = { ...copy[idx], [field]: val }
      return copy
    })
  }

  const removeStep = (idx: number) => {
    setFSteps(prev => {
      if (prev.length <= 1) return prev
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

  const handleSavePop = async () => {
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

    const validSteps = fSteps.filter(
      s => s.title.trim() || s.instruction.trim() || (s.media && s.media.length > 0)
    )
    if (validSteps.length === 0) {
      showToast('⚠ Adicione ao menos 1 etapa preenchida ao procedimento', 'warn')
      return
    }

    setIsSaving(true)
    try {
      const editTargetId = createNew && !currentPopOverride ? undefined : pop.id || undefined
      const payload: Partial<Pop> = {
        title: fTitle.trim(),
        objective: fObjective.trim(),
        when_to_use: fWhenToUse.trim(),
        prerequisites: fPrerequisites.trim(),
        cautions: fCautions.trim(),
        expected_result: fExpectedResult.trim(),
        contact_notes: fContactNotes.trim(),
        responsible: fResponsible.trim() || currentUser?.name || 'Raffaela Lima',
        estimated_time: fEstimatedTime.trim() || '30 min',
        steps: validSteps.map((s, i) => ({
          ...s,
          id: s.id || genId(),
          order: i + 1,
          title: s.title.trim() || `Etapa ${i + 1}`,
          instruction: s.instruction.trim(),
          media: s.media || [],
          tip: s.tip?.trim() || undefined,
          tipType: s.tip?.trim() ? s.tipType || 'info' : undefined
        })),
        active: pop.active !== undefined ? pop.active : true
      }

      const saved = await savePopApi(payload, editTargetId)
      setCurrentPopOverride(saved)
      await onRefreshPops?.()
      onSaved?.(saved)
      setIsEditing(false)
      showToast('✅ POP salvo com sucesso!', 'success')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelEdit = () => {
    if ((createNew && !currentPopOverride) || initialMode === 'edit') {
      onClose()
      return
    }
    setIsEditing(false)
    setQuickMediaStepIdx(null)
  }

  const handleChangeTaskPop = async (newPopId: string) => {
    setSelectedTaskPopId(newPopId)
    setCurrentPopOverride(null)
    if (task) {
      await linkTaskToPopApi(task.id, newPopId)
      onPopLinked?.(task.id, newPopId)
      showToast('🔗 Procedimento (POP) vinculado à tarefa!', 'info')
    }
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
      return raw
        .split('\n')
        .map(s => s.trim().replace(/^[-•*]\s*/, ''))
        .filter(Boolean)
    }
    if (raw.includes(';') || raw.includes(',')) {
      return raw
        .split(/[;,]/)
        .map(s =>
          s
            .trim()
            .replace(/^[-•*]\s*/, '')
            .replace(/\.$/, '')
        )
        .filter(Boolean)
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
          ${steps
            .map((s, idx) => {
              const num = s.order || idx + 1
              const displayTitle = s.title.startsWith('Etapa ') ? s.title : `Etapa ${num}: ${s.title}`
              return `
              <div class="step-card">
                <div class="step-title">${displayTitle}</div>
                <div class="step-inst">${s.instruction}</div>
              </div>
            `
            })
            .join('')}
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
    if (!canEdit) {
      showToast('Apenas administradores podem editar procedimentos (POP).', 'warn')
      return
    }
    populateForm(pop)
    setIsEditing(true)
  }

  const responsibleFirstName = (pop.responsible || 'Raffaela Lima').split(' ')[0]

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: '#0d1324',
    border: '1px solid #2a3558',
    borderRadius: 7,
    padding: '8px 11px',
    color: '#e6e9f2',
    font: "400 13px 'IBM Plex Sans', sans-serif",
    outline: 'none'
  }

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
          border-color: #4f6bff !important;
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

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(6, 9, 18, 0.62)'
        }}
      />

      {/* Janela Principal */}
      <section
        className="pop-dc-modal"
        data-testid="pop-runner-modal"
        style={{
          position: 'absolute',
          top: 28,
          bottom: 28,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(840px, calc(100% - 32px))',
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
        {/* CABEÇALHO */}
        <header
          style={{
            padding: '20px 28px 16px',
            borderBottom: '1px solid #1f2740',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span
              style={{
                font: "500 11px 'IBM Plex Mono', monospace",
                color: '#7d93ff',
                background: '#1b2550',
                padding: '4px 8px',
                borderRadius: 5
              }}
            >
              {isEditing
                ? createNew && !currentPopOverride
                  ? 'NOVO POP · MODO EDIÇÃO'
                  : `EDITANDO POP · v${pop.version || 1}`
                : `POP · v${pop.version || 1}`}
            </span>

            {/* Seletor rápido de POP vinculado quando aberto por uma Tarefa */}
            {!isEditing && task && allPops.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: '#8b94b3' }}>Procedimento da tarefa:</span>
                <select
                  aria-label="Trocar POP da tarefa"
                  value={pop.id}
                  onChange={e => handleChangeTaskPop(e.target.value)}
                  style={{
                    background: '#141b31',
                    border: '1px solid #2a3454',
                    borderRadius: 6,
                    color: '#c6cce0',
                    fontSize: 11.5,
                    padding: '4px 8px',
                    cursor: 'pointer'
                  }}
                >
                  {allPops
                    .filter(p => p.active || p.id === pop.id)
                    .map(p => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                </select>
              </div>
            )}

            <span style={{ flex: 1 }} />

            {!isEditing && (
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
            )}

            {!isEditing && canEdit && (
              <button
                type="button"
                onClick={handleEditPop}
                style={{
                  height: 32,
                  padding: '0 12px',
                  borderRadius: 7,
                  border: '1px solid #3c5299',
                  background: '#182346',
                  color: '#a9b8ff',
                  font: "600 12px 'IBM Plex Sans', sans-serif",
                  cursor: 'pointer'
                }}
              >
                ✎ Editar POP
              </button>
            )}

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

          {isEditing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ fontSize: 10, letterSpacing: '.08em', color: '#7d93ff', marginBottom: 4 }}>
                  TÍTULO DO PROCEDIMENTO (POP) *
                </div>
                <input
                  value={fTitle}
                  onChange={e => setFTitle(e.target.value)}
                  placeholder="Ex: Fechamento Diário de Caixa e Conciliação Bancária"
                  style={{
                    ...inputStyle,
                    fontSize: 16,
                    fontWeight: 700,
                    padding: '9px 12px'
                  }}
                />
              </div>

              <div
                className="pop-dc-grid2"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1.3fr 140px',
                  gap: 10
                }}
              >
                <div>
                  <div style={{ fontSize: 10, color: '#8b94b3', marginBottom: 3 }}>RESPONSÁVEL</div>
                  <input
                    value={fResponsible}
                    onChange={e => setFResponsible(e.target.value)}
                    placeholder="Ex: Raffaela Lima"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#8b94b3', marginBottom: 3 }}>
                    DÚVIDAS / CONTATO DE APOIO
                  </div>
                  <input
                    value={fContactNotes}
                    onChange={e => setFContactNotes(e.target.value)}
                    placeholder="Ex: Gestora Financeira Raffaela Lima"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#8b94b3', marginBottom: 3 }}>TEMPO ESTIMADO</div>
                  <input
                    value={fEstimatedTime}
                    onChange={e => setFEstimatedTime(e.target.value)}
                    placeholder="Ex: 30 min"
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>
          ) : (
            <>
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
            </>
          )}
        </header>

        {/* CORPO COM ROLAGEM INTERNA */}
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
                {isEditing ? 'OBJETIVO *' : 'OBJETIVO'}
              </div>
              {isEditing ? (
                <textarea
                  rows={3}
                  value={fObjective}
                  onChange={e => setFObjective(e.target.value)}
                  placeholder="Qual o propósito e a finalidade deste procedimento?"
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              ) : (
                <div style={{ fontSize: 13, lineHeight: 1.5, color: '#c6cce0' }}>
                  {pop.objective}
                </div>
              )}
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
                {isEditing ? 'QUANDO UTILIZAR *' : 'QUANDO UTILIZAR'}
              </div>
              {isEditing ? (
                <textarea
                  rows={3}
                  value={fWhenToUse}
                  onChange={e => setFWhenToUse(e.target.value)}
                  placeholder="Ex: Diariamente até às 09h30 ou ao iniciar o expediente financeiro"
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              ) : (
                <div style={{ fontSize: 13, lineHeight: 1.5, color: '#c6cce0' }}>
                  {pop.when_to_use}
                </div>
              )}
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
            {isEditing ? (
              <input
                value={fPrerequisites}
                onChange={e => setFPrerequisites(e.target.value)}
                placeholder="Separe por ponto e vírgula (;). Ex: Acesso ao internet banking; Sistema ERP; Extrato OFX/PDF"
                style={inputStyle}
              />
            ) : (
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
            )}
          </div>

          {/* CABEÇALHO DE ETAPAS NUMERADAS */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: 4
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: '.1em',
                color: '#5b6688'
              }}
            >
              ETAPAS NUMERADAS ({totalSteps})
            </div>

            {isEditing && (
              <button
                type="button"
                onClick={addStep}
                style={{
                  height: 30,
                  padding: '0 12px',
                  borderRadius: 7,
                  border: '1px solid #4f6bff',
                  background: '#1b2854',
                  color: '#a9b8ff',
                  font: "600 12px 'IBM Plex Sans', sans-serif",
                  cursor: 'pointer'
                }}
              >
                + Adicionar Etapa
              </button>
            )}
          </div>

          {steps.map((step, idx) => {
            const isOk = !isEditing && doneStepIndices.includes(idx)
            const stepNum = idx + 1
            const displayTitle = step.title?.startsWith('Etapa ')
              ? step.title
              : `Etapa ${stepNum}: ${step.title}`

            const stepMedia = step.media || []
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
                    cursor: isEditing ? 'default' : 'pointer',
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
                  {isEditing ? (
                    <>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          value={step.title}
                          onChange={e => updateStepField(idx, 'title', e.target.value)}
                          placeholder={`Título da Etapa ${stepNum} (ex: Conferência de saldos bancários)`}
                          style={{ ...inputStyle, fontWeight: 600, flex: 1 }}
                        />
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveStep(idx, -1)}
                          title="Subir etapa"
                          style={{
                            width: 30,
                            height: 32,
                            borderRadius: 6,
                            border: '1px solid #2a3454',
                            background: '#0d1324',
                            color: '#c6cce0',
                            cursor: idx === 0 ? 'not-allowed' : 'pointer',
                            opacity: idx === 0 ? 0.4 : 1
                          }}
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          disabled={idx === steps.length - 1}
                          onClick={() => moveStep(idx, 1)}
                          title="Descer etapa"
                          style={{
                            width: 30,
                            height: 32,
                            borderRadius: 6,
                            border: '1px solid #2a3454',
                            background: '#0d1324',
                            color: '#c6cce0',
                            cursor: idx === steps.length - 1 ? 'not-allowed' : 'pointer',
                            opacity: idx === steps.length - 1 ? 0.4 : 1
                          }}
                        >
                          ▼
                        </button>
                        {steps.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeStep(idx)}
                            title="Remover etapa"
                            style={{
                              width: 30,
                              height: 32,
                              borderRadius: 6,
                              border: '1px solid #7a2e3a',
                              background: '#2a1720',
                              color: '#ff7a8a',
                              cursor: 'pointer'
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      <textarea
                        rows={3}
                        value={step.instruction}
                        onChange={e => updateStepField(idx, 'instruction', e.target.value)}
                        placeholder="Descreva passo a passo o que deve ser executado nesta etapa..."
                        style={{ ...inputStyle, resize: 'vertical' }}
                      />

                      {/* Dica ou Alerta da Etapa */}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <select
                          value={step.tipType || 'info'}
                          onChange={e =>
                            updateStepField(idx, 'tipType', e.target.value as 'info' | 'warn')
                          }
                          style={{
                            ...inputStyle,
                            width: 130,
                            flexShrink: 0,
                            color: step.tipType === 'warn' ? '#ffb48a' : '#a9b8ff'
                          }}
                        >
                          <option value="info">💡 Dica</option>
                          <option value="warn">⚠️ Atenção</option>
                        </select>
                        <input
                          value={step.tip || ''}
                          onChange={e => updateStepField(idx, 'tip', e.target.value)}
                          placeholder="Dica prática ou alerta importante para esta etapa (opcional)..."
                          style={{ ...inputStyle, flex: 1 }}
                        />
                      </div>
                    </>
                  ) : (
                    <>
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
                    </>
                  )}

                  {/* Grade de Mídias + Botões de Anexo (Vídeos, Planilhas, PDFs, Imagens) */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                      gap: 8
                    }}
                  >
                    {stepMedia.map((m, mediaIdx) => {
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
                          key={m.id || `${idx}-${mediaIdx}`}
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
                              target={m.url && m.url.startsWith('http') ? '_blank' : undefined}
                              rel="noreferrer"
                              onClick={e => {
                                if (!m.url) {
                                  e.preventDefault()
                                  showToast(`Arquivo de referência: ${m.name}`, 'info')
                                }
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
                            onClick={() => handleRemoveMedia(idx, mediaIdx)}
                            title="Remover anexo"
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

                    {/* Upload direto de arquivo do computador */}
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

                    {/* Botão para cadastrar vídeo / planilha / anexo nomeado */}
                    <button
                      type="button"
                      className="pop-dc-attach-label"
                      onClick={() => {
                        setQuickMediaStepIdx(quickMediaStepIdx === idx ? null : idx)
                        setQmKind('video')
                        setQmName('')
                        setQmUrl('')
                      }}
                      style={{
                        aspectRatio: '4/3',
                        borderRadius: 8,
                        border: '1.5px dashed #2d4d5c',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        cursor: 'pointer',
                        color: '#7dd3fc',
                        background: '#101d2e',
                        padding: 6
                      }}
                    >
                      <span style={{ fontSize: 18, lineHeight: 1 }}>🎬 📊</span>
                      <span style={{ fontSize: 11.5, fontWeight: 600, textAlign: 'center' }}>
                        + Vídeo / Planilha
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          color: '#6c8a9c',
                          textAlign: 'center'
                        }}
                      >
                        Incluir tutorial, XLSX ou link
                      </span>
                    </button>
                  </div>

                  {/* Painel rápido inline para incluir Vídeo, Planilha XLSX, PDF ou Imagem */}
                  {quickMediaStepIdx === idx && (
                    <div
                      style={{
                        background: '#0d1324',
                        border: '1px solid #34407a',
                        borderRadius: 8,
                        padding: 12,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#a9b8ff' }}>
                        Incluir Vídeo, Planilha ou Documento na Etapa {stepNum}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 1fr', gap: 8 }} className="pop-dc-grid2">
                        <select
                          value={qmKind}
                          onChange={e => setQmKind(e.target.value as 'video' | 'xlsx' | 'pdf' | 'image')}
                          style={inputStyle}
                        >
                          <option value="video">🎬 Vídeo (MP4)</option>
                          <option value="xlsx">📊 Planilha (XLSX)</option>
                          <option value="pdf">📄 Documento (PDF)</option>
                          <option value="image">🖼 Imagem (PNG)</option>
                        </select>
                        <input
                          value={qmName}
                          onChange={e => setQmName(e.target.value)}
                          placeholder={
                            qmKind === 'video'
                              ? 'Ex: video-tutorial-erp.mp4'
                              : qmKind === 'xlsx'
                                ? 'Ex: planilha-conciliacao.xlsx'
                                : 'Nome do arquivo...'
                          }
                          style={inputStyle}
                        />
                        <input
                          value={qmUrl}
                          onChange={e => setQmUrl(e.target.value)}
                          placeholder="URL ou link opcional (https://...)"
                          style={inputStyle}
                        />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => setQuickMediaStepIdx(null)}
                          style={{
                            height: 28,
                            padding: '0 10px',
                            borderRadius: 6,
                            border: '1px solid #2a3454',
                            background: 'transparent',
                            color: '#8b94b3',
                            fontSize: 11.5,
                            cursor: 'pointer'
                          }}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleConfirmQuickMedia(idx)}
                          style={{
                            height: 28,
                            padding: '0 12px',
                            borderRadius: 6,
                            border: 'none',
                            background: '#4f6bff',
                            color: '#fff',
                            fontSize: 11.5,
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Incluir na etapa
                        </button>
                      </div>
                    </div>
                  )}

                  {!isEditing && step.tip && (
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

          {/* CUIDADOS E ATENÇÃO & RESULTADO ESPERADO */}
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
              {isEditing ? (
                <textarea
                  rows={3}
                  value={fCautions}
                  onChange={e => setFCautions(e.target.value)}
                  placeholder="O que não pode ser esquecido? Quais erros evitar?"
                  style={{
                    ...inputStyle,
                    background: '#1c0f16',
                    borderColor: '#7a2e3a',
                    color: '#f1d6da',
                    resize: 'vertical'
                  }}
                />
              ) : (
                <div style={{ fontSize: 13, lineHeight: 1.5, color: '#f1d6da' }}>
                  {pop.cautions}
                </div>
              )}
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
              {isEditing ? (
                <textarea
                  rows={3}
                  value={fExpectedResult}
                  onChange={e => setFExpectedResult(e.target.value)}
                  placeholder="Como saber que a tarefa foi concluída com qualidade?"
                  style={{
                    ...inputStyle,
                    background: '#0d1b16',
                    borderColor: '#2a6b4d',
                    color: '#d3efe2',
                    resize: 'vertical'
                  }}
                />
              ) : (
                <div style={{ fontSize: 13, lineHeight: 1.5, color: '#d3efe2' }}>
                  {pop.expected_result}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RODAPÉ */}
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
          {isEditing ? (
            <>
              <span style={{ fontSize: 12, color: '#8b94b3', flex: 1 }}>
                Todos os vídeos, planilhas e alterações ficam salvos na versão atualizada do POP.
              </span>
              <button
                type="button"
                onClick={handleCancelEdit}
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
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSavePop}
                style={{
                  height: 38,
                  padding: '0 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#22a06b',
                  color: '#fff',
                  font: "600 13px 'IBM Plex Sans', sans-serif",
                  cursor: isSaving ? 'wait' : 'pointer'
                }}
              >
                {isSaving ? 'Salvando...' : 'Salvar POP'}
              </button>
            </>
          ) : (
            <>
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
            </>
          )}
        </footer>
      </section>
    </div>
  )
}


