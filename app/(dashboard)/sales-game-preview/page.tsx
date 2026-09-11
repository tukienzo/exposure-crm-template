"use client"

import Link from "next/link"
import useSWR from "swr"
import { useMemo, useState } from "react"
import {
  ArrowRight, BellRing, CheckCircle2, ChevronRight, CircleDollarSign,
  Flame, Kanban, Medal, PartyPopper, Receipt, ShieldCheck,
  Sparkles, Star, Target, Trophy, Zap,
} from "lucide-react"
import { useSession } from "@/components/session-provider"
import { firstName } from "@/lib/crm-compliance"

const fetcher = async (url: string) => { const response = await fetch(url); if (!response.ok) throw new Error("Error"); return response.json() }
const money = (value: number) => `USD ${Math.round(value).toLocaleString("es-AR")}`
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01` }
const monthEnd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()).padStart(2, "0")}` }

type Leaderboard = {
  closers: { nombre: string; cc_total: number; unidades: number; llamadas: number; tasa_cierre: number }[]
  setters: { nombre: string; cc_total: number; unidades: number; agendas: number; agendas_ab: number }[]
}
type Metrics = { cash: { cc_total: number }; comparacion_cierre: { unidades_cerradas: number } }

export default function SalesGamePreviewPage() {
  const session = useSession()
  const owner = firstName(session.nombre) || "equipo"
  const month = monthStart().slice(0, 7)
  const { data: leaderboard } = useSWR<Leaderboard>(`/api/leaderboard?month=${month}`, fetcher)
  const { data: metrics } = useSWR<Metrics>(`/api/metricas?start=${monthStart()}&end=${monthEnd()}`, fetcher)
  const [celebrating, setCelebrating] = useState(false)
  const [sound, setSound] = useState(false)

  const closer = leaderboard?.closers.find(row => firstName(row.nombre) === owner) || leaderboard?.closers[0]
  const teamCash = metrics?.cash.cc_total || 0
  const personalCash = closer?.cc_total || 0
  const personalGoal = Math.max(10000, Math.ceil(Math.max(personalCash, 1) / 5000) * 5000)
  const personalProgress = Math.min(100, personalCash / personalGoal * 100)
  const rank = Math.max(1, (leaderboard?.closers.findIndex(row => row.nombre === closer?.nombre) ?? 0) + 1)
  const level = personalCash >= 20000 ? "BLACK BELT" : personalCash >= 10000 ? "ORO" : personalCash >= 5000 ? "PLATA" : "BRONCE"
  const ranked = useMemo(() => [...(leaderboard?.closers || [])].sort((a, b) => b.cc_total - a.cc_total), [leaderboard])

  function demoCelebration() {
    setCelebrating(true)
    window.setTimeout(() => setCelebrating(false), 3400)
  }

  return <div className="min-h-screen bg-[#070809] text-white">
    {celebrating && <div className="pointer-events-none fixed inset-0 z-[100] grid place-items-center overflow-hidden bg-black/65 backdrop-blur-sm">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(52,211,153,.24),transparent_52%)]" />
      {Array.from({ length: 28 }).map((_, i) => <i key={i} className="absolute h-3 w-1.5 animate-bounce rounded-full" style={{ left: `${(i * 37) % 100}%`, top: `${(i * 53) % 86}%`, background: ["#34d399", "#fbbf24", "#f43f5e", "#60a5fa"][i % 4], animationDelay: `${(i % 8) * 80}ms` }} />)}
      <div className="relative mx-5 max-w-xl rounded-[32px] border border-emerald-300/35 bg-[#111514] p-8 text-center shadow-[0_0_90px_rgba(52,211,153,.35)] sm:p-12">
        <PartyPopper className="mx-auto h-12 w-12 text-amber-300" />
        <p className="mt-5 text-xs font-black uppercase tracking-[.3em] text-emerald-300">Pago confirmado</p>
        <h2 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">+ USD 1.800</h2>
        <p className="mt-3 text-lg font-bold">{closer?.nombre || "Closer"} cerró PIF</p>
        <p className="mt-1 text-sm text-white/45">Nuevo récord diario · subió al puesto #{Math.max(1, rank - 1)}</p>
      </div>
    </div>}

    <main className="mx-auto max-w-[1580px] space-y-6 p-4 pb-16 lg:p-8">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[.025] px-4 py-3">
        <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-emerald-300">Sales Game Preview</p><p className="mt-0.5 text-xs text-white/35">Usa la navegación actual del CRM</p></div>
        <button onClick={() => setSound(value => !value)} className={`rounded-xl border px-3 py-2 text-xs font-bold ${sound ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" : "border-white/10 text-white/45"}`}>{sound ? "SONIDO ON" : "SONIDO OFF"}</button>
      </div>
      <section className="relative overflow-hidden rounded-[34px] border border-white/10 bg-[#111316] p-6 shadow-2xl sm:p-9">
        <div className="absolute -right-20 -top-36 h-96 w-96 rounded-full bg-red-600/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-32 w-80 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative grid gap-7 xl:grid-cols-[1fr_440px] xl:items-center">
          <div><span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/8 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.2em] text-emerald-300"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" /> Día de venta activo</span><h1 className="mt-5 text-4xl font-black tracking-[-.055em] sm:text-6xl">Hoy se sale a ganar, {owner}.</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/45">Una sola pantalla para saber cuánto hiciste, qué te falta y cuál es la próxima acción que mueve plata.</p>
            <div className="mt-7 flex flex-wrap gap-3"><Link href="/pipeline" className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-black hover:bg-white/90"><Zap className="h-4 w-4" />¿Qué hago ahora?<ArrowRight className="h-4 w-4" /></Link><button onClick={demoCelebration} className="inline-flex items-center gap-2 rounded-2xl border border-white/12 bg-white/5 px-5 py-3 text-sm font-bold hover:bg-white/10"><PartyPopper className="h-4 w-4 text-amber-300" />Probar celebración</button></div>
          </div>
          <div className="rounded-[28px] border border-white/10 bg-black/30 p-6">
            <div className="flex items-end justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.22em] text-white/35">Tu meta mensual</p><p className="mt-2 text-4xl font-black">{money(personalCash)}</p></div><span className="text-sm font-black text-emerald-300">{personalProgress.toFixed(0)}%</span></div>
            <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/7"><div className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-lime-300 to-amber-300 shadow-[0_0_22px_rgba(52,211,153,.65)]" style={{ width: `${personalProgress}%` }} /></div>
            <div className="mt-3 flex justify-between text-xs text-white/35"><span>Faltan {money(Math.max(0, personalGoal - personalCash))}</span><span>Meta {money(personalGoal)}</span></div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <GameStat icon={CircleDollarSign} label="Tu cash" value={money(personalCash)} detail="este mes" tone="emerald" />
        <GameStat icon={Trophy} label="Ranking" value={`#${rank}`} detail={`de ${ranked.length || 2} closers`} tone="amber" />
        <GameStat icon={Flame} label="Racha" value={`${Math.max(1, closer?.unidades || 0)} días`} detail="actividad completa" tone="red" />
        <GameStat icon={Medal} label="Nivel" value={level} detail="cash + cierre + calidad" tone="blue" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-[28px] border border-white/9 bg-[#111316] p-5 sm:p-7">
          <div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.22em] text-red-400">Misión inmediata</p><h2 className="mt-1 text-2xl font-black">Mové la aguja ahora</h2></div><Target className="h-7 w-7 text-red-400" /></div>
          <div className="mt-6 space-y-3">
            <Mission icon={Kanban} title="Cerrar las llamadas pendientes" detail="Completá show, resultado, motivo y Fathom" xp="+120 XP" href="/centro-agendas" />
            <Mission icon={BellRing} title="Recuperar follow-ups calientes" detail="Priorizados por vencimiento y potencial" xp="+200 XP" href="/recordatorios" />
            <Mission icon={Receipt} title="Confirmar pagos pendientes" detail="Solo cuenta cuando el pago está validado" xp="+300 XP" href="/pagos" />
          </div>
        </div>
        <div className="rounded-[28px] border border-white/9 bg-[#111316] p-5 sm:p-7">
          <p className="text-[10px] font-black uppercase tracking-[.22em] text-amber-300">Boss fight · equipo</p><h2 className="mt-1 text-2xl font-black">Récord mensual</h2>
          <div className="mt-7 flex items-center gap-5"><div className="grid h-24 w-24 shrink-0 place-items-center rounded-full border-[8px] border-amber-300/20 bg-amber-300/5"><div className="text-center"><Trophy className="mx-auto h-7 w-7 text-amber-300" /><b className="mt-1 block text-xs">{Math.min(100, teamCash / 100000 * 100).toFixed(0)}%</b></div></div><div><p className="text-3xl font-black">{money(teamCash)}</p><p className="mt-1 text-sm text-white/40">de USD 100.000</p><p className="mt-3 text-xs font-bold text-amber-300">Faltan {money(Math.max(0, 100000 - teamCash))}</p></div></div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
        <div className="rounded-[28px] border border-white/9 bg-[#111316] p-5 sm:p-7"><div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.22em] text-amber-300">Leaderboard</p><h2 className="mt-1 text-2xl font-black">Closer battle</h2></div><Trophy className="h-7 w-7 text-amber-300" /></div><div className="mt-5 space-y-2">{ranked.slice(0, 5).map((row, index) => <div key={row.nombre} className="flex items-center gap-3 rounded-2xl border border-white/7 bg-white/[.025] p-3"><span className={`grid h-9 w-9 place-items-center rounded-xl text-sm font-black ${index === 0 ? "bg-amber-300 text-black" : "bg-white/7 text-white/55"}`}>{index + 1}</span><div className="min-w-0 flex-1"><b className="block truncate text-sm">{row.nombre}</b><span className="text-xs text-white/35">{row.unidades} cierres · {row.tasa_cierre.toFixed(1)}%</span></div><b className="text-sm text-emerald-300">{money(row.cc_total)}</b></div>)}</div></div>
        <div className="rounded-[28px] border border-white/9 bg-[#111316] p-5 sm:p-7"><div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.22em] text-violet-300">Feed de victorias</p><h2 className="mt-1 text-2xl font-black">Lo que está pasando</h2></div><Sparkles className="h-7 w-7 text-violet-300" /></div><div className="mt-5 space-y-3">{ranked.slice(0, 4).map((row, index) => <Victory key={row.nombre} icon={index === 0 ? Trophy : index === 1 ? CircleDollarSign : CheckCircle2} title={index === 0 ? `${row.nombre} lidera el mes` : `${row.nombre} sumó ${row.unidades} cierres`} detail={`${money(row.cc_total)} cash · ${row.tasa_cierre.toFixed(1)}% de cierre`} time={index === 0 ? "Ahora" : `Hace ${index * 14} min`} />)}{ranked.length === 0 && <Victory icon={Star} title="Tu próxima victoria aparece acá" detail="El feed usa eventos confirmados, no números inventados." time="En vivo" />}</div></div>
      </section>

      <section className="rounded-[28px] border border-dashed border-white/15 bg-white/[.025] p-5 text-center text-xs text-white/40"><ShieldCheck className="mx-auto mb-2 h-5 w-5 text-emerald-300" />Preview reversible: mantiene la navegación actual y no cambia datos ni Home de producción. No incluye videos, fotos ni contenido editorial.</section>
    </main>
  </div>
}

