'use client'
import type { ReactNode, CSSProperties } from 'react'
import { ChartNoAxesColumnIncreasing, Crown, Megaphone, Radar, Target } from 'lucide-react'

/* ══ identidad de agentes ═══════════════════════════════════
   un color y un icono por agente. mismo par en todo el producto. */
export type AgentKey = 'ceo' | 'investigador' | 'cmo' | 'comercial' | 'datos'

export const IDENTITY: Record<
  AgentKey,
  { color: string; soft: string; icon: typeof Crown; name: string }
> = {
  ceo: { color: '#7C5CFA', soft: 'rgba(124,92,250,0.11)', icon: Crown, name: 'CEO' },
  investigador: {
    color: '#3BA8F0',
    soft: 'rgba(59,168,240,0.11)',
    icon: Radar,
    name: 'Investigador',
  },
  cmo: { color: '#F2794C', soft: 'rgba(242,121,76,0.11)', icon: Megaphone, name: 'CMO' },
  comercial: {
    color: '#D9A63C',
    soft: 'rgba(217,166,60,0.13)',
    icon: Target,
    name: 'Agente Comercial',
  },
  datos: {
    color: '#2FB79A',
    soft: 'rgba(47,183,154,0.11)',
    icon: ChartNoAxesColumnIncreasing,
    name: 'Analista de Datos',
  },
}

export const byName = (name: string): AgentKey | undefined =>
  (Object.keys(IDENTITY) as AgentKey[]).find((k) => IDENTITY[k].name === name)

/* ══ estado ═════════════════════════════════════════════════ */
export type Status = 'working' | 'waiting' | 'idle'

export const STATUS_ES: Record<Status, string> = {
  working: 'Trabajando',
  waiting: 'Esperando',
  idle: 'Inactivo',
}

const TONE: Record<Status, string> = {
  working: 'var(--color-gold-dk)',
  waiting: 'var(--color-faint)',
  idle: '#b3ada3',
}

export function Dot({
  status,
  size = 6,
  color,
}: {
  status: Status
  size?: number
  color?: string
}) {
  const c = color ?? (status === 'working' ? '#c8a95d' : status === 'waiting' ? 'var(--color-faint2)' : '#cfc9bf')
  return (
    <span
      className={status === 'working' ? 'pulse' : ''}
      style={{
        width: size,
        height: size,
        borderRadius: 99,
        background: c,
        boxShadow: status === 'working' ? `0 0 0 3px ${c}22` : 'none',
        flex: 'none',
      }}
    />
  )
}

export function State({
  status,
  size = 12,
  color,
}: {
  status: Status
  size?: number
  color?: string
}) {
  return (
    <span className="inline-flex items-center gap-[7px]" style={{ fontSize: size }}>
      <Dot status={status} size={5} color={color} />
      <span style={{ color: color ?? TONE[status], fontWeight: 500 }}>{STATUS_ES[status]}</span>
    </span>
  )
}

/* ══ superficies ════════════════════════════════════════════ */
export function Card({
  children,
  className = '',
  tone = 1,
  gold,
  lit,
  accent,
  style,
  onClick,
}: {
  children: ReactNode
  className?: string
  tone?: 1 | 2
  gold?: boolean
  lit?: boolean
  /** color de agente: filo y aura tenue */
  accent?: string
  style?: CSSProperties
  onClick?: () => void
}) {
  const accentStyle: CSSProperties = accent
    ? {
        borderColor: `${accent}55`,
        boxShadow: `0 1px 2px rgba(20,16,8,0.03), 0 14px 34px ${accent}1f`,
      }
    : {}
  return (
    <div
      onClick={onClick}
      style={{ ...accentStyle, ...style }}
      className={`${tone === 1 ? 'card' : 'card card-2'} ${gold ? 'card-gold' : ''} ${
        lit ? 'lit' : ''
      } ${className}`}
    >
      {children}
    </div>
  )
}

/* ══ tipografía ═════════════════════════════════════════════ */
export function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`lbl ${className}`}>{children}</div>
}

