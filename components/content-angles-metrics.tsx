"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import {
  Activity, BadgeDollarSign, CalendarCheck2, CheckCircle2, CircleAlert,
  Layers3, Radar, Receipt, Route, Sparkles, Tags, UsersRound,
} from "lucide-react"
import { BUYER_ARCHETYPES } from "@/lib/trace-intelligence"
import { SALES_ANGLES } from "@/lib/sales-angles"
import { useSession } from "@/components/session-provider"

const fetcher = (url: string) => fetch(url).then(async (response) => {
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || "No se pudo cargar")
  return body
})

type AngleRow = {
  angle: string; assets: number; touches: number; agendas: number; qualifiedAgendas: number
  shows: number; sales: number; buyers500: number; entryBuyers: number; diagnosedBuyers: number
  cash: number; diagnosedCash: number; aov: number | null; agendaRate: number | null
  closeRate: number | null; evidenceCoverage: number | null
  denominators: { agendaRate: number; closeRate: number; evidenceCoverage: number }
}
type Aggregate = { buyers: number; cash: number; aov?: number | null; examples?: Array<{ name: string; evidence: string }> }
type ReviewItem = {
  id: string; personId: string; name: string; reason: string; cash: number
  candidateAngle: string | null; candidateArchetype: string | null; confidence: number
  evidence: string[]; fathomUrl: string | null
}
type Response = {
  generatedAt: string
  totals: {
    assets: number; angles: number; leads: number; agendas: number; buyers: number; buyers500: number
    totalCash: number; attributedCash: number; cashCoverage: number | null
    attributedBuyers: number; buyerCoverage: number | null; reviewPending: number
  }
  angles: AngleRow[]
  archetypes: Array<Aggregate & { archetype: string; leads: number }>
  motives: Array<Aggregate & { motive: string }>
  sources: Array<{ source: string; leads: number; agendas: number; buyers: number; cash: number }>
  journeys: Array<{ journey: string; people: number; buyers: number; cash: number }>
  pieces: Array<{ id: string; title: string; angle: string; format: string | null; touches: number; agendas: number; buyers: number; cash: number }>
  reviewQueue: ReviewItem[]
  methodology: Record<string, string>
}

const money = (value: number | null | undefined) => new Intl.NumberFormat("es-AR", {
  style: "currency", currency: "USD", maximumFractionDigits: 0,
}).format(Number(value || 0))
const pct = (value: number | null | undefined) => value == null ? "—" : `${value}%`

const TABS = ["Ángulos", "Arquetipos", "Motivos", "Viajes", "Contenido", "Revisión editorial"] as const
type Tab = (typeof TABS)[number]

