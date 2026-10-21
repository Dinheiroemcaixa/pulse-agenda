import { sb } from './supabase'
import { genId } from './utils'
import type { Pop, PopStep, PopStepMedia, Task } from '../types'

const POPS_LOCAL_STORAGE_KEY = 'pulse_pops_cache_v5'
const TASK_POP_LINKS_KEY = 'pulse_task_pop_links_v2'

export const POP_STORAGE_BUCKET = 'pop-media'
export const POP_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB (limite real configurado no bucket pop-media)
export const POP_MAX_FILE_SIZE_LABEL = '50 MB'

const ALLOWED_VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi', 'ogg', 'mkv']
const ALLOWED_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']
const ALLOWED_DOC_EXTENSIONS = ['pdf', 'xlsx', 'xls', 'csv', 'docx', 'doc', 'ofx', 'txt']
const ALL_ALLOWED_EXTENSIONS = [
  ...ALLOWED_VIDEO_EXTENSIONS,
  ...ALLOWED_IMAGE_EXTENSIONS,
  ...ALLOWED_DOC_EXTENSIONS
]

const EXTENSION_MIME_MAP: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  ogg: 'video/ogg',
  mkv: 'video/x-matroska',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv;charset=utf-8',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  ofx: 'application/x-ofx',
  txt: 'text/plain;charset=utf-8'
}

export interface PopFileValidationResult {
  valid: boolean
  error?: string
  mediaType?: 'video' | 'image' | 'doc'
  extension?: string
  inferredMimeType?: string
}

export function formatPopFileSize(bytes: number): string {
  if (bytes >= 1048576) {
    return `${(bytes / 1048576).toFixed(1)} MB`
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export function validatePopAttachmentFile(file: File): PopFileValidationResult {
  if (!file) {
    return { valid: false, error: 'Nenhum arquivo selecionado.' }
  }
  if (file.size === 0) {
    return {
      valid: false,
      error: `O arquivo "${file.name}" está vazio (0 bytes). Selecione um arquivo válido.`
    }
  }
  if (file.size > POP_MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `O arquivo "${file.name}" (${formatPopFileSize(file.size)}) excede o limite máximo de ${POP_MAX_FILE_SIZE_LABEL} do Supabase Storage.`
    }
  }

  const rawExt = (file.name.split('.').pop() || '').toLowerCase().trim()
  const mime = (file.type || '').toLowerCase().trim()

  const isVideoExt = ALLOWED_VIDEO_EXTENSIONS.includes(rawExt)
  const isImageExt = ALLOWED_IMAGE_EXTENSIONS.includes(rawExt)
  const isDocExt = ALLOWED_DOC_EXTENSIONS.includes(rawExt)

  const isVideoMime = mime.startsWith('video/')
  const isImageMime = mime.startsWith('image/')
  const isDocMime =
    mime === 'application/pdf' ||
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    mime.includes('csv') ||
    mime.includes('word') ||
    mime.includes('officedocument') ||
    mime.includes('msword') ||
    mime.includes('ofx') ||
    mime.startsWith('text/') ||
    mime === 'application/octet-stream' ||
    mime === ''

  const isAllowedByExt = ALL_ALLOWED_EXTENSIONS.includes(rawExt)
  if (!isAllowedByExt && !isVideoMime && !isImageMime) {
    return {
      valid: false,
      error: `Formato não suportado em "${file.name}". Tipos aceitos: Vídeos (MP4, WebM, MOV, AVI, MKV), Imagens (PNG, JPG, WebP, GIF, SVG) e Documentos (PDF, XLSX, XLS, CSV, DOCX, DOC, OFX, TXT).`
    }
  }

  if (isVideoExt || (isVideoMime && !isImageExt && !isDocExt)) {
    return {
      valid: true,
      mediaType: 'video',
      extension: (rawExt || 'mp4').toUpperCase().slice(0, 4),
      inferredMimeType:
        mime && mime !== 'application/octet-stream'
          ? mime
          : EXTENSION_MIME_MAP[rawExt] || 'video/mp4'
    }
  }

  if (isImageExt || (isImageMime && !isVideoExt && !isDocExt)) {
    return {
      valid: true,
      mediaType: 'image',
      extension: (rawExt || 'png').toUpperCase().slice(0, 4),
      inferredMimeType:
        mime && mime !== 'application/octet-stream'
          ? mime
          : EXTENSION_MIME_MAP[rawExt] || 'image/png'
    }
  }

  if (isDocExt && isDocMime) {
    return {
      valid: true,
      mediaType: 'doc',
      extension: rawExt.toUpperCase().slice(0, 4),
      inferredMimeType:
        EXTENSION_MIME_MAP[rawExt] ||
        (mime && mime !== 'application/octet-stream' ? mime : 'application/octet-stream')
    }
  }

  return {
    valid: false,
    error: `Tipo de arquivo inválido ou incompatível em "${file.name}".`
  }
}

function sanitizeStorageSegment(raw: string): string {
  return (
    raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 90) || 'arquivo'
  )
}