export function SectionTitle({
  children,
  right,
  className = '',
}: {
  children: ReactNode
  right?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex items-end justify-between gap-4 ${className}`}>
      <h2 className="text-[16px] leading-none" style={{ fontWeight: 580, letterSpacing: '-0.016em' }}>
        {children}
      </h2>
      {right}
    </div>
  )
}

export function CardHead({
  title,
  sub,
  right,
  icon,
}: {
  title: string
  sub?: string
  right?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-2.5 min-w-0">
        {icon && (
          <span className="flex-none" style={{ color: 'var(--color-gold-dk)' }}>
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <div
            className="text-[15px] leading-none truncate"
            style={{ fontWeight: 570, letterSpacing: '-0.014em' }}
          >
            {title}
          </div>
          {sub && (
            <div className="mt-[9px] text-[12.5px] leading-none truncate" style={{ color: 'var(--color-faint)' }}>
              {sub}
            </div>
          )}
        </div>
      </div>
      {right && <div className="flex-none">{right}</div>}
    </div>
  )
}

export function PageHead({ title, sub, right }: { title: string; sub: string; right?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-8 pb-5">
      <div className="min-w-0">
        <h1 className="text-[29px] leading-none" style={{ fontWeight: 600, letterSpacing: '-0.03em' }}>
          {title}
        </h1>
        <p className="mt-3.5 text-[14px] leading-none" style={{ color: 'var(--color-mute)' }}>
          {sub}
        </p>
      </div>
      {right && <div className="flex items-center gap-3 flex-none">{right}</div>}
    </div>
  )
}

/* ══ métricas ═══════════════════════════════════════════════ */
export function Stat({
  value,
  label,
  size = 22,
  gold,
  color,
  align = 'left',
}: {
  value: ReactNode
  label: string
  size?: number
  gold?: boolean
  color?: string
  align?: 'left' | 'right'
}) {
  return (
    <div style={{ textAlign: align }}>
      <div className="val" style={{ fontSize: size, color: color ?? (gold ? 'var(--color-gold-dk)' : 'var(--color-ink)') }}>
        {value}
      </div>
      <div className="mt-[10px] text-[12px] leading-none" style={{ color: 'var(--color-faint)' }}>
        {label}
      </div>
    </div>
  )
}

export function Stats({
  items,
  size = 22,
  divide,
  className = '',
  gap = 40,
}: {
  items: { value: ReactNode; label: string; gold?: boolean; color?: string }[]
  size?: number
  divide?: boolean
  className?: string
  gap?: number
}) {
  return (
    <div className={`flex items-start ${className}`} style={{ gap }}>
      {items.map((s, i) => (
        <div key={i} className="flex items-start" style={{ gap }}>
          {divide && i > 0 && (
            <span style={{ width: 1, height: size + 24, background: 'rgba(0,0,0,0.07)' }} />
          )}
          <Stat {...s} size={size} />
        </div>
      ))}
    </div>
  )
}

/* ══ chips ══════════════════════════════════════════════════ */
export function Tag({
  children,
  gold,
  accent,
  dark,
}: {
  children: ReactNode
  gold?: boolean
  /** color de agente */
  accent?: string
  dark?: boolean
}) {
  const style: CSSProperties = accent
    ? { background: `${accent}18`, color: accent }
    : gold
      ? { background: 'rgba(200,169,93,0.16)', color: '#8f6f2e' }
      : dark
        ? { background: 'var(--color-pill)', color: '#f4f1ea' }
        : { background: 'var(--color-soft)', color: 'var(--color-ink2)' }
  return (
    <span
      className="inline-flex items-center rounded-[7px] px-2 py-[5px] text-[11.5px] leading-none"
      style={{ ...style, fontWeight: 500 }}
    >
      {children}
    </span>
  )
}

/* ══ barra ══════════════════════════════════════════════════ */
export function Bar({
  pct,
  gold,
  color,
  h = 4,
}: {
  pct: number
  gold?: boolean
  color?: string
  h?: number
}) {
  const fill = color
    ? color
    : gold
      ? 'linear-gradient(90deg,#c8a95d,#9c7a37)'
      : 'var(--color-faint2)'
  return (
    <div style={{ height: h, width: '100%', background: 'var(--color-line)', borderRadius: 99 }}>
      <div
        style={{
          height: '100%',
          width: `${Math.min(100, pct)}%`,
          borderRadius: 99,
          background: fill,
        }}
      />
    </div>
  )
}

/* ══ insignia de agente ═════════════════════════════════════
   cuadrado redondeado oscuro + icono en color + aura tenue. */
export function AgentBadge({
  agent,
  size = 38,
  active,
}: {
  agent: AgentKey
  size?: number
  active?: boolean
}) {
  const { color, icon: Icon } = IDENTITY[agent]
  return (
    <span
      className="pop-badge inline-flex items-center justify-center flex-none relative"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        background: `linear-gradient(160deg,#232323,#141414)`,
        boxShadow: active
          ? `0 0 0 1px ${color}66, 0 6px 20px ${color}44`
          : `0 0 0 1px rgba(0,0,0,0.10), 0 4px 12px ${color}22`,
        color,
      }}
    >
      <span
        className="absolute inset-0"
        style={{
          borderRadius: 'inherit',
          background: `radial-gradient(120% 100% at 50% 8%, ${color}3d, transparent 62%)`,
        }}
      />
      <Icon size={size * 0.46} strokeWidth={1.9} style={{ position: 'relative' }} />
    </span>
  )
}

