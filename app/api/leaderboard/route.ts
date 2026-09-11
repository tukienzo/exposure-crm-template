import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { applyStrikes, closerTopTarget, closerUnlockedRate, frontendCohort, setterUnlockedRate, withinSetterWindow } from "@/lib/commission-scheme"
import { canonicalCloserName } from "@/lib/equipo"
import { normalizeBusinessAccount } from "@/lib/business-account"

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error("Missing Supabase config")
  return createClient(url, key)
}

// CC Nuevo: cash de CLIENTE NUEVO. Las ventas internas/upsell (cliente que ya pagó) NO cuentan acá.
const CC_NUEVO_TIPOS = new Set([
  "Venta Nueva", "Venta Nueva (En Call)", "Venta Nueva (Post Fee)",
  "Completó PIF", "Completó PIF (Post Fee)",
  "Fee", "Refuerzo de Fee",
  "Adentro en Seguimiento", "Adentro en Seguimiento y Post Fee",
])

// Unidades: solo adquisiciones de cliente NUEVO (no fees, no ventas internas/upsell a cliente existente)
const UNIDAD_TIPOS = new Set([
  "Venta Nueva", "Venta Nueva (En Call)", "Venta Nueva (Post Fee)",
  "Completó PIF", "Completó PIF (Post Fee)",
])

// Se conserva el esquema histórico para no recalcular meses anteriores a
// agosto de 2026 con reglas que todavía no existían.
const LEGACY_CC_100 = new Set([
  "Venta Nueva", "Venta Nueva (En Call)", "Venta Nueva (Post Fee)", "Venta Nueva Interna",
  "Venta Interna", "Completó PIF", "Completó PIF (Post Fee)", "Fee", "Fee Venta Interna",
  "Refuerzo de Fee", "Adentro en Seguimiento", "Adentro en Seguimiento y Post Fee",
])
const LEGACY_CC_50 = new Set([
  "Cuota", "Cuota 1", "Cuota 2", "Cuota 3", "Cuota 4", "Cuota 5", "Cuota 6", "Cuota 7", "Cuota 8",
  "Cuota Venta Interna", "Completa Total (Post Venta)", "Completa Total y Finaliza Pago",
  "Completa Total + Acceso Acción",
  "Completó PIF + Acceso Total Consulting",
])

// Ex-integrantes: se ocultan del ranking desde el mes indicado, sin tocar sus
// registros históricos. Se configuran en .env: CRM_SETTERS_INACTIVOS,
// CRM_CLOSERS_INACTIVOS (nombres separados por coma) y CRM_INACTIVOS_DESDE ("AAAA-MM").
const listaEnv = (v: string | undefined) => String(v || "").split(",").map((x) => x.trim()).filter(Boolean)
const SETTERS_FUERA = new Set(listaEnv(process.env.CRM_SETTERS_INACTIVOS))
const SETTERS_FUERA_DESDE = process.env.CRM_INACTIVOS_DESDE || "2000-01"
const CLOSERS_FUERA = new Set(listaEnv(process.env.CRM_CLOSERS_INACTIVOS))
const CLOSERS_FUERA_DESDE = process.env.CRM_INACTIVOS_DESDE || "2000-01"
// El dueño que también cierra se mantiene visible en el ranking aunque en el
// mes no tenga pagos ni llamadas (CRM_OWNER_CLOSER_NAME, opcional).
const OWNER_CLOSER = String(process.env.CRM_OWNER_CLOSER_NAME || "").trim()

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
}

function firstWord(name: string): string {
  return name.trim().split(/\s+/)[0]
}

// Metas personales por mes y persona (primer nombre en minúsculas), en JSON:
// CRM_METAS_PERSONALES='{"2026-09":{"ana":35000,"bruno":30000}}'
const PERSONAL_MONTHLY_GOALS: Record<string, Record<string, number>> = (() => {
  try { return JSON.parse(process.env.CRM_METAS_PERSONALES || "{}") } catch { return {} }
})()

function personalMonthlyGoal(month: string, name: string): number | null {
  const key = firstWord(name).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  return PERSONAL_MONTHLY_GOALS[month]?.[key] ?? null
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
}
// Los alias de closers (NEXT_PUBLIC_CRM_CLOSER_ALIASES) unifican a la misma persona.
function canonical(name: string): string {
  return firstWord(canonicalCloserName(name))
}

