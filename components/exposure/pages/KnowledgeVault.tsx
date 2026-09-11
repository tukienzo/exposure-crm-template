'use client'
import { useMemo, useRef, useState } from 'react'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import {
  BOUNDS,
  CLUSTER_ACCENT,
  CLUSTERS,
  DEGREE,
  EDGES,
  MEMORIA_ACTIVIDAD,
  NODES,
  conexiones,
  ficha,
  type Cluster,
  type Tier,
} from '@/components/exposure/data'
import { AgentBadge, Card, Label, PageHead, Stats, Tag, type AgentKey } from '@/components/exposure/ui'

/* jerarquía: hub con color de identidad · memoria principal oscura · apoyo gris claro */
const FILL: Record<Tier, string> = { hub: '#c8a95d', mid: '#403c35', small: '#c9c2b6' }
const LBL: Record<Tier, string> = { hub: 'var(--color-ink)', mid: 'var(--color-ink2)', small: 'var(--color-faint)' }

/** insignia del agente dueño de cada clúster */
const CLUSTER_AGENT: Partial<Record<Cluster, AgentKey>> = {
  ceo: 'ceo',
  investigacion: 'investigador',
  marketing: 'cmo',
  ventas: 'comercial',
  datos: 'datos',
}

const VB = BOUNDS
const CX = VB.x + VB.w / 2
const CY = VB.y + VB.h / 2
/** eje de simetría: las etiquetas apuntan hacia afuera del centro */
const MID = 500

