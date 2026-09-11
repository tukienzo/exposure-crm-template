import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { CUENTA_A_LABEL, CUENTA_B_LABEL } from "@/lib/equipo"
import { normalizeBusinessAccount } from "@/lib/business-account"

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error("Missing Supabase config")
  return createClient(url, key)
}

const SEMANAS: Record<string, Array<[number, number]>> = {
  "2025-12": [[1,7],[8,14],[15,21],[22,28],[29,31]],
  "2026-01": [[1,4],[5,11],[12,18],[19,25],[26,31]],
  "2026-02": [[2,8],[9,15],[16,22],[23,28]],
  "2026-03": [[1,8],[9,15],[16,22],[23,31]],
  "2026-04": [[1,5],[6,12],[13,19],[20,26],[27,30]],
  "2026-05": [[1,3],[4,10],[11,17],[18,24],[25,31]],
  "2026-06": [[1,7],[8,14],[15,21],[22,30]],
  "2026-07": [[1,5],[6,12],[13,19],[20,26],[27,31]],
  "2026-08": [[1,9],[10,16],[17,23],[24,31]],
  "2026-09": [[1,6],[7,13],[14,20],[21,27],[28,30]],
  "2026-10": [[1,4],[5,11],[12,18],[19,25],[26,31]],
  "2026-11": [[1,8],[9,15],[16,22],[23,30]],
  "2026-12": [[1,6],[7,13],[14,20],[21,27],[28,31]],
}

const FECCU_TIPOS = new Set([
  "Fee", "Refuerzo de Fee",
  "Venta Nueva", "Venta Nueva (En Call)", "Venta Nueva (Post Fee)",
  "Completó PIF (Post Fee)",
])
const FECCP_TIPOS = new Set([
  "Completó PIF + Acceso Total Consulting",
  "Completa Total (Post Venta)",
  "Completa Total + Acceso Acción",
  "Completa Total y Finaliza Pago",
  "Cuota", "Cuota 1", "Cuota 2", "Cuota 3", "Cuota 4", "Cuota 5", "Cuota 6", "Cuota 7", "Cuota 8",
])
const BECCU_TIPOS = new Set(["Fee Venta Interna", "Venta Nueva Interna"])
const BECCPP_TIPOS = new Set(["Cuota Venta Interna"])
const CIERRES_TIPOS = new Set([
  "Venta Nueva", "Venta Nueva (En Call)", "Venta Nueva (Post Fee)",
  "Completó PIF (Post Fee)", "Venta Nueva Interna",
])

function getDateRange(mes: string, weekIdx: number): { start: string; end: string } {
  const [year, mon] = mes.split("-").map(Number)
  const lastDay = new Date(year, mon, 0).getDate()
  const pad = (n: number) => String(n).padStart(2, "0")
  if (weekIdx > 0) {
    const weeks = SEMANAS[mes]
    if (weeks && weeks[weekIdx - 1]) {
      const [s, e] = weeks[weekIdx - 1]
      return { start: `${mes}-${pad(s)}`, end: `${mes}-${pad(Math.min(e, lastDay))}` }
    }
  }
  return { start: `${mes}-01`, end: `${mes}-${pad(lastDay)}` }
}

function argentinaAgendaBoundary(date: string, end = false): string {
  return new Date(`${date}T${end ? "23:59:59" : "00:00:00"}-03:00`).toISOString().slice(0, 19)
}

// Para "cash collected por call": SOLO Fee y Venta Nueva (En Call) — los
// unicos dos tipos que efectivamente pasan por una llamada.
const CASH_POR_CALL_TIPOS = new Set(["Fee", "Venta Nueva (En Call)"])