export async function uploadPopMediaFile(
  popId: string,
  stepId: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<PopStepMedia> {
  const validation = validatePopAttachmentFile(file)
  if (!validation.valid) {
    throw new Error(validation.error || 'Arquivo inválido para envio.')
  }

  const safePopId = sanitizeStorageSegment(popId || 'draft')
  const safeStepId = sanitizeStorageSegment(stepId || 'step')
  const safeFileName = sanitizeStorageSegment(file.name)
  const randomId = Math.random().toString(36).slice(2, 8)
  const storagePath = `pops/${safePopId}/${safeStepId}_${Date.now()}_${randomId}_${safeFileName}`
  const inferredMimeType =
    validation.inferredMimeType || file.type || 'application/octet-stream'

  onProgress?.(15)
  const progressTimer = setInterval(() => {
    onProgress?.(65)
  }, 280)

  try {
    const { error } = await sb.storage.from(POP_STORAGE_BUCKET).upload(storagePath, file, {
      contentType: inferredMimeType,
      upsert: false
    })

    if (error) {
      throw new Error(
        `Falha ao enviar "${file.name}" para o Supabase Storage: ${error.message || 'Erro de armazenamento'}`
      )
    }

    onProgress?.(100)

    const mediaType = validation.mediaType || 'doc'
    const ext =
      validation.extension ||
      (file.name.split('.').pop() || 'ARQ').slice(0, 4).toUpperCase()

    return {
      id: `${Date.now()}_${randomId}`,
      name: file.name,
      type: mediaType,
      storage_bucket: POP_STORAGE_BUCKET,
      storage_path: storagePath,
      mime_type: inferredMimeType,
      file_size_bytes: file.size,
      size: formatPopFileSize(file.size),
      extension: ext,
      content_hash: `${file.name}::${file.size}::${file.lastModified}`
    }
  } finally {
    clearInterval(progressTimer)
  }
}

// Cache em memória de URLs assinadas (TTL de 45 min para URLs assinadas de 3600s)
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>()
const referenceBlobCache = new Map<
  string,
  {
    url: string
    blob: Blob
    mimeType: string
    previewRows?: string[][]
    previewText?: string
  }
>()

export interface ResolvedPopMediaAccess {
  ok: boolean
  error?: string
  url?: string
  source?: 'storage' | 'external' | 'data' | 'reference'
  isExternalLink?: boolean
  mimeType?: string
  previewRows?: string[][]
  previewText?: string
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function escapePdfText(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

function buildValidPdfBytes(title: string, lines: string[]): Uint8Array {
  const safeTitle = escapePdfText(title)
  const contentCommands: string[] = [
    'BT',
    '/F1 16 Tf',
    '48 770 Td',
    `(PULSE AGENDA - DOCUMENTO OPERACIONAL POP) Tj`,
    '0 -26 Td',
    '/F1 13 Tf',
    `(${safeTitle}) Tj`,
    '0 -24 Td',
    '/F1 10 Tf'
  ]

  for (const line of lines) {
    contentCommands.push(`(${escapePdfText(line)}) Tj`)
    contentCommands.push('0 -16 Td')
  }
  contentCommands.push('ET')

  const streamContent = contentCommands.join('\n')
  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'
  ]

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = [0]
  for (const obj of objects) {
    offsets.push(pdf.length)
    pdf += obj
  }
  const xrefStart = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
  return new TextEncoder().encode(pdf)
}

async function generateSyntheticTutorialVideoBlob(title: string): Promise<Blob | null> {
  if (typeof document === 'undefined' || typeof MediaRecorder === 'undefined') {
    return null
  }
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 360
    const ctx = canvas.getContext('2d')
    if (!ctx || typeof canvas.captureStream !== 'function') return null

    const mimeCandidates = [
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4'
    ]
    const supportedMime =
      mimeCandidates.find(m => {
        try {
          return MediaRecorder.isTypeSupported(m)
        } catch {
          return false
        }
      }) || ''

    const stream = canvas.captureStream(15)
    const recorder = supportedMime
      ? new MediaRecorder(stream, { mimeType: supportedMime })
      : new MediaRecorder(stream)

    const chunks: BlobPart[] = []
    recorder.ondataavailable = e => {
      if (e.data && e.data.size > 0) chunks.push(e.data)
    }

    const stopped = new Promise<Blob>(resolve => {
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: supportedMime || 'video/webm' }))
      }
    })

    const drawFrame = (frame: number, totalFrames: number) => {
      ctx.fillStyle = '#0d1324'
      ctx.fillRect(0, 0, 640, 360)

      ctx.fillStyle = '#141b31'
      ctx.fillRect(24, 24, 592, 54)
      ctx.strokeStyle = '#34407a'
      ctx.lineWidth = 2
      ctx.strokeRect(24, 24, 592, 54)

      ctx.fillStyle = '#4f6bff'
      ctx.font = 'bold 14px sans-serif'
      ctx.fillText('PULSE AGENDA • TUTORIAL OPERACIONAL POP', 40, 48)
      ctx.fillStyle = '#e6e9f2'
      ctx.font = 'bold 16px sans-serif'
      ctx.fillText(title.slice(0, 48), 40, 68)

      const steps = [
        '1. Acessar o módulo bancário / ERP do cliente e validar filtros de data',
        '2. Exportar ou conferir lançamentos linha a linha conforme instrução da etapa',
        '3. Validar saldos finais e anexar comprovante de execução no fechamento'
      ]
      const activeStep = Math.min(2, Math.floor((frame / totalFrames) * 3))
      steps.forEach((txt, idx) => {
        const y = 104 + idx * 62
        ctx.fillStyle = idx === activeStep ? '#1b2854' : '#121930'
        ctx.fillRect(24, y, 592, 48)
        ctx.strokeStyle = idx === activeStep ? '#4f6bff' : '#26304f'
        ctx.strokeRect(24, y, 592, 48)

        ctx.fillStyle = idx <= activeStep ? '#5ed39a' : '#8b94b3'
        ctx.font = 'bold 13px sans-serif'
        ctx.fillText(idx < activeStep ? '✓ CONCLUÍDO' : idx === activeStep ? '▶ EM EXECUÇÃO' : '• PENDENTE', 38, y + 20)

        ctx.fillStyle = '#e6e9f2'
        ctx.font = '13px sans-serif'
        ctx.fillText(txt, 38, y + 38)
      })

      const pct = Math.min(1, (frame + 1) / totalFrames)
      ctx.fillStyle = '#1b223b'
      ctx.fillRect(24, 312, 592, 16)
      ctx.fillStyle = '#22a06b'
      ctx.fillRect(24, 312, Math.round(592 * pct), 16)
    }

    recorder.start()
    const totalFrames = 18
    for (let f = 0; f < totalFrames; f++) {
      drawFrame(f, totalFrames)
      await new Promise(r => setTimeout(r, 55))
    }
    recorder.stop()
    stream.getTracks().forEach(t => t.stop())
    const blob = await stopped
    return blob.size > 0 ? blob : null
  } catch {
    return null
  }
}