function isRealMember(name: string): boolean {
  const value = stripAccents(name).replace(/[^a-z0-9]+/g, " ").trim()
  return Boolean(value) && !["sin", "sin setter", "sin asignar", "sin asignado", "no setter"].includes(value)
}

function paymentAccount(value: string | null | undefined): "paul" | "cristian" | null {
  const cuenta = normalizeBusinessAccount(value)
  if (cuenta === "paul") return "paul"
  if (cuenta === "cris") return "cristian"
  return null
}

// Fees: mismo concepto que usa Carga de Pagos / Pipeline para "seña".
const FEE_TIPOS = new Set(["Fee", "Refuerzo de Fee", "Fee Venta Interna"])
const BECCU_TIPOS = new Set(["Fee Venta Interna", "Venta Nueva Interna"])

function round2(n: number) { return Math.round(n * 100) / 100 }

function closerNetCommissionBase(amount: number, operation: string | null | undefined, appliesPlatformDiscount: boolean) {
  if (!appliesPlatformDiscount || amount <= 0) return amount
  const prices = [...String(operation || "").matchAll(/\$\s*([0-9][0-9,.]*)/g)]
  const grossPrice = prices.length ? Number(prices.at(-1)?.[1].replace(/,/g, "")) : 0
  const ratio = grossPrice === 1800 ? 1700 / 1800
    : grossPrice === 2450 ? 2300 / 2450
    : 0.94
  return amount * ratio
}

function closerLevel(rate: number): 1 | 2 | 3 { return rate >= 0.12 ? 3 : rate >= 0.11 ? 2 : 1 }
function setterLevel(rate: number): 1 | 2 | 3 { return rate >= 0.06 ? 3 : rate >= 0.055 ? 2 : 1 }

function identityKey(row: { person_id?: string | null; telefono?: string | null; cliente?: string | null }): string {
  if (row.person_id) return `p:${row.person_id}`
  const phone = String(row.telefono || "").replace(/\D/g, "")
  if (phone) return `t:${phone}`
  return `n:${stripAccents(String(row.cliente || "")).replace(/[^a-z0-9]/g, "")}`
}

function legacyCloserNivel(ccPond: number, tcAB: number, strikes: number): 1 | 2 | 3 {
  if (ccPond >= 20000 && tcAB >= 45 && strikes <= 1) return 3
  if (ccPond >= 10000 && tcAB >= 30 && strikes <= 2) return 2
  return 1
}

function legacyCloserRate(nivel: 1 | 2 | 3, strikes: number, teamCC: number): number {
  const base = nivel === 3 ? 0.10 : nivel === 2 ? 0.09 : 0.08
  if (nivel >= 2 && strikes <= 1 && teamCC >= 40000) return Math.min(base + 0.02, 0.12)
  if (nivel >= 2 && strikes <= 1 && teamCC >= 30000) return Math.min(base + 0.01, 0.12)
  return base
}

function legacySetterNivel(ccPond: number, tAgenda: number | null, strikes: number): 1 | 2 | 3 {
  if (tAgenda === null || tAgenda < 50) return 1
  if (ccPond >= 20000 && tAgenda >= 65 && strikes <= 1) return 3
  if (ccPond >= 10000 && tAgenda >= 80 && strikes <= 2) return 2
  return 1
}

