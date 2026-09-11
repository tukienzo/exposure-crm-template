import { isContentOnlyAccount } from "@/lib/role-access"
import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { SALES_ANGLES } from "@/lib/sales-angles"
import { createSupabaseServer } from "@/lib/supabase-server"
import {
  BUYER_ARCHETYPES,
  buyingMotive,
  callEvidenceText,
  classifyBuyerArchetype,
  knownSalesAngle,
  unknownSalesAngle,
} from "@/lib/trace-intelligence"

export const dynamic = "force-dynamic"
export const revalidate = 0

type AnyRow = Record<string, any>
const RETENTION_PAYMENT_TYPES = new Set(["Fee Venta Interna", "Venta Nueva Interna", "Venta Nueva Interna (Post Fee)", "Cuota Venta Interna", "Upsell", "Rollover"])

async function allRows(fetchPage: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>) {
  const rows: AnyRow[] = []
  const size = 1000
  for (let from = 0; ; from += size) {
    const { data, error } = await fetchPage(from, from + size - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data || []))
    if ((data || []).length < size) return rows
  }
}

const money = (value: unknown) => {
  const parsed = Number(String(value ?? 0).replace(/[^0-9.-]/g, ""))
  return Number.isFinite(parsed) ? parsed : 0
}
const round = (value: number) => Math.round(value * 100) / 100
const day = (value: unknown) => String(value || "").slice(0, 10)
const text = (value: unknown) => String(value ?? "").trim()
const isYes = (value: unknown) => ["si", "sí", "true", "1"].includes(text(value).toLowerCase())

function reviewMap(rows: AnyRow[]) {
  const map = new Map<string, AnyRow>()
  for (const row of rows) map.set(row.source_id, row.metadata || {})
  return map
}

function sourceGroup(value: unknown) {
  const raw = text(value)
  const lower = raw.toLowerCase()
  if (/manychat|bienvenida|follow/.test(lower)) return "ManyChat / nuevos seguidores"
  if (/reel/.test(lower)) return "Reel"
  if (/histor|story/.test(lower)) return "Historia"
  if (/carrusel/.test(lower)) return "Carrusel"
  if (/outbound/.test(lower)) return "Outbound"
  if (/ads?|pauta|meta/.test(lower)) return "Ads"
  if (/instagram|dm/.test(lower)) return "Instagram DM"
  return raw || "Sin fuente"
}