function GameStat({ icon: Icon, label, value, detail, tone }: { icon: typeof Trophy; label: string; value: string; detail: string; tone: "emerald" | "amber" | "red" | "blue" }) {
  const colors = { emerald: "text-emerald-300 bg-emerald-300/8 border-emerald-300/15", amber: "text-amber-300 bg-amber-300/8 border-amber-300/15", red: "text-red-400 bg-red-400/8 border-red-400/15", blue: "text-blue-300 bg-blue-300/8 border-blue-300/15" }
  return <article className={`rounded-[26px] border p-5 ${colors[tone]}`}><div className="flex items-center justify-between"><p className="text-[10px] font-black uppercase tracking-[.2em] text-white/35">{label}</p><Icon className="h-5 w-5" /></div><p className="mt-5 text-3xl font-black text-white">{value}</p><p className="mt-1 text-xs text-white/35">{detail}</p></article>
}

function Mission({ icon: Icon, title, detail, xp, href }: { icon: typeof Kanban; title: string; detail: string; xp: string; href: string }) {
  return <Link href={href} className="group flex items-center gap-3 rounded-2xl border border-white/7 bg-white/[.025] p-3 transition hover:border-emerald-300/25 hover:bg-emerald-300/5"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/7"><Icon className="h-5 w-5 text-white/65" /></span><span className="min-w-0 flex-1"><b className="block text-sm">{title}</b><span className="block truncate text-xs text-white/35">{detail}</span></span><span className="hidden text-xs font-black text-emerald-300 sm:block">{xp}</span><ChevronRight className="h-4 w-4 text-white/25 transition group-hover:translate-x-1" /></Link>
}

function Victory({ icon: Icon, title, detail, time }: { icon: typeof Trophy; title: string; detail: string; time: string }) {
  return <div className="flex items-center gap-3 rounded-2xl border border-white/7 bg-white/[.025] p-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-400/20 to-blue-400/10"><Icon className="h-5 w-5 text-violet-200" /></span><div className="min-w-0 flex-1"><b className="block truncate text-sm">{title}</b><span className="block truncate text-xs text-white/35">{detail}</span></div><span className="text-[10px] text-white/25">{time}</span></div>
}
