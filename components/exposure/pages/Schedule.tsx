'use client'
import { AGENDA } from '@/components/exposure/data'
import { Bar, Card, CardHead, Dot, IDENTITY, PageHead, Stat, byName } from '@/components/exposure/ui'

const STATE_COLOR: Record<string, string> = {
  Completado: 'var(--color-faint)',
  'En curso': 'var(--color-gold-dk)',
  Pendiente: 'var(--color-mute)',
}

/* línea del día: progreso dorado + hitos. sin ticks de terminal. */
function Dia() {
  const now = 16.1
  return (
    <div className="px-7 pb-8 pt-2">
      <div className="relative" style={{ height: 58 }}>
        <div
          className="absolute left-0 right-0"
          style={{ top: 20, height: 3, borderRadius: 99, background: 'rgba(20,16,8,0.10)' }}
        />
        <div
          className="absolute"
          style={{
            left: 0,
            width: `${(now / 24) * 100}%`,
            top: 20,
            height: 3,
            borderRadius: 99,
            background: 'linear-gradient(90deg,#dec27c,#9c7a37)',
          }}
        />
        {AGENDA.map((s) => {
          const h = parseInt(s.t.slice(0, 2)) + parseInt(s.t.slice(3)) / 60
          const done = s.state === 'Completado'
          const live = s.state === 'En curso'
          return (
            <div
              key={s.t}
              className="absolute"
              style={{ left: `${(h / 24) * 100}%`, top: 21.5, transform: 'translate(-50%,-50%)' }}
              title={`${s.t} · ${s.label}`}
            >
              <div
                className={live ? 'pulse' : ''}
                style={{
                  width: live ? 13 : 9,
                  height: live ? 13 : 9,
                  borderRadius: 99,
                  background: done || live ? 'var(--color-gold)' : 'var(--color-card)',
                  border: `2px solid ${done || live ? 'var(--color-card)' : 'var(--color-line2)'}`,
                  boxShadow: live
                    ? '0 0 0 4px rgba(200,169,93,0.22)'
                    : '0 1px 2px rgba(20,16,8,0.12)',
                }}
              />
            </div>
          )
        })}
        <div
          className="absolute"
          style={{ left: `${(now / 24) * 100}%`, top: 0, width: 1, height: 18, background: 'rgba(156,122,55,0.45)' }}
        />
        <div
          className="absolute text-[11px]"
          style={{ left: `${(now / 24) * 100}%`, top: -14, color: 'var(--color-gold-dk)', transform: 'translateX(-50%)' }}
        >
          Ahora
        </div>
        {['06:00', '12:00', '18:00'].map((l, i) => (
          <span
            key={l}
            className="mono absolute text-[11px]"
            style={{
              left: `${((6 + i * 6) / 24) * 100}%`,
              top: 38,
              color: '#b3ada3',
              transform: 'translateX(-50%)',
            }}
          >
            {l}
          </span>
        ))}
      </div>
    </div>
  )
}

function AgentDot({ name }: { name: string }) {
  const k = byName(name)
  if (!k) return null
  return (
    <span
      style={{ width: 5, height: 5, borderRadius: 99, background: IDENTITY[k].color, flex: 'none' }}
    />
  )
}

export default function Agenda_() {
  return (
    <div>
      <PageHead title="Agenda" sub="El ritmo diario con el que trabaja el sistema." />

      <Card className="mb-4 overflow-hidden">
        <div className="px-7 pt-6 pb-5 flex items-start justify-between gap-10">
          <CardHead title="Hoy" sub="9 momentos de trabajo coordinado" />
          <div className="flex items-start" style={{ gap: 44 }}>
            <Stat value="3" label="Completados" align="right" size={20} />
            <Stat value="2" label="En curso" align="right" size={20} gold />
            <Stat value="16:00" label="Próximo" align="right" size={20} />
          </div>
        </div>
        <Dia />
      </Card>

      <Card className="overflow-hidden">
        {AGENDA.map((s, i) => (
          <div
            key={s.t}
            className="row-hover flex items-center gap-5 px-7"
            style={{ height: 60, borderTop: i ? '1px solid rgba(0,0,0,0.07)' : 'none' }}
          >
            <span className="mono text-[13px] flex-none" style={{ color: 'var(--color-ink2)', width: 46 }}>
              {s.t}
            </span>
            <Dot status={s.state === 'En curso' ? 'working' : s.state === 'Pendiente' ? 'waiting' : 'idle'} size={5} />
            <span
              className="text-[13.5px] flex-1 truncate"
              style={{ color: s.state === 'Completado' ? 'var(--color-mute)' : 'var(--color-ink)' }}
            >
              {s.label}
            </span>
            <span className="flex items-center gap-2 flex-none" style={{ width: 165 }}>
              <AgentDot name={s.agent} />
              <span className="text-[12.5px] truncate" style={{ color: 'var(--color-faint)' }}>
                {s.agent}
              </span>
            </span>
            <span
              className="text-[12px] flex-none text-right"
              style={{ color: STATE_COLOR[s.state], width: 92 }}
            >
              {s.state}
            </span>
          </div>
        ))}
      </Card>

      <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Card gold lit className="px-7 py-6">
          <CardHead title="Próxima ventana" sub="Hoy a las 14:00" />
          <div className="mt-4 text-[17px] leading-none" style={{ fontWeight: 550, letterSpacing: '-0.02em' }}>
            Ventana de seguimientos
          </div>
          <p className="mt-3.5 text-[13px] leading-[1.5]" style={{ color: 'var(--color-ink2)' }}>
            El Agente Comercial preparó 27 mensajes y espera tu aprobación para enviarlos.
          </p>
          <div className="mt-5 flex items-start" style={{ gap: 44 }}>
            <Stat value="27" label="En cola" size={20} gold />
            <Stat value="4 min" label="Duración estimada" size={20} />
            <Stat value="Tu OK" label="Aprobación" size={20} />
          </div>
        </Card>

        <Card className="px-7 py-6">
          <CardHead title="Cómo viene el día" sub="Comparado con el promedio de la semana" />
          <div className="mt-5">
            {[
              ['Puntualidad', 99, '9 de 9 ventanas'],
              ['Trabajo completado', 89, '8 de 9 ventanas'],
              ['Sin intervención humana', 78, '7 de 9 ventanas'],
            ].map(([k, v, sub]) => (
              <div key={k as string} className="py-3">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[12.5px]" style={{ color: 'var(--color-ink2)' }}>
                    {k as string}
                  </span>
                  <span className="val text-[13px]" style={{ color: (v as number) > 90 ? 'var(--color-gold-dk)' : 'var(--color-ink2)' }}>
                    {v as number}%
                  </span>
                </div>
                <Bar pct={v as number} gold={(v as number) > 90} h={4} />
                <div className="mt-2.5 text-[11.5px]" style={{ color: 'var(--color-faint)' }}>
                  {sub as string}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
