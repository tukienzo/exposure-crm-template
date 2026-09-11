import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { revenueFromPlans } from "@/lib/revenue"
import { isCashCollectedType, sumCashCollected } from "@/lib/cash-collected"

export const dynamic = "force-dynamic"

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error("Missing Supabase config")
  return createClient(url, key)
}

// Meta mensual vigente del negocio (USD Cash Collected). Cuenta A la cambia
// cuando el negocio sostiene un nuevo nivel; hasta entonces es constante y
// explícita, nunca inferida de datos históricos.
const META_MENSUAL_USD = 50000

const CALIFS_AB = new Set(["LEAD S", "LEAD A", "LEAD B"])
const CIERRES_TIPOS = new Set([
  "Venta Nueva", "Venta Nueva (En Call)", "Venta Nueva (Post Fee)",
  "Completó PIF (Post Fee)", "Venta Nueva Interna",
])

function r2(n: number) { return Math.round(n * 100) / 100 }
function iso(d: Date) { return d.toISOString().slice(0, 10) }
function firstWord(s: string | null | undefined) { return (s || "").trim().split(/\s+/)[0] }
function stripAccents(s: string) { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() }

// Semana actual = lunes a domingo, calculada en UTC para ser consistente con
// como el resto del CRM guarda fecha_agenda/fecha (strings YYYY-MM-DD sin
// hora). Documentado explícitamente porque no hay una definición previa de
// "semana" para esta vista (la de Métricas/Equipo usa cortes manuales
// distintos, ver SEMANAS en app/api/metricas/route.ts).
function currentWeekRange(referenceIso?: string | null) {
  const ref = referenceIso ? new Date(`${referenceIso}T12:00:00Z`) : new Date()
  const day = ref.getUTCDay() // 0=domingo..6=sabado
  const diffToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate() + diffToMonday))
  const sunday = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 6))
  return { start: iso(monday), end: iso(sunday) }
}

// Cuenta cuántas semanas lunes-domingo tocan el mes (para prorratear el
// objetivo mensual en un objetivo semanal explícito y auditable).
function weeksTouchingMonth(year: number, monthIdx0: number): number {
  const first = new Date(Date.UTC(year, monthIdx0, 1))
  const last = new Date(Date.UTC(year, monthIdx0 + 1, 0))
  const firstMonday = new Date(first)
  const day = firstMonday.getUTCDay()
  firstMonday.setUTCDate(firstMonday.getUTCDate() + (day === 0 ? -6 : 1 - day))
  let weeks = 0
  let cursor = new Date(firstMonday)
  while (cursor <= last) {
    weeks++
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() + 7))
  }
  return weeks
}