function legacySetterRate(nivel: 1 | 2 | 3, strikes: number, teamCC: number): number {
  const base = nivel === 3 ? 0.05 : nivel === 2 ? 0.045 : 0.04
  if (nivel >= 2 && strikes <= 1 && teamCC >= 40000) return Math.min(base + 0.02, 0.065)
  if (nivel >= 2 && strikes <= 1 && teamCC >= 30000) return Math.min(base + 0.01, 0.065)
  return base
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const month = searchParams.get("month") || new Date().toISOString().slice(0, 7)
    const uses2026Scheme = month >= "2026-08"
    const [year, mon] = month.split("-").map(Number)
    const start = `${month}-01`
    const end = `${month}-${String(new Date(year, mon, 0).getDate()).padStart(2, "0")}`

    const sb = getSupabase()

    // es_reactivacion es una columna nueva — si todavia no se corrio la
    // migracion, se reintenta sin ella para no romper el leaderboard entero.
    const paymentFields = "monto,tipo,operacion,closer,setter,es_reactivacion,fecha,person_id,telefono,cliente"
    const paymentFallbackFields = "monto,tipo,operacion,closer,setter,fecha,person_id,telefono,cliente"
    const pagosConReactivacion = await sb.from("pagos").select(paymentFields).eq("record_status", "active").gte("fecha", start).lte("fecha", end)
    const pagosRes = pagosConReactivacion.error?.code === "42703"
      ? await sb.from("pagos").select(paymentFallbackFields).eq("record_status", "active").gte("fecha", start).lte("fecha", end)
      : pagosConReactivacion
    const [
      { data: agendas, error: aErr },
      { data: strikesData },
    ] = await Promise.all([
      sb.from("agendas").select("closer,setter,show,cerro,calificacion,estado").or("estado.is.null,estado.neq.Archivada manualmente").gte("fecha_agenda", start).lte("fecha_agenda", end),
      sb.from("strikes").select("nombre,count,updated_at"),
    ])
    const { error: pErr } = pagosRes
    const pagos = (pagosRes.data || []).map((row) => ({
      ...row,
      es_reactivacion: "es_reactivacion" in row ? row.es_reactivacion : false,
    }))
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
    if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 })

    // La ventana de comisión del setter se ancla al primer pago FE histórico
    // de cada cliente, no al tipo escrito manualmente en un pago posterior.
    // Supabase limita cada respuesta a 1.000 filas aunque se pida un limit
    // mayor. Hay más de 1.000 pagos históricos: la consulta anterior traía
    // solo los más viejos y dejaba afuera las identidades de agosto, por eso
    // todos los setters aparecían con CC $0. Se pagina explícitamente.
    const paymentHistory: Array<{ fecha: string | null; tipo: string | null; person_id: string | null; telefono: string | null; cliente: string | null }> = []
    for (let from = 0; ; from += 1000) {
      const { data: page, error: historyError } = await sb
        .from("pagos")
        .select("fecha,tipo,person_id,telefono,cliente")
        .eq("record_status", "active")
        .not("fecha", "is", null)
        .order("fecha", { ascending: true })
        .range(from, from + 999)
      if (historyError) return NextResponse.json({ error: historyError.message }, { status: 500 })
      paymentHistory.push(...(page || []))
      if (!page || page.length < 1000) break
    }
    const firstFrontendPayment = new Map<string, string>()
    for (const payment of paymentHistory) {
      if (!frontendCohort(payment.tipo)) continue
      const key = identityKey(payment)
      if (!firstFrontendPayment.has(key) && payment.fecha) firstFrontendPayment.set(key, payment.fecha)
    }

    // La cuenta de origen vive en agendas, no en pagos. Para cada identidad se
    // usa la agenda más reciente anterior al pago (fallback: la última conocida).
    const accountHistory = new Map<string, Array<{ fecha: string; cuenta: string }>>()
    for (let from = 0; ; from += 1000) {
      const { data: page, error: accountError } = await sb
        .from("agendas")
        .select("person_id,telefono,nombre,cuenta,fecha_agenda")
        .not("cuenta", "is", null)
        .order("fecha_agenda", { ascending: true })
        .range(from, from + 999)
      if (accountError) return NextResponse.json({ error: accountError.message }, { status: 500 })
      for (const agenda of page || []) {
        const key = identityKey({ person_id: agenda.person_id, telefono: agenda.telefono, cliente: agenda.nombre })
        const rows = accountHistory.get(key) || []
        rows.push({ fecha: agenda.fecha_agenda || "", cuenta: agenda.cuenta || "" })
        accountHistory.set(key, rows)
      }
      if (!page || page.length < 1000) break
    }

    function accountForPayment(payment: { person_id?: string | null; telefono?: string | null; cliente?: string | null; fecha?: string | null }) {
      const rows = accountHistory.get(identityKey(payment)) || []
      if (rows.length === 0) return null
      const prior = rows.filter(row => !payment.fecha || !row.fecha || row.fecha <= payment.fecha)
      return paymentAccount((prior.at(-1) || rows.at(-1))?.cuenta)
    }

    // Conversaciones asignadas per setter
    const convAsigMap = new Map<string, number>()
    try {
      const { data: convData } = await sb
        .from("metricas_manual")
        .select("persona,valor")
        .eq("mes", month)
        .eq("tipo", "conversaciones_asignadas")
      for (const row of convData || []) {
        convAsigMap.set(firstWord(row.persona), row.valor || 0)
      }
    } catch {
      // table may not exist yet — skip silently
    }

    const strikesMap = new Map<string, number>()
    for (const s of strikesData || []) {
      // Los strikes son mensuales y se reinician el día 1. La tabla histórica
      // conserva el último contador; solo aplica si fue actualizado dentro del
      // mes seleccionado. Así un strike de julio no reduce agosto.
      const strikeMonth = s.updated_at ? String(s.updated_at).slice(0, 7) : ""
      strikesMap.set(firstWord(s.nombre), strikeMonth === month ? (s.count ?? 0) : 0)
    }

    type CM = {
      cc_nuevo: number; cc_total: number; commission_base: number; cc_paul: number; cc_cristian: number; cc_ponderado: number; feccu: number; feccpp: number; unidades: number; fees: number
      llamadas: number; cerradas: number; total_ag: number; pres_ab: number; cerr_ab: number
    }
    type SM = {
      cc_nuevo: number; cc_total: number; cc_paul: number; cc_cristian: number; cc_ponderado: number; feccu: number; feccpp: number; feccpp_excluido: number; unidades: number; fees: number
      agendas: number; agendas_ab: number; shows: number
    }

    const closerMap = new Map<string, CM>()
    const setterMap = new Map<string, SM>()
    let csmCc = 0
    let teamFeccu = 0
    let teamFeccpp = 0
    let teamBeccu = 0

    if (OWNER_CLOSER) closerMap.set(OWNER_CLOSER, { cc_nuevo: 0, cc_total: 0, commission_base: 0, cc_paul: 0, cc_cristian: 0, cc_ponderado: 0, feccu: 0, feccpp: 0, unidades: 0, fees: 0, llamadas: 0, cerradas: 0, total_ag: 0, pres_ab: 0, cerr_ab: 0 })

    for (const pago of pagos || []) {
      const closer = canonical(pago.closer || "")
      const setter = canonical(pago.setter || "")
      const monto = pago.monto || 0
      const tipo = pago.tipo || ""
      const account = accountForPayment(pago)
      const cohort = frontendCohort(tipo)
      if (cohort === "FECCU") teamFeccu += monto
      if (cohort === "FECCPP") teamFeccpp += monto
      if (BECCU_TIPOS.has(tipo)) teamBeccu += monto
      const isReactivation = !!pago.es_reactivacion
      const legacy100 = LEGACY_CC_100.has(tipo)
      const legacy50 = LEGACY_CC_50.has(tipo)
      const closerCommissionableCc = uses2026Scheme
        ? cohort ? monto : 0
        : (legacy100 || isReactivation) ? monto : legacy50 ? monto * 0.5 : 0
      const setterWindow = cohort && withinSetterWindow(pago.fecha, firstFrontendPayment.get(identityKey(pago)))
      const setterCommissionableCc = uses2026Scheme
        ? setterWindow ? monto : 0
        : legacy100 ? monto : legacy50 ? monto * 0.5 : 0

      if (closer === "Tony") { csmCc += monto; continue }

      if (isRealMember(closer)) {
        if (!closerMap.has(closer)) closerMap.set(closer, { cc_nuevo: 0, cc_total: 0, commission_base: 0, cc_paul: 0, cc_cristian: 0, cc_ponderado: 0, feccu: 0, feccpp: 0, unidades: 0, fees: 0, llamadas: 0, cerradas: 0, total_ag: 0, pres_ab: 0, cerr_ab: 0 })
        const c = closerMap.get(closer)!
        c.cc_total += closerCommissionableCc
        c.commission_base += closerNetCommissionBase(closerCommissionableCc, pago.operacion, uses2026Scheme)
        if (account === "paul") c.cc_paul += closerCommissionableCc
        if (account === "cristian") c.cc_cristian += closerCommissionableCc
        c.cc_ponderado += closerCommissionableCc
        if (cohort === "FECCU") c.feccu += monto
        if (cohort === "FECCPP") c.feccpp += monto
        if (CC_NUEVO_TIPOS.has(tipo)) c.cc_nuevo += monto
        if (UNIDAD_TIPOS.has(tipo)) c.unidades++
        if (FEE_TIPOS.has(tipo)) c.fees++
      }

      if (isRealMember(setter)) {
        if (!setterMap.has(setter)) setterMap.set(setter, { cc_nuevo: 0, cc_total: 0, cc_paul: 0, cc_cristian: 0, cc_ponderado: 0, feccu: 0, feccpp: 0, feccpp_excluido: 0, unidades: 0, fees: 0, agendas: 0, agendas_ab: 0, shows: 0 })
        const s = setterMap.get(setter)!
        s.cc_total += setterCommissionableCc
        if (account === "paul") s.cc_paul += setterCommissionableCc
        if (account === "cristian") s.cc_cristian += setterCommissionableCc
        s.cc_ponderado += setterCommissionableCc
        if (setterWindow && cohort === "FECCU") s.feccu += monto
        if (setterWindow && cohort === "FECCPP") s.feccpp += monto
        if (!setterWindow && cohort === "FECCPP") s.feccpp_excluido += monto
        if (CC_NUEVO_TIPOS.has(tipo)) s.cc_nuevo += monto
        if (UNIDAD_TIPOS.has(tipo)) s.unidades++
        if (FEE_TIPOS.has(tipo)) s.fees++
      }
    }

    const CALIFS_AB = new Set(["LEAD S", "LEAD A", "LEAD B"])

    for (const ag of agendas || []) {
      const closerNorm = canonical(ag.closer || "")
      const setter = canonical(ag.setter || "")

      if (isRealMember(closerNorm)) {
        if (!closerMap.has(closerNorm)) closerMap.set(closerNorm, { cc_nuevo: 0, cc_total: 0, commission_base: 0, cc_paul: 0, cc_cristian: 0, cc_ponderado: 0, feccu: 0, feccpp: 0, unidades: 0, fees: 0, llamadas: 0, cerradas: 0, total_ag: 0, pres_ab: 0, cerr_ab: 0 })
        const c = closerMap.get(closerNorm)!
        c.total_ag++
        if (ag.show) {
          c.llamadas++
          if (ag.cerro) c.cerradas++
          if (CALIFS_AB.has(ag.calificacion || "")) {
            c.pres_ab++
            if (ag.cerro) c.cerr_ab++
          }
        }
      }

      if (isRealMember(setter)) {
        if (!setterMap.has(setter)) setterMap.set(setter, { cc_nuevo: 0, cc_total: 0, cc_paul: 0, cc_cristian: 0, cc_ponderado: 0, feccu: 0, feccpp: 0, feccpp_excluido: 0, unidades: 0, fees: 0, agendas: 0, agendas_ab: 0, shows: 0 })
        const s = setterMap.get(setter)!
        s.agendas++
        if (ag.show) {
          s.shows++
          // Only count A/B on actual shows (calificadas = showed up AND qualified)
          if (CALIFS_AB.has(ag.calificacion || "")) s.agendas_ab++
        }
      }
    }

    const teamCCTotal = Array.from(closerMap.values()).reduce((sum, c) => sum + c.cc_total, 0)
    const legacyTeamCC = Array.from(closerMap.values()).reduce((sum, c) => sum + c.cc_ponderado, 0)
    const topCloser = Array.from(closerMap.entries()).sort((a, b) => b[1].cc_total - a[1].cc_total || b[1].feccu - a[1].feccu)[0]?.[0]
    const topSetter = Array.from(setterMap.entries()).sort((a, b) => b[1].cc_total - a[1].cc_total || b[1].feccu - a[1].feccu)[0]?.[0]

    const closers = Array.from(closerMap.entries())
      .map(([nombre, d]) => {
        const strikes = strikesMap.get(nombre) ?? 0
        const tcAB = d.pres_ab > 0 ? round2((d.cerr_ab / d.pres_ab) * 100) : 0
        const legacyNivel = legacyCloserNivel(d.cc_ponderado, tcAB, strikes)
        const unlockedRate = uses2026Scheme ? closerUnlockedRate(d.cc_total, nombre === topCloser, month) : legacyCloserRate(legacyNivel, strikes, legacyTeamCC)
        const rate = uses2026Scheme ? applyStrikes(unlockedRate, strikes, 0.08) : unlockedRate
        const nivel = uses2026Scheme ? closerLevel(unlockedRate) : legacyNivel
        const nextTarget = d.cc_total < 40000 ? 40000 : unlockedRate < 0.12 ? closerTopTarget(month) : closerTopTarget(month)
        const nextRate = d.cc_total < 40000 ? 11 : 12
        return {
          nombre, initials: getInitials(nombre),
          cc_nuevo: round2(d.cc_nuevo), cc_total: round2(d.cc_total), cc_paul: round2(d.cc_paul), cc_cristian: round2(d.cc_cristian), cc_ponderado: round2(d.cc_ponderado),
          feccu: round2(d.feccu), feccpp: round2(d.feccpp), commissionable_cc: round2(d.commission_base),
          unidades: d.unidades, fees: d.fees, llamadas: d.llamadas, cerradas: d.cerradas,
          tasa_cierre: d.llamadas > 0 ? round2((d.unidades / d.llamadas) * 100) : 0,
          tc_ab: tcAB, aov: d.unidades > 0 ? round2(d.cc_nuevo / d.unidades) : 0,
          show_up: d.total_ag > 0 ? round2((d.llamadas / d.total_ag) * 100) : 0,
          nivel, rate: round2(rate * 100), unlocked_rate: round2(unlockedRate * 100), strikes,
          is_top: nombre === topCloser, next_target: nextTarget, next_rate: nextRate,
          personal_goal: personalMonthlyGoal(month, nombre),
          comisiones: round2((uses2026Scheme ? d.commission_base : d.cc_ponderado) * rate),
        }
      })
      .filter(c => isRealMember(c.nombre) && ((OWNER_CLOSER && c.nombre === OWNER_CLOSER) || c.personal_goal || c.cc_total > 0 || c.llamadas > 0) && !(month >= CLOSERS_FUERA_DESDE && CLOSERS_FUERA.has(c.nombre)))
      .sort((a, b) => b.cc_total - a.cc_total || Number(Boolean(b.personal_goal)) - Number(Boolean(a.personal_goal)) || b.feccu - a.feccu)

    const setters = Array.from(setterMap.entries())
      .map(([nombre, d]) => {
        const strikes = strikesMap.get(nombre) ?? 0
        const convAsig = convAsigMap.get(nombre) ?? 0
        // T. Agenda = total agendas / conversaciones asignadas (per user definition)
        const t_agenda = convAsig > 0 ? round2((d.agendas / convAsig) * 100) : null
        const legacyNivel = legacySetterNivel(d.cc_ponderado, t_agenda, strikes)
        const unlockedRate = uses2026Scheme ? setterUnlockedRate(d.cc_total, nombre === topSetter) : legacySetterRate(legacyNivel, strikes, legacyTeamCC)
        const rate = uses2026Scheme ? applyStrikes(unlockedRate, strikes, 0.04) : unlockedRate
        const nivel = uses2026Scheme ? setterLevel(unlockedRate) : legacyNivel
        const nextTarget = d.cc_total < 25000 ? 25000 : 30000
        const nextRate = d.cc_total < 25000 ? 5.5 : 6
        return {
          nombre, initials: getInitials(nombre),
          cc_nuevo: round2(d.cc_nuevo), cc_total: round2(d.cc_total), cc_paul: round2(d.cc_paul), cc_cristian: round2(d.cc_cristian), cc_ponderado: round2(d.cc_ponderado),
          feccu: round2(d.feccu), feccpp: round2(d.feccpp), feccpp_excluido: round2(d.feccpp_excluido), commissionable_cc: round2(d.cc_total),
          unidades: d.unidades, fees: d.fees, agendas: d.agendas, agendas_ab: d.agendas_ab,
          t_agenda,
          show_up: d.agendas > 0 ? round2((d.shows / d.agendas) * 100) : 0,
          nivel, rate: round2(rate * 100), unlocked_rate: round2(unlockedRate * 100), strikes,
          is_top: nombre === topSetter, next_target: nextTarget, next_rate: nextRate,
          personal_goal: personalMonthlyGoal(month, nombre),
          comisiones: round2((uses2026Scheme ? d.cc_total : d.cc_ponderado) * rate),
        }
      })
      .filter(s => isRealMember(s.nombre) && (s.personal_goal || s.cc_total > 0 || s.agendas > 0) && !(month >= SETTERS_FUERA_DESDE && SETTERS_FUERA.has(s.nombre)))
      .sort((a, b) => b.cc_total - a.cc_total || b.feccu - a.feccu)

    // CSM (Tony): 5% flat sobre CC Back-End (igual que el Sheets)
    const csmComision = round2(csmCc * 0.05)

    return NextResponse.json({
      closers,
      setters,
      csm_cc: round2(csmCc),
      csm_comision: csmComision,
      team_cc_total: round2(teamCCTotal),
      team_feccu: round2(teamFeccu),
      team_feccpp: round2(teamFeccpp),
      team_beccu: round2(teamBeccu),
      // Compatibilidad temporal para clientes cacheados del preview.
      team_cc_pond: round2(teamCCTotal),
      scheme: {
        closer_top_target: closerTopTarget(month), closer_mid_target: 40000,
        setter_top_target: 30000, setter_mid_target: 25000, setter_window_days: 30,
      },
    })
  } catch {
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 })
  }
}