export default function MemoriaCompartida() {
  const [sel, setSel] = useState(NODES.findIndex((n) => n.id === 'ceo'))
  const [hover, setHover] = useState<number | null>(null)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)

  const node = NODES[sel]
  const f = useMemo(() => ficha(sel), [sel])
  const linked = useMemo(() => conexiones(sel), [sel])

  const adj = useMemo(() => {
    const m = new Set<number>()
    for (const e of EDGES) {
      if (e.a === sel) m.add(e.b)
      if (e.b === sel) m.add(e.a)
    }
    return m
  }, [sel])

  const accent = CLUSTER_ACCENT[node.cluster]
  const clusterAgent = CLUSTER_AGENT[node.cluster]

  const zoom = (d: number) =>
    setView((v) => ({ ...v, k: Math.min(2.4, Math.max(0.7, +(v.k + d).toFixed(2))) }))

  return (
    <div>
      <PageHead
        title="Memoria Compartida"
        sub="Todo lo que aprende un agente queda disponible para los demás."
        right={
          <div className="flex items-center gap-6 pb-1">
            <div className="text-right">
              <div className="val text-[20px]">{NODES.length}</div>
              <div className="mt-[7px] text-[11.5px]" style={{ color: 'var(--color-faint)' }}>
                recuerdos
              </div>
            </div>
            <span style={{ width: 1, height: 34, background: 'rgba(0,0,0,0.09)' }} />
            <div className="text-right">
              <div className="val text-[20px]" style={{ color: 'var(--color-gold-dk)' }}>
                {EDGES.length}
              </div>
              <div className="mt-[7px] text-[11.5px]" style={{ color: 'var(--color-faint)' }}>
                conexiones
              </div>
            </div>
          </div>
        }
      />

      <div className="flex gap-4" style={{ height: 'calc(100vh - 186px)' }}>
        {/* ── grafo ──────────────────────────────────────────── */}
        <Card className="flex-1 min-w-0 overflow-hidden relative graph-bg">
          <div className="absolute left-6 top-5 z-10 flex items-center gap-2.5">
            {(Object.keys(CLUSTERS) as Cluster[]).map((c) => {
              const on = c === node.cluster
              return (
                <span
                  key={c}
                  className="inline-flex items-center gap-2 rounded-[7px] px-2.5 py-[6px] text-[11px]"
                  style={{
                    background: on ? `${CLUSTER_ACCENT[c]}1a` : 'rgba(20,16,8,0.045)',
                    color: on ? CLUSTER_ACCENT[c] : 'var(--color-mute)',
                    fontWeight: on ? 550 : 450,
                  }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 99,
                      background: CLUSTER_ACCENT[c],
                      opacity: on ? 1 : 0.5,
                    }}
                  />
                  {CLUSTERS[c].label}
                </span>
              )
            })}
          </div>

          <svg
            className="absolute inset-0 w-full h-full"
            viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ cursor: drag.current ? 'grabbing' : 'grab' }}
            /* React escucha wheel en modo pasivo: sin preventDefault, solo zoom */
            onWheel={(e) => zoom(e.deltaY > 0 ? -0.1 : 0.1)}
            onPointerDown={(e) => {
              drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
              ;(e.target as Element).setPointerCapture?.(e.pointerId)
            }}
            onPointerMove={(e) => {
              if (!drag.current) return
              const d = drag.current
              setView((v) => ({
                ...v,
                x: d.vx + (e.clientX - d.x) / v.k,
                y: d.vy + (e.clientY - d.y) / v.k,
              }))
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerLeave={() => (drag.current = null)}
          >
            <defs>
              {(Object.keys(CLUSTERS) as Cluster[]).map((c) => (
                <radialGradient key={c} id={`aura-${c}`} cx="50%" cy="50%">
                  <stop offset="0%" stopColor={CLUSTER_ACCENT[c]} stopOpacity="0.30" />
                  <stop offset="55%" stopColor={CLUSTER_ACCENT[c]} stopOpacity="0.07" />
                  <stop offset="100%" stopColor={CLUSTER_ACCENT[c]} stopOpacity="0" />
                </radialGradient>
              ))}
            </defs>

            <g
              transform={`translate(${CX},${CY}) scale(${view.k}) translate(${view.x - CX},${
                view.y - CY
              })`}
            >
              {/* halo suave sobre cada hub */}
              {NODES.filter((n) => n.tier === 'hub').map((n) => (
                <circle
                  key={n.id}
                  cx={n.x}
                  cy={n.y}
                  r={78}
                  fill={`url(#aura-${n.cluster})`}
                  opacity={n.cluster === node.cluster ? 1 : 0.6}
                />
              ))}

              {EDGES.map((e, i) => {
                const A = NODES[e.a]
                const B = NODES[e.b]
                const live = e.a === sel || e.b === sel
                const mx = (A.x + B.x) / 2
                const my = (A.y + B.y) / 2
                const cx = mx - (B.y - A.y) * 0.05
                const cy = my + (B.x - A.x) * 0.05
                return (
                  <path
                    key={i}
                    d={`M${A.x},${A.y} Q${cx},${cy} ${B.x},${B.y}`}
                    fill="none"
                    stroke={live ? CLUSTER_ACCENT[node.cluster] : undefined}
                    style={live ? undefined : { stroke: 'var(--color-ink)' }}
                    strokeWidth={live ? 1 : 0.5}
                    opacity={live ? 0.5 : e.strong ? 0.16 : 0.085}
                  />
                )
              })}

              {NODES.map((n, i) => {
                const isSel = i === sel
                const isAdj = adj.has(i)
                const isHov = hover === i
                const r = n.r * (isSel ? 1.28 : isHov ? 1.14 : 1)
                const show = n.tier !== 'small' || isSel || isAdj || isHov
                return (
                  <g
                    key={n.id}
                    onPointerEnter={() => setHover(i)}
                    onPointerLeave={() => setHover(null)}
                    onClick={() => setSel(i)}
                    style={{ cursor: 'pointer' }}
                  >
                    {isSel && (
                      <circle cx={n.x} cy={n.y} r={r * 3.2} fill={`url(#aura-${n.cluster})`} />
                    )}
                    <circle cx={n.x} cy={n.y} r={r + 3.5} fill="#f7f4ee" opacity={0.9} />
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={r}
                      fill={
                        n.tier === 'hub' || isSel
                          ? CLUSTER_ACCENT[n.cluster]
                          : isAdj
                            ? '#4a463f'
                            : FILL[n.tier]
                      }
                      stroke={n.tier === 'hub' || isSel ? '#ffffff' : 'rgba(255,255,255,0.85)'}
                      strokeWidth={n.tier === 'hub' || isSel ? 1.8 : 1}
                    />
                    {n.tier === 'hub' && (
                      <circle cx={n.x} cy={n.y} r={r * 0.3} fill="#ffffff" opacity={0.9} />
                    )}
                    {show &&
                      (n.tier === 'hub' ? (
                        /* los hubs llevan la etiqueta al costado, hacia afuera */
                        <text
                          className="gl"
                          x={n.x + (n.x < MID ? -(r + 8) : r + 8)}
                          y={n.y + 4}
                          textAnchor={n.x < MID ? 'end' : 'start'}
                          fill={LBL.hub}
                          style={{ fontSize: 13.5, fontWeight: 600 }}
                        >
                          {n.label}
                        </text>
                      ) : (
                        /* el resto debajo y centrado: nunca choca con el vecino */
                        <text
                          className="gl"
                          x={n.x}
                          y={n.y + r + 12}
                          textAnchor="middle"
                          style={{ fontSize: n.tier === 'mid' ? 10.5 : 9.5, fill: isSel ? CLUSTER_ACCENT[n.cluster] : LBL[n.tier] }}
                        >
                          {n.label}
                        </text>
                      ))}
                  </g>
                )
              })}
            </g>
          </svg>

          <div className="absolute right-5 bottom-5 flex items-center gap-1.5">
            <span className="mono text-[11px] mr-1" style={{ color: '#9a958d' }}>
              {(view.k * 100).toFixed(0)}%
            </span>
            {[
              { i: <Minus size={12} strokeWidth={2} />, fn: () => zoom(-0.15) },
              { i: <Plus size={12} strokeWidth={2} />, fn: () => zoom(0.15) },
              { i: <RotateCcw size={11} strokeWidth={1.9} />, fn: () => setView({ x: 0, y: 0, k: 1 }) },
            ].map((b, i) => (
              <button
                key={i}
                onClick={b.fn}
                className="flex items-center justify-center rounded-[8px] transition-colors duration-150"
                style={{
                  width: 30,
                  height: 30,
                  background: 'var(--color-card)',
                  boxShadow: '0 1px 3px rgba(20,16,8,0.10)',
                  color: 'var(--color-ink2)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-gold-dk)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-ink2)')}
              >
                {b.i}
              </button>
            ))}
          </div>
        </Card>

        {/* ── inspector ──────────────────────────────────────── */}
        <div className="flex-none flex flex-col gap-4" style={{ width: 372 }}>
        <Card accent={accent} className="overflow-hidden">
          <span className="absolute left-0 right-0 top-0" style={{ height: 2.5, background: accent }} />
          <div className="px-6 pt-6 pb-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Label>{CLUSTERS[node.cluster].label}</Label>
                <h2
                  className="mt-4 text-[22px] leading-[1.15]"
                  style={{ fontWeight: 570, letterSpacing: '-0.028em' }}
                >
                  {node.label}
                </h2>
              </div>
              {clusterAgent && <AgentBadge agent={clusterAgent} size={40} active />}
            </div>
            <p className="mt-4 text-[13.5px] leading-[1.55]" style={{ color: 'var(--color-ink2)' }}>
              {f.desc}
            </p>
            {node.tier === 'hub' && (
              <div className="mt-4 flex items-center gap-2">
                <span
                  className="pulse"
                  style={{ width: 6, height: 6, borderRadius: 99, background: accent }}
                />
                <span className="text-[12.5px]" style={{ color: accent, fontWeight: 500 }}>
                  Activa
                </span>
              </div>
            )}
          </div>

          <div className="px-6 py-5" style={{ borderTop: '1px solid rgba(0,0,0,0.075)' }}>
            <Stats
              size={20}
              gap={30}
              items={[
                { value: String(DEGREE[sel]), label: 'Conexiones' },
                { value: String(f.lecturas), label: 'Lecturas' },
                { value: f.actualizado.replace('Hace ', ''), label: 'Actualizado' },
              ]}
            />
          </div>

          <div className="px-6 py-5" style={{ borderTop: '1px solid rgba(0,0,0,0.075)' }}>
            <Label>Último aprendizaje</Label>
            <p className="mt-3.5 text-[13.5px] leading-[1.55]" style={{ color: 'var(--color-ink)' }}>
              “{f.aprendizaje}”
            </p>
            <div className="mt-4 flex items-center gap-2">
              <span className="text-[12px]" style={{ color: 'var(--color-faint)' }}>
                Fuente
              </span>
              <span className="text-[12.5px]" style={{ color: accent, fontWeight: 500 }}>
                {f.fuente}
              </span>
            </div>
          </div>

          <div className="px-6 py-5" style={{ borderTop: '1px solid rgba(0,0,0,0.075)' }}>
            <Label>Conectado con</Label>
            <div className="mt-3.5 flex flex-wrap gap-2">
              {linked.map((n) => (
                <button
                  key={n.id}
                  onClick={() => setSel(NODES.findIndex((x) => x.id === n.id))}
                  onMouseEnter={() => setHover(NODES.findIndex((x) => x.id === n.id))}
                  onMouseLeave={() => setHover(null)}
                >
                  <Tag accent={n.tier === 'hub' ? CLUSTER_ACCENT[n.cluster] : undefined}>
                    {n.label}
                  </Tag>
                </button>
              ))}
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="px-6 pt-5 pb-4">
            <Label>Escrituras recientes</Label>
          </div>
          {MEMORIA_ACTIVIDAD.map((r, i) => (
            <div
              key={i}
              className="row-hover flex items-center gap-4 px-6"
              style={{ height: 46, borderTop: '1px solid rgba(0,0,0,0.07)' }}
            >
              <span className="mono text-[11.5px] flex-none" style={{ color: '#9a958d' }}>
                {r.t}
              </span>
              <span className="text-[12.5px] flex-1 truncate" style={{ color: 'var(--color-ink2)' }}>
                {r.m}
              </span>
            </div>
          ))}
        </Card>
        </div>
      </div>
    </div>
  )
}
