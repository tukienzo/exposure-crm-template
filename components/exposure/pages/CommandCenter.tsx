'use client'
import { ACTIVIDAD, ESPECIALISTAS, SISTEMA, agentById, type AgentId } from '@/components/exposure/data'
import {
  AgentBadge,
  Card,
  IDENTITY,
  Label,
  SectionTitle,
  Stat,
  Stats,
  State,
  Tag,
  byName,
} from '@/components/exposure/ui'

export default function CentroDeMando({
  agent,
  setAgent,
}: {
  agent: AgentId
  setAgent: (a: AgentId) => void
}) {
  const ceo = agentById('ceo')
  const ceoId = IDENTITY.ceo

  return (
    <div>
      <div className="pb-5">
        <h1 className="text-[29px] leading-none" style={{ fontWeight: 600, letterSpacing: '-0.03em' }}>
          Centro de Mando
        </h1>
        <p className="mt-3.5 text-[14px] leading-none" style={{ color: 'var(--color-mute)' }}>
          Todo tu equipo de IA operando desde un mismo lugar.
        </p>
      </div>

      {/* ── 1 · estado del sistema ───────────────────────────── */}
      <Card className="overflow-hidden mb-4">
        <div className="flex items-center justify-between gap-10 px-8 py-6">
          <div className="min-w-0">
            <Label>Sistema Operativo</Label>
            <div className="mt-4 flex items-center gap-3">
              <span
                className="pulse"
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 99,
                  background: '#c8a95d',
                  boxShadow: '0 0 0 4px rgba(200,169,93,0.18)',
                }}
              />
              <div
                className="text-[24px] leading-none"
                style={{ fontWeight: 570, letterSpacing: '-0.028em' }}
              >
                Todo funcionando correctamente
              </div>
            </div>
            <p className="mt-4 text-[13.5px] leading-none" style={{ color: 'var(--color-mute)' }}>
              5 agentes coordinados por un único sistema.
            </p>
          </div>
          <Stats items={SISTEMA} size={32} gap={52} divide className="flex-none" />
        </div>
      </Card>

      {/* ── 2 · CEO: marco dorado global + identidad violeta ─── */}
      <Card
        gold
        lit
        className="pop overflow-hidden mb-6 cursor-pointer"
        style={{ ['--pop' as string]: `${ceoId.color}2e` }}
        onClick={() => setAgent('ceo')}
      >
        <span
          className="absolute left-0 top-0 bottom-0"
          style={{ width: 3, background: ceoId.color, opacity: 0.9 }}
        />
        <div className="flex items-center justify-between gap-10 px-8 py-6">
          <div className="flex items-start min-w-0" style={{ gap: 18 }}>
            <AgentBadge agent="ceo" size={50} active />
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h3
                  className="text-[20px] leading-none"
                  style={{ fontWeight: 570, letterSpacing: '-0.024em' }}
                >
                  CEO / Orquestador
                </h3>
                <Tag accent={ceoId.color}>Dirección</Tag>
                <State status="working" size={12.5} color={ceoId.color} />
              </div>
              <p className="mt-4 text-[13.5px] leading-[1.5] max-w-[540px]" style={{ color: 'var(--color-ink2)' }}>
                Define prioridades y coordina el trabajo del resto de los agentes.
              </p>
            </div>
          </div>
          <Stats
            items={ceo.stats.map((s, i) =>
              i === 0 ? { ...s, gold: false, color: ceoId.color } : s,
            )}
            size={26}
            gap={46}
            className="flex-none"
          />
        </div>
      </Card>

      {/* ── 3 · equipo ───────────────────────────────────────── */}
      <SectionTitle
        className="mb-4"
        right={
          <span className="text-[12.5px]" style={{ color: 'var(--color-faint)' }}>
            4 especialistas
          </span>
        }
      >
        Equipo de agentes
      </SectionTitle>
      <div className="grid grid-cols-4 gap-4 mb-6">
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
              <div className="flex items-center justify-between">
                <AgentBadge agent={a.id} size={40} active={on} />
                <State
                  status={a.status}
                  size={11.5}
                  color={a.status === 'idle' ? undefined : id.color}
                />
              </div>
              <div
                className="mt-5 text-[16px] leading-none"
                style={{ fontWeight: 570, letterSpacing: '-0.02em' }}
              >
                {a.name}
              </div>
              <p className="mt-3 text-[13px] leading-[1.45]" style={{ color: 'var(--color-mute)', minHeight: 38 }}>
                {a.short}
              </p>
              <div className="mt-5 flex items-end justify-between">
                <Stat value={a.metric.value} label={a.metric.label} size={24} color={id.color} />
                <span className="text-[11.5px] pb-[3px]" style={{ color: 'var(--color-faint2)' }}>
                  {a.role}
                </span>
              </div>
            </Card>
          )
        })}
      </div>

      {/* ── 4 · actividad ────────────────────────────────────── */}
      <SectionTitle
        className="mb-4"
        right={
          <span className="text-[12.5px]" style={{ color: 'var(--color-faint)' }}>
            Hoy
          </span>
        }
      >
        Actividad reciente
      </SectionTitle>
      <Card className="overflow-hidden">
        {ACTIVIDAD.map((r, i) => {
          const key = byName(r.who)
          const id = key ? IDENTITY[key] : undefined
          return (
            <div
              key={i}
              className="row-hover flex items-center gap-4 px-7"
              style={{ height: 51, borderTop: i ? '1px solid rgba(0,0,0,0.06)' : 'none' }}
            >
              <span className="mono text-[12px] flex-none" style={{ color: 'var(--color-faint2)', width: 42 }}>
                {r.t}
              </span>
              {key && <AgentBadge agent={key} size={28} />}
              <span className="text-[14px] flex-1 truncate" style={{ color: 'var(--color-ink)' }}>
                {r.m}
              </span>
              {id && <Tag accent={id.color}>{r.who}</Tag>}
            </div>
          )
        })}
      </Card>
    </div>
  )
}
