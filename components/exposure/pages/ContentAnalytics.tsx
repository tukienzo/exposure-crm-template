'use client'
import {
  KPIS,
  MEJORES_ANGULOS,
  MEJORES_HOOKS,
  MEJOR_CONTENIDO,
  SERIE_LEADS,
  SERIE_VIEWS,
} from '@/components/exposure/data'
import { AgentBadge, Bar, Card, CardHead, PageHead, Stat } from '@/components/exposure/ui'

/* barras = visualizaciones · línea dorada = leads. sin grilla, sin ejes duros. */
function Grafico() {
  const W = 1000
  const H = 230
  const pad = 26
  const max = Math.max(...SERIE_VIEWS)
  const lmax = Math.max(...SERIE_LEADS)
  const bw = W / SERIE_VIEWS.length

  const pts = SERIE_LEADS.map((d, i) => [i * bw + bw / 2, H - pad - (d / lmax) * (H - pad - 12)])
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `${line} L${W},${H - pad} L0,${H - pad} Z`

  return (
    <div className="px-7 pb-6">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
        <defs>
          <linearGradient id="leadArea" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
            <stop offset="0%" stopColor="#c8a95d" stopOpacity="0.26" />
            <stop offset="100%" stopColor="#c8a95d" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {SERIE_VIEWS.map((d, i) => {
          const h = (d / max) * (H - pad - 10)
          const recent = i >= SERIE_VIEWS.length - 6
          return (
            <rect
              key={i}
              x={i * bw + bw * 0.3}
              y={H - pad - h}
              width={bw * 0.4}
              height={h}
              fill={recent ? 'rgba(200,169,93,0.42)' : 'rgba(20,16,8,0.11)'}
            />
          )
        })}

        <path d={area} fill="url(#leadArea)" />
        <path d={line} fill="none" stroke="#9c7a37" strokeWidth={2} strokeLinejoin="round" />
        <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={3.6} fill="#9c7a37" />
        <line
          x1={0}
          x2={W}
          y1={H - pad}
          y2={H - pad}
          stroke="rgba(0,0,0,0.09)"
          strokeWidth={1}
        />
      </svg>

      <div className="flex items-center justify-between mt-1">
        {['Hace 30 días', '', '', '', 'Hoy'].map((l, i) => (
          <span key={i} className="text-[11.5px]" style={{ color: '#9a958d' }}>
            {l}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-6 mt-5">
        <span className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--color-mute)' }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: 'rgba(20,16,8,0.16)' }} />
          Visualizaciones
        </span>
        <span className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--color-mute)' }}>
          <span style={{ width: 11, height: 2, borderRadius: 99, background: 'var(--color-gold-dk)' }} />
          Leads generados
        </span>
        <span className="ml-auto text-[12px]" style={{ color: 'var(--color-gold-dk)' }}>
          +18,4% este mes
        </span>
      </div>
    </div>
  )
}

export default function Analitica() {
  return (
    <div>
      <PageHead
        title="Analítica de Contenido"
        sub="Qué contenido está generando atención, leads y oportunidades."
        right={
          <div className="flex items-center gap-3 pb-1">
            <AgentBadge agent="cmo" size={34} active />
            <div>
              <div className="text-[13px] leading-none" style={{ fontWeight: 520 }}>
                CMO
              </div>
              <div className="mt-2 text-[11.5px] leading-none" style={{ color: 'var(--color-faint)' }}>
                Analiza esta página
              </div>
            </div>
          </div>
        }
      />

      <Card className="mb-4">
        <div className="grid grid-cols-4">
          {KPIS.map((k, i) => (
            <div
              key={k.label}
              className="px-7 py-6"
              style={{ borderLeft: i ? '1px solid rgba(0,0,0,0.07)' : 'none' }}
            >
              <Stat value={k.value} label={k.label} size={34} gold={k.gold} />
            </div>
          ))}
        </div>
      </Card>

      <Card className="mb-4 overflow-hidden">
        <div className="px-7 pt-6 pb-5">
          <CardHead
            title="Rendimiento del contenido"
            sub="Visualizaciones y leads generados — últimos 30 días"
          />
        </div>
        <Grafico />
      </Card>

      <div className="grid gap-4" style={{ gridTemplateColumns: '1.35fr 1fr 1fr' }}>
        <Card className="px-6 py-6">
          <CardHead title="Mejor contenido" />
          <div className="mt-5">
            {MEJOR_CONTENIDO.map((c, i) => (
              <div
                key={c.title}
                className="py-3.5"
                style={{ borderTop: i ? '1px solid rgba(0,0,0,0.07)' : 'none' }}
              >
                <div className="text-[13.5px] leading-[1.35]" style={{ color: 'var(--color-ink)', fontWeight: 450 }}>
                  {c.title}
                </div>
                <div className="mt-2.5 flex items-center gap-5">
                  <span className="text-[12px]" style={{ color: 'var(--color-mute)' }}>
                    {c.views} visualizaciones
                  </span>
                  <span className="text-[12px]" style={{ color: 'var(--color-gold-dk)' }}>
                    {c.leads} leads
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="px-6 py-6">
          <CardHead title="Mejores hooks" />
          <div className="mt-5">
            {MEJORES_HOOKS.map((h, i) => (
              <div
                key={h.label}
                className="flex items-start gap-4 py-3.5"
                style={{ borderTop: i ? '1px solid rgba(0,0,0,0.07)' : 'none' }}
              >
                <span className="text-[13px] leading-[1.4] flex-1" style={{ color: 'var(--color-ink2)' }}>
                  “{h.label}”
                </span>
                <span className="val text-[15px] flex-none" style={{ color: 'var(--color-gold-dk)' }}>
                  {h.lift}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="px-6 py-6">
          <CardHead title="Mejores ángulos" />
          <div className="mt-5">
            {MEJORES_ANGULOS.map((a) => (
              <div key={a.label} className="py-[11px]">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[12.5px]" style={{ color: 'var(--color-ink2)' }}>
                    {a.label}
                  </span>
                  <span className="val text-[13px]" style={{ color: a.pct > 25 ? 'var(--color-gold-dk)' : 'var(--color-ink2)' }}>
                    {a.pct}%
                  </span>
                </div>
                <Bar pct={a.pct * 2.6} gold={a.pct > 25} h={4} />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