export async function buildReferenceMediaBlob(media: PopStepMedia): Promise<{
  url: string
  blob: Blob
  mimeType: string
  previewRows?: string[][]
  previewText?: string
}> {
  const cacheKey = `${media.type}::${media.extension || ''}::${media.name}`
  const cached = referenceBlobCache.get(cacheKey)
  if (cached) return cached

  const ext = (
    media.extension ||
    (media.name.includes('.') ? media.name.split('.').pop() || '' : '')
  )
    .toUpperCase()
    .trim()

  if (media.type === 'image') {
    const safeName = escapeXml(media.name || 'Captura Operacional')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="580" viewBox="0 0 960 580">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0d1324"/>
          <stop offset="100%" stop-color="#151f3a"/>
        </linearGradient>
      </defs>
      <rect width="960" height="580" fill="url(#bg)"/>
      <rect x="28" y="24" width="904" height="58" rx="10" fill="#182342" stroke="#304072" stroke-width="1.5"/>
      <circle cx="54" cy="53" r="7" fill="#ff6b7a"/>
      <circle cx="76" cy="53" r="7" fill="#f5b851"/>
      <circle cx="98" cy="53" r="7" fill="#4cd98c"/>
      <text x="128" y="58" fill="#a9b8ff" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="16" font-weight="700">PULSE AGENDA • GUIA VISUAL DE REFERÊNCIA DO POP</text>
      <rect x="28" y="102" width="904" height="446" rx="12" fill="#11182d" stroke="#263359" stroke-width="1.5"/>
      <rect x="56" y="130" width="848" height="72" rx="8" fill="#182240" stroke="#395196" stroke-width="1.2"/>
      <text x="80" y="160" fill="#7d93ff" font-family="IBM Plex Mono, monospace" font-size="13" font-weight="600">TELA / ETAPA ILUSTRADA</text>
      <text x="80" y="186" fill="#ffffff" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="22" font-weight="700">${safeName}</text>
      <rect x="56" y="224" width="410" height="140" rx="8" fill="#141d36" stroke="#263359"/>
      <text x="76" y="254" fill="#5ed39a" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="14" font-weight="700">✓ Checklist de Conferência Visual</text>
      <text x="76" y="282" fill="#c6cce0" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="13">1. Selecionar conta e período correto no filtro</text>
      <text x="76" y="308" fill="#c6cce0" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="13">2. Validar valores de entrada, saída e saldo final</text>
      <text x="76" y="334" fill="#c6cce0" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="13">3. Exportar comprovante / extrato para conciliação</text>
      <rect x="486" y="224" width="418" height="140" rx="8" fill="#141d36" stroke="#263359"/>
      <text x="506" y="254" fill="#a9b8ff" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="14" font-weight="700">Resumo de Conciliação BPO</text>
      <text x="506" y="284" fill="#8b94b3" font-family="IBM Plex Mono, monospace" font-size="13">Status do Lote: CONFERIDO E VALIDADO</text>
      <text x="506" y="310" fill="#8b94b3" font-family="IBM Plex Mono, monospace" font-size="13">Divergências: R$ 0,00 (100% Conciliado)</text>
      <text x="506" y="336" fill="#5ed39a" font-family="IBM Plex Mono, monospace" font-size="13">Padrão Operacional: LM Contabilidade / BPO</text>
      <rect x="56" y="386" width="848" height="132" rx="8" fill="#0d1428" stroke="#263359"/>
      <text x="76" y="418" fill="#ffb48a" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="13" font-weight="700">ORIENTAÇÃO DE EXECUÇÃO:</text>
      <text x="76" y="446" fill="#aab2cc" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="13">Confira se os dados exibidos na tela do sistema correspondem integralmente ao documento fiscal ou extrato bancário</text>
      <text x="76" y="470" fill="#aab2cc" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="13">antes de avançar para o próximo passo deste Procedimento Operacional Padrão (POP).</text>
    </svg>`
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const entry = { url, blob, mimeType: 'image/svg+xml' }
    referenceBlobCache.set(cacheKey, entry)
    return entry
  }

  if (media.type === 'video') {
    const videoBlob = await generateSyntheticTutorialVideoBlob(media.name || 'Tutorial POP')
    if (videoBlob) {
      const url = URL.createObjectURL(videoBlob)
      const entry = {
        url,
        blob: videoBlob,
        mimeType: videoBlob.type || 'video/webm',
        previewText: `Vídeo demonstrativo do procedimento: "${media.name}". Reproduza os passos operacionais no player acima ou baixe o arquivo de vídeo.`
      }
      referenceBlobCache.set(cacheKey, entry)
      return entry
    }
    const fallbackText = [
      `ROTEIRO DE VÍDEO OPERACIONAL — PULSE AGENDA`,
      `Anexo: ${media.name}`,
      `------------------------------------------------------------`,
      `00:00 - Abertura do sistema / Internet Banking do cliente`,
      `00:25 - Seleção do período de conciliação e filtros da etapa`,
      `00:55 - Exportação e conferência dos registros (OFX / PDF / ERP)`,
      `01:25 - Validação de saldo final e arquivamento do comprovante`
    ].join('\n')
    const blob = new Blob([fallbackText], { type: 'video/webm' })
    const url = URL.createObjectURL(blob)
    const entry = { url, blob, mimeType: 'video/webm', previewText: fallbackText }
    referenceBlobCache.set(cacheKey, entry)
    return entry
  }

  if (ext === 'PDF') {
    const pdfBytes = buildValidPdfBytes(media.name, [
      `Arquivo de Referencia: ${media.name}`,
      'Procedimento Operacional Padrao (POP) - Equipe BPO Financeiro',
      '----------------------------------------------------------------------',
      '1. Verifique os dados cadastrais do cliente, conta bancaria e periodo.',
      '2. Confira se todos os lancamentos possuem documento comprobatario.',
      '3. Caso identifique divergencia de saldo ou valor, registre neste modelo',
      '   e comunique imediatamente a coordenacao financeira (Raffaela Lima).',
      '4. Arquive o comprovante validado na pasta oficial do cliente.'
    ])
    const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const entry = {
      url,
      blob,
      mimeType: 'application/pdf',
      previewText: `Documento PDF operacional: ${media.name}`
    }
    referenceBlobCache.set(cacheKey, entry)
    return entry
  }

  if (ext === 'XLSX' || ext === 'XLS' || ext === 'CSV') {
    const rows: string[][] = [
      ['Código Cliente', 'Razão Social / Cliente', 'Banco / Conta', 'Data Base', 'Valor / Saldo (R$)', 'Status Conciliação', 'Responsável BPO'],
      ['CLI-001', 'Grupo Alfa Serviços Ltda', 'Itaú Empresas • Ag 0412 CC 99812-4', new Date().toLocaleDateString('pt-BR'), 'R$ 48.920,50', 'Conciliado', 'Raffaela Lima'],
      ['CLI-002', 'Beta Tecnologia & Consultoria', 'Bradesco Corporate • Ag 1180 CC 33401-1', new Date().toLocaleDateString('pt-BR'), 'R$ 19.430,00', 'Conciliado', 'Raffaela Lima'],
      ['CLI-003', 'Clínica Integrada São Lucas', 'Banco Inter PJ • CC 7721904-8', new Date().toLocaleDateString('pt-BR'), 'R$ 12.875,90', 'Em Conferência', 'Equipe BPO'],
      ['CLI-004', 'Comércio Varejista Horizonte', 'Santander Empresas • Ag 3021 CC 130092-1', new Date().toLocaleDateString('pt-BR'), 'R$ 84.110,25', 'Conciliado', 'Raffaela Lima']
    ]
    const csvContent =
      '\uFEFF' +
      rows
        .map(r => r.map(cell => `"${cell.replace(/"/g, '""')}"`).join(';'))
        .join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const entry = {
      url,
      blob,
      mimeType: 'text/csv;charset=utf-8',
      previewRows: rows
    }
    referenceBlobCache.set(cacheKey, entry)
    return entry
  }

  // DOCX, DOC, OFX, TXT e demais documentos
  const docText = [
    `DOCUMENTO OPERACIONAL DE REFERÊNCIA — PULSE AGENDA`,
    `Arquivo: ${media.name}`,
    `Formato: ${ext || 'DOC'}`,
    `====================================================================`,
    `1. OBJETIVO DO MODELO`,
    `   Padronizar a conferência e o registro das etapas do Procedimento Operacional Padrão (POP).`,
    ``,
    `2. INSTRUÇÕES DE PREENCHIMENTO / USO`,
    `   - Identifique o cliente, CNPJ e data de competência antes de iniciar.`,
    `   - Registre os valores conferidos e anexe as evidências exigidas na etapa.`,
    `   - Em caso de dúvidas ou exceções operacionais, acione a gestão financeira.`,
    ``,
    `3. CONTROLE DE QUALIDADE`,
    `   Documento gerado pelo módulo de Procedimentos (POP) do Pulse Agenda.`
  ].join('\r\n')
  const blob = new Blob([docText], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const entry = {
    url,
    blob,
    mimeType: 'text/plain;charset=utf-8',
    previewText: docText
  }
  referenceBlobCache.set(cacheKey, entry)
  return entry
}

