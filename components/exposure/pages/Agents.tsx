'use client'
import { ESPECIALISTAS, agentById, type AgentId } from '@/components/exposure/data'
import { AgentBadge, Card, IDENTITY, PageHead, Stat, Stats, State, Tag } from '@/components/exposure/ui'

export default function Agentes({
  agent,
  setAgent,
}: {
  agent: AgentId
  setAgent: (a: AgentId) => void
}) {
  const ceo = agentById('ceo')
  const active = agentById(agent)
  const ceoId = IDENTITY.ceo
  const activeId = IDENTITY[agent]

  return (
    <div>
      <PageHead title="Agentes" sub="Un CEO coordinando cuatro agentes especializados." />

      {/* ── red ──────────────────────────────────────────────── */}
      <div className="relative">
        <div className="flex justify-center">
          <Card
            gold
            lit
            className="pop overflow-hidden cursor-pointer"
            style={{ width: 680, ['--pop' as string]: `${ceoId.color}2e` }}
            onClick={() => setAgent('ceo')}
          >
            <span
              className="absolute left-0 top-0 bottom-0"
              style={{ width: 3, background: ceoId.color, opacity: 0.9 }}
            />
            <div className="px-8 pt-6 pb-5">
              <div className="flex items-start" style={{ gap: 18 }}>
                <AgentBadge agent="ceo" size={52} active />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <h3
                      className="text-[21px] leading-none"
                      style={{ fontWeight: 570, letterSpacing: '-0.026em' }}
                    >
                      CEO / Orquestador
                    </h3>
                    <Tag accent={ceoId.color}>Dirección</Tag>
                  </div>
                  <div className="mt-3.5">
                    <State status="working" size={12.5} color={ceoId.color} />
                  </div>
                </div>
              </div>
              <p className="mt-4.5 text-[13.5px] leading-[1.55]" style={{ color: 'var(--color-ink2)', marginTop: 18 }}>
                Define prioridades, distribuye trabajo y conecta toda la información del sistema.
              </p>
            </div>
            <div className="px-8 py-4" style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }}>
              <Stats
                items={ceo.stats.map((s, i) =>
                  i === 0 ? { ...s, gold: false, color: ceoId.color } : s,
                )}
                size={22}
                gap={54}
              />
            </div>
          </Card>
        </div>

        {/* conectores: gris muy tenue, con la punta en el color de cada agente */}
        <svg width="100%" height="62" className="block">
          <line x1="50%" y1="0" x2="50%" y2="28" stroke={ceoId.color} strokeWidth="1.4" opacity="0.5" />
          <line x1="12.5%" y1="28" x2="87.5%" y2="28" stroke="rgba(0,0,0,0.11)" strokeWidth="1" />
          {ESPECIALISTAS.map((a, i) => {
            const x = `${12.5 + i * 25}%`
            return (
              <g key={a.id}>
                <line x1={x} y1="28" x2={x} y2="62" stroke="rgba(0,0,0,0.11)" strokeWidth="1" />
                <circle cx={x} cy="28" r="2.6" fill={IDENTITY[a.id].color} opacity="0.75" />
              </g>
            )
          })}
          <circle cx="50%" cy="28" r="3.4" fill={ceoId.color} />
        </svg>

        <div className="grid grid-cols-4 gap-4">
          {ESPECIALISTAS.map((a) => {
            const on = agent === a.id
            const id = IDENTITY[a.id]
            return (
              <Card
                key={a.id}
                accent={on ? id.color : undefined}
                className="pop px-6 py-5 cursor-pointer overflow-hidden"
                style={{ ['--pop' as string]: `${id.color}30` }}
                onClick={() => setAgent(a.id)}
              >
                <span
                  className="absolute left-0 right-0 top-0"
                  style={{ height: 2, background: id.color, opacity: on ? 0.95 : 0.4 }}
                />
                <span
                  className="absolute pointer-events-none"
                  style={{
                    inset: 0,
                    background: `radial-gradient(320px 130px at 12% 0%, ${id.color}${on ? '1f' : '12'}, transparent 70%)`,
                  }}
                />
                <div className="relative flex items-center justify-between">
                  <AgentBadge agent={a.id} size={42} active={on} />
                  <State
                    status={a.status}
                    size={11.5}
                    color={a.status === 'idle' ? undefined : id.color}
                  />
                </div>
                <div
                  className="relative mt-5 text-[16.5px] leading-none"
                  style={{ fontWeight: 570, letterSpacing: '-0.02em' }}
                >
                  {a.name}
                </div>
                <p
                  className="relative mt-3 text-[13px] leading-[1.5]"
                  style={{ color: 'var(--color-mute)', minHeight: 58 }}
                >
                  {a.desc}
                </p>
                <div className="relative mt-4 flex items-end justify-between">
                  <Stat value={a.metric.value} label={a.metric.label} size={24} color={id.color} />
                  <span className="text-[11.5px] pb-[3px]" style={{ color: 'var(--color-faint2)' }}>
                    {a.role}
                  </span>
                </div>
              </Card>
            )
          })}
        </div>
      </div>

      {/* ── agente seleccionado ──────────────────────────────── */}
      <div className="flex items-center gap-3 mt-7 mb-4">
        <h2 className="text-[16px] leading-none" style={{ fontWeight: 580, letterSpacing: '-0.016em' }}>
          Actividad reciente
        </h2>
        <Tag accent={activeId.color}>{active.name}</Tag>
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 400px' }}>
        <Card className="overflow-hidden">
          {active.activity.map((r, i) => (
            <div
              key={i}
              className="row-hover flex items-center gap-4 px-7"
              style={{ height: 50, borderTop: i ? '1px solid rgba(0,0,0,0.06)' : 'none' }}
            >
              <span className="mono text-[12px] flex-none" style={{ color: 'var(--color-faint2)', width: 42 }}>
                {r.t}
              </span>
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 99,
                  background: activeId.color,
                  flex: 'none',
                }}
              />
              <span className="text-[14px] flex-1 truncate" style={{ color: 'var(--color-ink)' }}>
                {r.m}
              </span>
            </div>
          ))}
        </Card>

        <Card
          accent={activeId.color}
          className="pop px-7 py-6 overflow-hidden"
          style={{ ['--pop' as string]: `${activeId.color}2a` }}
        >
          <span
            className="absolute pointer-events-none"
            style={{
              inset: 0,
              background: `radial-gradient(340px 150px at 10% 0%, ${activeId.color}1c, transparent 70%)`,
            }}
          />
          <div className="relative flex items-center gap-4">
            <AgentBadge agent={agent} size={44} active />
            <div>
              <div className="text-[17px] leading-none" style={{ fontWeight: 570, letterSpacing: '-0.022em' }}>
                {active.name}
              </div>
              <div className="mt-3">
                <State
                  status={active.status}
                  size={12}
                  color={active.status === 'idle' ? undefined : activeId.color}
                />
              </div>
            </div>
          </div>
          <p className="relative mt-5 text-[13px] leading-[1.55]" style={{ color: 'var(--color-mute)' }}>
            {active.desc}
          </p>
          <div className="relative mt-6">
            <Stats
              items={active.stats.map((s, i) =>
                i === 0 ? { ...s, gold: false, color: activeId.color } : s,
              )}
              size={20}
              gap={34}
            />
          </div>
        </Card>
      </div>
    </div>
  )
}
