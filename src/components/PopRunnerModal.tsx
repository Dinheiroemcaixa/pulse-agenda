import { useState, useEffect, useRef } from 'react'
import type { Pop, PopStep, PopStepMedia, Task, User } from '../types'
import {
  DEFAULT_POPS,
  POP_MAX_FILE_SIZE_LABEL,
  getLocalPops,
  resolveTaskPopId,
  savePopApi,
  linkTaskToPopApi,
  validatePopAttachmentFile,
  uploadPopMediaFile,
  resolvePopMediaAccess,
  openPopMediaFile,
  downloadPopMediaFile,
  getPopMediaFormatCategory,
  getNormalizedMediaExtension,
  cleanupUnreferencedPopStorageFiles,
  type ResolvedPopMediaAccess
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
  onLinkTaskPop?: (taskId: string, popId: string | null) => Promise<boolean>
  onRefreshPops?: () => Promise<void>
  showToast: (msg: string, type?: string) => void
}

function getYouTubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v')
      if (v) return `https://www.youtube.com/embed/${v}`
      if (u.pathname.startsWith('/embed/')) return url
    }
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '')
      if (id) return `https://www.youtube.com/embed/${id}`
    }
    if (u.hostname.includes('vimeo.com')) {
      const match = u.pathname.match(/\/(\d+)/)
      if (match?.[1]) return `https://player.vimeo.com/video/${match[1]}`
    }
  } catch {
    // URL inválida ou relativa
  }
  return null
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
    onLinkTaskPop,
    onRefreshPops,
    showToast
  } = props

  const canEdit = Boolean(isAdmin)

  const basePops = propAllPops ?? propPops ?? getLocalPops()
  const allPops = basePops

  useEffect(() => {
    if (onRefreshPops) {
      void onRefreshPops()
    }
  }, [])

  const initialLinkedPopId = task ? resolveTaskPopId(task) : explicitPop?.id
  const [selectedTaskPopId, setSelectedTaskPopId] = useState<string | undefined>(initialLinkedPopId)
  const [currentPopOverride, setCurrentPopOverride] = useState<Pop | null>(null)
  const [isCreatingForTask, setIsCreatingForTask] = useState<boolean>(false)
  const [pendingSelectPopId, setPendingSelectPopId] = useState<string>('')
  const [confirmUnlinkInRunner, setConfirmUnlinkInRunner] = useState<boolean>(false)

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

  // Resolução estrita (Regra A): NUNCA faz fallback automático para DEFAULT_POPS[0] ou allPops[0]
  const resolvedPopId = task ? selectedTaskPopId : explicitPop?.id

  const rawPop: Pop | undefined =
    (createNew || isCreatingForTask) && !currentPopOverride
      ? emptyPopTemplate
      : currentPopOverride
        ? allPops.find(p => p.id === currentPopOverride.id) || currentPopOverride
        : explicitPop
          ? allPops.find(p => p.id === explicitPop.id) || explicitPop
          : resolvedPopId
            ? allPops.find(p => p.id === resolvedPopId)
            : undefined

  // Hidratação segura apenas caso o POP realmente exista em rawPop
  const defaultMatch = rawPop?.id ? DEFAULT_POPS.find(d => d.id === rawPop.id) : undefined
  const hasRawSteps = Array.isArray(rawPop?.steps) && rawPop.steps.length > 0

  const pop: Pop =
    (createNew || isCreatingForTask) && !currentPopOverride
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
        : emptyPopTemplate

  // Modo de visualização vs edição interna unificada
  const [isEditing, setIsEditing] = useState<boolean>(
    Boolean((createNew || initialMode === 'edit') && canEdit)
  )
  const [isSaving, setIsSaving] = useState(false)

  const isUnlinkedTaskView = Boolean(task && !createNew && !isEditing && !rawPop)

  // ID estável de rascunho para uploads no Storage mesmo antes do primeiro save de um Novo POP
  const draftPopIdRef = useRef<string>(pop.id || `pop_${genId()}`)
  const pendingDeletedStoragePathsRef = useRef<string[]>([])
  const sessionUploadedStoragePathsRef = useRef<string[]>([])

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

  // Confirmação de exclusão de uma etapa inteira
  const [stepIndexPendingDelete, setStepIndexPendingDelete] = useState<number | null>(null)

  // Estados de upload direto para o Supabase Storage (pop-media)
  const [uploadingState, setUploadingState] = useState<{
    stepIdx: number
    fileName: string
    progress: number
  } | null>(null)
  const [failedUploadState, setFailedUploadState] = useState<{
    stepIdx: number
    file: File
    error: string
  } | null>(null)

  // Estado do Modal Visualizador de Anexo unificado (Problema 4 e 5)
  const [activeViewerMedia, setActiveViewerMedia] = useState<{
    media: PopStepMedia
    stepNum: number
    stepTitle: string
  } | null>(null)
  const [viewerAccess, setViewerAccess] = useState<ResolvedPopMediaAccess | null>(null)
  const [viewerLoading, setViewerLoading] = useState(false)
  const [viewerLoadFailed, setViewerLoadFailed] = useState(false)
  const [viewerZoom, setViewerZoom] = useState(100)

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
    setStepIndexPendingDelete(null)
    pendingDeletedStoragePathsRef.current = []
    sessionUploadedStoragePathsRef.current = []
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

  const processFilesForStep = async (stepIdx: number, files: File[]) => {
    if (files.length === 0) return

    const currentStepList = isEditing ? fSteps : pop.steps || []
    const targetStep = currentStepList[stepIdx]
    if (!targetStep) return

    const existingMedia = targetStep.media || []
    const uploadedItems: PopStepMedia[] = []
    const targetPopId = pop.id || draftPopIdRef.current

    for (const file of files) {
      const validation = validatePopAttachmentFile(file)
      if (!validation.valid) {
        showToast(`⚠️ ${validation.error}`, 'warn')
        continue
      }

      const candidateHash = `${file.name}::${file.size}::${file.lastModified}`
      const isDuplicate =
        existingMedia.some(
          m =>
            (m.content_hash && m.content_hash === candidateHash) ||
            (m.name === file.name && m.file_size_bytes === file.size)
        ) ||
        uploadedItems.some(
          m =>
            (m.content_hash && m.content_hash === candidateHash) ||
            (m.name === file.name && m.file_size_bytes === file.size)
        )

      if (isDuplicate) {
        showToast(
          `ℹ️ O arquivo "${file.name}" já está anexado nesta etapa.`,
          'info'
        )
        continue
      }

      setFailedUploadState(null)
      setUploadingState({
        stepIdx,
        fileName: file.name,
        progress: 10
      })

      try {
        const uploadedMedia = await uploadPopMediaFile(
          targetPopId,
          targetStep.id || `s${stepIdx + 1}`,
          file,
          pct => {
            setUploadingState({
              stepIdx,
              fileName: file.name,
              progress: pct
            })
          }
        )
        uploadedItems.push(uploadedMedia)
        if (isEditing && uploadedMedia.storage_path) {
          sessionUploadedStoragePathsRef.current.push(uploadedMedia.storage_path)
        }
      } catch (err: any) {
        const errMsg =
          err?.message ||
          `Erro ao enviar "${file.name}" para o Supabase Storage. Verifique sua conexão e tente novamente.`
        setFailedUploadState({
          stepIdx,
          file,
          error: errMsg
        })
        showToast(`❌ ${errMsg}`, 'warn')
      }
    }

    setUploadingState(null)

    if (uploadedItems.length === 0) return

    if (isEditing) {
      setFSteps(prev =>
        prev.map((s, idx) =>
          idx === stepIdx ? { ...s, media: [...(s.media || []), ...uploadedItems] } : s
        )
      )
      showToast(
        `✅ ${uploadedItems.length === 1 ? `"${uploadedItems[0].name}" enviado` : `${uploadedItems.length} arquivos enviados`} ao Storage e anexado(s) à Etapa ${stepIdx + 1}!`,
        'success'
      )
    } else {
      const updatedSteps = (pop.steps || []).map((s, idx) =>
        idx === stepIdx ? { ...s, media: [...(s.media || []), ...uploadedItems] } : s
      )
      await persistViewModeSteps(
        updatedSteps,
        `✅ Anexo salvo no POP e armazenado com segurança!`
      )
    }
  }

  const handleAddFiles = async (stepIdx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    await processFilesForStep(stepIdx, files)
  }

  const handleRetryFailedUpload = async () => {
    if (!failedUploadState) return
    const { stepIdx, file } = failedUploadState
    setFailedUploadState(null)
    await processFilesForStep(stepIdx, [file])
  }

  const handleRemoveMedia = async (stepIdx: number, mediaIdx: number) => {
    const currentStepList = isEditing ? fSteps : pop.steps || []
    const removedMedia = currentStepList[stepIdx]?.media?.[mediaIdx]

    if (isEditing) {
      if (removedMedia?.storage_path) {
        pendingDeletedStoragePathsRef.current.push(removedMedia.storage_path)
      }
      setFSteps(prev =>
        prev.map((s, idx) =>
          idx === stepIdx
            ? { ...s, media: (s.media || []).filter((_, mIdx) => mIdx !== mediaIdx) }
            : s
        )
      )
      showToast('🗑 Anexo removido da etapa.', 'info')
    } else {
      const updatedSteps = (pop.steps || []).map((s, idx) =>
        idx === stepIdx
          ? { ...s, media: (s.media || []).filter((_, mIdx) => mIdx !== mediaIdx) }
          : s
      )
      await persistViewModeSteps(updatedSteps, '🗑 Anexo removido do POP.')
      if (removedMedia?.storage_path) {
        const updatedPopForCheck: Pop = { ...pop, steps: updatedSteps }
        const popsSnapshot = allPops.map(p =>
          p.id === updatedPopForCheck.id ? updatedPopForCheck : p
        )
        await cleanupUnreferencedPopStorageFiles(
          [removedMedia.storage_path],
          popsSnapshot
        )
      }
    }
  }

  const handleOpenMediaViewer = async (
    media: PopStepMedia,
    stepNum: number,
    stepTitle: string,
    forceRefresh = false
  ) => {
    const userIdentifier =
      currentUser?.email || currentUser?.name || 'usuario.autenticado@pulse.local'
    const category = getPopMediaFormatCategory(media)

    if (category === 'external' && !forceRefresh) {
      const res = await openPopMediaFile(media, userIdentifier)
      if (!res.ok) {
        showToast(`⚠️ ${res.error || 'Não foi possível abrir o link.'}`, 'warn')
        return
      }
      showToast(`↗ Link "${media.name}" aberto em nova aba.`, 'info')
      return
    }

    setActiveViewerMedia({ media, stepNum, stepTitle })
    setViewerLoading(true)
    setViewerLoadFailed(false)
    if (!forceRefresh) setViewerZoom(100)
    try {
      const access = await resolvePopMediaAccess(media, userIdentifier, forceRefresh)
      setViewerAccess(access)
      if (!access.ok) {
        showToast(`⚠️ ${access.error || 'Não foi possível abrir o arquivo.'}`, 'warn')
        return
      }

      if (!forceRefresh) {
        if (category === 'pdf' && access.url) {
          window.open(access.url, '_blank', 'noopener,noreferrer')
          showToast(`📄 PDF "${media.name}" aberto para leitura!`, 'info')
        } else if (category === 'excel' || category === 'word') {
          const appName = category === 'excel' ? 'Microsoft Excel' : 'Microsoft Word'
          await openPopMediaFile(media, userIdentifier)
          showToast(
            `📂 Abrindo "${media.name}" para leitura no ${appName} / aplicativo associado...`,
            'info'
          )
        }
      }
    } catch (err: any) {
      setViewerAccess({
        ok: false,
        error: err?.message || 'Erro ao abrir o arquivo anexado.'
      })
    } finally {
      setViewerLoading(false)
    }
  }

  const handleDownloadMedia = async (media: PopStepMedia, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const userIdentifier =
      currentUser?.email || currentUser?.name || 'usuario.autenticado@pulse.local'
    const res = await downloadPopMediaFile(media, userIdentifier)
    if (!res.ok) {
      showToast(`⚠️ ${res.error || 'Não foi possível baixar o arquivo.'}`, 'warn')
      return
    }
    if (res.openedExternal) {
      showToast(`↗ Link externo "${media.name}" aberto em nova guia.`, 'info')
    } else {
      showToast(`⬇ Download iniciado: ${media.name}`, 'info')
    }
  }

  const handleConfirmQuickMedia = async (stepIdx: number) => {
    const trimmedName = qmName.trim()
    const trimmedUrl = qmUrl.trim()
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
      url: trimmedUrl || undefined,
      external_url:
        trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')
          ? trimmedUrl
          : undefined,
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

  // Manipulação de etapas no modo de edição (suporta 8, 10, 20+ etapas sem qualquer limite)
  const addStep = () => {
    const nextIdx = fSteps.length
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
    setTimeout(() => {
      const el = stepRefs.current[nextIdx]
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 80)
  }

  const handleAddStepFromViewMode = () => {
    if (!canEdit) return
    populateForm(pop)
    const nextIdx = (pop.steps || []).length
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
    setIsEditing(true)
    setTimeout(() => {
      const el = stepRefs.current[nextIdx]
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 100)
  }

  const updateStepField = <K extends keyof PopStep>(idx: number, field: K, val: PopStep[K]) => {
    setFSteps(prev => {
      const copy = [...prev]
      copy[idx] = { ...copy[idx], [field]: val }
      return copy
    })
  }

  const requestDeleteStep = (idx: number) => {
    if (fSteps.length <= 1) {
      showToast('⚠️ O POP deve possuir pelo menos 1 etapa.', 'warn')
      return
    }
    setStepIndexPendingDelete(idx)
  }

  const confirmDeleteStep = () => {
    if (stepIndexPendingDelete === null) return
    const idx = stepIndexPendingDelete
    const stepToRemove = fSteps[idx]
    if (stepToRemove?.media) {
      for (const m of stepToRemove.media) {
        if (m.storage_path) {
          pendingDeletedStoragePathsRef.current.push(m.storage_path)
        }
      }
    }
    setFSteps(prev => {
      if (prev.length <= 1) return prev
      const filtered = prev.filter((_, i) => i !== idx)
      return filtered.map((s, i) => ({ ...s, order: i + 1 }))
    })
    setStepIndexPendingDelete(null)
    showToast(`🗑 Etapa ${idx + 1} excluída. As demais etapas foram renumeradas.`, 'info')
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

    if (fSteps.length === 0) {
      showToast('⚠ Adicione ao menos 1 etapa ao procedimento', 'warn')
      return
    }

    setIsSaving(true)
    try {
      const isNewPopCreation = (createNew && !currentPopOverride) || isCreatingForTask
      const editTargetId = isNewPopCreation ? undefined : pop.id || undefined
      const payload: Partial<Pop> = {
        id: editTargetId || draftPopIdRef.current,
        title: fTitle.trim(),
        objective: fObjective.trim(),
        when_to_use: fWhenToUse.trim(),
        prerequisites: fPrerequisites.trim(),
        cautions: fCautions.trim(),
        expected_result: fExpectedResult.trim(),
        contact_notes: fContactNotes.trim(),
        responsible: fResponsible.trim() || currentUser?.name || 'Raffaela Lima',
        estimated_time: fEstimatedTime.trim() || '30 min',
        steps: fSteps.map((s, i) => ({
          ...s,
          id: s.id || genId(),
          order: i + 1,
          title: s.title.trim() || `Etapa ${i + 1}`,
          instruction: s.instruction.trim() || 'Executar conforme orientação operacional.',
          media: s.media || [],
          tip: s.tip?.trim() || undefined,
          tipType: s.tip?.trim() ? s.tipType || 'info' : undefined
        })),
        active: pop.active !== undefined ? pop.active : true
      }

      const saved = await savePopApi(payload, editTargetId)

      if (pendingDeletedStoragePathsRef.current.length > 0) {
        const popsSnapshot = allPops.some(p => p.id === saved.id)
          ? allPops.map(p => (p.id === saved.id ? saved : p))
          : [saved, ...allPops]
        await cleanupUnreferencedPopStorageFiles(
          pendingDeletedStoragePathsRef.current,
          popsSnapshot
        )
        pendingDeletedStoragePathsRef.current = []
      }
      sessionUploadedStoragePathsRef.current = []

      setCurrentPopOverride(saved)
      if (task && isNewPopCreation) {
        setSelectedTaskPopId(saved.id)
        if (onLinkTaskPop) {
          await onLinkTaskPop(task.id, saved.id)
        } else {
          await linkTaskToPopApi(task.id, saved.id)
        }
        onPopLinked?.(task.id, saved.id)
      }
      setIsCreatingForTask(false)
      await onRefreshPops?.()
      onSaved?.(saved)
      setIsEditing(false)
      showToast(`✅ POP salvo com sucesso (${saved.steps.length} etapas)!`, 'success')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelEdit = async () => {
    if (sessionUploadedStoragePathsRef.current.length > 0) {
      await cleanupUnreferencedPopStorageFiles(
        sessionUploadedStoragePathsRef.current,
        allPops
      )
      sessionUploadedStoragePathsRef.current = []
    }
    pendingDeletedStoragePathsRef.current = []
    setStepIndexPendingDelete(null)
    setFailedUploadState(null)

    if (isCreatingForTask) {
      setIsCreatingForTask(false)
      setIsEditing(false)
      setQuickMediaStepIdx(null)
      return
    }

    if ((createNew && !currentPopOverride) || initialMode === 'edit') {
      onClose()
      return
    }
    setIsEditing(false)
    setQuickMediaStepIdx(null)
  }

  const handleChangeTaskPop = async (newPopId: string | null) => {
    const normalized = newPopId && newPopId.trim() ? newPopId.trim() : null
    setSelectedTaskPopId(normalized || '')
    setCurrentPopOverride(null)
    setConfirmUnlinkInRunner(false)
    if (task) {
      if (onLinkTaskPop) {
        await onLinkTaskPop(task.id, normalized)
      } else {
        await linkTaskToPopApi(task.id, normalized)
      }
      onPopLinked?.(task.id, normalized || '')
      if (normalized) {
        showToast('🔗 Procedimento (POP) vinculado à tarefa!', 'info')
      } else {
        showToast('🔓 POP desvinculado desta tarefa com sucesso.', 'info')
      }
    }
  }

  const handleStartCreatePopForTask = () => {
    draftPopIdRef.current = `pop_${Date.now()}`
    setCurrentPopOverride(null)
    setIsCreatingForTask(true)
    setFTitle(task?.descricao ? `POP - ${task.descricao}` : '')
    setFObjective('')
    setFWhenToUse('')
    setFPrerequisites('')
    setFCautions('')
    setFExpectedResult('')
    setFContactNotes('')
    setFResponsible(currentUser?.name || 'Raffaela Lima')
    setFEstimatedTime('30 min')
    setFSteps([
      {
        id: genId(),
        order: 1,
        title: 'Etapa 1',
        instruction: '',
        media: []
      }
    ])
    setIsEditing(true)
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
                color: isUnlinkedTaskView ? '#f59e0b' : '#7d93ff',
                background: isUnlinkedTaskView ? 'rgba(245, 158, 11, 0.14)' : '#1b2550',
                padding: '4px 8px',
                borderRadius: 5
              }}
            >
              {isEditing
                ? (createNew && !currentPopOverride) || isCreatingForTask
                  ? 'NOVO POP · MODO EDIÇÃO'
                  : `EDITANDO POP · v${pop.version || 1}`
                : isUnlinkedTaskView
                ? 'TAREFA SEM POP VINCULADO'
                : `POP · v${pop.version || 1}`}
            </span>

            {/* Seletor rápido e botão Desvincular POP quando aberto por uma Tarefa vinculada */}
            {!isEditing && !isUnlinkedTaskView && task && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {allPops.length > 0 && (
                  <>
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
                  </>
                )}

                <button
                  type="button"
                  data-testid="runner-unlink-pop-btn"
                  onClick={() => setConfirmUnlinkInRunner(true)}
                  style={{
                    height: 28,
                    padding: '0 10px',
                    borderRadius: 6,
                    border: '1px solid rgba(239, 68, 68, 0.45)',
                    background: 'rgba(239, 68, 68, 0.12)',
                    color: '#ff8a96',
                    font: "600 11px 'IBM Plex Sans', sans-serif",
                    cursor: 'pointer'
                  }}
                >
                  🔓 Desvincular POP
                </button>
              </div>
            )}

            <span style={{ flex: 1 }} />

            {!isEditing && !isUnlinkedTaskView && (
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

            {!isEditing && !isUnlinkedTaskView && canEdit && (
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

          {confirmUnlinkInRunner && !isEditing && !isUnlinkedTaskView && task && (
            <div
              data-testid="runner-confirm-unlink-banner"
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap'
              }}
            >
              <span style={{ fontSize: 12, color: '#ffd1d6', fontWeight: 500 }}>
                Tem certeza que deseja desvincular o POP desta tarefa? O procedimento continuará salvo na biblioteca de POPs.
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setConfirmUnlinkInRunner(false)}
                  style={{
                    height: 28,
                    padding: '0 12px',
                    borderRadius: 6,
                    border: '1px solid #2a3454',
                    background: '#141b31',
                    color: '#c6cce0',
                    fontSize: 11.5,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  data-testid="runner-confirm-unlink-btn"
                  onClick={() => handleChangeTaskPop(null)}
                  style={{
                    height: 28,
                    padding: '0 12px',
                    borderRadius: 6,
                    border: 'none',
                    background: '#ef4444',
                    color: '#fff',
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Confirmar desvinculação
                </button>
              </div>
            </div>
          )}

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
          ) : isUnlinkedTaskView ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <h1
                style={{
                  margin: 0,
                  fontSize: 19,
                  fontWeight: 700,
                  lineHeight: 1.25,
                  color: '#e6e9f2'
                }}
              >
                {task?.descricao || 'Tarefa selecionada'}
              </h1>
              <div style={{ fontSize: 12, color: '#8b94b3' }}>
                Responsável: <b style={{ color: '#e6e9f2' }}>{task?.resp || 'Geral'}</b> • Nenhum POP está vinculado automaticamente a esta tarefa.
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
          {isUnlinkedTaskView ? (
            <div
              data-testid="unlinked-task-pop-state"
              style={{
                background: '#141b31',
                border: '1px solid #263359',
                borderRadius: 12,
                padding: '28px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: 20
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#e6e9f2' }}>
                  📋 Nenhum POP vinculado a esta tarefa
                </div>
                <div style={{ fontSize: 13, color: '#9aa4c7', lineHeight: 1.5 }}>
                  Esta tarefa não possui nenhum Procedimento Operacional Padrão (POP) vinculado no momento. Você pode vincular um POP já criado na sua biblioteca ou criar um novo POP agora mesmo.
                </div>
              </div>

              <div
                style={{
                  background: '#0f1527',
                  border: '1px solid #1f2740',
                  borderRadius: 10,
                  padding: 18,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12
                }}
              >
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#a9b8ff', letterSpacing: '.04em' }}>
                  VINCULAR UM POP EXISTENTE DA BIBLIOTECA
                </div>
                {allPops.length > 0 ? (
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select
                      data-testid="link-existing-pop-select"
                      aria-label="Selecionar POP para vincular"
                      value={pendingSelectPopId}
                      onChange={e => setPendingSelectPopId(e.target.value)}
                      style={{
                        ...inputStyle,
                        flex: 1,
                        minWidth: 240,
                        cursor: 'pointer'
                      }}
                    >
                      <option value="">— Selecione um POP criado por você —</option>
                      {allPops
                        .filter(p => p.active !== false)
                        .map(p => (
                          <option key={p.id} value={p.id}>
                            📋 {p.title} ({p.steps?.length || 0} etapas)
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      data-testid="confirm-link-pop-btn"
                      disabled={!pendingSelectPopId}
                      onClick={() => {
                        if (pendingSelectPopId) {
                          void handleChangeTaskPop(pendingSelectPopId)
                        }
                      }}
                      style={{
                        height: 38,
                        padding: '0 18px',
                        borderRadius: 8,
                        border: 'none',
                        background: pendingSelectPopId ? '#4f6bff' : '#242e4c',
                        color: pendingSelectPopId ? '#fff' : '#6c7696',
                        font: "600 13px 'IBM Plex Sans', sans-serif",
                        cursor: pendingSelectPopId ? 'pointer' : 'not-allowed'
                      }}
                    >
                      🔗 Vincular POP à Tarefa
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: 12.5, color: '#8b94b3' }}>
                    Ainda não há nenhum POP cadastrado na biblioteca. Crie o primeiro POP abaixo para vinculá-lo a esta tarefa.
                  </div>
                )}
              </div>

              {canEdit && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                    paddingTop: 4
                  }}
                >
                  <span style={{ fontSize: 12.5, color: '#8b94b3' }}>
                    Deseja documentar um novo procedimento exclusivo para esta atividade?
                  </span>
                  <button
                    type="button"
                    data-testid="create-pop-for-task-btn"
                    onClick={handleStartCreatePopForTask}
                    style={{
                      height: 38,
                      padding: '0 18px',
                      borderRadius: 8,
                      border: '1px solid #3c5299',
                      background: '#182346',
                      color: '#a9b8ff',
                      font: "600 13px 'IBM Plex Sans', sans-serif",
                      cursor: 'pointer'
                    }}
                  >
                    + Criar Novo POP para esta Tarefa
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
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
              paddingTop: 4,
              flexWrap: 'wrap',
              gap: 8
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: '.1em',
                color: '#5b6688'
              }}
            >
              ETAPAS NUMERADAS ({totalSteps}) — SUPORTE ILIMITADO A ETAPAS (8, 10, 20+)
            </div>

            {isEditing && (
              <button
                type="button"
                data-testid="add-step-top-btn"
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
              : `Etapa ${stepNum}: ${step.title || `Etapa ${stepNum}`}`

            const stepMedia = step.media || []
            const isWarnTip = step.tipType === 'warn'
            const isPendingDeleteThisStep = isEditing && stepIndexPendingDelete === idx
            const isUploadingThisStep = uploadingState?.stepIdx === idx
            const hasFailedUploadThisStep = failedUploadState?.stepIdx === idx

            return (
              <div
                key={step.id || idx}
                data-testid={`pop-step-card-${idx}`}
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
                  border: `1px solid ${
                    isPendingDeleteThisStep
                      ? '#d64545'
                      : isOk
                        ? '#2a6b4d'
                        : '#26304f'
                  }`
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
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          value={step.title}
                          onChange={e => updateStepField(idx, 'title', e.target.value)}
                          placeholder={`Título da Etapa ${stepNum} (ex: Conferência de saldos bancários)`}
                          style={{ ...inputStyle, fontWeight: 600, flex: '1 1 240px' }}
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
                        <button
                          type="button"
                          data-testid={`delete-step-btn-${idx}`}
                          onClick={() => requestDeleteStep(idx)}
                          title="Excluir esta etapa"
                          style={{
                            height: 32,
                            padding: '0 10px',
                            borderRadius: 6,
                            border: '1px solid #7a2e3a',
                            background: '#2a1720',
                            color: '#ff7a8a',
                            font: "600 11.5px 'IBM Plex Sans', sans-serif",
                            cursor: steps.length <= 1 ? 'not-allowed' : 'pointer',
                            opacity: steps.length <= 1 ? 0.45 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                            whiteSpace: 'nowrap'
                          }}
                        >
                          🗑 Excluir etapa
                        </button>
                      </div>

                      {/* Diálogo de confirmação inline de exclusão da etapa */}
                      {isPendingDeleteThisStep && (
                        <div
                          data-testid={`confirm-delete-step-box-${idx}`}
                          style={{
                            background: '#2a141c',
                            border: '1px solid #d64545',
                            borderRadius: 8,
                            padding: '12px 14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                            flexWrap: 'wrap'
                          }}
                        >
                          <div style={{ fontSize: 12.5, color: '#ffd6dc', lineHeight: 1.45, flex: '1 1 280px' }}>
                            <strong>
                              Confirma a exclusão da Etapa {stepNum} ({step.title?.trim() || 'Sem título'})?
                            </strong>{' '}
                            As demais etapas serão renumeradas automaticamente.
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <button
                              type="button"
                              onClick={() => setStepIndexPendingDelete(null)}
                              style={{
                                height: 30,
                                padding: '0 12px',
                                borderRadius: 6,
                                border: '1px solid #6b3b47',
                                background: 'transparent',
                                color: '#f1d6da',
                                fontSize: 12,
                                cursor: 'pointer'
                              }}
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              data-testid="confirm-delete-step-btn"
                              onClick={confirmDeleteStep}
                              style={{
                                height: 30,
                                padding: '0 14px',
                                borderRadius: 6,
                                border: 'none',
                                background: '#d64545',
                                color: '#fff',
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              Confirmar exclusão da etapa
                            </button>
                          </div>
                        </div>
                      )}

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

                  {/* Cabeçalho orientativo de Anexos e Limite Supabase Storage */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 6,
                      paddingTop: 2
                    }}
                  >
                    <span style={{ fontSize: 11, color: '#7d93ff', fontWeight: 600 }}>
                      📎 Anexos e Mídias da Etapa ({stepMedia.length})
                    </span>
                    <span style={{ fontSize: 10.5, color: '#6c779c' }}>
                      Envio direto (Vídeos MP4/WebM/MOV, PDF, Planilhas XLSX/CSV, Word DOCX, Imagens) · Limite: até {POP_MAX_FILE_SIZE_LABEL} por arquivo
                    </span>
                  </div>

                  {/* Barra de progresso de upload no Supabase Storage */}
                  {isUploadingThisStep && uploadingState && (
                    <div
                      style={{
                        background: '#0d1324',
                        border: '1px solid #3c5299',
                        borderRadius: 8,
                        padding: '10px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#a9b8ff' }}>
                        <span>Enviando "{uploadingState.fileName}" para o Supabase Storage (pop-media)...</span>
                        <strong>{uploadingState.progress}%</strong>
                      </div>
                      <div style={{ height: 6, background: '#1b223b', borderRadius: 4, overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${uploadingState.progress}%`,
                            background: '#4f6bff',
                            transition: 'width 0.2s ease'
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Alerta de falha de upload com opção de Tentar enviar novamente sem perder dados */}
                  {hasFailedUploadThisStep && failedUploadState && (
                    <div
                      style={{
                        background: '#2a1720',
                        border: '1px solid #d64545',
                        borderRadius: 8,
                        padding: '10px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        flexWrap: 'wrap'
                      }}
                    >
                      <div style={{ fontSize: 12, color: '#ffd6dc', flex: 1 }}>
                        ⚠️ {failedUploadState.error}
                      </div>
                      <button
                        type="button"
                        onClick={handleRetryFailedUpload}
                        style={{
                          height: 28,
                          padding: '0 12px',
                          borderRadius: 6,
                          border: '1px solid #ff7a8a',
                          background: '#4a1d28',
                          color: '#fff',
                          fontSize: 11.5,
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        ↻ Tentar enviar novamente
                      </button>
                    </div>
                  )}

                  {/* Grade de Mídias + Botões de Anexo (Vídeos, Planilhas, PDFs, Imagens) */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(205px, 1fr))',
                      gap: 10
                    }}
                  >
                    {stepMedia.map((m, mediaIdx) => {
                      const ext = (
                        m.extension ||
                        (m.name.includes('.') ? m.name.split('.').pop() || '' : '') ||
                        (m.type === 'video' ? 'MP4' : m.type === 'image' ? 'IMG' : 'DOC')
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
                            TXT: '#5b6688',
                            MP4: '#4f6bff',
                            WEBM: '#4f6bff',
                            MOV: '#4f6bff'
                          } as Record<string, string>
                        )[ext] || '#4f6bff'

                      const isImgWithImmediateUrl =
                        m.type === 'image' &&
                        Boolean(m.url && (m.url.startsWith('data:') || m.url.startsWith('http')))
                      const isVideo = m.type === 'video'
                      const isImage = m.type === 'image'
                      const isExternal = Boolean(
                        m.external_url ||
                          (m.url &&
                            (m.url.startsWith('http://') || m.url.startsWith('https://')) &&
                            !m.url.includes('/storage/v1/object/'))
                      )

                      return (
                        <div
                          key={m.id || `${idx}-${mediaIdx}`}
                          data-testid={`media-card-${idx}-${mediaIdx}`}
                          onClick={() => handleOpenMediaViewer(m, stepNum, displayTitle)}
                          title={`Clique para abrir o arquivo: ${m.name}`}
                          style={{
                            position: 'relative',
                            borderRadius: 9,
                            border: '1px solid #2b3860',
                            overflow: 'hidden',
                            background: '#11182d',
                            display: 'flex',
                            flexDirection: 'column',
                            cursor: 'pointer',
                            transition: 'border-color 0.15s ease, transform 0.15s ease'
                          }}
                        >
                          {/* Área visual superior do card */}
                          <div
                            style={{
                              position: 'relative',
                              height: 102,
                              background:
                                'repeating-linear-gradient(135deg, #161e36 0 10px, #131a30 10px 20px)',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 6,
                              overflow: 'hidden'
                            }}
                          >
                            {isImgWithImmediateUrl && (
                              <img
                                src={m.url}
                                alt={m.name}
                                style={{
                                  position: 'absolute',
                                  inset: 0,
                                  width: '100%',
                                  height: '100%',
                                  objectFit: 'cover'
                                }}
                              />
                            )}

                            {isVideo && (
                              <div
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  gap: 5,
                                  zIndex: 1
                                }}
                              >
                                <div
                                  style={{
                                    width: 42,
                                    height: 42,
                                    borderRadius: '50%',
                                    background: '#4f6bff',
                                    boxShadow: '0 4px 14px rgba(79, 107, 255, 0.45)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}
                                >
                                  <div
                                    style={{
                                      width: 0,
                                      height: 0,
                                      borderLeft: '13px solid #fff',
                                      borderTop: '8px solid transparent',
                                      borderBottom: '8px solid transparent',
                                      marginLeft: 3
                                    }}
                                  />
                                </div>
                                <span
                                  style={{
                                    fontSize: 9.5,
                                    fontWeight: 700,
                                    color: '#c6d2ff',
                                    background: 'rgba(13, 19, 36, 0.82)',
                                    padding: '2px 7px',
                                    borderRadius: 4
                                  }}
                                >
                                  {m.storage_path ? 'VÍDEO STORAGE' : isExternal ? 'VÍDEO EXTERNO' : 'ASSISTIR VÍDEO'}
                                </span>
                              </div>
                            )}

                            {isImage && !isImgWithImmediateUrl && (
                              <div
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  gap: 5
                                }}
                              >
                                <span
                                  style={{
                                    width: 42,
                                    height: 42,
                                    borderRadius: 8,
                                    background: '#1e2c54',
                                    border: '1px solid #3c5299',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 20
                                  }}
                                >
                                  🖼
                                </span>
                                <span style={{ fontSize: 9.5, fontWeight: 600, color: '#a9b8ff' }}>
                                  {ext || 'IMAGEM'}
                                </span>
                              </div>
                            )}

                            {!isVideo && !isImage && (
                              <div
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  gap: 5
                                }}
                              >
                                <span
                                  style={{
                                    width: 42,
                                    height: 48,
                                    borderRadius: 6,
                                    background: docColor,
                                    display: 'flex',
                                    alignItems: 'flex-end',
                                    justifyContent: 'center',
                                    paddingBottom: 6,
                                    font: "700 10px 'IBM Plex Mono', monospace",
                                    color: '#fff',
                                    boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
                                  }}
                                >
                                  {ext}
                                </span>
                                <span style={{ fontSize: 10, color: '#9aa4c7' }}>
                                  {m.size || (m.storage_path ? 'Storage' : 'Documento')}
                                </span>
                              </div>
                            )}

                            {/* Selo de origem (Storage ou Link) */}
                            {m.storage_path && (
                              <span
                                style={{
                                  position: 'absolute',
                                  top: 6,
                                  left: 6,
                                  fontSize: 9,
                                  fontWeight: 700,
                                  padding: '2px 5px',
                                  borderRadius: 4,
                                  background: 'rgba(29, 74, 54, 0.92)',
                                  color: '#5ed39a',
                                  border: '1px solid #2a6b4d'
                                }}
                              >
                                ☁ Storage
                              </span>
                            )}

                            {/* Botão de remover anexo */}
                            {(isEditing || canEdit) && (
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation()
                                  handleRemoveMedia(idx, mediaIdx)
                                }}
                                title="Remover anexo desta etapa"
                                style={{
                                  position: 'absolute',
                                  top: 6,
                                  right: 6,
                                  width: 22,
                                  height: 22,
                                  borderRadius: 5,
                                  border: '1px solid rgba(255, 122, 138, 0.35)',
                                  background: 'rgba(13, 18, 32, 0.9)',
                                  color: '#ff7a8a',
                                  fontSize: 13,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  zIndex: 2
                                }}
                              >
                                ×
                              </button>
                            )}
                          </div>

                          {/* Nome do arquivo e metadados */}
                          <div
                            style={{
                              padding: '7px 8px 6px',
                              background: '#0e1426',
                              borderTop: '1px solid #1f2947',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 6
                            }}
                          >
                            <div
                              style={{
                                font: "500 10.5px 'IBM Plex Mono', monospace",
                                color: '#dbe1f5',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}
                              title={m.name}
                            >
                              {m.name}
                            </div>

                            {/* Barra de ações diretas: Abrir arquivo e Baixar arquivo */}
                            <div style={{ display: 'flex', gap: 5 }}>
                              <button
                                type="button"
                                data-testid={`view-media-btn-${idx}-${mediaIdx}`}
                                onClick={e => {
                                  e.stopPropagation()
                                  handleOpenMediaViewer(m, stepNum, displayTitle)
                                }}
                                style={{
                                  flex: 1,
                                  height: 26,
                                  padding: '0 6px',
                                  borderRadius: 5,
                                  border: '1px solid #354780',
                                  background: '#182346',
                                  color: '#a9b8ff',
                                  font: "600 10.5px 'IBM Plex Sans', sans-serif",
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 4,
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                📂 Abrir arquivo
                              </button>
                              <button
                                type="button"
                                data-testid={`download-media-btn-${idx}-${mediaIdx}`}
                                onClick={e => handleDownloadMedia(m, e)}
                                title={isExternal ? 'Abrir link externo' : `Baixar arquivo ${m.name}`}
                                style={{
                                  height: 26,
                                  padding: '0 8px',
                                  borderRadius: 5,
                                  border: '1px solid #264d3b',
                                  background: '#132a20',
                                  color: '#5ed39a',
                                  font: "600 10.5px 'IBM Plex Sans', sans-serif",
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 3,
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {isExternal ? '↗ Abrir link' : '⬇ Baixar arquivo'}
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}

                    {/* Upload direto de arquivo do computador para o Supabase Storage */}
                    <label
                      className="pop-dc-attach-label"
                      style={{
                        minHeight: 156,
                        borderRadius: 9,
                        border: '1.5px dashed #34407a',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        cursor: 'pointer',
                        color: '#a9b8ff',
                        background: '#121933',
                        padding: 10
                      }}
                    >
                      <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>
                      <span style={{ fontSize: 12, fontWeight: 600, textAlign: 'center' }}>
                        Anexar vídeo ou arquivo
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          color: '#6c779c',
                          textAlign: 'center',
                          lineHeight: 1.35
                        }}
                      >
                        MP4, WebM, MOV, PDF, Excel, Word, Fotos (até {POP_MAX_FILE_SIZE_LABEL})
                      </span>
                      <input
                        type="file"
                        multiple
                        accept=".mp4,.webm,.mov,.avi,.ogg,.mkv,.png,.jpg,.jpeg,.webp,.gif,.svg,.pdf,.xlsx,.xls,.csv,.docx,.doc,.ofx,.txt,video/*,image/*,application/pdf"
                        onChange={e => handleAddFiles(idx, e)}
                        style={{ display: 'none' }}
                      />
                    </label>

                    {/* Botão para cadastrar vídeo / planilha / link externo */}
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
                        minHeight: 156,
                        borderRadius: 9,
                        border: '1.5px dashed #2d4d5c',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        cursor: 'pointer',
                        color: '#7dd3fc',
                        background: '#101d2e',
                        padding: 10
                      }}
                    >
                      <span style={{ fontSize: 18, lineHeight: 1 }}>🎬 📊</span>
                      <span style={{ fontSize: 11.5, fontWeight: 600, textAlign: 'center' }}>
                        + Link / Referência
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          color: '#6c8a9c',
                          textAlign: 'center',
                          lineHeight: 1.35
                        }}
                      >
                        Link externo (YouTube, Drive) ou modelo
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
                        Incluir Link Externo ou Referência na Etapa {stepNum}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 1fr', gap: 8 }} className="pop-dc-grid2">
                        <select
                          value={qmKind}
                          onChange={e => setQmKind(e.target.value as 'video' | 'xlsx' | 'pdf' | 'image')}
                          style={inputStyle}
                        >
                          <option value="video">🎬 Vídeo (MP4 / Link)</option>
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

          {/* BOTÃO DE ADICIONAR ETAPA NO FINAL DA LISTA (FACILITA POPS COM 8+ ETAPAS) */}
          {isEditing && (
            <button
              type="button"
              data-testid="add-step-bottom-btn"
              onClick={addStep}
              style={{
                width: '100%',
                minHeight: 44,
                padding: '10px 16px',
                borderRadius: 10,
                border: '1.5px dashed #4f6bff',
                background: '#141e42',
                color: '#a9b8ff',
                font: "600 13px 'IBM Plex Sans', sans-serif",
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              }}
            >
              <span>+ Adicionar Etapa (Etapa {steps.length + 1})</span>
            </button>
          )}

          {!isEditing && canEdit && (
            <button
              type="button"
              data-testid="add-step-from-view-btn"
              onClick={handleAddStepFromViewMode}
              style={{
                width: '100%',
                minHeight: 40,
                padding: '8px 16px',
                borderRadius: 9,
                border: '1px dashed #344478',
                background: '#121930',
                color: '#8fa2ff',
                font: "600 12.5px 'IBM Plex Sans', sans-serif",
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6
              }}
            >
              + Adicionar nova etapa a este POP (Etapa {steps.length + 1})
            </button>
          )}

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
            </>
          )}
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
                Todos os vídeos, planilhas e etapas ficam salvos no Supabase e no POP atualizado.
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
                data-testid="save-pop-btn"
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
          ) : isUnlinkedTaskView ? (
            <>
              <span style={{ fontSize: 12, color: '#8b94b3', flex: 1 }}>
                Nenhum POP padrão é vinculado automaticamente. Escolha ou crie um POP quando necessário.
              </span>
              <button
                type="button"
                onClick={onClose}
                style={{
                  height: 38,
                  padding: '0 18px',
                  borderRadius: 8,
                  border: '1px solid #2a3454',
                  background: 'transparent',
                  color: '#c6cce0',
                  font: "500 13px 'IBM Plex Sans', sans-serif",
                  cursor: 'pointer'
                }}
              >
                Fechar
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

      {/* MODAL VISUALIZADOR UNIFICADO DE ANEXOS E VÍDEOS (PROBLEMAS 4 E 5) */}
      {activeViewerMedia && (
        <div
          data-testid="pop-media-viewer-modal"
          onClick={e => {
            e.stopPropagation()
            if (e.target === e.currentTarget) {
              setActiveViewerMedia(null)
            }
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10050,
            background: 'rgba(5, 8, 18, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 'min(900px, 100%)',
              maxHeight: '90vh',
              background: '#0f162b',
              border: '1px solid #304072',
              borderRadius: 14,
              boxShadow: '0 32px 90px rgba(0, 0, 0, 0.7)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              color: '#e6e9f2'
            }}
          >
            {/* Header do Modal de Arquivo Aberto */}
            <div
              style={{
                padding: '14px 20px',
                borderBottom: '1px solid #222d4d',
                background: '#131c36',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  data-testid="back-to-pop-btn"
                  onClick={() => setActiveViewerMedia(null)}
                  style={{
                    height: 32,
                    padding: '0 12px',
                    borderRadius: 7,
                    border: '1px solid #354780',
                    background: '#182346',
                    color: '#a9b8ff',
                    font: "600 12px 'IBM Plex Sans', sans-serif",
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    flexShrink: 0
                  }}
                >
                  ← Voltar para {task ? 'a Tarefa / POP' : 'o POP'}
                </button>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: '#7d93ff', fontWeight: 600 }}>
                    Arquivo Aberto • {activeViewerMedia.stepTitle}
                  </div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: '#fff',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {activeViewerMedia.media.name}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {activeViewerMedia.media.type === 'image' && viewerAccess?.ok && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 4 }}>
                    <button
                      type="button"
                      onClick={() => setViewerZoom(z => Math.max(50, z - 25))}
                      style={{
                        height: 30,
                        padding: '0 8px',
                        borderRadius: 6,
                        border: '1px solid #2f3d69',
                        background: '#182346',
                        color: '#c6cce0',
                        cursor: 'pointer'
                      }}
                    >
                      −
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewerZoom(100)}
                      style={{
                        height: 30,
                        padding: '0 8px',
                        borderRadius: 6,
                        border: '1px solid #2f3d69',
                        background: '#182346',
                        color: '#a9b8ff',
                        fontSize: 11.5,
                        cursor: 'pointer'
                      }}
                    >
                      {viewerZoom}%
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewerZoom(z => Math.min(200, z + 25))}
                      style={{
                        height: 30,
                        padding: '0 8px',
                        borderRadius: 6,
                        border: '1px solid #2f3d69',
                        background: '#182346',
                        color: '#c6cce0',
                        cursor: 'pointer'
                      }}
                    >
                      +
                    </button>
                  </div>
                )}

                {viewerAccess?.ok && viewerAccess?.url && (
                  <button
                    type="button"
                    data-testid="viewer-open-tab-btn"
                    onClick={() => {
                      if (viewerAccess.url) {
                        window.open(viewerAccess.url, '_blank', 'noopener,noreferrer')
                      }
                    }}
                    style={{
                      height: 32,
                      padding: '0 12px',
                      borderRadius: 7,
                      border: '1px solid #354780',
                      background: '#182346',
                      color: '#a9b8ff',
                      font: "600 12px 'IBM Plex Sans', sans-serif",
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5
                    }}
                  >
                    ↗ Abrir em nova aba
                  </button>
                )}

                <button
                  type="button"
                  data-testid="viewer-download-btn"
                  onClick={e => handleDownloadMedia(activeViewerMedia.media, e)}
                  style={{
                    height: 32,
                    padding: '0 14px',
                    borderRadius: 7,
                    border: 'none',
                    background: '#22a06b',
                    color: '#fff',
                    font: "600 12px 'IBM Plex Sans', sans-serif",
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  {viewerAccess?.isExternalLink ? '↗ Abrir link externo' : '⬇ Baixar arquivo'}
                </button>

                <button
                  type="button"
                  data-testid="close-media-viewer-btn"
                  onClick={() => setActiveViewerMedia(null)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 7,
                    border: '1px solid #2f3d69',
                    background: 'transparent',
                    color: '#c6cce0',
                    fontSize: 16,
                    cursor: 'pointer'
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            {/* Corpo do Arquivo Aberto */}
            <div
              style={{
                padding: 20,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 14,
                minHeight: 320
              }}
            >
              {viewerLoading ? (
                <div style={{ color: '#a9b8ff', fontSize: 13.5 }}>
                  Abrindo arquivo com acesso seguro...
                </div>
              ) : !viewerAccess?.ok ? (
                <div
                  style={{
                    background: '#2a1720',
                    border: '1px solid #d64545',
                    borderRadius: 10,
                    padding: 20,
                    textAlign: 'center',
                    maxWidth: 520,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    alignItems: 'center'
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#ff7a8a' }}>
                    ⚠️ {viewerAccess?.error || 'URL expirada ou arquivo indisponível'}
                  </div>
                  {activeViewerMedia.media.storage_path && (
                    <button
                      type="button"
                      onClick={() =>
                        handleOpenMediaViewer(
                          activeViewerMedia.media,
                          activeViewerMedia.stepNum,
                          activeViewerMedia.stepTitle,
                          true
                        )
                      }
                      style={{
                        height: 34,
                        padding: '0 16px',
                        borderRadius: 7,
                        border: 'none',
                        background: '#4f6bff',
                        color: '#fff',
                        fontWeight: 600,
                        fontSize: 12.5,
                        cursor: 'pointer'
                      }}
                    >
                      ↻ Renovar Link Assinado
                    </button>
                  )}
                </div>
              ) : viewerLoadFailed ? (
                <div
                  style={{
                    background: '#2a1720',
                    border: '1px solid #d64545',
                    borderRadius: 10,
                    padding: 20,
                    textAlign: 'center',
                    maxWidth: 520,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    alignItems: 'center'
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#ff7a8a' }}>
                    ⚠️ URL expirada ou arquivo indisponível para reprodução direta.
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      type="button"
                      onClick={() =>
                        handleOpenMediaViewer(
                          activeViewerMedia.media,
                          activeViewerMedia.stepNum,
                          activeViewerMedia.stepTitle,
                          true
                        )
                      }
                      style={{
                        height: 34,
                        padding: '0 14px',
                        borderRadius: 7,
                        border: 'none',
                        background: '#4f6bff',
                        color: '#fff',
                        fontWeight: 600,
                        fontSize: 12.5,
                        cursor: 'pointer'
                      }}
                    >
                      ↻ Renovar Link Assinado
                    </button>
                    <button
                      type="button"
                      onClick={e => handleDownloadMedia(activeViewerMedia.media, e)}
                      style={{
                        height: 34,
                        padding: '0 14px',
                        borderRadius: 7,
                        border: 'none',
                        background: '#22a06b',
                        color: '#fff',
                        fontWeight: 600,
                        fontSize: 12.5,
                        cursor: 'pointer'
                      }}
                    >
                      ⬇ Baixar Arquivo Original
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* 1. Player de Vídeo */}
                  {activeViewerMedia.media.type === 'video' && (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
                      {viewerAccess.isExternalLink && viewerAccess.url ? (
                        (() => {
                          const embedUrl = getYouTubeEmbedUrl(viewerAccess.url)
                          return embedUrl ? (
                            <iframe
                              src={embedUrl}
                              title={activeViewerMedia.media.name}
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                              style={{
                                width: '100%',
                                height: '58vh',
                                border: 'none',
                                borderRadius: 10,
                                background: '#000'
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: '100%',
                                background: '#141d36',
                                border: '1px solid #304072',
                                borderRadius: 10,
                                padding: 24,
                                textAlign: 'center',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 12
                              }}
                            >
                              <div style={{ fontSize: 14, fontWeight: 700, color: '#a9b8ff' }}>
                                🎬 Link de Vídeo Externo
                              </div>
                              <div style={{ fontSize: 12.5, color: '#8b94b3', wordBreak: 'break-all' }}>
                                {viewerAccess.url}
                              </div>
                              <a
                                href={viewerAccess.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  padding: '9px 18px',
                                  borderRadius: 7,
                                  background: '#4f6bff',
                                  color: '#fff',
                                  textDecoration: 'none',
                                  fontWeight: 600,
                                  fontSize: 13
                                }}
                              >
                                ↗ Abrir Vídeo Externo em Nova Guia
                              </a>
                            </div>
                          )
                        })()
                      ) : (
                        <video
                          data-testid="pop-viewer-video-element"
                          src={viewerAccess.url}
                          controls
                          autoPlay
                          onError={() => setViewerLoadFailed(true)}
                          style={{
                            width: '100%',
                            maxHeight: '62vh',
                            borderRadius: 10,
                            background: '#000'
                          }}
                        />
                      )}
                      {viewerAccess.previewText && (
                        <div
                          style={{
                            width: '100%',
                            background: '#141b31',
                            border: '1px solid #26304f',
                            borderRadius: 8,
                            padding: '10px 14px',
                            fontSize: 12,
                            color: '#aab2cc',
                            lineHeight: 1.5
                          }}
                        >
                          {viewerAccess.previewText}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 2. Visualizador de Imagem com Zoom */}
                  {activeViewerMedia.media.type === 'image' && viewerAccess.url && (
                    <div
                      style={{
                        width: '100%',
                        overflow: 'auto',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        background: '#0a0f1d',
                        borderRadius: 10,
                        padding: 12,
                        maxHeight: '66vh'
                      }}
                    >
                      <img
                        data-testid="pop-viewer-image-element"
                        src={viewerAccess.url}
                        alt={activeViewerMedia.media.name}
                        onError={() => setViewerLoadFailed(true)}
                        style={{
                          width: `${viewerZoom}%`,
                          maxWidth: viewerZoom === 100 ? '100%' : 'none',
                          height: 'auto',
                          borderRadius: 8,
                          objectFit: 'contain'
                        }}
                      />
                    </div>
                  )}

                  {/* 3. Abertura de Documentos (PDF, Planilhas XLSX/CSV, Word DOCX, OFX, TXT, Links Externos) */}
                  {activeViewerMedia.media.type === 'doc' &&
                    (() => {
                      const activeCategory =
                        viewerAccess.formatCategory ||
                        getPopMediaFormatCategory(activeViewerMedia.media)
                      const activeExt = getNormalizedMediaExtension(activeViewerMedia.media)
                      const isOfficeFile = activeCategory === 'excel' || activeCategory === 'word'
                      const officeAppName =
                        activeCategory === 'excel' ? 'Microsoft Excel' : 'Microsoft Word'
                      const userIdentifier =
                        currentUser?.email ||
                        currentUser?.name ||
                        'usuario.autenticado@pulse.local'

                      return (
                        <div
                          style={{
                            width: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 14
                          }}
                        >
                          {viewerAccess.isExternalLink && viewerAccess.url ? (
                            <div
                              style={{
                                background: '#141d36',
                                border: '1px solid #304072',
                                borderRadius: 10,
                                padding: 24,
                                textAlign: 'center',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 12
                              }}
                            >
                              <div style={{ fontSize: 15, fontWeight: 700, color: '#a9b8ff' }}>
                                🔗 Link Externo Vinculado à Etapa
                              </div>
                              <div
                                style={{
                                  fontSize: 12.5,
                                  color: '#8b94b3',
                                  wordBreak: 'break-all'
                                }}
                              >
                                {viewerAccess.url}
                              </div>
                              <a
                                href={viewerAccess.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  padding: '9px 18px',
                                  borderRadius: 7,
                                  background: '#4f6bff',
                                  color: '#fff',
                                  textDecoration: 'none',
                                  fontWeight: 600,
                                  fontSize: 13
                                }}
                              >
                                ↗ Abrir Link Externo em Nova Guia
                              </a>
                            </div>
                          ) : activeCategory === 'pdf' ? (
                            <div
                              style={{
                                width: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 10
                              }}
                            >
                              <div
                                style={{
                                  padding: '10px 14px',
                                  borderRadius: 8,
                                  background: '#141e3c',
                                  border: '1px solid #2d3f75',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: 10,
                                  flexWrap: 'wrap'
                                }}
                              >
                                <span style={{ fontSize: 12, color: '#c6d2ff' }}>
                                  📄 <b>PDF aberto para leitura</b> — O documento foi aberto em uma nova guia do navegador e também pode ser lido abaixo.
                                </span>
                                <button
                                  type="button"
                                  data-testid="pdf-open-new-tab-btn"
                                  onClick={() => {
                                    if (viewerAccess.url) {
                                      window.open(viewerAccess.url, '_blank', 'noopener,noreferrer')
                                    }
                                  }}
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
                                  ↗ Abrir PDF em nova aba
                                </button>
                              </div>
                              <iframe
                                data-testid="pop-viewer-pdf-iframe"
                                src={viewerAccess.url}
                                title={activeViewerMedia.media.name}
                                style={{
                                  width: '100%',
                                  height: '64vh',
                                  border: 'none',
                                  borderRadius: 8,
                                  background: '#fff'
                                }}
                              />
                            </div>
                          ) : (
                            <>
                              {isOfficeFile && (
                                <div
                                  data-testid="office-open-banner"
                                  style={{
                                    background: '#13243a',
                                    border: '1px solid #2b507a',
                                    borderRadius: 10,
                                    padding: '18px 20px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 12
                                  }}
                                >
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <div style={{ fontSize: 14.5, fontWeight: 700, color: '#5ed39a' }}>
                                      ✅ Arquivo "{activeViewerMedia.media.name}" entregue para abertura no {officeAppName}
                                    </div>
                                    <div style={{ fontSize: 12.5, color: '#b4c2e0', lineHeight: 1.5 }}>
                                      O arquivo original ({activeExt}) foi disponibilizado para abertura imediata no{' '}
                                      <b>{officeAppName}</b> ou no aplicativo associado do seu sistema. Você também pode acioná-lo diretamente pelos botões abaixo:
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                    {viewerAccess.officeProtocolUrl && (
                                      <button
                                        type="button"
                                        data-testid="open-office-desktop-btn"
                                        onClick={() => {
                                          void openPopMediaFile(
                                            activeViewerMedia.media,
                                            userIdentifier,
                                            { preferOfficeProtocol: true }
                                          )
                                          showToast(
                                            `🚀 Solicitando abertura direta no ${officeAppName}...`,
                                            'info'
                                          )
                                        }}
                                        style={{
                                          height: 36,
                                          padding: '0 16px',
                                          borderRadius: 8,
                                          border: 'none',
                                          background: '#4f6bff',
                                          color: '#fff',
                                          fontWeight: 700,
                                          fontSize: 12.5,
                                          cursor: 'pointer'
                                        }}
                                      >
                                        🚀 Abrir diretamente no {officeAppName} (App Desktop)
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      data-testid="reopen-office-file-btn"
                                      onClick={() => {
                                        void openPopMediaFile(
                                          activeViewerMedia.media,
                                          userIdentifier
                                        )
                                        showToast(
                                          `📂 Entregando "${activeViewerMedia.media.name}" para abertura...`,
                                          'info'
                                        )
                                      }}
                                      style={{
                                        height: 36,
                                        padding: '0 16px',
                                        borderRadius: 8,
                                        border: '1px solid #354780',
                                        background: '#182346',
                                        color: '#a9b8ff',
                                        fontWeight: 600,
                                        fontSize: 12.5,
                                        cursor: 'pointer'
                                      }}
                                    >
                                      📂 Abrir arquivo novamente
                                    </button>
                                    <button
                                      type="button"
                                      onClick={e =>
                                        handleDownloadMedia(activeViewerMedia.media, e)
                                      }
                                      style={{
                                        height: 36,
                                        padding: '0 16px',
                                        borderRadius: 8,
                                        border: 'none',
                                        background: '#22a06b',
                                        color: '#fff',
                                        fontWeight: 600,
                                        fontSize: 12.5,
                                        cursor: 'pointer'
                                      }}
                                    >
                                      ⬇ Baixar arquivo ({activeExt})
                                    </button>
                                  </div>
                                </div>
                              )}

                              {viewerAccess.previewRows && viewerAccess.previewRows.length > 0 && (
                                <div
                                  style={{
                                    width: '100%',
                                    background: '#131b31',
                                    border: '1px solid #28365e',
                                    borderRadius: 10,
                                    overflow: 'hidden'
                                  }}
                                >
                                  <div
                                    style={{
                                      padding: '10px 14px',
                                      background: '#182342',
                                      borderBottom: '1px solid #28365e',
                                      fontSize: 12,
                                      fontWeight: 600,
                                      color: '#5ed39a',
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      flexWrap: 'wrap',
                                      gap: 8
                                    }}
                                  >
                                    <span>
                                      {activeExt === 'OFX'
                                        ? `🏦 Lançamentos do Extrato OFX (${activeViewerMedia.media.name})`
                                        : `📊 Conteúdo Estruturado da Planilha / CSV (${activeViewerMedia.media.name})`}
                                    </span>
                                    <span>
                                      {activeExt === 'OFX'
                                        ? 'Extrato Financeiro OFX'
                                        : 'Compatível com Microsoft Excel / CSV'}
                                    </span>
                                  </div>
                                  <div style={{ overflowX: 'auto' }}>
                                    <table
                                      style={{
                                        width: '100%',
                                        borderCollapse: 'collapse',
                                        fontSize: 12,
                                        textAlign: 'left'
                                      }}
                                    >
                                      <thead>
                                        <tr style={{ background: '#0e1529', color: '#a9b8ff' }}>
                                          {viewerAccess.previewRows[0].map((col, cIdx) => (
                                            <th
                                              key={cIdx}
                                              style={{
                                                padding: '9px 12px',
                                                borderBottom: '1px solid #263359',
                                                whiteSpace: 'nowrap'
                                              }}
                                            >
                                              {col}
                                            </th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {viewerAccess.previewRows.slice(1).map((row, rIdx) => (
                                          <tr
                                            key={rIdx}
                                            style={{
                                              borderBottom: '1px solid #1d2746',
                                              color: '#dbe1f5'
                                            }}
                                          >
                                            {row.map((cell, cIdx) => (
                                              <td
                                                key={cIdx}
                                                style={{
                                                  padding: '8px 12px',
                                                  whiteSpace: 'nowrap'
                                                }}
                                              >
                                                {cell}
                                              </td>
                                            ))}
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              {viewerAccess.previewText &&
                                (!viewerAccess.previewRows || activeExt === 'OFX' || activeExt === 'TXT') && (
                                  <pre
                                    style={{
                                      width: '100%',
                                      margin: 0,
                                      padding: 16,
                                      background: '#0d1324',
                                      border: '1px solid #28365e',
                                      borderRadius: 8,
                                      color: '#dbe1f5',
                                      font: "12.5px/1.6 'IBM Plex Mono', monospace",
                                      whiteSpace: 'pre-wrap',
                                      maxHeight: '55vh',
                                      overflowY: 'auto'
                                    }}
                                  >
                                    {viewerAccess.previewText}
                                  </pre>
                                )}

                              {!isOfficeFile &&
                                (!viewerAccess.previewRows ||
                                  viewerAccess.previewRows.length === 0) &&
                                !viewerAccess.previewText && (
                                  <div
                                    style={{
                                      background: '#141d36',
                                      border: '1px solid #304072',
                                      borderRadius: 10,
                                      padding: 24,
                                      textAlign: 'center',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      alignItems: 'center',
                                      gap: 12
                                    }}
                                  >
                                    <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
                                      📄 {activeViewerMedia.media.name}
                                    </div>
                                    <div style={{ fontSize: 12.5, color: '#9aa4c7' }}>
                                      Formato: {activeExt} • Tamanho:{' '}
                                      {activeViewerMedia.media.size ||
                                        'Armazenado no Supabase Storage (pop-media)'}
                                    </div>
                                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                      {viewerAccess.url && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            window.open(
                                              viewerAccess.url,
                                              '_blank',
                                              'noopener,noreferrer'
                                            )
                                          }
                                          style={{
                                            height: 38,
                                            padding: '0 20px',
                                            borderRadius: 8,
                                            border: 'none',
                                            background: '#4f6bff',
                                            color: '#fff',
                                            fontWeight: 700,
                                            fontSize: 13,
                                            cursor: 'pointer'
                                          }}
                                        >
                                          📂 Abrir em nova aba
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={e =>
                                          handleDownloadMedia(activeViewerMedia.media, e)
                                        }
                                        style={{
                                          height: 38,
                                          padding: '0 20px',
                                          borderRadius: 8,
                                          border: 'none',
                                          background: '#22a06b',
                                          color: '#fff',
                                          fontWeight: 700,
                                          fontSize: 13,
                                          cursor: 'pointer'
                                        }}
                                      >
                                        ⬇ Baixar arquivo ({activeExt})
                                      </button>
                                    </div>
                                  </div>
                                )}
                            </>
                          )}
                        </div>
                      )
                    })()}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