export async function resolvePopMediaAccess(
  media: PopStepMedia,
  currentUserEmail?: string | null,
  forceRefresh?: boolean
): Promise<ResolvedPopMediaAccess> {
  if (!currentUserEmail || !currentUserEmail.trim()) {
    return {
      ok: false,
      error:
        'Acesso restrito: faça login com um usuário autorizado para visualizar ou baixar este anexo.'
    }
  }

  // Caso 1: Arquivo armazenado no Supabase Storage (media.storage_path)
  if (media.storage_path) {
    const bucket = media.storage_bucket || POP_STORAGE_BUCKET
    const cacheKey = `${bucket}::${media.storage_path}`
    const now = Date.now()
    if (!forceRefresh) {
      const cached = signedUrlCache.get(cacheKey)
      if (cached && cached.expiresAt > now) {
        return {
          ok: true,
          url: cached.url,
          source: 'storage',
          isExternalLink: false,
          mimeType: media.mime_type
        }
      }
    }

    const { data, error } = await sb.storage
      .from(bucket)
      .createSignedUrl(media.storage_path, 3600)

    if (error || !data?.signedUrl) {
      return {
        ok: false,
        error: `Não foi possível gerar o link seguro do arquivo "${media.name}" no Storage (${error?.message || 'arquivo indisponível'}).`
      }
    }

    signedUrlCache.set(cacheKey, {
      url: data.signedUrl,
      expiresAt: now + 45 * 60 * 1000 // 45 minutos
    })

    let previewRows: string[][] | undefined
    let previewText: string | undefined
    const extUpper = (media.extension || '').toUpperCase()
    if (
      (!media.file_size_bytes || media.file_size_bytes <= 512 * 1024) &&
      (extUpper === 'CSV' || extUpper === 'TXT' || extUpper === 'OFX')
    ) {
      try {
        const res = await fetch(data.signedUrl)
        if (res.ok) {
          const text = (await res.text()).replace(/^\uFEFF/, '')
          if (extUpper === 'CSV') {
            previewRows = text
              .split(/\r?\n/)
              .filter(line => line.trim().length > 0)
              .slice(0, 30)
              .map(line => line.split(/[;,]/).map(cell => cell.trim()))
          } else {
            previewText = text.slice(0, 4000)
          }
        }
      } catch {
        // Ignora erro de pré-visualização textual opcional
      }
    }

    return {
      ok: true,
      url: data.signedUrl,
      source: 'storage',
      isExternalLink: false,
      mimeType: media.mime_type,
      previewRows,
      previewText
    }
  }

  // Caso 2: Link externo (media.external_url ou media.url começando com http:// ou https://)
  const rawExternal = (media.external_url || media.url || '').trim()
  if (rawExternal.startsWith('http://') || rawExternal.startsWith('https://')) {
    const isStorageSignedUrl = rawExternal.includes('/storage/v1/object/')
    return {
      ok: true,
      url: rawExternal,
      source: 'external',
      isExternalLink: !isStorageSignedUrl,
      mimeType: media.mime_type
    }
  }

  // Caso 3: Data URL legada
  if (media.url && media.url.startsWith('data:')) {
    return {
      ok: true,
      url: media.url,
      source: 'data',
      isExternalLink: false,
      mimeType: media.mime_type
    }
  }

  // Caso 4: Anexos pré-existentes dos POPs padrão (DEFAULT_POPS) sem storage_path/url ou blob legado
  const refData = await buildReferenceMediaBlob(media)
  return {
    ok: true,
    url: refData.url,
    source: 'reference',
    isExternalLink: false,
    mimeType: refData.mimeType,
    previewRows: refData.previewRows,
    previewText: refData.previewText
  }
}