/** contenedor de icono neutro (no-agentes) */
export function IconBox({
  children,
  size = 34,
  active,
  radius = 11,
}: {
  children: ReactNode
  size?: number
  active?: boolean
  radius?: number
}) {
  return (
    <span
      className="inline-flex items-center justify-center flex-none"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: active ? 'rgba(200,169,93,0.14)' : 'rgba(20,16,8,0.05)',
        boxShadow: active ? '0 0 0 1px rgba(200,169,93,0.32)' : 'none',
        color: active ? 'var(--color-gold-dk)' : 'var(--color-faint)',
      }}
    >
      {children}
    </span>
  )
}

/* ══ sparkline ══════════════════════════════════════════════ */
export function Spark({
  data,
  w = 150,
  h = 46,
  gold,
}: {
  data: number[]
  w?: number
  h?: number
  gold?: boolean
}) {
  const max = Math.max(...data)
  const min = Math.min(...data)
  const span = max - min || 1
  const pts = data.map((d, i) => [
    (i / (data.length - 1)) * w,
    h - 3 - ((d - min) / span) * (h - 8),
  ])
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const c = gold ? '#c8a95d' : 'var(--color-faint)'
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <path
        d={`${line} L${w},${h} L0,${h} Z`}
        fill={gold ? 'rgba(200,169,93,0.14)' : 'rgba(20,16,8,0.05)'}
      />
      <path d={line} fill="none" stroke={c} strokeWidth={1.6} strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2.8} fill={c} />
    </svg>
  )
}

/* ══ marca ══════════════════════════════════════════════════ */
export function Mark({ size = 30 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center flex-none"
      style={{
        width: size,
        height: size,
        borderRadius: 9,
        background: 'linear-gradient(160deg,#2a2419,#141414)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 0 20px rgba(200,169,93,0.14)',
      }}
    >
      <svg width={size * 0.54} height={size * 0.54} viewBox="0 0 16 16" fill="none">
        <path d="M8 1.4 L14 8 L8 14.6 L2 8 Z" stroke="#c8a95d" strokeWidth="1" opacity="0.95" />
        <path d="M8 4.6 L11.4 8 L8 11.4 L4.6 8 Z" fill="#dec27c" opacity="0.3" />
        <circle cx="8" cy="8" r="1.5" fill="#dec27c" />
      </svg>
    </div>
  )
}
