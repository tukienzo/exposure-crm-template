import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { canonicalSalesAngle, SALES_ANGLES } from "@/lib/sales-angles"

export const dynamic = "force-dynamic"
export const revalidate = 0

type Asset = {
  id: string
  title: string
  angle: string | null
  format: string | null
  topic: string | null
  planned_at: string | null
  published_at: string | null
  status: string
  metadata?: Record<string, unknown> | null
}

type Call = { person_id: string | null; occurred_at: string; trace_analysis: Record<string, unknown> | null }

type Event = {
  id?: string
  person_id: string
  event_type: string
  occurred_at: string
  metadata: Record<string, unknown> | null
}

const STIMULUS_EVENTS = new Set([
  "followed", "manychat_tag", "sales_angle", "content_viewed",
  "content_replied", "cta_replied",
])
const AGENDA_EVENTS = new Set(["call_booked"])
const SHOW_EVENTS = new Set(["call_showed"])
const SALE_EVENTS = new Set(["payment_received", "upsell", "resell"])
const QUALIFIED = new Set(["S", "A", "B", "LEAD S", "LEAD A", "LEAD B"])

function cleanAngle(value: unknown) {
  return canonicalSalesAngle(value)
}

async function readAllEvents(sb: ReturnType<typeof createSupabaseAdmin>) {
  // Conserva el universo histórico validado que ya alimentaba esta pantalla
  // y suma todas las atribuciones explícitas aunque sean posteriores. Leer la
  // tabla completa mezclaría eventos de restauración técnica fuera del universo
  // comercial validado y cambiaría artificialmente los denominadores.
  const [{ data: historical, error }, { data: explicit, error: explicitError }] = await Promise.all([
    sb
      .from("crm_events")
      .select("id,person_id,event_type,occurred_at,metadata")
      .order("occurred_at", { ascending: true })
      .limit(20000),
    sb
      .from("crm_events")
      .select("id,person_id,event_type,occurred_at,metadata")
      .eq("event_type", "sales_angle")
      .limit(5000),
  ])
  if (error || explicitError) return { data: null, error: error || explicitError }
  const merged = new Map<string, Event>()
  for (const row of [...(historical || []), ...(explicit || [])] as Event[]) {
    merged.set(row.id || `${row.person_id}:${row.event_type}:${row.occurred_at}`, row)
  }
  return { data: [...merged.values()], error: null }
}

