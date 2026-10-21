import React from 'react'

export interface DcxFlowIconProps {
  size?: number
  className?: string
  style?: React.CSSProperties
}

export const DcxFlowIcon: React.FC<DcxFlowIconProps> = ({
  size = 34,
  className = '',
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`flex-shrink-0 ${className}`.trim()}
    style={style}
    aria-hidden="true"
  >
    <rect width="64" height="64" rx="15" fill="#0D1B38" />
    <rect
      x="0.75"
      y="0.75"
      width="62.5"
      height="62.5"
      rx="14.25"
      stroke="#FFFFFF"
      strokeOpacity="0.12"
      strokeWidth="1.5"
    />
    {/* Arco geométrico estilizado em formato de "D" dinâmico */}
    <path
      d="M17 15H30C40.4934 15 49 22.6112 49 32C49 41.3888 40.4934 49 30 49H17V39.5"
      stroke="#FFFFFF"
      strokeWidth="6.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M17 15V24.5"
      stroke="#FFFFFF"
      strokeWidth="6.5"
      strokeLinecap="round"
    />
    {/* Seta de fluxo em verde-esmeralda avançando pelo centro */}
    <path
      d="M16 32H41M41 32L33.5 24.5M41 32L33.5 39.5"
      stroke="#22C55E"
      strokeWidth="6.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export interface DcxFlowBrandProps {
  variant?: 'compact' | 'full'
  theme?: 'light' | 'dark'
  iconSize?: number
  className?: string
}

export const DcxFlowBrand: React.FC<DcxFlowBrandProps> = ({
  variant = 'compact',
  theme,
  iconSize,
  className = '',
}) => {
  const resolvedIconSize = iconSize ?? (variant === 'full' ? 42 : 30)
  const dcxColor =
    theme === 'light'
      ? '#0F172A'
      : theme === 'dark'
      ? '#FFFFFF'
      : 'var(--text, #0F172A)'
  const flowColor = theme === 'dark' ? '#34D399' : '#16A34A'
  const subColor =
    theme === 'light'
      ? '#475569'
      : theme === 'dark'
      ? '#94A3B8'
      : 'var(--text3, #64748B)'

  return (
    <div
      className={`inline-flex items-center gap-2.5 select-none ${className}`.trim()}
      style={{ display: 'inline-flex', alignItems: 'center', gap: variant === 'full' ? 12 : 9 }}
    >
      <DcxFlowIcon size={resolvedIconSize} />
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.08 }}>
        <div
          style={{
            fontFamily: "'Manrope', 'IBM Plex Sans', sans-serif",
            fontSize: variant === 'full' ? 24 : 16,
            fontWeight: 800,
            letterSpacing: '-0.025em',
            color: dcxColor,
            display: 'flex',
            alignItems: 'baseline',
            gap: 4,
          }}
        >
          <span>DCX</span>
          <span style={{ color: flowColor }}>Flow</span>
        </div>
        {variant === 'full' && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: subColor,
              marginTop: 3,
            }}
          >
            DINHEIRO EM CAIXA
          </span>
        )}
      </div>
    </div>
  )
}