// Filtros de pagos por "card" de la pantalla de Métricas — deben coincidir
// exactamente con las definiciones usadas en app/api/metricas/route.ts.
type PagoRow = { tipo: string; operacion?: string | null }
// La categoría depende del tipo de cobro, no del producto. Mastermind puede
// ser una venta nueva frontend y no debe convertirse en backend por su nombre.
const backend = (r: PagoRow) => BECCU_TIPOS.has(r.tipo) || BECCPP_TIPOS.has(r.tipo)
const beccpp = (r: PagoRow) => BECCPP_TIPOS.has(r.tipo)
const beccu = (r: PagoRow) => backend(r) && !beccpp(r)
const PAGO_FILTERS: Record<string, (row: PagoRow) => boolean> = {
  feccu: r => !backend(r) && FECCU_TIPOS.has(r.tipo),
  feccp: r => !backend(r) && FECCP_TIPOS.has(r.tipo),
  beccu,
  beccpp,
  fees: r => r.tipo === "Fee" || r.tipo === "Refuerzo de Fee",
  cierres_be: r => r.tipo === "Venta Nueva Interna",
  cierres_llamada: r => r.tipo === "Venta Nueva (En Call)",
  cierres_seguimiento: r => r.tipo === "Venta Nueva (Post Fee)" || r.tipo === "Completó PIF (Post Fee)" || r.tipo === "Venta Nueva Interna",
  cierres_totales: r => CIERRES_TIPOS.has(r.tipo),
  fe_total: r => !backend(r) && (FECCU_TIPOS.has(r.tipo) || FECCP_TIPOS.has(r.tipo)),
  be_total: backend,
  ingresos_totales: r => backend(r) || FECCU_TIPOS.has(r.tipo) || FECCP_TIPOS.has(r.tipo),
  aov_dia1: r => r.tipo === "Venta Nueva (En Call)" || r.tipo === "Fee",
  aov_tc: r => CIERRES_TIPOS.has(r.tipo),
  pagos_totales: r => CIERRES_TIPOS.has(r.tipo) || r.tipo === "Fee" || r.tipo === "Refuerzo de Fee" || r.tipo === "Fee Venta Interna",
  unidades_cerradas: r => CIERRES_TIPOS.has(r.tipo),
}