export async function GET(request: Request) {
  try {
    const session = await createSupabaseServer()
    const { data: { user } } = await session.auth.getUser()
    if (isContentOnlyAccount(user?.email)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }
    const sb = createSupabaseAdmin()
    const startedAt = Date.now()
    const cacheKey = "trace-intelligence:v3"
    const forceRefresh = new URL(request.url).searchParams.get("refresh") === "1"
    if (!forceRefresh) {
      const { data: cached } = await sb.from("crm_metric_cache").select("value,computed_at,expires_at").eq("cache_key", cacheKey).maybeSingle()
      if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
        return NextResponse.json({ ...(cached.value as object), cache: { hit: true, computedAt: cached.computed_at } })
      }
    }
    const [assets, agendas, payments, calls, events, summaries, reviews] = await Promise.all([
      allRows((from, to) => sb.from("crm_content_assets")
        .select("id,title,angle,format,topic,source_key,source_url,planned_at,published_at,status,metadata")
        .range(from, to)),
      allRows((from, to) => sb.from("agendas")
        .select("id,person_id,nombre,fecha_agenda,fecha_lead,created_at,calificacion,show,cerro,estado,fuente,cuenta,setter,closer,recurso,puntos_contacto,resumen_chat")
        .or("estado.is.null,estado.neq.Archivada manualmente")
        .range(from, to)),
      allRows((from, to) => sb.from("pagos")
        .select("id,person_id,cliente,fecha,monto,tipo,fuente,operacion,contenido_contestado")
        .eq("record_status", "active")
        .range(from, to)),
      allRows((from, to) => sb.from("crm_call_records")
        .select("id,person_id,call_type,occurred_at,fathom_url,trace_analysis,needs_review,match_confidence")
        .range(from, to)),
      allRows((from, to) => sb.from("crm_events")
        .select("id,person_id,event_type,occurred_at,title,source,metadata")
        .in("event_type", ["content_replied", "content_attributed", "sales_angle"])
        .order("occurred_at", { ascending: true })
        .range(from, to)),
      allRows((from, to) => sb.from("crm_integration_assets")
        .select("source_id,metadata")
        .eq("source", "manychat")
        .eq("asset_type", "chat_summary")
        .range(from, to)),
      allRows((from, to) => sb.from("crm_integration_assets")
        .select("source_id,metadata")
        .eq("source", "trace_review")
        .eq("asset_type", "decision")
        .range(from, to)),
    ])

    const reviewsById = reviewMap(reviews)
    const assetById = new Map(assets.map((row) => [row.id, row]))
    const summaryByPerson = new Map(summaries.map((row) => [row.source_id, text(row.metadata?.summary)]))
    const agendasByPerson = new Map<string, AnyRow[]>()
    const callsByPerson = new Map<string, AnyRow[]>()
    const paymentsByPerson = new Map<string, AnyRow[]>()
    const touchesByPerson = new Map<string, AnyRow[]>()

    for (const row of agendas) {
      if (!row.person_id) continue
      if (!agendasByPerson.has(row.person_id)) agendasByPerson.set(row.person_id, [])
      agendasByPerson.get(row.person_id)!.push(row)
    }
    for (const row of calls) {
      if (!row.person_id) continue
      if (!callsByPerson.has(row.person_id)) callsByPerson.set(row.person_id, [])
      callsByPerson.get(row.person_id)!.push(row)
    }
    for (const row of payments) {
      if (!row.person_id || money(row.monto) <= 0) continue
      if (!paymentsByPerson.has(row.person_id)) paymentsByPerson.set(row.person_id, [])
      paymentsByPerson.get(row.person_id)!.push(row)
    }
    for (const row of events) {
      if (!row.person_id) continue
      const metadata = row.metadata || {}
      const asset = metadata.content_asset_id ? assetById.get(metadata.content_asset_id) : null
      const angle = knownSalesAngle(metadata.angle || metadata.angulo || metadata.sales_angle || asset?.angle)
      if (!angle) continue
      if (!touchesByPerson.has(row.person_id)) touchesByPerson.set(row.person_id, [])
      touchesByPerson.get(row.person_id)!.push({
        ...row,
        angle,
        asset,
        isTrigger: Boolean(metadata.trigger_for_booking),
        confidence: metadata.attribution_confidence || (row.event_type === "content_attributed" ? "high" : "medium"),
      })
    }
    for (const rows of agendasByPerson.values()) rows.sort((a, b) => text(a.fecha_agenda).localeCompare(text(b.fecha_agenda)))
    for (const rows of callsByPerson.values()) rows.sort((a, b) => text(a.occurred_at).localeCompare(text(b.occurred_at)))
    for (const rows of touchesByPerson.values()) rows.sort((a, b) => text(a.occurred_at).localeCompare(text(b.occurred_at)))

    const angleStats = new Map<string, AnyRow>()
    const archetypeStats = new Map<string, AnyRow>()
    const motiveStats = new Map<string, AnyRow>()
    const sourceStats = new Map<string, AnyRow>()
    const journeyStats = new Map<string, AnyRow>()
    const pieceStats = new Map<string, AnyRow>()
    const reviewQueue: AnyRow[] = []
    const people = new Set([...agendasByPerson.keys(), ...paymentsByPerson.keys(), ...callsByPerson.keys()])

    const getAngle = (angle: string) => {
      if (!angleStats.has(angle)) angleStats.set(angle, {
        angle, assets: 0, touches: new Set(), agendas: new Set(), qualifiedAgendas: new Set(),
        shows: new Set(), buyers: new Set(), buyers500: new Set(), entryBuyers: new Set(),
        diagnosedBuyers: new Set(), retainedBuyers: new Set(), cash: 0, diagnosedCash: 0, retainedCash: 0,
      })
      return angleStats.get(angle)!
    }
    for (const angle of SALES_ANGLES) getAngle(angle)
    for (const asset of assets) {
      const angle = knownSalesAngle(asset.angle)
      if (angle && !asset.metadata?.excluded_from_measurement) getAngle(angle).assets += 1
    }

    for (const personId of people) {
      const personAgendas = agendasByPerson.get(personId) || []
      const personCalls = callsByPerson.get(personId) || []
      const personPayments = paymentsByPerson.get(personId) || []
      const personTouches = touchesByPerson.get(personId) || []
      const buyerCash = personPayments.reduce((sum, row) => sum + money(row.monto), 0)
      const retainedCash = personPayments.filter((row) => RETENTION_PAYMENT_TYPES.has(text(row.tipo))).reduce((sum, row) => sum + money(row.monto), 0)
      const isRetainedBuyer = retainedCash > 0
      const isBuyer = buyerCash > 0
      const firstAgenda = personAgendas[0]
      const name = firstAgenda?.nombre || personPayments[0]?.cliente || "Lead sin nombre"
      const firstBookingAt = firstAgenda?.fecha_agenda || firstAgenda?.created_at || null
      const touchesBeforeBooking = firstBookingAt
        ? personTouches.filter((row) => !row.occurred_at || row.occurred_at <= firstBookingAt)
        : personTouches
      const entryTouch = touchesBeforeBooking[0] || personTouches[0] || null
      const triggerTouch = [...touchesBeforeBooking].reverse().find((row) => row.isTrigger)
        || [...touchesBeforeBooking].reverse()[0] || null
      const latestCompleteCall = [...personCalls].reverse().find((row) => row.trace_analysis?.analysis_status === "complete")
        || [...personCalls].reverse()[0]
      const rawDiagnosedAngle = latestCompleteCall?.trace_analysis?.primary_angle
      const diagnosedAngle = knownSalesAngle(rawDiagnosedAngle)
      const manual = reviewsById.get(personId) || {}
      const entryAngle = knownSalesAngle(manual.angle_override) || entryTouch?.angle || null

      const combinedEvidence = [
        summaryByPerson.get(personId),
        ...personCalls.map((row) => callEvidenceText(row.trace_analysis)),
      ].filter(Boolean).join("\n")
      const automaticArchetype = classifyBuyerArchetype(combinedEvidence)
      const archetype = BUYER_ARCHETYPES.includes(manual.archetype_override)
        ? manual.archetype_override
        : automaticArchetype.primary
      const traceConfidence = Number(latestCompleteCall?.trace_analysis?.trace_confidence || 0)

      for (const touch of personTouches) getAngle(touch.angle).touches.add(personId)
      if (entryAngle) {
        const stats = getAngle(entryAngle)
        for (const agenda of personAgendas) {
          stats.agendas.add(personId)
          const grade = text(agenda.calificacion).toUpperCase()
          if (["S", "A", "B", "LEAD S", "LEAD A", "LEAD B"].includes(grade)) stats.qualifiedAgendas.add(personId)
          if (isYes(agenda.show)) stats.shows.add(personId)
        }
        if (isBuyer) {
          stats.buyers.add(personId)
          stats.entryBuyers.add(personId)
          stats.cash += buyerCash
          if (isRetainedBuyer) { stats.retainedBuyers.add(personId); stats.retainedCash += retainedCash }
          if (buyerCash >= 500) stats.buyers500.add(personId)
        }
      }
      if (diagnosedAngle && isBuyer) {
        const stats = getAngle(diagnosedAngle)
        stats.diagnosedBuyers.add(personId)
        stats.diagnosedCash += buyerCash
      }

      if (archetype) {
        if (!archetypeStats.has(archetype)) archetypeStats.set(archetype, { archetype, leads: new Set(), buyers: new Set(), retainedBuyers: new Set(), cash: 0, retainedCash: 0, examples: [] })
        const stats = archetypeStats.get(archetype)!
        stats.leads.add(personId)
        if (isBuyer) { stats.buyers.add(personId); stats.cash += buyerCash }
        if (isRetainedBuyer) { stats.retainedBuyers.add(personId); stats.retainedCash += retainedCash }
        if (stats.examples.length < 3 && automaticArchetype.evidence.length) stats.examples.push({ name, evidence: automaticArchetype.evidence[0] })
      }

      const whyBought = personCalls.map((row) => row.trace_analysis?.why_bought).filter(Boolean).at(-1)
      const motive = isBuyer ? buyingMotive(whyBought) : null
      if (motive) {
        if (!motiveStats.has(motive)) motiveStats.set(motive, { motive, buyers: new Set(), cash: 0, examples: [] })
        const stats = motiveStats.get(motive)!
        stats.buyers.add(personId); stats.cash += buyerCash
        if (stats.examples.length < 3) stats.examples.push({ name, evidence: text(whyBought).slice(0, 220) })
      }

      const source = sourceGroup(firstAgenda?.fuente || personPayments[0]?.fuente)
      if (!sourceStats.has(source)) sourceStats.set(source, { source, leads: new Set(), agendas: new Set(), buyers: new Set(), cash: 0 })
      const sourceRow = sourceStats.get(source)!
      sourceRow.leads.add(personId)
      if (personAgendas.length) sourceRow.agendas.add(personId)
      if (isBuyer) { sourceRow.buyers.add(personId); sourceRow.cash += buyerCash }

      if (entryAngle || triggerTouch?.angle || diagnosedAngle) {
        const key = `${entryAngle || "Sin entrada"} → ${triggerTouch?.angle || "Setter/DM o sin gatillo"} → ${diagnosedAngle || "Sin diagnóstico"}`
        if (!journeyStats.has(key)) journeyStats.set(key, { journey: key, people: new Set(), buyers: new Set(), cash: 0 })
        const stats = journeyStats.get(key)!
        stats.people.add(personId)
        if (isBuyer) { stats.buyers.add(personId); stats.cash += buyerCash }
      }

      for (const touch of personTouches) {
        if (!touch.asset?.id) continue
        if (!pieceStats.has(touch.asset.id)) pieceStats.set(touch.asset.id, {
          id: touch.asset.id, title: touch.asset.title, angle: touch.angle, format: touch.asset.format,
          touches: new Set(), agendas: new Set(), buyers: new Set(), retainedBuyers: new Set(), cash: 0, retainedCash: 0,
        })
        const stats = pieceStats.get(touch.asset.id)!
        stats.touches.add(personId)
        if (personAgendas.length) stats.agendas.add(personId)
        if (isBuyer) { stats.buyers.add(personId); stats.cash += buyerCash }
        if (isRetainedBuyer) { stats.retainedBuyers.add(personId); stats.retainedCash += retainedCash }
      }

      const unknownAngle = unknownSalesAngle(rawDiagnosedAngle)
      const queueReason = unknownAngle ? "Ángulo nuevo no incluido en la taxonomía"
        : latestCompleteCall?.needs_review ? "Call sin identidad o matching confirmado"
          : isBuyer && !entryAngle ? "Comprador sin ángulo de entrada"
            : !archetype && (isBuyer || personAgendas.length) ? "Sin arquetipo respaldado"
              : automaticArchetype.primary && automaticArchetype.confidence < 0.7 ? "Arquetipo con confianza baja"
                : null
      if (queueReason && manual.status !== "resolved" && manual.status !== "ignored") {
        reviewQueue.push({
          id: personId, personId, name, reason: queueReason, cash: round(buyerCash),
          candidateAngle: unknownAngle || diagnosedAngle || entryAngle,
          candidateArchetype: automaticArchetype.primary,
          confidence: Math.max(traceConfidence, automaticArchetype.confidence),
          evidence: automaticArchetype.evidence.slice(0, 2),
          fathomUrl: latestCompleteCall?.fathom_url || null,
        })
      }
    }

    const totalCash = [...paymentsByPerson.values()].flat().reduce((sum, row) => sum + money(row.monto), 0)
    const attributedCash = [...angleStats.values()].reduce((sum, row) => sum + row.cash, 0)
    const buyers = paymentsByPerson.size
    const attributedBuyers = new Set([...angleStats.values()].flatMap((row) => [...row.entryBuyers])).size

    const angles = [...angleStats.values()].map((row) => ({
      angle: row.angle, assets: row.assets, touches: row.touches.size, agendas: row.agendas.size,
      qualifiedAgendas: row.qualifiedAgendas.size, shows: row.shows.size, sales: row.buyers.size,
      buyers500: row.buyers500.size, entryBuyers: row.entryBuyers.size,
      diagnosedBuyers: row.diagnosedBuyers.size, cash: round(row.cash), diagnosedCash: round(row.diagnosedCash),
      retainedBuyers: row.retainedBuyers.size, retainedCash: round(row.retainedCash),
      retentionRate: row.buyers.size ? round((row.retainedBuyers.size / row.buyers.size) * 100) : null,
      aov: row.buyers.size ? round(row.cash / row.buyers.size) : null,
      agendaRate: row.touches.size ? round((row.agendas.size / row.touches.size) * 100) : null,
      closeRate: row.shows.size ? round((row.buyers.size / row.shows.size) * 100) : null,
      evidenceCoverage: row.agendas.size ? round((row.touches.size / row.agendas.size) * 100) : null,
      denominators: { agendaRate: row.touches.size, closeRate: row.shows.size, evidenceCoverage: row.agendas.size },
    })).sort((a, b) => b.cash - a.cash || b.sales - a.sales || b.agendas - a.agendas)

    const payload = {
      generatedAt: new Date().toISOString(),
      totals: {
        assets: assets.length, angles: SALES_ANGLES.length, leads: people.size, agendas: agendasByPerson.size,
        buyers, buyers500: [...paymentsByPerson.values()].filter((rows) => rows.reduce((sum, row) => sum + money(row.monto), 0) >= 500).length,
        totalCash: round(totalCash), attributedCash: round(attributedCash),
        cashCoverage: totalCash ? round((attributedCash / totalCash) * 100) : null,
        attributedBuyers, buyerCoverage: buyers ? round((attributedBuyers / buyers) * 100) : null,
        reviewPending: reviewQueue.length,
      },
      angles,
      archetypes: [...archetypeStats.values()].map((row) => ({
        archetype: row.archetype, leads: row.leads.size, buyers: row.buyers.size, cash: round(row.cash),
        retainedBuyers: row.retainedBuyers.size, retainedCash: round(row.retainedCash),
        retentionRate: row.buyers.size ? round((row.retainedBuyers.size / row.buyers.size) * 100) : null,
        aov: row.buyers.size ? round(row.cash / row.buyers.size) : null, examples: row.examples,
      })).sort((a, b) => b.cash - a.cash),
      motives: [...motiveStats.values()].map((row) => ({
        motive: row.motive, buyers: row.buyers.size, cash: round(row.cash), examples: row.examples,
      })).sort((a, b) => b.cash - a.cash),
      sources: [...sourceStats.values()].map((row) => ({
        source: row.source, leads: row.leads.size, agendas: row.agendas.size, buyers: row.buyers.size, cash: round(row.cash),
      })).sort((a, b) => b.cash - a.cash),
      journeys: [...journeyStats.values()].map((row) => ({
        journey: row.journey, people: row.people.size, buyers: row.buyers.size, cash: round(row.cash),
      })).sort((a, b) => b.cash - a.cash).slice(0, 20),
      pieces: [...pieceStats.values()].map((row) => ({
        id: row.id, title: row.title, angle: row.angle, format: row.format, touches: row.touches.size,
        agendas: row.agendas.size, buyers: row.buyers.size, cash: round(row.cash),
        retainedBuyers: row.retainedBuyers.size, retainedCash: round(row.retainedCash),
        retentionRate: row.buyers.size ? round((row.retainedBuyers.size / row.buyers.size) * 100) : null,
      })).sort((a, b) => b.cash - a.cash || b.buyers - a.buyers).slice(0, 50),
      reviewQueue: reviewQueue.sort((a, b) => b.cash - a.cash || b.confidence - a.confidence).slice(0, 200),
      methodology: {
        entry: "Ángulo explícito más antiguo antes de la agenda. Nunca se reemplaza por el diagnóstico de la call.",
        trigger: "Última pieza explícita marcada como gatillo; material enviado por DM queda separado del ángulo de feed.",
        diagnosis: "Dolor/ángulo extraído de Fathom. Se muestra aparte y no se presenta como atribución de contenido.",
        cash: "Suma directa de pagos por person_id, una sola vez por comprador. Sin eventos duplicados.",
        retention: "Cash y compradores con pago backend/upsell/rollover explícito. Cuotas frontend no cuentan como retención.",
        archetype: "Cruce de resumen de chat + venta + onboarding; clasificación automática auditable y override humano.",
      },
    }
    const computationMs = Date.now() - startedAt
    await sb.from("crm_metric_cache").upsert({
      cache_key: cacheKey,
      value: payload,
      source_cursor: String(Math.max(assets.length, agendas.length, payments.length, calls.length, events.length)),
      computed_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      computation_ms: computationMs,
      row_count: assets.length + agendas.length + payments.length + calls.length + events.length,
      last_error: null,
    })
    return NextResponse.json({ ...payload, cache: { hit: false, computationMs } })
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 })
  }
}