function ensureDownloadFileName(media: PopStepMedia, mimeType?: string): string {
  const rawName = (media.name || 'anexo-pop').replace(/[·•]/g, '-').trim()
  if (/\.[a-zA-Z0-9]{2,5}$/.test(rawName)) {
    // Se for planilha de referência gerada em CSV compatível com Excel, garante extensão legível se necessário
    if (mimeType?.includes('text/csv') && /\.xlsx$/i.test(rawName) && !media.storage_path) {
      return rawName.replace(/\.xlsx$/i, '.csv')
    }
    return rawName
  }
  const ext = (media.extension || '').toLowerCase()
  if (ext === 'pdf') return `${rawName}.pdf`
  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
    return media.storage_path ? `${rawName}.${ext}` : `${rawName}.csv`
  }
  if (media.type === 'video') {
    return mimeType?.includes('mp4') ? `${rawName}.mp4` : `${rawName}.webm`
  }
  if (media.type === 'image') {
    return mimeType?.includes('svg') ? `${rawName}.svg` : `${rawName}.png`
  }
  return `${rawName}.txt`
}

function triggerBrowserBlobDownload(blob: Blob, fileName: string): void {
  const blobUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = fileName
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(blobUrl), 5000)
}

export async function downloadPopMediaFile(
  media: PopStepMedia,
  currentUserEmail?: string | null
): Promise<{ ok: boolean; error?: string; openedExternal?: boolean }> {
  if (!currentUserEmail || !currentUserEmail.trim()) {
    return {
      ok: false,
      error:
        'Acesso restrito: faça login com um usuário autorizado para baixar este anexo.'
    }
  }

  // 1. Se possui storage_path no Supabase Storage, faz download binário direto do Blob original
  if (media.storage_path) {
    const bucket = media.storage_bucket || POP_STORAGE_BUCKET
    const { data, error } = await sb.storage.from(bucket).download(media.storage_path)
    if (error || !data) {
      return {
        ok: false,
        error: `Falha ao baixar "${media.name}" do Supabase Storage: ${error?.message || 'Arquivo não encontrado'}`
      }
    }
    const finalBlob =
      media.mime_type && data.type !== media.mime_type
        ? new Blob([data], { type: media.mime_type })
        : data
    triggerBrowserBlobDownload(
      finalBlob,
      ensureDownloadFileName(media, media.mime_type || data.type)
    )
    return { ok: true }
  }

  // 2. Se for Data URL legada, converte para Blob real com o MIME correto
  if (media.url && media.url.startsWith('data:')) {
    try {
      const res = await fetch(media.url)
      const blob = await res.blob()
      triggerBrowserBlobDownload(blob, ensureDownloadFileName(media, blob.type))
      return { ok: true }
    } catch {
      return { ok: false, error: `Não foi possível converter o anexo "${media.name}" para download.` }
    }
  }

  // 3. Se for link externo (http/https), abre em nova guia segura sem baixar HTML de erro
  const rawExternal = (media.external_url || media.url || '').trim()
  if (rawExternal.startsWith('http://') || rawExternal.startsWith('https://')) {
    window.open(rawExternal, '_blank', 'noopener,noreferrer')
    return { ok: true, openedExternal: true }
  }

  // 4. Anexo de referência dos POPs padrão (DEFAULT_POPS)
  const refData = await buildReferenceMediaBlob(media)
  triggerBrowserBlobDownload(refData.blob, ensureDownloadFileName(media, refData.mimeType))
  return { ok: true }
}