// Misma normalización que usa el tally() de Volumen en app/api/metricas/route.ts,
// para que el detalle de una barra (ej. "Instagram RMKT") filtre exactamente
// los mismos registros que se contaron ahí.
const SIN = "Sin dato"
function normalizeVolumenVal(field: string, raw: unknown): string {
  const v = (raw || "").toString().trim()
  if (field === "cuenta") {
    if (!v || v === "-" || v === "No se le envió") return SIN
    const low = v.toLowerCase()
    const cuenta = normalizeBusinessAccount(low)
    if (cuenta === "cris") return CUENTA_B_LABEL
    if (cuenta === "paul") return CUENTA_A_LABEL
    return v
  }
  if (field === "ocupacion" || field === "manychat") {
    if (!v || v === "-" || v === "No se le envió") return "No se le envió"
    return v
  }
  // fuente (y cualquier otro campo por default)
  if (!v || v === "-" || v === "No se le envió") return SIN
  return v
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const mes = searchParams.get("month")
    const weekIdx = parseInt(searchParams.get("week") || "0")
    const key = searchParams.get("key") || ""
    if (!mes) return NextResponse.json({ error: "Falta month" }, { status: 400 })

    const { start, end } = getDateRange(mes, weekIdx)
    const sb = getSupabase()

    if (key === "agendas") {
      const { data, error } = await sb
        .from("agendas")
        .select("id,person_id,telefono,nombre,instagram,closer,setter,calificacion,show,fecha_agenda,fecha_closer")
        .or("estado.is.null,estado.neq.Archivada manualmente")
        .gte("fecha_agenda", argentinaAgendaBoundary(start))
        .lte("fecha_agenda", argentinaAgendaBoundary(end, true))
        .order("fecha_agenda", { ascending: false })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const seen = new Set<string>()
      const rows = (data || []).filter((agenda: any) => {
        const phone = String(agenda.telefono || "").replace(/\D/g, "")
        const name = String(agenda.nombre || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "")
        const identity = agenda.person_id ? `person:${agenda.person_id}` : phone ? `phone:${phone}` : `name:${name}`
        const dedupeKey = `${String(agenda.setter || "").trim().split(/\s+/)[0].toLowerCase()}:${identity}`
        if (seen.has(dedupeKey)) return false
        seen.add(dedupeKey)
        return true
      })
      return NextResponse.json({ kind: "agendas", rows })
    }

    if (key === "canceladas_triage" || key === "no_show" || key === "no_response" || key === "sin_resultado") {
      const { data, error } = await sb
        .from("agendas")
        .select("id,nombre,instagram,closer,setter,calificacion,show,estado,fecha_agenda,fecha_closer,call_confirmer")
        .or("estado.is.null,estado.neq.Archivada manualmente")
        .gte("fecha_closer", `${start}T00:00:00`)
        .lte("fecha_closer", `${end}T23:59:59`)
        .order("fecha_agenda", { ascending: false })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const nowMs = Date.now()
      const noShows = (data || []).filter((r: any) => {
        const scheduled = r.fecha_closer ? new Date(r.fecha_closer).getTime() : NaN
        return Number.isFinite(scheduled) && scheduled <= nowMs && r.show !== true && r.estado !== "Cancelado"
      })
      const rows = key === "canceladas_triage"
        ? noShows.filter((r: any) => (r.call_confirmer || "").includes("Triage"))
        : key === "no_response"
        ? noShows.filter((r: any) => r.call_confirmer === "No Respondió")
        : key === "sin_resultado"
        ? noShows.filter((r: any) => r.show == null && !(r.call_confirmer || "").includes("Triage") && r.call_confirmer !== "No Respondió")
        : noShows.filter((r: any) => r.show === false && !(r.call_confirmer || "").includes("Triage") && r.call_confirmer !== "No Respondió")
      return NextResponse.json({ kind: "agendas", rows })
    }

    if (key === "calificaba_realmente") {
      const { data, error } = await sb
        .from("agendas")
        .select("id,nombre,instagram,closer,setter,calificacion,show,fecha_agenda,fecha_closer,calificaba_realmente")
        .or("estado.is.null,estado.neq.Archivada manualmente")
        .eq("show", true)
        .in("calificacion", ["LEAD S", "LEAD A", "LEAD B"])
        .gte("fecha_closer", `${start}T00:00:00`)
        .lte("fecha_closer", `${end}T23:59:59`)
        .order("fecha_closer", { ascending: false })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const rows = (data || []).filter((r: any) => r.calificaba_realmente === "Si" || r.calificaba_realmente === "No")
      return NextResponse.json({ kind: "agendas", rows })
    }

    if (key === "volumen") {
      const field = searchParams.get("field") || ""
      const value = searchParams.get("value") || ""
      if (!["cuenta", "ocupacion", "fuente", "manychat"].includes(field)) {
        return NextResponse.json({ error: "field inválido" }, { status: 400 })
      }
      const { data, error } = await sb
        .from("agendas")
        .select("id,nombre,instagram,closer,setter,calificacion,show,fecha_agenda,cuenta,fuente,ocupacion,manychat")
        .or("estado.is.null,estado.neq.Archivada manualmente")
        .gte("fecha_agenda", `${start}T00:00:00`)
        .lte("fecha_agenda", `${end}T23:59:59`)
        .order("fecha_agenda", { ascending: false })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const rows = (data || []).filter((r: any) => normalizeVolumenVal(field, r[field]) === value)
      return NextResponse.json({ kind: "agendas", rows })
    }

    if (key === "cash_calificacion") {
      const tier = searchParams.get("tier") || ""
      const closer = searchParams.get("closer") || ""
      if (!["S", "A", "B", "C"].includes(tier)) {
        return NextResponse.json({ error: "tier inválido" }, { status: 400 })
      }
      const label = `LEAD ${tier}`
      const { data, error } = await sb
        .from("pagos")
        .select("cliente,tipo,monto,fecha,closer,calificacion")
        .eq("record_status", "active")
        .eq("calificacion", label)
        .gte("fecha", start)
        .lte("fecha", end)
        .order("fecha", { ascending: false })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const closerKeyOf = (s: string) => (s || "").trim().split(/\s+/)[0].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      const closerTarget = closerKeyOf(closer)
      const rows = (data || [])
        .filter(r => CASH_POR_CALL_TIPOS.has(r.tipo))
        .filter(r => !closer || closerKeyOf(r.closer || "") === closerTarget)
      return NextResponse.json({ kind: "pagos", rows })
    }

    const filterFn = PAGO_FILTERS[key]
    if (!filterFn) return NextResponse.json({ error: "key inválida" }, { status: 400 })

    const { data, error } = await sb
      .from("pagos")
      .select("cliente,tipo,monto,fecha,closer,operacion")
      .eq("record_status", "active")
      .gte("fecha", start)
      .lte("fecha", end)
      .order("fecha", { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const rows = (data || []).filter(r => filterFn(r as PagoRow))
    return NextResponse.json({ kind: "pagos", rows })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 })
  }
}