export async function GET() {
  try {
    const sb = createSupabaseAdmin()
    const [{ data: rawAssets, error: assetError }, { data: events, error: eventError }, { data: calls, error: callError }] = await Promise.all([
      sb
        .from("crm_content_assets")
        .select("id,title,angle,format,topic,planned_at,published_at,status,metadata")
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("planned_at", { ascending: false, nullsFirst: false })
        .limit(2500),
      readAllEvents(sb),
      sb.from("crm_call_records").select("person_id,occurred_at,trace_analysis").not("person_id", "is", null).not("trace_analysis", "is", null).limit(2500),
    ])

    if (assetError || eventError || callError) {
      const error = assetError || eventError || callError
      if (error?.code === "42P01" || error?.message?.includes("schema cache")) {
        return NextResponse.json({ schemaReady: false, assets: [], angles: [], totals: {} })
      }
      return NextResponse.json({ error: error?.message || "No se pudo leer trazabilidad" }, { status: 500 })
    }
    const assets = ((rawAssets || []) as Asset[]).filter((asset) => !asset.metadata?.excluded_from_measurement)

    // La call permite diagnosticar el ángulo/dolor del comprador. No se usa
    // retroactivamente para atribuir estímulos o agendas: solo completa la
    // dimensión comprador→ángulo cuando no existe un ángulo de entrada explícito.
    const diagnosedAngle = new Map<string, string>()
    for (const call of (calls || []) as Call[]) {
      const raw = call.trace_analysis?.primary_angle
      if (call.person_id && raw) diagnosedAngle.set(call.person_id, cleanAngle(raw))
    }

    const angleStats = new Map<string, {
      angle: string
      assets: number
      touches: Set<string>
      agendas: Set<string>
      qualifiedAgendas: Set<string>
      shows: Set<string>
      sales: Set<string>
      buyers500: Set<string>
      cash: number
      cashEvents: number
      attributedEvents: number
      directAngleEvents: number
    }>()
    const getAngle = (angleValue: unknown) => {
      const angle = cleanAngle(angleValue)
      if (!angleStats.has(angle)) {
        angleStats.set(angle, {
          angle, assets: 0, touches: new Set(), agendas: new Set(),
          qualifiedAgendas: new Set(), shows: new Set(), sales: new Set(),
          buyers500: new Set(), cash: 0, cashEvents: 0,
          attributedEvents: 0, directAngleEvents: 0,
        })
      }
      return angleStats.get(angle)!
    }

    for (const angle of SALES_ANGLES) getAngle(angle)
    for (const asset of assets) getAngle(asset.angle).assets += 1

    const lastAngle = new Map<string, string>()
    for (const event of (events || []) as Event[]) {
      const directAngle =
        event.metadata?.angle ??
        event.metadata?.angulo ??
        event.metadata?.sales_angle
      if (directAngle) lastAngle.set(event.person_id, cleanAngle(directAngle))
      const inheritedAngle = directAngle || lastAngle.get(event.person_id)
      const angle = cleanAngle(inheritedAngle || (SALE_EVENTS.has(event.event_type) ? diagnosedAngle.get(event.person_id) : null))
      const stats = getAngle(angle)
      if (
        angle !== "Sin ángulo"
        && (STIMULUS_EVENTS.has(event.event_type) || AGENDA_EVENTS.has(event.event_type)
          || SHOW_EVENTS.has(event.event_type) || SALE_EVENTS.has(event.event_type))
      ) {
        stats.attributedEvents += 1
        if (directAngle || (SALE_EVENTS.has(event.event_type) && diagnosedAngle.has(event.person_id))) stats.directAngleEvents += 1
      }

      if (STIMULUS_EVENTS.has(event.event_type)) stats.touches.add(event.person_id)
      if (AGENDA_EVENTS.has(event.event_type)) {
        stats.agendas.add(event.person_id)
        const score = String(
          event.metadata?.score ?? event.metadata?.calificacion ?? event.metadata?.qualification ?? "",
        ).toUpperCase().trim()
        if (QUALIFIED.has(score)) stats.qualifiedAgendas.add(event.person_id)
      }
      if (SHOW_EVENTS.has(event.event_type)) stats.shows.add(event.person_id)
      if (SALE_EVENTS.has(event.event_type)) {
        stats.sales.add(event.person_id)
        const amount = Number(event.metadata?.monto ?? event.metadata?.amount ?? 0)
        if (Number.isFinite(amount) && amount > 0) {
          stats.cash += amount
          stats.cashEvents += 1
          if (amount >= 500) stats.buyers500.add(event.person_id)
        }
      }
    }

    const angles = [...angleStats.values()]
      .map((row) => ({
        angle: row.angle,
        assets: row.assets,
        touches: row.touches.size,
        agendas: row.agendas.size,
        qualifiedAgendas: row.qualifiedAgendas.size,
        shows: row.shows.size,
        sales: row.sales.size,
        buyers500: row.buyers500.size,
        cash: row.cashEvents ? Math.round(row.cash * 100) / 100 : null,
        agendaRate: row.touches.size ? Math.round((row.agendas.size / row.touches.size) * 1000) / 10 : null,
        closeRate: row.shows.size && row.sales.size <= row.shows.size
          ? Math.round((row.sales.size / row.shows.size) * 1000) / 10
          : null,
        evidenceCoverage: row.attributedEvents
          ? Math.round((row.directAngleEvents / row.attributedEvents) * 1000) / 10
          : null,
        denominators: {
          agendaRate: row.touches.size,
          closeRate: row.shows.size,
          evidenceCoverage: row.attributedEvents,
        },
      }))
      .sort((left, right) => right.sales - left.sales || right.agendas - left.agendas || right.assets - left.assets)

    const totalSales = new Set(
      (events || []).filter((event: Event) => SALE_EVENTS.has(event.event_type)).map((event: Event) => event.person_id),
    ).size
    const attributedSales = angles
      .filter((row) => row.angle !== "Sin ángulo")
      .reduce((sum, row) => sum + row.sales, 0)

    return NextResponse.json({
      schemaReady: true,
      assets,
      angles,
      totals: {
        assets: assets.length,
        angles: angles.filter((row) => row.angle !== "Sin ángulo").length,
        touches: new Set((events || []).filter((event: Event) => STIMULUS_EVENTS.has(event.event_type)).map((event: Event) => event.person_id)).size,
        agendas: new Set((events || []).filter((event: Event) => AGENDA_EVENTS.has(event.event_type)).map((event: Event) => event.person_id)).size,
        sales: totalSales,
        attributedSales,
        traceCoverage: totalSales ? Math.round((attributedSales / totalSales) * 1000) / 10 : null,
        buyers500: new Set((events || []).filter((event: Event) => {
          if (!SALE_EVENTS.has(event.event_type)) return false
          const amount = Number(event.metadata?.monto ?? event.metadata?.amount ?? 0)
          return Number.isFinite(amount) && amount >= 500
        }).map((event: Event) => event.person_id)).size,
      },
      methodology: {
        attribution: "Entrada explícita para estímulo/agenda; para compradores sin entrada trazada se usa el diagnóstico de su call, sin presentarlo como atribución de contenido.",
        qualified: "Solo S/A/B explícito en el evento de agenda.",
        buyer500: "Pago explícito individual mayor o igual a USD 500; no es Revenue contractual.",
        caveat: "Sin denominador o monto explícito se devuelve null, nunca cero inferido.",
        incompatibleDenominator: "Show→venta solo se calcula cuando ventas y shows pertenecen a un universo comparable.",
      },
    })
  } catch {
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 })
  }
}