export async function cleanupUnreferencedPopStorageFiles(
  pathsToDelete: string[],
  allPops: Pop[]
): Promise<void> {
  const uniqueCandidates = Array.from(
    new Set(pathsToDelete.map(p => p.trim()).filter(Boolean))
  )
  if (uniqueCandidates.length === 0) return

  const referencedPaths = new Set<string>()
  for (const pop of allPops) {
    for (const step of pop.steps || []) {
      for (const m of step.media || []) {
        if (m.storage_path) {
          referencedPaths.add(m.storage_path.trim())
        }
      }
    }
  }

  const unreferencedPaths = uniqueCandidates.filter(p => !referencedPaths.has(p))
  if (unreferencedPaths.length === 0) return

  try {
    await sb.storage.from(POP_STORAGE_BUCKET).remove(unreferencedPaths)
  } catch (err) {
    console.warn('Aviso ao limpar arquivos órfãos do bucket pop-media:', err)
  }
}

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

function sanitizePopStepsForPersistence(steps: PopStep[]): PopStep[] {
  return (steps || []).map((s, idx) => ({
    ...s,
    order: idx + 1,
    media: (s.media || []).map(m => {
      const rawUrl = m.url || ''
      const isBlobUrl = rawUrl.startsWith('blob:')
      const isDataVideo = rawUrl.startsWith('data:video/')
      const hasStoragePath = Boolean(m.storage_path)
      return {
        ...m,
        url: hasStoragePath || isBlobUrl || isDataVideo ? undefined : m.url
      }
    })
  }))
}

