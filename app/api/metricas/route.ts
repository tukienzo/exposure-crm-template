import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { getMetaSpend } from "@/lib/meta-spend"
import { frontendCohort, withinSetterWindow } from "@/lib/commission-scheme"
import { buildAccountAttributor, normalizeBusinessAccount, type BusinessAccount } from "@/lib/business-account"
import { canonicalCloserName, CUENTA_A_LABEL, CUENTA_B_LABEL } from "@/lib/equipo"
const listaEnv = (v: string | undefined) => String(v || "").split(",").map((x) => x.trim()).filter(Boolean)

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

// Setters que ya no trabajan con el equipo — se excluyen de la tabla de
// Setting (conversaciones asignadas) en los meses indicados, sin tocar las
// agendas historicas reales (esos registros siguen intactos en la base).
const SETTERS_EXCLUIDOS: Record<string, string[]> = {}
// Personas que no son setters activos. Sus registros históricos permanecen
// intactos para auditoría, pero nunca deben aparecer en la tabla de Setting.
const SETTERS_NO_ACTIVOS = new Set(listaEnv(process.env.CRM_SETTERS_INACTIVOS))

// Closers que ya no son closers activos — se sacan de la tabla de Cash
// Collected por Closer para siempre, sin tocar sus pagos/agendas historicos
// (esos registros siguen intactos en la base, solo se ocultan de este cuadro).
const CLOSERS_EXCLUIDOS = new Set(listaEnv(process.env.CRM_CLOSERS_INACTIVOS).map((n) => n.toLowerCase()))

// Definición operativa confirmada: una agenda calificada es S, A o B.
const CALIFS_AB = new Set(["LEAD S", "LEAD A", "LEAD B"])

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
  "Cuota", "Cuota 1", "Cuota 2", "Cuota 3", "Cuota 4", "Cuota 5",
  "Cuota 6", "Cuota 7", "Cuota 8", "Cuota 9", "Cuota 10",
])
const BECCU_TIPOS = new Set(["Fee Venta Interna", "Venta Nueva Interna"])
const BECCPP_TIPOS = new Set(["Cuota Venta Interna"])
const CIERRES_TIPOS = new Set([
  "Venta Nueva", "Venta Nueva (En Call)", "Venta Nueva (Post Fee)",
  "Completó PIF (Post Fee)", "Venta Nueva Interna",
])
// Revenue contractual de ventas nuevas externas. Se conserva como métrica
// separada, pero NO es la base del ROAS.
const VENTA_NUEVA_EXTERNA = new Set([
  "Venta Nueva", "Venta Nueva (En Call)", "Venta Nueva (Post Fee)",
  "Completó PIF", "Completó PIF (Post Fee)", "Fee", "Refuerzo de Fee",
])
// Para "cash collected por call": SOLO Fee y Venta Nueva (En Call) — los
// unicos dos tipos que efectivamente pasan por una llamada. Refuerzo de Fee,
// Post Fee, Completó PIF, cuotas y ventas internas se cobran sin una llamada
// nueva, asi que no cuentan aca.
const CALIFS_SABCD = ["S", "A", "B", "C", "D"]

function r2(n: number) { return Math.round(n * 100) / 100 }
function pct(a: number, b: number): number | null { return b > 0 ? r2((a / b) * 100) : null }
function firstWord(s: string) { return (s || "").trim().split(/\s+/)[0] }
function identityKey(row: { person_id?: string | null; telefono?: string | null; cliente?: string | null }): string {
  if (row.person_id) return `p:${row.person_id}`
  const phone = String(row.telefono || "").replace(/\D/g, "")
  if (phone) return `t:${phone}`
  const name = String(row.cliente || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "")
  return `n:${name}`
}
type PagoBucket = { tipo?: string | null; operacion?: string | null }
function isBackendContext(p: PagoBucket) {
  return BECCU_TIPOS.has(p.tipo || "")
    || BECCPP_TIPOS.has(p.tipo || "")
}
function isBeccpp(p: PagoBucket) { return BECCPP_TIPOS.has(p.tipo || "") }
function isBeccu(p: PagoBucket) { return isBackendContext(p) && !isBeccpp(p) }

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

