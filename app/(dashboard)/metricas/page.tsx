"use client"

import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { BarChart3 } from "lucide-react"
import { CrmPageIntro } from "@/components/crm-ui"

const MESES_DISPONIBLES = [
  { value: "2025-12", label: "Dic 2025" },
  { value: "2026-01", label: "Ene 2026" },
  { value: "2026-02", label: "Feb 2026" },
  { value: "2026-03", label: "Mar 2026" },
  { value: "2026-04", label: "Abr 2026" },
  { value: "2026-05", label: "May 2026" },
  { value: "2026-06", label: "Jun 2026" },
  { value: "2026-07", label: "Jul 2026" },
  { value: "2026-08", label: "Ago 2026" },
  { value: "2026-09", label: "Sep 2026" },
  { value: "2026-10", label: "Oct 2026" },
  { value: "2026-11", label: "Nov 2026" },
  { value: "2026-12", label: "Dic 2026" },
]

const SEMANAS: Record<string, Array<[number, number, string]>> = {
  "2025-12": [[1,7,"S1 1-7"],[8,14,"S2 8-14"],[15,21,"S3 15-21"],[22,28,"S4 22-28"],[29,31,"S5 29-31"]],
  "2026-01": [[1,4,"S1 1-4"],[5,11,"S2 5-11"],[12,18,"S3 12-18"],[19,25,"S4 19-25"],[26,31,"S5 26-31"]],
  "2026-02": [[2,8,"S1 2-8"],[9,15,"S2 9-15"],[16,22,"S3 16-22"],[23,28,"S4 23-28"]],
  "2026-03": [[1,8,"S1 1-8"],[9,15,"S2 9-15"],[16,22,"S3 16-22"],[23,31,"S4 23-31"]],
  "2026-04": [[1,5,"S1 1-5"],[6,12,"S2 6-12"],[13,19,"S3 13-19"],[20,26,"S4 20-26"],[27,30,"S5 27-30"]],
  "2026-05": [[1,3,"S1 1-3"],[4,10,"S2 4-10"],[11,17,"S3 11-17"],[18,24,"S4 18-24"],[25,31,"S5 25-31"]],
  "2026-06": [[1,7,"S1 1-7"],[8,14,"S2 8-14"],[15,21,"S3 15-21"],[22,30,"S4 22-30"]],
  "2026-07": [[1,5,"S1 1-5"],[6,12,"S2 6-12"],[13,19,"S3 13-19"],[20,26,"S4 20-26"],[27,31,"S5 27-31"]],
  "2026-08": [[1,9,"S1 1-9"],[10,16,"S2 10-16"],[17,23,"S3 17-23"],[24,31,"S4 24-31"]],
  "2026-09": [[1,6,"S1 1-6"],[7,13,"S2 7-13"],[14,20,"S3 14-20"],[21,27,"S4 21-27"],[28,30,"S5 28-30"]],
  "2026-10": [[1,4,"S1 1-4"],[5,11,"S2 5-11"],[12,18,"S3 12-18"],[19,25,"S4 19-25"],[26,31,"S5 26-31"]],
  "2026-11": [[1,8,"S1 1-8"],[9,15,"S2 9-15"],[16,22,"S3 16-22"],[23,30,"S4 23-30"]],
  "2026-12": [[1,6,"S1 1-6"],[7,13,"S2 7-13"],[14,20,"S3 14-20"],[21,27,"S4 21-27"],[28,31,"S5 28-31"]],
}

interface Setter {
  nombre: string
  conv_asig: number | null
  calendarios_enviados: number | null
  agendas: number
  agendas_calificadas: number
  cash_collected: number
  t_agenda: number | null
}

interface MetricasData {
  funnel: {
    total_agendas: number; calls_evaluables: number; calificadas: number; presentadas: number
    calif_presentadas: number; cierres: number; cierres_fe: number; cierres_be: number
    cierres_llamada: number; cierres_seguimiento: number
    canceladas_triage: number; no_show: number; no_response: number; sin_resultado: number
    pct_calificadas: number | null; show_total: number | null; show_calif: number | null
    show_sin_triage: number | null
    pct_canceladas_triage: number | null; pct_no_show: number | null; pct_no_response: number | null; pct_sin_resultado: number | null
    tc_total: number | null; tc_presentadas: number | null; tc_calificadas: number | null
    con_calificaba_realmente: number; calificaron_si_realmente: number; pct_calificaba_realmente: number | null
  }
  cash: {
    feccu: number; feccp: number; beccu: number; beccpp: number; cc_total: number
    fees_count: number; fees_sum: number; aov_dia1: number | null; aov_tc: number | null
  }
  setters: Setter[]
  nuevos_leads?: number | null
  conversaciones_asignadas_total?: number
  comparacion_cierre?: {
    pagos_totales: number; unidades_cerradas: number
    tc_pagos_totales_agendas: number | null; tc_pagos_totales_presentadas: number | null; tc_pagos_totales_calificadas: number | null
    tc_unidades_agendas: number | null; tc_unidades_presentadas: number | null; tc_unidades_calificadas: number | null
  }
  cash_por_calificacion?: Array<{
    calificacion: string; cc_total: number; llamadas: number; presentadas: number; pagaron: number; cc_por_call: number | null
  }>
  cash_por_closer?: Array<{
    closer: string
    tiers: Array<{ calificacion: string; cc_total: number; llamadas: number; presentadas: number; pagaron: number; cc_por_call: number | null }>
  }>
  volumen?: {
    total: number
    por_cuenta: Array<{ nombre: string; cantidad: number }>
    por_ocupacion: Array<{ nombre: string; cantidad: number }>
    por_fuente: Array<{ nombre: string; cantidad: number }>
    por_manychat?: Array<{ nombre: string; cantidad: number }>
  }
}