// Semanas lunes-domingo restantes en el mes, incluyendo la semana actual,
// contadas por su lunes de inicio.
function weeksRemainingInMonth(nowIso: string, monthStartIso: string, monthEndIso: string): number {
  let weeks = 0
  let cursor = new Date(`${currentWeekRange(nowIso).start}T12:00:00Z`)
  const monthEnd = new Date(`${monthEndIso}T12:00:00Z`)
  while (cursor <= monthEnd) {
    weeks++
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() + 7))
  }
  return Math.max(1, weeks)
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const refParam = searchParams.get("date")
    const { start, end } = currentWeekRange(refParam)

    const now = refParam ? new Date(`${refParam}T12:00:00Z`) : new Date()
    const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`
    const monthEndDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
    const monthEnd = iso(monthEndDate)

    const sb = getSupabase()

    const [
      { data: agendas, error: aErr },
      { data: pagos, error: pErr },
      { data: planesAlta, error: plErr },
      { data: pagosMTD, error: pmErr },
    ] = await Promise.all([
      sb.from("agendas")
        .select("fuente,closer,setter,show,calificacion,fecha_agenda,cerro")
        .or("estado.is.null,estado.neq.Archivada manualmente")
        .gte("fecha_agenda", `${start}T00:00:00`).lte("fecha_agenda", `${end}T23:59:59`),
      sb.from("pagos")
        .select("fecha,closer,tipo,monto")
        .eq("record_status", "active")
        .gte("fecha", start).lte("fecha", end),
      sb.from("planes_pago")
        .select("id,closer,operacion,fecha_alta")
        .gte("fecha_alta", start).lte("fecha_alta", end),
      // Cash Collected mes-a-la-fecha, para calcular ritmo requerido restante.
      sb.from("pagos")
        .select("monto,tipo")
        .eq("record_status", "active")
        .gte("fecha", monthStart).lte("fecha", monthEnd),
    ])
    if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 })
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
    if (plErr) return NextResponse.json({ error: plErr.message }, { status: 500 })
    if (pmErr) return NextResponse.json({ error: pmErr.message }, { status: 500 })

    const a = agendas || []
    const p = pagos || []
    const plans = planesAlta || []

    // AGENDAS POR ORIGEN (fuente)
    const porOrigen = new Map<string, number>()
    for (const row of a) {
      const key = (row.fuente || "").trim() || "Sin dato"
      porOrigen.set(key, (porOrigen.get(key) || 0) + 1)
    }

    // SCORING / CALIDAD
    const totalAgendas = a.length
    const calificadas = a.filter(r => CALIFS_AB.has(r.calificacion || "")).length
    const scoring = ["LEAD S", "LEAD A", "LEAD B", "LEAD C", "LEAD D"].map(label => ({
      calificacion: label,
      cantidad: a.filter(r => r.calificacion === label).length,
    }))

    // PRESENTADAS
    const presentadas = a.filter(r => r.show).length

    // VENTAS (unidades) de la semana
    const ventasArr = p.filter(x => CIERRES_TIPOS.has(x.tipo || ""))
    const ventas = ventasArr.length

    // CASH COLLECTED total semanal (todos los tipos que efectivamente cobran)
    const cashTotal = sumCashCollected(p)

    // REVENUE contractual de la semana (planes dados de alta en el rango)
    const revenueTotal = r2(revenueFromPlans(plans))

    // POR CLOSER: revenue (planes) + cash collected (pagos), unificados por
    // primer nombre normalizado (mismo criterio que leaderboard/metricas).
    const closerKey = (s: string | null | undefined) => stripAccents(firstWord(s))
    const closerLabel = new Map<string, string>()
    const porCloser = new Map<string, { revenue: number; cash: number; ventas: number; llamadas: number; cerradas: number }>()
    function ensureCloser(raw: string | null | undefined) {
      const key = closerKey(raw)
      if (!key || key === "sin") return null
      if (!closerLabel.has(key)) closerLabel.set(key, firstWord(raw))
      if (!porCloser.has(key)) porCloser.set(key, { revenue: 0, cash: 0, ventas: 0, llamadas: 0, cerradas: 0 })
      return key
    }
    for (const plan of plans) {
      const key = ensureCloser(plan.closer)
      if (!key) continue
      porCloser.get(key)!.revenue += revenueFromPlans([plan])
    }
    for (const pago of p) {
      const key = ensureCloser(pago.closer)
      if (!key) continue
      const d = porCloser.get(key)!
      if (isCashCollectedType(pago.tipo)) d.cash += pago.monto || 0
      if (CIERRES_TIPOS.has(pago.tipo || "")) d.ventas += 1
    }
    for (const ag of a) {
      const key = ensureCloser(ag.closer)
      if (!key) continue
      const d = porCloser.get(key)!
      if (ag.show) {
        d.llamadas += 1
        if (ag.cerro) d.cerradas += 1
      }
    }
    const closers = Array.from(porCloser.entries())
      .map(([key, d]) => ({
        closer: closerLabel.get(key) || key,
        revenue: r2(d.revenue),
        cash_collected: r2(d.cash),
        ventas: d.ventas,
        llamadas_presentadas: d.llamadas,
        cerradas: d.cerradas,
        tasa_cierre: d.llamadas > 0 ? r2((d.cerradas / d.llamadas) * 100) : null,
      }))
      .sort((x, y) => y.cash_collected - x.cash_collected)

    // OBJETIVO SEMANAL: meta mensual prorrateada por la cantidad real de
    // semanas lunes-domingo que tocan el mes en curso. Fórmula explícita:
    // objetivo_semanal = META_MENSUAL_USD / semanas_del_mes.
    const weeksInMonth = weeksTouchingMonth(now.getUTCFullYear(), now.getUTCMonth())
    const objetivoSemanal = r2(META_MENSUAL_USD / weeksInMonth)
    const avanceObjetivoPct = objetivoSemanal > 0 ? r2((cashTotal / objetivoSemanal) * 100) : null

    // RITMO NECESARIO: cuánto Cash Collected promedio por semana hace falta
    // en las semanas restantes del mes (incluida esta) para llegar a la meta
    // mensual, dado lo ya cobrado en el mes hasta la fecha.
    const cashMTD = sumCashCollected(pagosMTD || [])
    const semanasRestantes = weeksRemainingInMonth(iso(now), monthStart, monthEnd)
    const faltanteMensual = r2(Math.max(0, META_MENSUAL_USD - cashMTD))
    const ritmoNecesarioSemanal = r2(faltanteMensual / semanasRestantes)

    return NextResponse.json({
      periodo: { start, end, tz_note: "Semana lunes-domingo en UTC (fecha_agenda/fecha sin hora)." },
      agendas_por_origen: Array.from(porOrigen.entries())
        .map(([nombre, cantidad]) => ({ nombre, cantidad }))
        .sort((x, y) => y.cantidad - x.cantidad),
      scoring: {
        total_agendas: totalAgendas,
        calificadas,
        pct_calificadas: totalAgendas > 0 ? r2((calificadas / totalAgendas) * 100) : null,
        desglose: scoring,
      },
      presentadas: { cantidad: presentadas, denominador_agendas: totalAgendas },
      ventas: { cantidad: ventas },
      revenue: { total: revenueTotal, formula: "Suma de planes_pago.operacion (contrato) dados de alta en la semana, deduplicados." },
      cash_collected: { total: cashTotal, formula: "Suma de pagos.monto de tipos que efectivamente cobran, con pagos.fecha en la semana." },
      por_closer: closers,
      meta_mensual: {
        valor: META_MENSUAL_USD,
        semanas_del_mes: weeksInMonth,
        objetivo_semanal: objetivoSemanal,
        formula_objetivo_semanal: "meta_mensual / semanas_lunes_domingo_del_mes_en_curso",
        avance_semana_actual_pct: avanceObjetivoPct,
        cash_collected_mes_a_la_fecha: cashMTD,
        faltante_mensual: faltanteMensual,
        semanas_restantes_incluyendo_actual: semanasRestantes,
        ritmo_necesario_semanal: ritmoNecesarioSemanal,
        formula_ritmo: "max(0, meta_mensual - cash_collected_mes_a_la_fecha) / semanas_restantes_incluyendo_actual",
      },
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error de servidor" }, { status: 500 })
  }
}