// iClosed persiste fecha_agenda en UTC sin sufijo de zona. Los cortes de las
// semanas comerciales se interpretan en Argentina (UTC-3), no a medianoche UTC.
function argentinaAgendaBoundary(date: string, end = false): string {
  return new Date(`${date}T${end ? "23:59:59" : "00:00:00"}-03:00`).toISOString().slice(0, 19)
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const now = new Date()
    const currentMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    const mes = searchParams.get("month") || currentMes
    const weekIdx = parseInt(searchParams.get("week") || "0")

    // Vista General filtra por rango libre (hoy, esta semana, rango custom,
    // etc.) en vez de mes+semana fijos — si vienen start/end directos, se usan
    // tal cual en lugar de derivarlos de mes+semana.
    const startParam = searchParams.get("start")
    const endParam = searchParams.get("end")
    const accountParam = searchParams.get("account")
    const businessAccount: BusinessAccount | null = accountParam === "paul" || accountParam === "cris" ? accountParam : null
    const { start, end } = (startParam && endParam) ? { start: startParam, end: endParam } : getDateRange(mes, weekIdx)
    const sb = getSupabase()

    const [
      { data: pagos, error: pErr },
      { data: planesRaw, error: plansErr },
      { data: agendasRaw, error: aErr },
      { data: agendasSetterRaw, error: asErr },
      metaSpend,
    ] = await Promise.all([
      sb.from("pagos").select("fecha,cliente,tipo,operacion,ppp,monto,closer,setter,calificacion,person_id,telefono").eq("record_status", "active").gte("fecha", start).lte("fecha", end),
      // Fuente de verdad igual a producción: contrato estructurado cargado en
      // el período, sumando los ítems del plan, estén pagos o pendientes.
      sb.from("planes_pago")
        .select("id,person_id,telefono,fecha_alta,created_at,plan_pago_items(monto,concepto)")
        .gte("created_at", `${start}T00:00:00`)
        .lte("created_at", `${end}T23:59:59.999`),
      sb.from("agendas")
        .select("id,person_id,telefono,cuenta,closer,setter,show,estado,calificacion,fecha_closer,created_at,call_confirmer,calificaba_realmente")
        .or("estado.is.null,estado.neq.Archivada manualmente")
        .gte("fecha_closer", `${start}T00:00:00`)
        .lte("fecha_closer", `${end}T23:59:59`),
      // Setting (agendas por setter) y Volumen (cuenta/fuente/ocupacion/manychat)
      // se miden por fecha_agenda (cuando se agendo), no por fecha_closer (cuando
      // cae la llamada) — asi coincide con como lo mide el Sheet y evita que
      // agendas de fin de mes "salten" al mes siguiente.
      sb.from("agendas")
        .select("id,person_id,nombre,telefono,setter,cuenta,fuente,ocupacion,manychat,calificacion,estado,fecha_agenda")
        .or("estado.is.null,estado.neq.Archivada manualmente")
        .gte("fecha_agenda", argentinaAgendaBoundary(start))
        .lte("fecha_agenda", argentinaAgendaBoundary(end, true)),
      getMetaSpend(start, end, businessAccount),
    ])

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
    if (plansErr) return NextResponse.json({ error: plansErr.message }, { status: 500 })
    if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 })
    if (asErr) return NextResponse.json({ error: asErr.message }, { status: 500 })

    let p = pagos || []

    // Pagos y planes no guardan la cuenta comercial directamente. La cuenta
    // se hereda de la agenda explícita más reciente de la misma persona,
    // priorizando una agenda anterior a la fecha del cobro/alta del plan.
    let accountFor: ReturnType<typeof buildAccountAttributor> | null = null
    if (businessAccount) {
      const accountAgendas: any[] = []
      for (let from = 0; ; from += 1000) {
        const { data: page, error: accountAgendaError } = await sb.from("agendas")
          .select("person_id,telefono,cuenta,fecha_agenda,fecha_closer,created_at")
          .not("cuenta", "is", null)
          .order("fecha_agenda", { ascending: true })
          .range(from, from + 999)
        if (accountAgendaError) return NextResponse.json({ error: accountAgendaError.message }, { status: 500 })
        accountAgendas.push(...(page || []))
        if (!page || page.length < 1000) break
      }
      accountFor = buildAccountAttributor(accountAgendas)
      p = p.filter(payment => accountFor!(payment, payment.fecha) === businessAccount)
    }

    // La ventana del setter se cuenta desde el primer pago frontend histórico
    // de cada cliente, aunque el período visible empiece después.
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
    // Sin dedup: la data viene limpia del Sheets (1 fila = 1 agenda real)
    const a = businessAccount
      ? (agendasRaw || []).filter(agenda => normalizeBusinessAccount((agenda as any).cuenta) === businessAccount)
      : (agendasRaw || [])
    const setterAgendaSeen = new Set<string>()
    const accountSetterRows = businessAccount
      ? (agendasSetterRaw || []).filter((agenda: any) => normalizeBusinessAccount(agenda.cuenta) === businessAccount)
      : (agendasSetterRaw || [])
    const aBySetterFecha = accountSetterRows.filter((agenda: any) => {
      const phone = String(agenda.telefono || "").replace(/\D/g, "")
      const name = String(agenda.nombre || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "")
      const identity = agenda.person_id ? `person:${agenda.person_id}` : phone ? `phone:${phone}` : `name:${name}`
      const key = `${firstWord(agenda.setter || "").toLowerCase()}:${identity}`
      if (setterAgendaSeen.has(key)) return false
      setterAgendaSeen.add(key)
      return true
    })
    const planes = businessAccount
      ? (planesRaw || []).filter((plan: any) => accountFor!(plan, plan.fecha_alta || plan.created_at) === businessAccount)
      : (planesRaw || [])
    const revenue = r2(planes.reduce((total, plan: any) =>
      total + (plan.plan_pago_items || []).reduce(
        (subtotal: number, item: any) => subtotal + Number(item.monto || 0),
        0,
      ), 0))
    const ventas_nuevas_revenue = r2(planes.reduce((total, plan: any) =>
      total + (plan.plan_pago_items || []).reduce(
        (subtotal: number, item: any) =>
          subtotal + (VENTA_NUEVA_EXTERNA.has(item.concepto || "") ? Number(item.monto || 0) : 0),
        0,
      ), 0))
    // FUNNEL
    const total_agendas = a.length
    const calificadas = a.filter(x => CALIFS_AB.has(x.calificacion || "")).length
    const nowMs = Date.now()
    // `show=null` no equivale a no-show, pero tampoco se puede excluir del
    // denominador una vez que la llamada ya ocurrió: eso infla artificialmente
    // el show. Las llamadas ocurridas sin resultado se exponen por separado.
    const callsOccurred = a.filter(x => {
      const scheduled = x.fecha_closer ? new Date(x.fecha_closer).getTime() : NaN
      return Number.isFinite(scheduled) && scheduled <= nowMs
    })
    const presentadas = callsOccurred.filter(x => x.show === true).length
    const calificadasOcurridas = callsOccurred.filter(x => CALIFS_AB.has(x.calificacion || ""))
    const calif_presentadas = calificadasOcurridas.filter(x => x.show === true).length
    const cierres = p.filter(x => CIERRES_TIPOS.has(x.tipo)).length
    const cierres_fe = p.filter(x => CIERRES_TIPOS.has(x.tipo) && x.tipo !== "Venta Nueva Interna").length
    const cierres_be = p.filter(x => x.tipo === "Venta Nueva Interna").length
    // Cerro en la llamada original (En Call) vs cerro despues via seguimiento
    // (Post Fee / Completo PIF / venta interna, que siempre se cierran aparte).
    const cierres_llamada = p.filter(x => x.tipo === "Venta Nueva (En Call)").length
    const cierres_seguimiento = p.filter(x =>
      x.tipo === "Venta Nueva (Post Fee)" || x.tipo === "Completó PIF (Post Fee)" || x.tipo === "Venta Nueva Interna"
    ).length

    // PAGOS TOTALES vs UNIDADES CERRADAS: dos formas distintas de medir "tasa
    // de cierre". Pagos totales = Unidades Cerradas + Fees (fees SI cuentan
    // porque son el pago del día 1, ligado a la llamada) — pero NO cuotas,
    // que se cobran después sin que exista una llamada nueva ese período.
    // Unidades cerradas = solo gente que efectivamente entró al programa
    // (Venta Nueva / Post Fee / Completó PIF / Interna), FE + BE combinados.
    const unidades_cerradas = cierres
    const PAGOS_TOTALES_TIPOS = new Set([...CIERRES_TIPOS, "Fee", "Refuerzo de Fee", "Fee Venta Interna"])
    const pagos_totales = p.filter(x => PAGOS_TOTALES_TIPOS.has(x.tipo)).length

    // No shows: call_confirmer distingue por que no hubo show.
    // Cancelado es un resultado válido: no es no-show ni resultado pendiente.
    const noShows = callsOccurred.filter(x => x.show !== true && x.estado !== "Cancelado")
    const canceladas_triage = noShows.filter(x => (x.call_confirmer || "").includes("Triage")).length
    const canceladas_triage_calif = noShows.filter(x =>
      CALIFS_AB.has(x.calificacion || "") && (x.call_confirmer || "").includes("Triage")
    ).length
    const no_response = noShows.filter(x => x.call_confirmer === "No Respondió").length
    const no_show = noShows.filter(x =>
      x.show === false
      && x.call_confirmer !== "No Respondió"
      && !(x.call_confirmer || "").includes("Triage")
    ).length
    const sin_resultado = callsOccurred.filter(x => x.show == null
      && x.estado !== "Cancelado"
      && x.call_confirmer !== "No Respondió"
      && !(x.call_confirmer || "").includes("Triage")
    ).length

    // Calificaban de verdad audita exclusivamente si el scoring S/A/B estuvo
    // bien asignado. C/D no entran: ya estaban declaradas como no calificadas.
    const presentadasArr = callsOccurred.filter(x => x.show === true && CALIFS_AB.has(x.calificacion || ""))
    const con_calificaba_realmente = presentadasArr.filter(x => x.calificaba_realmente === "Si" || x.calificaba_realmente === "No").length
    const calificaron_si_realmente = presentadasArr.filter(x => x.calificaba_realmente === "Si").length

    // CASH
    const feccu = r2(p.filter(x => !isBackendContext(x) && FECCU_TIPOS.has(x.tipo)).reduce((s, x) => s + (x.monto || 0), 0))
    // Definición vigente confirmada por Cuenta A (08/08/2026): ROAS usa solo
    // FECCU efectivamente cobrado en el período. No entran cuotas/FECCP,
    // ventas internas/backend ni revenue contractual pendiente.
    const roas = metaSpend.available && metaSpend.spend > 0 ? r2(feccu / metaSpend.spend) : null
    const feccp = r2(p.filter(x => !isBackendContext(x) && FECCP_TIPOS.has(x.tipo)).reduce((s, x) => s + (x.monto || 0), 0))
    const beccu = r2(p.filter(isBeccu).reduce((s, x) => s + (x.monto || 0), 0))
    const beccpp = r2(p.filter(isBeccpp).reduce((s, x) => s + (x.monto || 0), 0))
    const cc_total = r2(feccu + feccp + beccu + beccpp)

    const fees_arr = p.filter(x => x.tipo === "Fee" || x.tipo === "Refuerzo de Fee")
    const fees_sum = r2(fees_arr.reduce((s, x) => s + (x.monto || 0), 0))

    const aov_d1_arr = p.filter(x => x.tipo === "Venta Nueva (En Call)" || x.tipo === "Venta Nueva" || x.tipo === "Fee")
    const aov_dia1 = aov_d1_arr.length > 0
      ? r2(aov_d1_arr.reduce((s, x) => s + (x.monto || 0), 0) / aov_d1_arr.length) : null

    const aov_tc_arr = p.filter(x => CIERRES_TIPOS.has(x.tipo))
    const aov_tc = aov_tc_arr.length > 0
      ? r2(aov_tc_arr.reduce((s, x) => s + (x.monto || 0), 0) / aov_tc_arr.length) : null

    // CAC (costo de adquisicion): mismo gasto de ads que ROAS, pero como costo
    // por unidad en vez de retorno. Denominador = mismo universo de "ventas
    // nuevas del mes" que usa ROAS (Front End, sin ventas internas) contado
    // como unidades, no como monto — usa cierres_fe (ya calculado en FUNNEL,
    // mismo set de tipos que FRONT_END_SALE_TYPES/newSalesRevenue).
    const cac = metaSpend.available && cierres_fe > 0 ? r2(metaSpend.spend / cierres_fe) : null

    // CASH COLLECTED POR CALIFICACIÓN DE LEAD, con atribución por cohorte.
    // Un pago no hereda su score desde pagos.calificacion: se ata por identidad
    // a la agenda del período y conserva score + closer de esa call. Incluye
    // todo el Cash Collected real cobrado en el período (fees, ventas, cuotas,
    // refuerzos y backend); cada pago se cuenta una sola vez. Así coincide con
    // la auditoría de Lead Scoring y no mezcla cash sin agenda atribuible.
    const agendaByIdentity = new Map<string, any>()
    const sortedAgendas = [...a].sort((x, y) => {
      if (Boolean(x.show) !== Boolean(y.show)) return x.show ? -1 : 1
      return new Date(y.fecha_closer || y.created_at || 0).getTime() - new Date(x.fecha_closer || x.created_at || 0).getTime()
    })
    for (const agenda of sortedAgendas) {
      for (const key of [agenda.person_id ? `p:${agenda.person_id}` : "", agenda.telefono ? `t:${String(agenda.telefono).replace(/\D/g, "")}` : ""].filter(Boolean)) {
        if (!agendaByIdentity.has(key)) agendaByIdentity.set(key, agenda)
      }
    }
    const attributedPayments = p.map((payment) => {
      const keys = [payment.person_id ? `p:${payment.person_id}` : "", payment.telefono ? `t:${String(payment.telefono).replace(/\D/g, "")}` : ""].filter(Boolean)
      const agenda = keys.map(key => agendaByIdentity.get(key)).find(Boolean)
      return agenda ? { payment, agenda } : null
    }).filter(Boolean) as Array<{ payment: any; agenda: any }>

    const cash_por_calificacion = CALIFS_SABCD.map((tier) => {
      const label = `LEAD ${tier}`
      const callsTier = a.filter(x => x.calificacion === label)
      const presentadasTier = callsTier.filter(x => x.show).length
      const pagosTier = attributedPayments.filter(x => x.agenda.calificacion === label)
      const ccTier = r2(pagosTier.reduce((s, x) => s + Number(x.payment.monto || 0), 0))
      return {
        calificacion: label,
        cc_total: ccTier,
        llamadas: callsTier.length,
        presentadas: presentadasTier,
        pagaron: new Set(pagosTier.map(x => identityKey(x.payment))).size,
        cc_por_call: presentadasTier > 0 ? r2(ccTier / presentadasTier) : null,
      }
    })

    // CASH COLLECTED POR CALIFICACIÓN, DESGLOSADO POR CLOSER. Los alias de
    // closers (NEXT_PUBLIC_CRM_CLOSER_ALIASES) unifican a la misma persona.
    function closerKey(s: string | null | undefined): string {
      const value = canonicalCloserName(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
      if (!value) return ""
      return firstWord(value)
    }
    function closerLabel(_key: string, raw: string | null | undefined): string {
      return firstWord(canonicalCloserName(raw || ""))
    }
    const closerLabels = new Map<string, string>()
    for (const x of a) {
      const k = closerKey(x.closer)
      if (k && k !== "sin" && !CLOSERS_EXCLUIDOS.has(k) && !closerLabels.has(k)) closerLabels.set(k, closerLabel(k, x.closer))
    }
    for (const x of p) {
      const k = closerKey(x.closer)
      if (k && k !== "sin" && !CLOSERS_EXCLUIDOS.has(k)) closerLabels.set(k, closerLabel(k, x.closer))
    }
    const cash_por_closer = Array.from(closerLabels.entries())
      .map(([key, label]) => ({
        closer: label,
        tiers: CALIFS_SABCD.map((tier) => {
          const lbl = `LEAD ${tier}`
          const callsTier = a.filter(x => closerKey(x.closer) === key && x.calificacion === lbl)
          const presentadasTier = callsTier.filter(x => x.show).length
          const pagosTier = attributedPayments.filter(x => closerKey(x.agenda.closer) === key && x.agenda.calificacion === lbl)
          const ccTier = r2(pagosTier.reduce((s, x) => s + Number(x.payment.monto || 0), 0))
          return {
            calificacion: lbl,
            cc_total: ccTier,
            llamadas: callsTier.length,
            presentadas: presentadasTier,
            pagaron: new Set(pagosTier.map(x => identityKey(x.payment))).size,
            cc_por_call: presentadasTier > 0 ? r2(ccTier / presentadasTier) : null,
          }
        }),
      }))
      .sort((x, y) => x.closer.localeCompare(y.closer))

    // SETTING
    const excluidos = new Set(SETTERS_EXCLUIDOS[mes] || [])
    const setterData = new Map<string, { conv_asig: number; agendas: number; calendarios_enviados: number; agendas_calificadas: number; cash_collected: number }>()
    for (const ag of aBySetterFecha) {
      const s = firstWord(ag.setter || "")
      if (!s || s === "Sin" || excluidos.has(s) || SETTERS_NO_ACTIVOS.has(s)) continue
      if (!setterData.has(s)) setterData.set(s, { conv_asig: 0, agendas: 0, calendarios_enviados: 0, agendas_calificadas: 0, cash_collected: 0 })
      const d = setterData.get(s)!
      d.agendas++
      if (CALIFS_AB.has(ag.calificacion || "")) d.agendas_calificadas++
    }

    // Cash comisionable del setter: solo frontend efectivamente cobrado entre
    // el primer pago y el día 30 inclusive. Backend y cuotas posteriores no
    // pertenecen al setter.
    for (const pago of p) {
      const s = firstWord(pago.setter || "")
      if (!s || s === "Sin" || excluidos.has(s) || SETTERS_NO_ACTIVOS.has(s)) continue
      const cohort = frontendCohort(pago.tipo)
      if (!cohort || !withinSetterWindow(pago.fecha, firstFrontendPayment.get(identityKey(pago)))) continue
      if (!setterData.has(s)) setterData.set(s, { conv_asig: 0, agendas: 0, calendarios_enviados: 0, agendas_calificadas: 0, cash_collected: 0 })
      setterData.get(s)!.cash_collected += Number(pago.monto || 0)
    }

    // Metricas cargadas a mano (conversaciones asignadas, calendarios enviados,
    // nuevos leads). Se guardan por semana real (columna "semana") para que un
    // valor cargado en una semana no se arrastre a las semanas siguientes.
    // En vista "Mes completo" (weekIdx 0) se suman todas las semanas del mes.
    let nuevos_leads: number | null = null
    try {
      let q = sb.from("metricas_manual")
        .select("persona,valor,tipo")
        .eq("mes", mes)
        .in("tipo", ["conversaciones_asignadas", "calendarios_enviados", "nuevos_leads"])
      q = weekIdx > 0 ? q.eq("semana", weekIdx) : q.not("semana", "is", null)
      const { data: manualData } = await q
      for (const row of manualData || []) {
        if (row.tipo === "nuevos_leads") {
          nuevos_leads = (nuevos_leads || 0) + (row.valor || 0)
          continue
        }
        const nombre = firstWord(row.persona || "")
        if (excluidos.has(nombre) || SETTERS_NO_ACTIVOS.has(nombre)) continue
        if (!setterData.has(nombre)) setterData.set(nombre, { conv_asig: 0, agendas: 0, calendarios_enviados: 0, agendas_calificadas: 0, cash_collected: 0 })
        const d = setterData.get(nombre)!
        if (row.tipo === "conversaciones_asignadas") d.conv_asig += row.valor || 0
        else if (row.tipo === "calendarios_enviados") d.calendarios_enviados += row.valor || 0
      }
    } catch { /* table may not exist yet */ }

    const setters = Array.from(setterData.entries())
      .map(([nombre, d]) => ({
        nombre,
        conv_asig: d.conv_asig || null,
        calendarios_enviados: d.calendarios_enviados || null,
        agendas: d.agendas,
        agendas_calificadas: d.agendas_calificadas,
        cash_collected: r2(d.cash_collected),
        t_agenda: d.conv_asig > 0 ? r2((d.agendas / d.conv_asig) * 100) : null,
      }))
      .sort((a, b) => b.agendas - a.agendas)
    const conversaciones_asignadas_total = setters.reduce((total, setter) => total + (setter.conv_asig || 0), 0)

    const weekCount = (SEMANAS[mes] || []).length

    // VOLUMEN — agregaciones de agendas por dimensión
    type Row = { cuenta?: string | null; fuente?: string | null; ocupacion?: string | null; manychat?: string | null }
    const SIN = "Sin dato"
    function tally(rows: Row[], field: keyof Row, opts: { normalize?: (v: string) => string; emptyLabel?: string } = {}) {
      const fallback = opts.emptyLabel || SIN
      const map = new Map<string, number>()
      for (const r of rows) {
        let v = (r[field] || "").toString().trim()
        if (!v || v === "-" || v === "No se le envió") v = fallback
        else if (opts.normalize) v = opts.normalize(v)
        map.set(v, (map.get(v) || 0) + 1)
      }
      return Array.from(map.entries())
        .map(([nombre, cantidad]) => ({ nombre, cantidad }))
        .sort((x, y) => y.cantidad - x.cantidad)
    }

    const cuentaNorm = (v: string) => {
      const low = v.toLowerCase()
      const cuenta = normalizeBusinessAccount(low)
      if (cuenta === "cris") return CUENTA_B_LABEL
      if (cuenta === "paul") return CUENTA_A_LABEL
      return v
    }

    const volumen = {
      total: aBySetterFecha.length,
      por_cuenta: tally(aBySetterFecha as Row[], "cuenta", { normalize: cuentaNorm }),
      por_ocupacion: tally(aBySetterFecha as Row[], "ocupacion", { emptyLabel: "No se le envió" }),
      por_fuente: tally(aBySetterFecha as Row[], "fuente").slice(0, 15),
      por_manychat: tally(aBySetterFecha as Row[], "manychat", { emptyLabel: "No se le envió" }),
    }

    return NextResponse.json({
      mes, weekIdx, weekCount, volumen,
      funnel: {
        total_agendas, calls_evaluables: callsOccurred.length, calificadas, presentadas, calif_presentadas,
        cierres, cierres_fe, cierres_be, cierres_llamada, cierres_seguimiento,
        canceladas_triage, no_show, no_response, sin_resultado,
        pct_calificadas: pct(calificadas, total_agendas),
        show_total: pct(presentadas, callsOccurred.length),
        show_calif: pct(calif_presentadas, calificadasOcurridas.length),
        // Si no hubo triage, esta tasa sería idéntica al show calificado y no
        // agrega información. Se devuelve null para que la UI diga "No aplica"
        // en vez de mostrar dos porcentajes iguales que parecen un error.
        show_sin_triage: canceladas_triage_calif > 0
          ? pct(calif_presentadas, calificadasOcurridas.length - canceladas_triage_calif)
          : null,
        pct_canceladas_triage: pct(canceladas_triage, callsOccurred.length),
        pct_no_show: pct(no_show, callsOccurred.length),
        pct_no_response: pct(no_response, callsOccurred.length),
        pct_sin_resultado: pct(sin_resultado, callsOccurred.length),
        con_calificaba_realmente, calificaron_si_realmente,
        pct_calificaba_realmente: pct(calificaron_si_realmente, con_calificaba_realmente),
        // TC (tasa de cierre) del funnel de Front End: solo unidades FE.
        // Las ventas internas (Venta Nueva Interna / BE) no cuentan acá.
        tc_total: pct(cierres_fe, total_agendas),
        tc_presentadas: pct(cierres_fe, presentadas),
        tc_calificadas: pct(cierres_fe, calif_presentadas),
      },
      cash: {
        feccu, feccp, beccu, beccpp, cc_total, fees_count: fees_arr.length,
        fees_sum, aov_dia1, aov_tc, revenue, ventas_nuevas_revenue, roas, cac,
        ad_spend: metaSpend.spend, ad_spend_available: metaSpend.available,
        ad_spend_source: metaSpend.source, ad_spend_estimated: metaSpend.estimated,
      },
      cash_por_calificacion,
      cash_por_closer,
      comparacion_cierre: {
        pagos_totales,
        unidades_cerradas,
        tc_pagos_totales_agendas: pct(pagos_totales, total_agendas),
        tc_pagos_totales_presentadas: pct(pagos_totales, presentadas),
        tc_pagos_totales_calificadas: pct(pagos_totales, calif_presentadas),
        tc_unidades_agendas: pct(unidades_cerradas, total_agendas),
        tc_unidades_presentadas: pct(unidades_cerradas, presentadas),
        tc_unidades_calificadas: pct(unidades_cerradas, calif_presentadas),
      },
      setters,
      nuevos_leads,
      conversaciones_asignadas_total,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 })
  }
}