const fmt$ = (n: number | null) => n === null || n === undefined ? "—"
  : "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtPct = (n: number | null) => n === null || n === undefined ? "—" : n.toFixed(1) + "%"

type EditingManual = { tipo: string; persona: string; val: string } | null

function mesActual() {
  const now = new Date()
  const valor = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  return MESES_DISPONIBLES.some(m => m.value === valor)
    ? valor
    : MESES_DISPONIBLES[MESES_DISPONIBLES.length - 1].value
}

export default function MetricasPage() {
  const [mes, setMes] = useState(mesActual)
  const [weekIdx, setWeekIdx] = useState(0)
  const [data, setData] = useState<MetricasData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingManual, setEditingManual] = useState<EditingManual>(null)
  const [savingConv, setSavingConv] = useState(false)
  const [tab, setTab] = useState<"general" | "volumen">("general")
  const inputRef = useRef<HTMLInputElement>(null)
  const [detail, setDetail] = useState<{ key: string; label: string } | null>(null)
  const [detailRows, setDetailRows] = useState<any[] | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    setLoading(true); setError(null)
    fetch(`/api/metricas?month=${mes}&week=${weekIdx}`)
      .then(r => r.json())
      .then(d => { if (d.error) { setError(d.error); setData(null) } else setData(d) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [mes, weekIdx])

  useEffect(() => { if (editingManual) inputRef.current?.focus() }, [editingManual])

  async function saveManual(tipo: string, persona: string, val: string) {
    if (!val.trim() || weekIdx === 0) return
    setSavingConv(true)
    await fetch("/api/metricas/conv-asig", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mes, semana: weekIdx, tipo, persona, valor: Number(val) }),
    })
    setSavingConv(false)
    setEditingManual(null)
    fetch(`/api/metricas?month=${mes}&week=${weekIdx}`)
      .then(r => r.json()).then(d => { if (!d.error) setData(d) })
  }

  const semanas = SEMANAS[mes] || []
  const f = data?.funnel
  const c = data?.cash
  const TARGET_USD = 50_000
  const [targetYear, targetMonth] = mes.split("-").map(Number)
  const targetDays = new Date(targetYear, targetMonth, 0).getDate()
  const now = new Date()
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const elapsedDays = mes === currentMonthKey ? Math.max(1, Math.min(now.getDate(), targetDays)) : targetDays
  const remainingDays = Math.max(0, targetDays - elapsedDays)
  const projectedCash = c ? (c.cc_total / elapsedDays) * targetDays : 0
  const remainingCash = c ? Math.max(0, TARGET_USD - c.cc_total) : TARGET_USD
  const requiredDaily = remainingDays > 0 ? remainingCash / remainingDays : remainingCash
  const requiredClosings = c?.aov_dia1 && c.aov_dia1 > 0 ? Math.ceil(remainingCash / c.aov_dia1) : null
  // El detalle clickeable de las cards esta disponible desde junio 2026 en
  // adelante (antes no hay garantia de que los datos esten reconciliados).
  const canDrill = mes >= "2026-06"

  async function openDetailUrl(url: string, label: string) {
    if (!canDrill) return
    setDetail({ key: url, label })
    setDetailLoading(true)
    setDetailRows(null)
    const res = await fetch(url)
    const json = await res.json()
    setDetailRows(json.rows || [])
    setDetailLoading(false)
  }

  function openDetail(key: string, label: string) {
    openDetailUrl(`/api/metricas/detalle?month=${mes}&week=${weekIdx}&key=${key}`, label)
  }

  function openVolumenDetail(field: string, value: string, blockTitle: string) {
    openDetailUrl(
      `/api/metricas/detalle?month=${mes}&week=${weekIdx}&key=volumen&field=${field}&value=${encodeURIComponent(value)}`,
      `${blockTitle} — ${value}`
    )
  }

  function openCashCalifDetail(tier: string, closer?: string) {
    const closerParam = closer ? `&closer=${encodeURIComponent(closer)}` : ""
    openDetailUrl(
      `/api/metricas/detalle?month=${mes}&week=${weekIdx}&key=cash_calificacion&tier=${tier}${closerParam}`,
      closer ? `Cash Collected — ${closer} — Lead ${tier}` : `Cash Collected — Lead ${tier}`
    )
  }

  const filterBtn = (active: boolean) =>
    `rounded-xl border px-3 py-2 text-sm font-bold transition-all duration-200 ${active
      ? "border-fuchsia-500/20 bg-gradient-to-br from-fuchsia-500 to-rose-400 text-white shadow-lg shadow-fuchsia-500/20"
      : "border-black/[.06] bg-white/55 text-muted-foreground hover:-translate-y-0.5 hover:bg-white hover:text-foreground dark:border-white/[.08] dark:bg-white/[.035]"}`

  return (
    <div className="crm-module-page metrics-page">
      <CrmPageIntro
        eyebrow="Rendimiento"
        title="Métricas"
        description=""
        icon={<BarChart3 className="h-6 w-6" />}
        tone="fuchsia"
      />

      {/* Filtros */}
      <div className="crm-toolbar !items-start">
        <div className="no-scrollbar flex max-w-full gap-2 overflow-x-auto pb-1">
          {MESES_DISPONIBLES.map(m => (
            <button key={m.value} onClick={() => { setMes(m.value); setWeekIdx(0) }}
              className={filterBtn(mes === m.value)}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 sm:justify-end">
          <button onClick={() => setWeekIdx(0)} className={filterBtn(weekIdx === 0)}>
            Mes completo
          </button>
          {semanas.map(([,, label], i) => (
            <button key={i} onClick={() => setWeekIdx(i + 1)} className={filterBtn(weekIdx === i + 1)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Pestañas */}
      <div className="grid grid-cols-2 gap-1 rounded-[18px] border border-white/70 bg-white/50 p-1.5 shadow-inner shadow-black/[.035] dark:border-white/10 dark:bg-white/[.03]">
        {([["general", "General"], ["volumen", "Volumen"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`rounded-2xl px-4 py-2.5 text-sm font-bold transition-all ${tab === key
              ? "bg-white text-foreground shadow-lg shadow-black/[.06] dark:bg-white/[.08]"
              : "text-muted-foreground hover:bg-white/50 hover:text-foreground dark:hover:bg-white/[.04]"}`}>
            {label}
          </button>
        ))}
      </div>

      {loading && <div className="text-muted-foreground text-sm">Cargando métricas...</div>}
      {error && <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-destructive text-sm">Error: {error}</div>}

      {data && !loading && tab === "general" && (
        <div className="space-y-8">
          {weekIdx === 0 && <section className="premium-panel overflow-hidden border-fuchsia-400/15 bg-gradient-to-br from-fuchsia-500/[.13] via-white/[.04] to-cyan-500/[.08] p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[.18em] text-fuchsia-400">Objetivo mensual</p>
                <div className="mt-2 flex items-end gap-3"><span className="text-4xl font-black tracking-tight sm:text-5xl">{fmt$(c!.cc_total)}</span><span className="pb-1 text-sm text-muted-foreground">de {fmt$(TARGET_USD)}</span></div>
                <div className="mt-4 h-3 overflow-hidden rounded-full bg-black/20"><div className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 via-violet-400 to-cyan-400 transition-all" style={{ width: `${Math.min(100, (c!.cc_total / TARGET_USD) * 100)}%` }} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatBox label="Avance" value={fmtPct((c!.cc_total / TARGET_USD) * 100)} sub={`${fmt$(remainingCash)} restantes`} />
                <StatBox label="Proyección" value={fmt$(projectedCash)} sub={`${fmt$(c!.cc_total)} ÷ ${elapsedDays} días × ${targetDays}`} />
                <StatBox label="Ritmo requerido" value={fmt$(requiredDaily)} sub={remainingDays ? `${fmt$(remainingCash)} ÷ ${remainingDays} días` : "mes cerrado"} />
                <StatBox label="Cierres estimados" value={requiredClosings === null ? "—" : String(requiredClosings)} sub={requiredClosings === null ? "sin AOV disponible" : `${fmt$(remainingCash)} ÷ AOV día 1 ${fmt$(c!.aov_dia1)}`} />
              </div>
            </div>
            <p className="mt-4 text-[11px] text-muted-foreground">Proyección lineal basada solo en cash collected y días transcurridos. Cierres estimados usa el AOV Día 1 disponible; no es una promesa ni incorpora datos inventados.</p>
          </section>}

          {/* ── FRONT END ─────────────────────────────────────── */}
          <section>
            <SectionTitle>Front End</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="premium-panel p-5">
                <h3 className="text-muted-foreground font-medium text-sm uppercase tracking-wide mb-4">Funnel</h3>
                <div className="space-y-3">
                  <FunnelRow label="Agendas totales" value={f!.total_agendas} max={f!.total_agendas} opacity={1} />
                  <FunnelRow label="Calificadas S/A/B" value={f!.calificadas} max={f!.total_agendas} opacity={0.8} />
                  <FunnelRow label="Presentadas" value={f!.presentadas} max={f!.total_agendas} opacity={0.6} />
                  <FunnelRow label="Calif. Presentadas" value={f!.calif_presentadas} max={f!.total_agendas} opacity={0.45} />
                  <FunnelRow label="Cierres FE" value={f!.cierres_fe} max={f!.total_agendas} opacity={0.3} />
                </div>
              </div>

              <div className="premium-panel p-5">
                <h3 className="text-muted-foreground font-medium text-sm uppercase tracking-wide mb-4">Tasas</h3>
                <div className="space-y-3">
                  <TasaRow label="Show Rate" value={fmtPct(f!.show_total)} desc={`${f!.presentadas} presentadas / ${f!.calls_evaluables} calls cuya fecha y hora ya ocurrieron`} />
                  <TasaRow label="Show (calificadas)" value={fmtPct(f!.show_calif)} desc={`${f!.calif_presentadas} / ${f!.calificadas}`} />
                  <TasaRow
                    label="Show calificado sin triage"
                    value={f!.show_sin_triage === null ? "No aplica" : fmtPct(f!.show_sin_triage)}
                    desc={f!.show_sin_triage === null
                      ? "0 canceladas calificadas por triage: sería idéntico al Show de calificadas"
                      : `${f!.calif_presentadas} / (S/A/B - canceladas por triage) · mínimo 60% · objetivo 75–80%`}
                  />
                  <TasaRow label="TC sobre agendas" value={fmtPct(f!.tc_total)} desc={`${f!.cierres_fe} cierres FE / ${f!.total_agendas}`} />
                  <TasaRow label="TC sobre presentadas" value={fmtPct(f!.tc_presentadas)} desc={`${f!.cierres_fe} / ${f!.presentadas}`} />
                  <TasaRow label="TC sobre calificadas" value={fmtPct(f!.tc_calificadas)} desc={`${f!.cierres_fe} / ${f!.calif_presentadas}`} />
                </div>
              </div>
            </div>

            {data.comparacion_cierre && (
              <div className="premium-panel mb-4 p-5">
                <h3 className="text-muted-foreground font-medium text-sm uppercase tracking-wide mb-1">Pagos Totales vs Unidades Cerradas</h3>
                <p className="text-muted-foreground text-xs mb-4">
                  Pagos Totales = Unidades Cerradas + Fees (el fee sí cuenta, es el pago del día 1 ligado a la llamada).
                  Las cuotas quedan afuera de los dos — se cobran después, sin una llamada nueva.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <StatBox
                    label="Pagos Totales"
                    value={String(data.comparacion_cierre.pagos_totales)}
                    sub="Unidades Cerradas + Fees"
                    onClick={canDrill ? () => openDetail("pagos_totales", "Pagos Totales") : undefined}
                  />
                  <StatBox
                    label="Unidades Cerradas"
                    value={String(data.comparacion_cierre.unidades_cerradas)}
                    sub="Solo gente que entró al programa"
                    onClick={canDrill ? () => openDetail("unidades_cerradas", "Unidades Cerradas") : undefined}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sobre Pagos Totales</p>
                    <TasaRow label="TC sobre agendas" value={fmtPct(data.comparacion_cierre.tc_pagos_totales_agendas)} desc={`${data.comparacion_cierre.pagos_totales} pagos / ${f!.total_agendas}`} />
                    <TasaRow label="TC sobre presentadas" value={fmtPct(data.comparacion_cierre.tc_pagos_totales_presentadas)} desc={`${data.comparacion_cierre.pagos_totales} / ${f!.presentadas}`} />
                    <TasaRow label="TC sobre calificadas" value={fmtPct(data.comparacion_cierre.tc_pagos_totales_calificadas)} desc={`${data.comparacion_cierre.pagos_totales} / ${f!.calif_presentadas}`} />
                  </div>
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sobre Unidades Cerradas</p>
                    <TasaRow label="TC sobre agendas" value={fmtPct(data.comparacion_cierre.tc_unidades_agendas)} desc={`${data.comparacion_cierre.unidades_cerradas} unidades / ${f!.total_agendas}`} />
                    <TasaRow label="TC sobre presentadas" value={fmtPct(data.comparacion_cierre.tc_unidades_presentadas)} desc={`${data.comparacion_cierre.unidades_cerradas} / ${f!.presentadas}`} />
                    <TasaRow label="TC sobre calificadas" value={fmtPct(data.comparacion_cierre.tc_unidades_calificadas)} desc={`${data.comparacion_cierre.unidades_cerradas} / ${f!.calif_presentadas}`} />
                  </div>
                </div>
              </div>
            )}

            <div className="premium-panel mb-4 p-5">
              <h3 className="text-muted-foreground font-medium text-sm uppercase tracking-wide mb-4">No Show</h3>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatBox label="Canceladas x Triage" value={String(f!.canceladas_triage)} sub={fmtPct(f!.pct_canceladas_triage)} onClick={canDrill ? () => openDetail("canceladas_triage", "Canceladas x Triage") : undefined} />
                <StatBox label="No Show" value={String(f!.no_show)} sub={fmtPct(f!.pct_no_show)} onClick={canDrill ? () => openDetail("no_show", "No Show") : undefined} />
                <StatBox label="No Response" value={String(f!.no_response)} sub={fmtPct(f!.pct_no_response)} onClick={canDrill ? () => openDetail("no_response", "No Response") : undefined} />
                <StatBox label="Sin resultado cargado" value={String(f!.sin_resultado)} sub={fmtPct(f!.pct_sin_resultado)} onClick={canDrill ? () => openDetail("sin_resultado", "Sin resultado cargado") : undefined} />
              </div>
            </div>

            <div className="premium-panel mb-4 p-5">
              <h3 className="text-muted-foreground font-medium text-sm uppercase tracking-wide mb-4">Calidad de Llamadas</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <StatBox
                  label="Calificaban de Verdad"
                  value={fmtPct(f!.pct_calificaba_realmente)}
                  sub={`${f!.calificaron_si_realmente} de ${f!.con_calificaba_realmente} S/A/B presentadas`}
                  onClick={canDrill ? () => openDetail("calificaba_realmente", "Calificaban de Verdad") : undefined}
                />
              </div>
            </div>

            <div className="premium-panel p-5">
              <h3 className="text-muted-foreground font-medium text-sm uppercase tracking-wide mb-4">Cash Collected — Front End</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatBox label="FECCU" value={fmt$(c!.feccu)} sub="Upfront" onClick={canDrill ? () => openDetail("feccu", "FECCU — Upfront") : undefined} />
                <StatBox label="FECCP" value={fmt$(c!.feccp)} sub="Plan de pago" onClick={canDrill ? () => openDetail("feccp", "FECCP — Plan de pago") : undefined} />
                <StatBox label="AOV Día 1" value={fmt$(c!.aov_dia1)} sub="Venta Nueva + Fee" onClick={canDrill ? () => openDetail("aov_dia1", "AOV Día 1 — Venta Nueva (En Call) + Fee") : undefined} />
                <StatBox label="AOV TC" value={fmt$(c!.aov_tc)} sub="Promedio por cierre" onClick={canDrill ? () => openDetail("aov_tc", "AOV TC — Promedio por cierre") : undefined} />
                <StatBox label="Fees" value={fmt$(c!.fees_sum)} sub={`${c!.fees_count} fee${c!.fees_count !== 1 ? "s" : ""}`} onClick={canDrill ? () => openDetail("fees", "Fees") : undefined} />
              </div>
            </div>
          </section>

          {/* ── BACK END ──────────────────────────────────────── */}
          <section>
            <SectionTitle>Back End</SectionTitle>
            <div className="premium-panel p-5">
              <h3 className="text-muted-foreground font-medium text-sm uppercase tracking-wide mb-4">Cash Collected — Back End</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatBox label="BECCU" value={fmt$(c!.beccu)} sub="Upfront (ventas internas)" onClick={canDrill ? () => openDetail("beccu", "BECCU — Upfront ventas internas") : undefined} />
                <StatBox label="BECCPP" value={fmt$(c!.beccpp)} sub="Plan de pago" onClick={canDrill ? () => openDetail("beccpp", "BECCPP — Plan de pago") : undefined} />
                <StatBox label="Cierres BE" value={String(f!.cierres_be)} sub="Venta Nueva Interna" onClick={canDrill ? () => openDetail("cierres_be", "Cierres BE — Venta Nueva Interna") : undefined} />
              </div>
            </div>
          </section>

          {/* ── TOTALES ───────────────────────────────────────── */}
          <section>
            <SectionTitle>Totales</SectionTitle>
            <div className="premium-panel p-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div
                  className={`md:col-span-2 ${canDrill ? "cursor-pointer" : ""}`}
                  onClick={canDrill ? () => openDetail("ingresos_totales", "Ingresos Totales") : undefined}
                >
                  <div className="text-muted-foreground text-xs uppercase tracking-wide">Ingresos Totales</div>
                  <div className="text-3xl font-bold text-primary mt-1">{fmt$(c!.cc_total)}</div>
                  <div className="text-muted-foreground text-xs mt-1">FECCU + FECCP + BECCU + BECCPP</div>
                </div>
                <StatBox label="FE Total" value={fmt$(c!.feccu + c!.feccp)} sub="FECCU + FECCP" onClick={canDrill ? () => openDetail("fe_total", "FE Total — FECCU + FECCP") : undefined} />
                <StatBox label="BE Total" value={fmt$(c!.beccu + c!.beccpp)} sub="BECCU + BECCPP" onClick={canDrill ? () => openDetail("be_total", "BE Total — BECCU + BECCPP") : undefined} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-border">
                <StatBox label="Cierres totales" value={String(f!.cierres)} sub={`FE: ${f!.cierres_fe} · BE: ${f!.cierres_be}`} onClick={canDrill ? () => openDetail("cierres_totales", "Cierres Totales") : undefined} />
                <StatBox label="Agendas" value={String(f!.total_agendas)} sub={`${fmtPct(f!.show_total)} show`} onClick={canDrill ? () => openDetail("agendas", "Agendas") : undefined} />
                <StatBox label="AOV Día 1" value={fmt$(c!.aov_dia1)} sub="Venta Nueva (En Call) + Fee" onClick={canDrill ? () => openDetail("aov_dia1", "AOV Día 1 — Venta Nueva (En Call) + Fee") : undefined} />
                <StatBox label="AOV TC" value={fmt$(c!.aov_tc)} sub="Promedio por cierre" onClick={canDrill ? () => openDetail("aov_tc", "AOV TC — Promedio por cierre") : undefined} />
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-border">
                <StatBox label="Unidades Cerradas en Llamada" value={String(f!.cierres_llamada)} sub="Venta Nueva (En Call)" onClick={canDrill ? () => openDetail("cierres_llamada", "Unidades Cerradas en Llamada") : undefined} />
                <StatBox label="Unidades Cerradas en Seguimiento" value={String(f!.cierres_seguimiento)} sub="Post Fee / Completó PIF / Interna" onClick={canDrill ? () => openDetail("cierres_seguimiento", "Unidades Cerradas en Seguimiento") : undefined} />
              </div>
            </div>
          </section>

          {/* ── CASH COLLECTED POR LEAD ─────────────────────────── */}
          {data.cash_por_calificacion && (
            <section>
              <SectionTitle>Cash Collected por Lead</SectionTitle>
              <p className="text-muted-foreground text-xs -mt-3 mb-4">
                Cash cobrado en el período atribuible a la cohorte de agendas del mismo período, dividido por calls presentadas. Incluye S/A/B/C/D y muestra siempre el tamaño de la muestra.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {data.cash_por_calificacion.map((row) => {
                  const tier = row.calificacion.replace("LEAD ", "")
                  return (
                    <StatBox
                      key={tier}
                      label={`Lead ${tier}`}
                      value={fmt$(row.cc_por_call)}
                      sub={`${fmt$(row.cc_total)} · ${row.pagaron} pagaron · ${row.presentadas}/${row.llamadas} presentadas`}
                      onClick={canDrill ? () => openCashCalifDetail(tier) : undefined}
                    />
                  )
                })}
              </div>
            </section>
          )}

          {/* ── CASH COLLECTED POR CLOSER ───────────────────────── */}
          {data.cash_por_closer && data.cash_por_closer.length > 0 && (
            <section>
              <SectionTitle>Cash Collected por Closer</SectionTitle>
              <p className="text-muted-foreground text-xs -mt-3 mb-4">
                Lo mismo que arriba, pero desglosado por closer — para ver cuánto deja cada tipo de lead según quién lo atienda.
              </p>
              <div className="premium-panel crm-scroll-shell p-5">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground text-xs border-b border-border">
                      <th className="text-left pb-3 pr-4 font-medium whitespace-nowrap">Closer</th>
                      {["S", "A", "B", "C", "D"].map(tier => (
                        <th key={tier} className="text-center pb-3 pr-4 font-medium whitespace-nowrap">Lead {tier}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.cash_por_closer.map((row) => (
                      <tr key={row.closer} className="border-b border-border last:border-0">
                        <td className="py-3 pr-4 text-foreground font-medium whitespace-nowrap">{row.closer}</td>
                        {row.tiers.map((t) => {
                          const tier = t.calificacion.replace("LEAD ", "")
                          return (
                            <td key={tier} className="py-3 pr-4 text-center">
                              <button
                                type="button"
                                onClick={canDrill ? () => openCashCalifDetail(tier, row.closer) : undefined}
                                disabled={!canDrill}
                                className={`inline-flex flex-col items-center ${canDrill ? "cursor-pointer hover:opacity-70" : ""}`}
                              >
                                <span className="font-semibold text-foreground">{fmt$(t.cc_por_call)}</span>
                                <span className="text-muted-foreground text-xs whitespace-nowrap">{t.presentadas}/{t.llamadas} pres.</span>
                              </button>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── SETTING ───────────────────────────────────────── */}
          <section>
            <SectionTitle>Setting</SectionTitle>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="premium-panel p-5 flex items-center justify-between gap-4">
                <div>
                  <div className="text-muted-foreground text-xs uppercase tracking-wide font-medium">Nuevos Leads</div>
                  <div className="text-muted-foreground text-xs mt-0.5">Nuevos leads que entraron a Instagram esta semana</div>
                </div>
                <div className="text-2xl font-bold text-foreground">
                  <EditableManualCell
                    tipo="nuevos_leads"
                    persona="General"
                    value={data.nuevos_leads ?? null}
                    editing={editingManual}
                    setEditing={setEditingManual}
                    onSave={saveManual}
                    saving={savingConv}
                    disabled={weekIdx === 0}
                    inputRef={inputRef}
                  />
                </div>
              </div>
              <div className="premium-panel p-5 flex items-center justify-between gap-4">
                <div>
                  <div className="text-muted-foreground text-xs uppercase tracking-wide font-medium">Conversaciones asignadas totales</div>
                  <div className="text-muted-foreground text-xs mt-0.5">Suma de todos los setters en el período</div>
                </div>
                <div className="text-2xl font-bold text-foreground">{data.conversaciones_asignadas_total ?? 0}</div>
              </div>
            </div>

            {data.setters.length > 0 ? (
              <div className="premium-panel p-5">
                <p className="text-muted-foreground text-xs mb-4">
                  Hacé clic en el <span className="text-foreground">—</span> de &quot;Conv. Asig.&quot; o &quot;Calendarios Enviados&quot; para cargarlo a mano.
                  {weekIdx === 0 && " Elegí una semana específica para poder editar (en \"Mes completo\" solo se muestra la suma)."}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-muted-foreground text-xs border-b border-border">
                        <th className="text-left pb-3 font-medium">Setter</th>
                        <th className="text-center pb-3 font-medium">Conv. Asig.</th>
                        <th className="text-center pb-3 font-medium">Calendarios Enviados</th>
                        <th className="text-center pb-3 font-medium">Agendas</th>
                        <th className="text-center pb-3 font-medium">Agendas Calificadas</th>
                        <th className="text-center pb-3 font-medium">CC comisionable ≤30 días</th>
                        <th className="text-center pb-3 font-medium">T. Agenda</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.setters.map((s, i) => (
                        <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/50">
                          <td className="py-3 text-foreground font-medium">{s.nombre}</td>
                          <td className="py-3 text-center">
                            <EditableManualCell
                              tipo="conversaciones_asignadas"
                              persona={s.nombre}
                              value={s.conv_asig}
                              editing={editingManual}
                              setEditing={setEditingManual}
                              onSave={saveManual}
                              saving={savingConv}
                              disabled={weekIdx === 0}
                              inputRef={inputRef}
                            />
                          </td>
                          <td className="py-3 text-center">
                            <EditableManualCell
                              tipo="calendarios_enviados"
                              persona={s.nombre}
                              value={s.calendarios_enviados}
                              editing={editingManual}
                              setEditing={setEditingManual}
                              onSave={saveManual}
                              saving={savingConv}
                              disabled={weekIdx === 0}
                              inputRef={inputRef}
                            />
                          </td>
                          <td className="py-3 text-center text-muted-foreground">{s.agendas}</td>
                          <td className="py-3 text-center text-muted-foreground">{s.agendas_calificadas}</td>
                          <td className="py-3 text-center font-semibold text-foreground">{fmt$(s.cash_collected)}</td>
                          <td className="py-3 text-center">
                            {s.t_agenda !== null
                              ? <span className={`font-semibold ${s.t_agenda >= 15 ? "text-emerald-600" : s.t_agenda >= 10 ? "text-amber-600" : "text-destructive"}`}>{fmtPct(s.t_agenda)}</span>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-4 rounded-xl border border-blue-500/15 bg-blue-500/[.06] px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                  Referencia orientativa de tasa de agenda: con menos de 3.000 leads, 10–15%; entre 3.000 y 10.000, alrededor de 5%; por encima de 10.000, 2–3%. La calidad del tráfico y del lead puede mover estos rangos.
                </p>
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">Sin datos de agendas para este período.</div>
            )}
          </section>

        </div>
      )}

      {data && !loading && tab === "volumen" && (
        <div className="space-y-6">
          {!data.volumen || data.volumen.total === 0 ? (
            <div className="text-muted-foreground text-sm">Sin datos de volumen para este período.</div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <VolumenBlock title="Agendas por cuenta" subtitle="Cuenta B vs Cuenta A" items={data.volumen.por_cuenta} total={data.volumen.total}
                  onItemClick={canDrill ? (v) => openVolumenDetail("cuenta", v, "Agendas por cuenta") : undefined} />
                <VolumenBlock title="Agendas por ocupación" subtitle="Negocio / Empleado / Estudiante" items={data.volumen.por_ocupacion} total={data.volumen.total}
                  onItemClick={canDrill ? (v) => openVolumenDetail("ocupacion", v, "Agendas por ocupación") : undefined} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <VolumenBlock title="Agendas por fuente" subtitle="Origen del agendamiento (top 15)" items={data.volumen.por_fuente} total={data.volumen.total}
                  onItemClick={canDrill ? (v) => openVolumenDetail("fuente", v, "Agendas por fuente") : undefined} />
                <VolumenBlock title="Apertura ManyChat" subtitle="Audio / Opción enviada en bienvenida" items={data.volumen.por_manychat || []} total={data.volumen.total}
                  onItemClick={canDrill ? (v) => openVolumenDetail("manychat", v, "Apertura ManyChat") : undefined} />
              </div>
              <p className="text-muted-foreground text-xs">
                El desglose por cuenta y ocupación depende de que esos campos estén cargados en la agenda.
                Hoy son más completos en los meses recientes; en agendas nuevas se irán llenando a medida que el equipo los complete en el CRM.
                {canDrill && " Hacé clic en cualquier barra para ver quién compone ese número."}
              </p>
            </>
          )}
        </div>
      )}

      {detail && (
        <DetailPanel
          label={detail.label}
          loading={detailLoading}
          rows={detailRows}
          onClose={() => { setDetail(null); setDetailRows(null) }}
        />
      )}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="text-lg font-semibold text-foreground">{children}</h2>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}

function EditableManualCell({
  tipo, persona, value, editing, setEditing, onSave, saving, disabled, inputRef,
}: {
  tipo: string
  persona: string
  value: number | null
  editing: EditingManual
  setEditing: (v: EditingManual) => void
  onSave: (tipo: string, persona: string, val: string) => void
  saving: boolean
  disabled: boolean
  inputRef: React.RefObject<HTMLInputElement | null>
}) {
  const isEditing = editing?.tipo === tipo && editing?.persona === persona
  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min={0}
        className="w-20 bg-background border border-border rounded px-2 py-1 text-foreground text-xs text-center focus:outline-none focus:ring-2 focus:ring-primary/30"
        value={editing.val}
        onChange={e => setEditing({ tipo, persona, val: e.target.value })}
        onKeyDown={e => {
          if (e.key === "Enter") onSave(tipo, persona, editing.val)
          if (e.key === "Escape") setEditing(null)
        }}
        onBlur={() => onSave(tipo, persona, editing.val)}
        disabled={saving}
      />
    )
  }
  if (disabled) {
    return <>{value !== null ? value : <span className="text-muted-foreground">—</span>}</>
  }
  return (
    <button
      onClick={() => setEditing({ tipo, persona, val: String(value ?? "") })}
      className="text-foreground hover:bg-muted rounded px-2 py-0.5 transition-colors min-w-[2rem]"
      title="Editar"
    >
      {value !== null ? value : <span className="text-muted-foreground">—</span>}
    </button>
  )
}

function VolumenBlock({ title, subtitle, items, total, onItemClick }: {
  title: string; subtitle: string; items: Array<{ nombre: string; cantidad: number }>; total: number
  onItemClick?: (value: string) => void
}) {
  const max = items.length > 0 ? Math.max(...items.map(i => i.cantidad)) : 0
  return (
    <div className="premium-panel p-5">
      <h3 className="text-foreground font-medium text-sm uppercase tracking-wide">{title}</h3>
      <p className="text-muted-foreground text-xs mb-4">{subtitle}</p>
      {items.length === 0 ? (
        <div className="text-muted-foreground text-sm">Sin datos.</div>
      ) : (
        <div className="space-y-3">
          {items.map((it, i) => {
            const pct = total > 0 ? (it.cantidad / total) * 100 : 0
            const barPct = max > 0 ? (it.cantidad / max) * 100 : 0
            return (
              <div
                key={i}
                className={onItemClick ? "cursor-pointer group" : ""}
                onClick={() => onItemClick?.(it.nombre)}
              >
                <div className="flex justify-between text-xs mb-1">
                  <span className={`text-foreground ${onItemClick ? "group-hover:underline" : ""}`}>{it.nombre}</span>
                  <span className="text-foreground font-medium">{it.cantidad} <span className="text-muted-foreground">({pct.toFixed(0)}%)</span></span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full bg-primary rounded-full transition-all ${onItemClick ? "group-hover:opacity-70" : ""}`} style={{ width: `${barPct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatBox({ label, value, sub, onClick }: { label: string; value: string; sub: string; onClick?: () => void }) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-gradient-to-br from-white/[.09] to-white/[.025] p-4 shadow-lg shadow-black/[.035] ${onClick ? "cursor-pointer transition hover:-translate-y-0.5 hover:border-fuchsia-400/25 hover:bg-white/[.12] hover:shadow-xl" : ""}`}
      onClick={onClick}
    >
      <div className="text-muted-foreground text-[11px] uppercase tracking-[.12em] font-black">{label}</div>
      <div className="text-2xl font-black mt-1 text-foreground">{value}</div>
      <div className="text-muted-foreground text-xs mt-0.5">{sub}</div>
    </div>
  )
}

function DetailPanel({ label, loading, rows, onClose }: { label: string; loading: boolean; rows: any[] | null; onClose: () => void }) {
  const isAgendas = !!rows && rows.length > 0 && "nombre" in rows[0]
  const showCalificaba = isAgendas && "calificaba_realmente" in (rows as any[])[0]
  const total = rows && !isAgendas ? rows.reduce((s, r) => s + (r.monto || 0), 0) : null
  if (typeof document === "undefined") return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="premium-panel max-h-[85vh] w-full max-w-3xl overflow-y-auto p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 gap-4">
          <h3 className="text-lg font-semibold text-foreground">{label}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">✕</button>
        </div>
        {loading ? (
          <div className="text-muted-foreground text-sm">Cargando...</div>
        ) : !rows || rows.length === 0 ? (
          <div className="text-muted-foreground text-sm">Sin registros para este período.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-xs border-b border-border">
                  {isAgendas ? (
                    <>
                      <th className="text-left pb-2 pr-4 font-medium whitespace-nowrap">Nombre</th>
                      <th className="text-left pb-2 pr-4 font-medium whitespace-nowrap">Instagram</th>
                      <th className="text-left pb-2 pr-4 font-medium whitespace-nowrap">Closer</th>
                      <th className="text-left pb-2 pr-4 font-medium whitespace-nowrap">Setter</th>
                      <th className="text-left pb-2 pr-4 font-medium whitespace-nowrap">Calif.</th>
                      <th className="text-left pb-2 pr-4 font-medium whitespace-nowrap">Show</th>
                      {showCalificaba && <th className="text-left pb-2 pr-4 font-medium whitespace-nowrap">Calificaba</th>}
                      <th className="text-left pb-2 font-medium whitespace-nowrap">F. Agenda</th>
                    </>
                  ) : (
                    <>
                      <th className="text-left pb-2 pr-4 font-medium whitespace-nowrap">Cliente</th>
                      <th className="text-left pb-2 pr-4 font-medium whitespace-nowrap">Tipo</th>
                      <th className="text-right pb-2 pr-4 font-medium whitespace-nowrap">Monto</th>
                      <th className="text-left pb-2 pr-4 font-medium whitespace-nowrap">Fecha</th>
                      <th className="text-left pb-2 font-medium whitespace-nowrap">Closer</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={i}
                    className={`border-b border-border last:border-0 hover:bg-muted/50${isAgendas && r.id ? " cursor-pointer" : ""}`}
                    onClick={isAgendas && r.id ? () => window.open(`/centro-agendas?q=${encodeURIComponent(r.nombre)}`, "_blank") : undefined}
                    title={isAgendas && r.id ? "Abrir en Centro de Agendas (pestaña nueva)" : undefined}
                  >
                    {isAgendas ? (
                      <>
                        <td className="py-2 pr-4 text-foreground font-medium whitespace-nowrap">{r.nombre}</td>
                        <td className="py-2 pr-4 whitespace-nowrap">
                          {r.instagram ? (
                            <a
                              href={`https://instagram.com/${String(r.instagram).replace(/^@/, "")}`}
                              target="_blank" rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-primary hover:underline"
                            >
                              @{String(r.instagram).replace(/^@/, "")}
                            </a>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">{r.closer || "—"}</td>
                        <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">{r.setter || "—"}</td>
                        <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">{r.calificacion || "—"}</td>
                        <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">{r.show === true ? "Show" : r.show === false ? "No Show" : "Pendiente"}</td>
                        {showCalificaba && (
                          <td className="py-2 pr-4 whitespace-nowrap">
                            {r.calificaba_realmente === "Si" ? (
                              <span className="text-emerald-600 font-medium">Sí</span>
                            ) : r.calificaba_realmente === "No" ? (
                              <span className="text-red-600 font-medium">No</span>
                            ) : "—"}
                          </td>
                        )}
                        <td className="py-2 text-muted-foreground whitespace-nowrap">{r.fecha_agenda?.slice(0, 10) || "—"}</td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 pr-4 text-foreground font-medium whitespace-nowrap">{r.cliente}</td>
                        <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">{r.tipo}</td>
                        <td className="py-2 pr-4 text-right text-foreground font-medium whitespace-nowrap">{fmt$(r.monto)}</td>
                        <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">{r.fecha?.slice(0, 10) || "—"}</td>
                        <td className="py-2 text-muted-foreground whitespace-nowrap">{r.closer || "—"}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-muted-foreground text-xs mt-3 pt-3 border-t border-border">
          {rows?.length ?? 0} registro{rows?.length !== 1 ? "s" : ""}
          {total !== null && ` · Suma: ${fmt$(total)}`}
        </p>
      </div>
    </div>,
    document.body,
  )
}

function FunnelRow({ label, value, max, opacity }: { label: string; value: number; max: number; opacity: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground font-medium">{value}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, opacity }} />
      </div>
    </div>
  )
}

function TasaRow({ label, value, desc }: { label: string; value: string; desc: string }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-border last:border-0">
      <div>
        <div className="text-foreground text-sm">{label}</div>
        <div className="text-muted-foreground text-xs">{desc}</div>
      </div>
      <div className="text-foreground font-bold text-base">{value}</div>
    </div>
  )
}