function hydrateBuiltInPops(list: Pop[]): Pop[] {
  if (!Array.isArray(list)) return []
  return list.map(p => ({
    ...p,
    estimated_time: p.estimated_time || '30 min',
    steps: Array.isArray(p.steps) ? p.steps : []
  }))
}

// Carrega POPs do cache local (sem injetar DEFAULT_POPS)
export function getLocalPops(): Pop[] {
  try {
    // Limpa caches legados desatualizados que continham DEFAULT_POPS ou vínculos implícitos
    localStorage.removeItem('pulse_pops_cache_v1')
    localStorage.removeItem('pulse_pops_cache_v2')
    localStorage.removeItem('pulse_pops_cache_v3')
    localStorage.removeItem('pulse_pops_cache_v4')
    localStorage.removeItem('pulse_task_pop_links_v1')
    const raw = localStorage.getItem(POPS_LOCAL_STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return []
    }
    const hydrated = hydrateBuiltInPops(parsed)
    localStorage.setItem(POPS_LOCAL_STORAGE_KEY, JSON.stringify(hydrated))
    return hydrated
  } catch {
    return []
  }
}

// Salva POPs no cache local com proteção contra estouro de quota (nunca salva blob: nem vídeos em data:)
function setLocalPops(pops: Pop[]): void {
  const sanitized = pops.map(p => ({
    ...p,
    steps: sanitizePopStepsForPersistence(p.steps || [])
  }))
  try {
    localStorage.setItem(POPS_LOCAL_STORAGE_KEY, JSON.stringify(sanitized))
  } catch (e) {
    console.warn('Limite de localStorage atingido para POPs; salvando versão compacta sem Data URLs pesadas:', e)
    try {
      const compactPops = sanitized.map(p => ({
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
    localStorage.removeItem('pulse_task_pop_links_v1')
    const raw = localStorage.getItem(TASK_POP_LINKS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function setLocalTaskPopLink(taskId: string, popId: string | null): void {
  try {
    const links = getLocalTaskPopLinks()
    if (!popId || !popId.trim()) {
      delete links[taskId]
    } else {
      links[taskId] = popId.trim()
    }
    localStorage.setItem(TASK_POP_LINKS_KEY, JSON.stringify(links))
  } catch (e) {
    console.error('Erro ao salvar vínculo de POP:', e)
  }
}

// ──────────────────────────────────────────────────────────────
// API DE POPS COM GRACEFUL DEGRADATION E SINCRONIZAÇÃO SUPABASE
// ──────────────────────────────────────────────────────────────

export async function fetchPopsApi(): Promise<Pop[]> {
  try {
    const { data, error } = await sb
      .from('pops')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      return getLocalPops()
    }
    if (!data || data.length === 0) {
      setLocalPops([])
      return []
    }
    const remoteFormatted = data.map((p: any) => {
      const parsedSteps =
        typeof p.steps === 'string' ? JSON.parse(p.steps) : Array.isArray(p.steps) ? p.steps : []
      return {
        ...p,
        estimated_time: p.estimated_time || '30 min',
        steps: parsedSteps
      }
    }) as Pop[]
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
      id: popData.id || genId(),
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

  const sanitizedSteps = sanitizePopStepsForPersistence(finalPop.steps || [])
  finalPop = {
    ...finalPop,
    steps: sanitizedSteps
  }

  // Persiste no Supabase (incluindo estimated_time e steps sanitizados sem blob: ou data:video)
  try {
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
      estimated_time: finalPop.estimated_time || '30 min',
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
  const existsInLocal = Boolean(
    (editId && localList.some(p => p.id === editId)) ||
      localList.some(p => p.id === finalPop.id)
  )
  const targetMatchId = editId || finalPop.id
  const updatedList = existsInLocal
    ? localList.map(p => (p.id === targetMatchId ? finalPop : p))
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
  const targetPop = localList.find(p => p.id === id)
  const remainingPops = localList.filter(p => p.id !== id)

  try {
    await sb.from('pops').delete().eq('id', id)
  } catch (err) {
    console.warn('Excluindo POP localmente:', err)
  }

  if (targetPop) {
    const candidatePaths: string[] = []
    for (const s of targetPop.steps || []) {
      for (const m of s.media || []) {
        if (m.storage_path) candidatePaths.push(m.storage_path)
      }
    }
    if (candidatePaths.length > 0) {
      await cleanupUnreferencedPopStorageFiles(candidatePaths, remainingPops)
    }
  }

  setLocalPops(remainingPops)
  return true
}

// Vincula ou desvincula POP de uma tarefa no Supabase e no cache local
export async function linkTaskToPopApi(taskId: string, popId: string | null): Promise<boolean> {
  const normalized = popId && popId.trim() ? popId.trim() : null
  setLocalTaskPopLink(taskId, normalized)

  if (!taskId.startsWith('virtual_')) {
    try {
      const { error } = await sb.from('tasks').update({ pop_id: normalized }).eq('id', taskId)
      return !error
    } catch {
      return false
    }
  }
  return true
}

// Resolve o pop_id de uma tarefa (Zero fallback automático — apenas vínculo explícito)
export function resolveTaskPopId(
  taskOrId: Task | string | undefined | null,
  localLinks?: Record<string, string>
): string | undefined {
  if (!taskOrId) return undefined
  const links = localLinks || getLocalTaskPopLinks()
  if (typeof taskOrId === 'object') {
    if (taskOrId.pop_id === null) return undefined
    if (typeof taskOrId.pop_id === 'string' && taskOrId.pop_id.trim()) {
      return taskOrId.pop_id.trim()
    }
    if (taskOrId.id && links[taskOrId.id]) {
      return links[taskOrId.id]
    }
    return undefined
  }
  if (typeof taskOrId === 'string' && links[taskOrId]) {
    return links[taskOrId]
  }
  return undefined
}
