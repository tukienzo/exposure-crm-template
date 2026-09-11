'use client'
import { HERRAMIENTAS } from '@/components/exposure/data'
import { Card, CardHead, IDENTITY, PageHead, Stat, Tag, byName } from '@/components/exposure/ui'

/** chip del agente dueño de la herramienta */
function AgentTag({ name }: { name: string }) {
  const k = byName(name) ?? (name === 'Comercial' ? ('comercial' as const) : undefined)
  if (!k)
    return (
      <span className="text-[12.5px]" style={{ color: 'var(--color-faint)' }}>
        {name}
      </span>
    )
  return <Tag accent={IDENTITY[k].color}>{name}</Tag>
}

export default function Herramientas_() {
  return (
    <div>
      <PageHead
        title="Herramientas"
        sub="Lo que los agentes pueden hacer y qué necesita tu aprobación."
      />

      <Card className="mb-4">
        <div className="grid grid-cols-3">
          {[
            { value: '9', label: 'Herramientas disponibles' },
            { value: '7', label: 'Automáticas' },
            { value: '2', label: 'Requieren aprobación', gold: true },
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

      <Card className="overflow-hidden">
        {HERRAMIENTAS.map((t, i) => {
          const gate = t.state !== 'Activa'
          return (
            <div
              key={t.name}
              className="row-hover flex items-center gap-6 px-7"
              style={{ height: 62, borderTop: i ? '1px solid rgba(0,0,0,0.07)' : 'none' }}
            >
              <div className="min-w-0" style={{ width: 260 }}>
                <div className="text-[13.5px] leading-none truncate" style={{ fontWeight: 500 }}>
                  {t.name}
                </div>
              </div>
              <span className="text-[12.5px] flex-1 truncate" style={{ color: 'var(--color-mute)' }}>
                {t.desc}
              </span>
              <span className="flex-none flex justify-end" style={{ width: 185 }}>
                <AgentTag name={t.agent} />
              </span>
              <span className="flex-none flex justify-end" style={{ width: 170 }}>
                <Tag gold={gate}>{t.state}</Tag>
              </span>
            </div>
          )
        })}
      </Card>

      <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Card gold lit className="px-7 py-6">
          <CardHead title="Requieren tu aprobación" sub="Nada sale sin que lo confirmes" />
          <div className="mt-4 space-y-4">
            {HERRAMIENTAS.filter((t) => t.state !== 'Activa').map((t) => (
              <div key={t.name} className="flex items-center justify-between gap-6">
                <div className="min-w-0">
                  <div className="text-[14px] leading-none" style={{ fontWeight: 500 }}>
                    {t.name}
                  </div>
                  <div className="mt-2.5 text-[12.5px] leading-none" style={{ color: 'var(--color-mute)' }}>
                    {t.desc}
                  </div>
                </div>
                <Tag gold>Pendiente</Tag>
              </div>
            ))}
          </div>
        </Card>

        <Card className="px-7 py-6">
          <CardHead title="Cómo funciona" sub="Reglas del sistema" />
          <p className="mt-4 text-[13px] leading-[1.6]" style={{ color: 'var(--color-ink2)' }}>
            Los agentes usan las herramientas automáticas sin preguntar. Todo lo que sale hacia un
            cliente o cambia el pipeline pasa antes por ti.
          </p>
        </Card>
      </div>
    </div>
  )
}
