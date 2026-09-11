'use client'
import { Check, Circle, CircleDot } from 'lucide-react'
import { AGENTS, GRUPOS, TAREAS } from '@/components/exposure/data'
import { AgentBadge, Bar, Card, CardHead, IDENTITY, PageHead, SectionTitle, Stat, byName } from '@/components/exposure/ui'

const MARK = [
  { icon: Circle, color: 'var(--color-faint)' },
  { icon: CircleDot, color: 'var(--color-gold-dk)' },
  { icon: Check, color: 'var(--color-faint2)' },
]

/** carga por agente, derivada de las tareas abiertas */
const CARGA = AGENTS.map((a) => {
  const abiertas = TAREAS.filter((t) => t.agent === a.name && t.group < 2).length
  return { id: a.id, name: a.name, abiertas, pct: 20 + abiertas * 28 }
})

/** punto del color del agente, por nombre */
function AgentDot({ name }: { name: string }) {
  const k = byName(name)
  if (!k) return null
  return (
    <span
      style={{
        width: 5,
        height: 5,
        borderRadius: 99,
        background: IDENTITY[k].color,
        flex: 'none',
      }}
    />
  )
}

export default function Tareas() {
  return (
    <div>
      <PageHead title="Tareas" sub="Lo que el sistema decidió hacer hoy y quién lo está haciendo." />

      <Card className="mb-6">
        <div className="grid grid-cols-3">
          {[
            { value: String(TAREAS.length), label: 'Tareas de hoy', gold: true },
            { value: String(TAREAS.filter((t) => t.group === 1).length), label: 'En progreso' },
            { value: String(TAREAS.filter((t) => t.group === 2).length), label: 'Completadas' },
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

      <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
        {GRUPOS.map((g, gi) => {
          const items = TAREAS.filter((t) => t.group === gi)
          const { icon: Icon, color } = MARK[gi]
          return (
            <div key={g}>
              <SectionTitle
                className="mb-3.5"
                right={
                  <span className="text-[12px]" style={{ color: 'var(--color-faint)' }}>
                    {items.length}
                  </span>
                }
              >
                {g}
              </SectionTitle>
              <Card className="overflow-hidden">
                {items.map((t, i) => (
                  <div
                    key={t.t}
                    className="row-hover flex items-start gap-3.5 px-5"
                    style={{
                      minHeight: 78,
                      paddingTop: 18,
                      paddingBottom: 18,
                      borderTop: i ? '1px solid rgba(0,0,0,0.07)' : 'none',
                    }}
                  >
                    <Icon
                      size={14}
                      strokeWidth={2}
                      style={{ color, flex: 'none', marginTop: 1 }}
                      className={gi === 1 ? 'pulse' : ''}
                    />
                    <div className="min-w-0">
                      <div
                        className="text-[13.5px] leading-[1.4]"
                        style={{ color: gi === 2 ? 'var(--color-mute)' : 'var(--color-ink)' }}
                      >
                        {t.t}
                      </div>
                      <div className="mt-2.5 flex items-center gap-2">
                        <AgentDot name={t.agent} />
                        <span className="text-[12px] leading-none" style={{ color: 'var(--color-faint)' }}>
                          {t.agent}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </Card>
            </div>
          )
        })}
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 460px' }}>
        <Card className="px-7 py-7">
          <CardHead title="Reparto del trabajo" sub="Tareas abiertas por agente" />
          <div className="mt-5 grid grid-cols-5 gap-6">
            {CARGA.map((c) => (
              <div
                key={c.name}
                className="pop rounded-[10px] px-3 py-3 -mx-1 cursor-default"
                style={{ ['--pop' as string]: `${IDENTITY[c.id].color}26` }}
              >
                <div className="flex items-center gap-2.5">
                  <AgentBadge agent={c.id} size={24} />
                  <span className="text-[12.5px] truncate" style={{ color: 'var(--color-ink2)' }}>
                    {c.name}
                  </span>
                </div>
                <div className="val text-[22px] mt-3.5" style={{ color: IDENTITY[c.id].color }}>
                  {c.abiertas}
                </div>
                <div className="mt-3">
                  <Bar pct={c.pct} color={IDENTITY[c.id].color} h={4} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card gold lit className="px-7 py-7">
          <CardHead title="Prioridad del día" sub="Definida por el CEO a las 16:06" />
          <p className="mt-5 text-[15px] leading-[1.5]" style={{ color: 'var(--color-ink)' }}>
            Conseguir más leads calificados es la restricción del negocio hoy.
          </p>

        </Card>
      </div>
    </div>
  )
}