export function ContentAnglesMetrics() {
  const { rol } = useSession()
  const { data, isLoading, error, mutate } = useSWR<Response>("/api/trace-intelligence?v=20260811-paolo", fetcher, {
    revalidateOnFocus: false,
  })
  const [tab, setTab] = useState<Tab>("Ángulos")
  const visibleTabs = rol === "Editor" ? TABS.filter((item) => item !== "Revisión editorial") : TABS

  return <main className="space-y-6">
    <section className="overflow-hidden rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(217,70,239,.18),transparent_35%),linear-gradient(135deg,rgba(24,24,27,.96),rgba(9,9,11,.98))] p-5 shadow-2xl shadow-black/30 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[.24em] text-fuchsia-300"><Radar className="h-4 w-4" /> Centro de inteligencia comercial</div>
          <h1 className="text-3xl font-black tracking-tight sm:text-5xl">Ángulos que venden</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50">Contenido de entrada → chat → agenda → call → motivo → pago → onboarding. La atribución de marketing y el diagnóstico comercial se muestran separados.</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[.05] px-4 py-3 text-xs text-white/45">
          {data?.generatedAt ? `Actualizado ${new Date(data.generatedAt).toLocaleString("es-AR")}` : "Calculando acumulado…"}
        </div>
      </div>
    </section>

    {error && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error.message}</div>}
    {isLoading && <div className="rounded-2xl border border-white/10 bg-white/[.035] p-8 text-sm text-white/45">Cruzando agendas, pagos, chats, Fathom, onboardings y contenido…</div>}

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
      <Metric label="Cash total" value={money(data?.totals.totalCash)} icon={BadgeDollarSign} tone="emerald" />
      <Metric label="Cash atribuido a entrada" value={money(data?.totals.attributedCash)} icon={Receipt} tone="fuchsia" />
      <Metric label="Cobertura cash" value={pct(data?.totals.cashCoverage)} icon={Radar} tone="violet" />
      <Metric label="Compradores" value={(data?.totals.buyers || 0).toLocaleString("es-AR")} icon={UsersRound} />
      <Metric label="Compradores ≥500" value={(data?.totals.buyers500 || 0).toLocaleString("es-AR")} icon={CheckCircle2} tone="emerald" />
      <Metric label="Agendas únicas" value={(data?.totals.agendas || 0).toLocaleString("es-AR")} icon={CalendarCheck2} />
      <Metric label="Piezas Notion/CRM" value={(data?.totals.assets || 0).toLocaleString("es-AR")} icon={Layers3} />
      <Metric label="Pendientes de revisión" value={(data?.totals.reviewPending || 0).toLocaleString("es-AR")} icon={CircleAlert} tone="amber" />
    </section>

    <section className="rounded-[26px] border border-white/10 bg-white/[.03] p-2">
      <div className="flex gap-2 overflow-x-auto">
        {visibleTabs.map((item) => <button key={item} onClick={() => setTab(item)} className={`whitespace-nowrap rounded-2xl px-4 py-3 text-sm font-bold transition ${tab === item ? "bg-fuchsia-500 text-white shadow-lg shadow-fuchsia-500/20" : "text-white/45 hover:bg-white/[.06] hover:text-white"}`}>{item}{item === "Revisión editorial" && data?.totals.reviewPending ? ` · ${data.totals.reviewPending}` : ""}</button>)}
      </div>
    </section>

    {data && tab === "Ángulos" && <AnglesTable rows={data.angles} />}
    {data && tab === "Arquetipos" && <Archetypes rows={data.archetypes} />}
    {data && tab === "Motivos" && <Motives rows={data.motives} />}
    {data && tab === "Viajes" && <Journeys journeys={data.journeys} sources={data.sources} />}
    {data && tab === "Contenido" && <Pieces rows={data.pieces} />}
    {data && tab === "Revisión editorial" && <ReviewQueue rows={data.reviewQueue} onSaved={() => mutate()} />}

    {data && <section className="rounded-[24px] border border-white/10 bg-black/25 p-5">
      <h2 className="text-sm font-black uppercase tracking-[.18em] text-white/55">Método de atribución</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {Object.entries(data.methodology).map(([key, value]) => <div key={key} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"><div className="text-xs font-black uppercase text-fuchsia-300">{key}</div><p className="mt-2 text-sm leading-6 text-white/55">{value}</p></div>)}
      </div>
    </section>}
  </main>
}

function AnglesTable({ rows }: { rows: AngleRow[] }) {
  return <section className="overflow-hidden rounded-[26px] border border-white/10 bg-white/[.035]">
    <div className="border-b border-white/10 px-5 py-4"><h2 className="text-lg font-black">Rendimiento por ángulo</h2><p className="mt-1 text-xs text-white/45">Cash de entrada = atribución de contenido. Cash diagnosticado = dolor detectado en la call. Nunca se mezclan.</p></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[1320px] text-sm">
      <thead className="bg-white/[.035] text-left text-[10px] font-black uppercase tracking-wider text-white/40"><tr>
        <th className="px-5 py-3">Ángulo</th><th className="px-3 py-3 text-right">Piezas</th><th className="px-3 py-3 text-right">Estímulos</th><th className="px-3 py-3 text-right">Agendas</th><th className="px-3 py-3 text-right">S/A/B</th><th className="px-3 py-3 text-right">Shows</th><th className="px-3 py-3 text-right">Compradores entrada</th><th className="px-3 py-3 text-right">Cash entrada</th><th className="px-3 py-3 text-right">AOV</th><th className="px-3 py-3 text-right">Compradores diagnóstico</th><th className="px-3 py-3 text-right">Cash diagnóstico</th><th className="px-3 py-3 text-right">Estímulo→agenda</th><th className="px-5 py-3 text-right">Show→venta</th>
      </tr></thead>
      <tbody>{rows.map((row) => <tr key={row.angle} className="border-t border-white/[.06] hover:bg-white/[.035]">
        <td className="px-5 py-4 font-bold">{row.angle}</td><N v={row.assets}/><N v={row.touches}/><N v={row.agendas}/><N v={row.qualifiedAgendas}/><N v={row.shows}/><N v={row.entryBuyers} strong/><N v={money(row.cash)} strong/><N v={row.aov == null ? "—" : money(row.aov)}/><N v={row.diagnosedBuyers}/><N v={money(row.diagnosedCash)}/><N v={`${pct(row.agendaRate)} · N=${row.denominators.agendaRate}`}/><N v={`${pct(row.closeRate)} · N=${row.denominators.closeRate}`}/>
      </tr>)}</tbody>
    </table></div>
  </section>
}

function Archetypes({ rows }: { rows: Response["archetypes"] }) {
  const all = useMemo(() => BUYER_ARCHETYPES.map((name) => rows.find((row) => row.archetype === name) || { archetype: name, leads: 0, buyers: 0, cash: 0, aov: null, examples: [] }), [rows])
  return <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{all.map((row, index) => <article key={row.archetype} className="rounded-[26px] border border-white/10 bg-gradient-to-br from-white/[.06] to-white/[.02] p-5">
    <div className="flex items-start justify-between gap-4"><span className="text-4xl font-black text-fuchsia-400/40">0{index + 1}</span><span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-300">{money(row.cash)}</span></div>
    <h2 className="mt-4 text-lg font-black">{row.archetype.replace(/^A\d · /, "")}</h2>
    <div className="mt-5 grid grid-cols-3 gap-2 text-center"><Mini label="Leads" value={row.leads}/><Mini label="Compradores" value={row.buyers}/><Mini label="AOV" value={row.aov == null ? "—" : money(row.aov)}/></div>
    {!!row.examples?.length && <div className="mt-4 space-y-2">{row.examples.map((example, idx) => <p key={idx} className="rounded-xl bg-black/20 p-3 text-xs leading-5 text-white/45"><strong className="text-white/70">{example.name}:</strong> {example.evidence}</p>)}</div>}
  </article>)}</section>
}

function Motives({ rows }: { rows: Response["motives"] }) {
  return <section className="overflow-hidden rounded-[26px] border border-white/10 bg-white/[.035]"><div className="border-b border-white/10 px-5 py-4"><h2 className="text-lg font-black">Por qué compran</h2><p className="mt-1 text-xs text-white/45">Agrupado desde el motivo explícito de las calls cerradas; conserva ejemplos auditables.</p></div><div className="divide-y divide-white/[.06]">{rows.map((row, index) => <div key={row.motive} className="grid gap-4 px-5 py-5 lg:grid-cols-[40px_1fr_100px_130px_2fr] lg:items-center"><div className="text-2xl font-black text-fuchsia-400/45">{index + 1}</div><div className="font-bold">{row.motive}</div><div className="text-sm text-white/50">{row.buyers} buyers</div><div className="font-black text-emerald-300">{money(row.cash)}</div><div className="text-xs leading-5 text-white/45">{row.examples?.[0]?.evidence || "Sin cita suficiente"}</div></div>)}</div></section>
}

function Journeys({ journeys, sources }: { journeys: Response["journeys"]; sources: Response["sources"] }) {
  return <div className="grid gap-5 xl:grid-cols-2"><section className="rounded-[26px] border border-white/10 bg-white/[.035] p-5"><h2 className="text-lg font-black">Viajes que terminan en pago</h2><p className="mt-1 text-xs text-white/45">Entrada → gatillo → diagnóstico. Solo aparece cuando existe evidencia en alguna capa.</p><div className="mt-4 space-y-3">{journeys.map((row) => <div key={row.journey} className="rounded-2xl border border-white/[.07] bg-black/20 p-4"><div className="flex items-start gap-3"><Route className="mt-0.5 h-4 w-4 shrink-0 text-fuchsia-300"/><p className="text-sm font-semibold leading-6">{row.journey}</p></div><div className="mt-3 flex gap-4 text-xs text-white/45"><span>{row.people} personas</span><span>{row.buyers} compradores</span><strong className="text-emerald-300">{money(row.cash)}</strong></div></div>)}</div></section><section className="rounded-[26px] border border-white/10 bg-white/[.035] p-5"><h2 className="text-lg font-black">Origen declarado</h2><div className="mt-4 space-y-2">{sources.map((row) => <div key={row.source} className="grid grid-cols-[1fr_70px_70px_110px] items-center gap-2 rounded-2xl bg-black/20 px-4 py-3 text-sm"><span className="font-semibold">{row.source}</span><span className="text-right text-white/45">{row.agendas} ag.</span><span className="text-right text-white/45">{row.buyers} buy.</span><strong className="text-right text-emerald-300">{money(row.cash)}</strong></div>)}</div></section></div>
}

function Pieces({ rows }: { rows: Response["pieces"] }) {
  return <section className="overflow-hidden rounded-[26px] border border-white/10 bg-white/[.035]"><div className="border-b border-white/10 px-5 py-4"><h2 className="text-lg font-black">Piezas cruzadas con Notion/CRM</h2><p className="mt-1 text-xs text-white/45">Solo piezas con identidad explícita. Si el tag no permite reconocer la pieza, queda a nivel ángulo y pasa a revisión.</p></div><div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{rows.length ? rows.map((row) => <article key={row.id} className="rounded-2xl border border-white/[.08] bg-black/20 p-4"><div className="flex flex-wrap gap-2 text-[10px] font-black uppercase"><span className="rounded-full bg-fuchsia-500/15 px-2.5 py-1 text-fuchsia-200">{row.angle}</span>{row.format && <span className="rounded-full bg-white/[.07] px-2.5 py-1 text-white/50">{row.format}</span>}</div><h3 className="mt-3 line-clamp-3 text-sm font-bold leading-5">{row.title}</h3><div className="mt-4 flex gap-4 text-xs text-white/45"><span>{row.agendas} agendas</span><span>{row.buyers} buyers</span><strong className="text-emerald-300">{money(row.cash)}</strong></div></article>) : <p className="p-6 text-sm text-white/40">Todavía no hay suficientes tags unidos a un ID de pieza. El panel conserva la atribución por ángulo sin inventar el video.</p>}</div></section>
}

function ReviewQueue({ rows, onSaved }: { rows: ReviewItem[]; onSaved: () => void }) {
  if (!rows.length) return <div className="rounded-[26px] border border-emerald-500/20 bg-emerald-500/5 p-8 text-center text-emerald-200"><CheckCircle2 className="mx-auto mb-3 h-8 w-8"/><strong>No hay pendientes de trazabilidad.</strong></div>
  return <section className="space-y-3">{rows.map((row) => <ReviewCard key={row.id} row={row} onSaved={onSaved}/>)}</section>
}

function ReviewCard({ row, onSaved }: { row: ReviewItem; onSaved: () => void }) {
  const [angle, setAngle] = useState(row.candidateAngle && (SALES_ANGLES as readonly string[]).includes(row.candidateAngle) ? row.candidateAngle : "")
  const [archetype, setArchetype] = useState(row.candidateArchetype || "")
  const [saving, setSaving] = useState(false)
  async function save(status: "resolved" | "ignored") {
    setSaving(true)
    try {
      const response = await fetch("/api/trace-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ person_id: row.personId, name: row.name, status, angle_override: angle || null, archetype_override: archetype || null }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "No se pudo guardar")
      onSaved()
    } finally { setSaving(false) }
  }
  return <article className="rounded-[24px] border border-amber-500/20 bg-amber-500/[.045] p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><CircleAlert className="h-4 w-4 text-amber-300"/><h3 className="font-black">{row.name}</h3>{row.cash > 0 && <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-black text-emerald-300">{money(row.cash)}</span>}</div><p className="mt-2 text-sm text-amber-100/70">{row.reason}</p>{!!row.evidence.length && <p className="mt-2 text-xs text-white/35">Evidencia: {row.evidence.join(" · ")}</p>}</div>{row.fathomUrl && <a href={row.fathomUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-fuchsia-300 hover:underline">Ver Fathom</a>}</div><div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_auto]"><select value={angle} onChange={(event) => setAngle(event.target.value)} className="rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm"><option value="">Sin override de ángulo</option>{SALES_ANGLES.map((item) => <option key={item}>{item}</option>)}</select><select value={archetype} onChange={(event) => setArchetype(event.target.value)} className="rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm"><option value="">Sin arquetipo</option>{BUYER_ARCHETYPES.map((item) => <option key={item}>{item}</option>)}</select><div className="flex gap-2"><button disabled={saving} onClick={() => save("resolved")} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-black text-zinc-950 disabled:opacity-50">Validar</button><button disabled={saving} onClick={() => save("ignored")} className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-white/55 disabled:opacity-50">Ignorar</button></div></div></article>
}

function Metric({ label, value, icon: Icon, tone = "default" }: { label: string; value: string; icon: typeof Radar; tone?: string }) {
  const colors: Record<string, string> = { emerald: "text-emerald-300", fuchsia: "text-fuchsia-300", violet: "text-violet-300", amber: "text-amber-300", default: "text-white/60" }
  return <div className="rounded-[22px] border border-white/10 bg-gradient-to-b from-white/[.06] to-white/[.025] p-4"><Icon className={`mb-4 h-5 w-5 ${colors[tone]}`}/><div className="text-xl font-black sm:text-2xl">{value}</div><div className="mt-1 text-[11px] font-semibold leading-4 text-white/40">{label}</div></div>
}
function Mini({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl bg-black/20 p-3"><div className="text-sm font-black">{value}</div><div className="mt-1 text-[10px] uppercase text-white/35">{label}</div></div> }
function N({ v, strong = false }: { v: string | number; strong?: boolean }) { return <td className={`px-3 py-4 text-right ${strong ? "font-black text-emerald-300" : "text-white/65"}`}>{v}</td> }
