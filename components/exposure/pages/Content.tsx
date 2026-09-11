'use client'
import { CONTENIDO, MEJORES_ANGULOS } from '@/components/exposure/data'
import { AgentBadge, Bar, Card, CardHead, IDENTITY, PageHead, Spark, Stat, Tag } from '@/components/exposure/ui'

export default function Contenido() {
  return (
    <div>
      <PageHead
        title="Contenido"
        sub="Lo que el sistema está preparando para publicar."
        right={
          <div className="flex items-center gap-3 pb-1">
            <AgentBadge agent="cmo" size={34} active />
            <div>
              <div className="text-[13px] leading-none" style={{ fontWeight: 520 }}>
                CMO
              </div>
              <div className="mt-2 text-[11.5px] leading-none" style={{ color: 'var(--color-faint)' }}>
                Produce esta página
              </div>
            </div>
          </div>
        }
      />

      <Card className="mb-4">
        <div className="grid grid-cols-4">
          {[
            { value: '84', label: 'Piezas este mes' },
            { value: '61', label: 'Publicadas' },
            { value: '3', label: 'Guiones de hoy', gold: true },
            { value: '94', label: 'Mejor puntaje' },
          ].map((s, i) => (
            <div
              key={s.label}
              className="px-7 py-6"
              style={{ borderLeft: i ? '1px solid rgba(0,0,0,0.07)' : 'none' }}
            >
              <Stat value={s.value} label={s.label} size={30} gold={s.gold} />
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 400px' }}>
        <Card className="overflow-hidden">
          <div className="px-6 pt-5 pb-4">
            <CardHead title="En producción" sub="Ordenado por puntaje del sistema" />
          </div>
          {CONTENIDO.map((c) => (
            <div
              key={c.title}
              className="row-hover flex items-center gap-5 px-6"
              style={{ height: 64, borderTop: '1px solid rgba(0,0,0,0.07)' }}
            >
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] leading-none truncate" style={{ color: 'var(--color-ink)' }}>
                  {c.title}
                </div>
                <div className="mt-2.5 text-[12px] leading-none truncate" style={{ color: 'var(--color-faint)' }}>
                  {c.angle}
                </div>
              </div>
              <span
                className="val text-[15px] flex-none"
                style={{ color: c.score >= 88 ? 'var(--color-gold-dk)' : 'var(--color-ink2)' }}
              >
                {c.score}
              </span>
              <span className="flex-none flex justify-end" style={{ width: 130 }}>
                <Tag gold={c.state === 'Agendado'}>{c.state}</Tag>
              </span>
            </div>
          ))}
        </Card>

        <Card className="px-6 py-6">
          <CardHead title="Ángulos en uso" sub="Distribución del mes" />
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

      <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <Card className="px-6 py-6">
          <CardHead title="Ritmo de producción" sub="Últimas 14 semanas" />
          <div className="mt-5 flex items-end justify-between gap-4">
            <Stat value="14" label="Piezas por semana" size={30} gold />
            <Spark data={[6, 8, 7, 9, 11, 10, 12, 11, 13, 12, 14, 13, 15, 14]} w={170} h={52} gold />
          </div>
        </Card>

        <Card className="px-6 py-6">
          <CardHead title="Formatos" sub="Distribución del mes" />
          <div className="mt-5">
            {[
              ['Reels', 62],
              ['Carruseles', 22],
              ['Video largo', 16],
            ].map(([k, v]) => (
              <div key={k as string} className="py-3">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[12.5px]" style={{ color: 'var(--color-ink2)' }}>
                    {k as string}
                  </span>
                  <span className="val text-[13px]" style={{ color: (v as number) > 50 ? 'var(--color-gold-dk)' : 'var(--color-ink2)' }}>
                    {v as number}%
                  </span>
                </div>
                <Bar pct={v as number} gold={(v as number) > 50} h={4} />
              </div>
            ))}
          </div>
        </Card>

        <Card className="px-6 py-6">
          <CardHead title="Lo que más funciona" sub="Aprendizaje del sistema" />
          <p className="mt-4 text-[13px] leading-[1.6]" style={{ color: 'var(--color-ink2)' }}>
            Las piezas que explican un problema antes de proponer una solución generan casi el doble
            de leads calificados que las demás.
          </p>
          <div className="mt-5 flex items-center gap-3">
            <span className="text-[12.5px]" style={{ color: 'var(--color-faint)' }}>
              Fuente
            </span>
            <span
              className="text-[12.5px]"
              style={{ color: IDENTITY.datos.color, fontWeight: 500 }}
            >
              Analista de Datos
            </span>
          </div>
        </Card>
      </div>
    </div>
  )
}
