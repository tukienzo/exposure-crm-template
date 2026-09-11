import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { isPreviewRuntime, supabaseProjectRef } from "@/lib/preview-runtime"

export const maxDuration = 60
export const dynamic = "force-dynamic"

type Module = "agendas" | "pagos" | "cuotas" | "clientes" | "historia"

const MODULES: Record<Module, { table: string; field: string }> = {
  agendas: { table: "agendas", field: "fecha_agenda" },
  pagos: { table: "pagos", field: "fecha" },
  cuotas: { table: "plan_pago_items", field: "fecha_planeada" },
  clientes: { table: "clientes", field: "fecha_ingreso" },
  historia: { table: "crm_events", field: "occurred_at" },
}

function monthKeys() {
  const out: string[] = []
  for (let year = 2024; year <= 2026; year++) {
    const first = year === 2024 ? 8 : 1
    const last = year === 2026 ? 7 : 12
    for (let month = first; month <= last; month++) {
      out.push(`${year}-${String(month).padStart(2, "0")}`)
    }
  }
  return out
}

function nextMonth(month: string) {
  const [year, value] = month.split("-").map(Number)
  const date = new Date(Date.UTC(year, value, 1))
  return date.toISOString().slice(0, 7)
}

async function countRange(table: string, field: string, start: string, endExclusive: string) {
  const sb = createSupabaseAdmin()
  const { count, error } = await sb
    .from(table)
    .select("*", { count: "exact", head: true })
    .gte(field, start)
    .lt(field, endExclusive)
  if (error) throw new Error(`${table}.${field}: ${error.message}`)
  return count || 0
}

export async function GET() {
  try {
    const months = await Promise.all(monthKeys().map(async (month) => {
      const start = `${month}-01`
      const end = `${nextMonth(month)}-01`
      const entries = await Promise.all(
        (Object.entries(MODULES) as Array<[Module, { table: string; field: string }]>)
          .map(async ([key, source]) => [key, await countRange(source.table, source.field, start, end)] as const),
      )
      return { month, ...Object.fromEntries(entries) } as { month: string } & Record<Module, number>
    }))

    const quarterMap = new Map<string, Record<Module, number>>()
    for (const row of months) {
      const [year, month] = row.month.split("-").map(Number)
      const key = `${year}-Q${Math.ceil(month / 3)}`
      if (!quarterMap.has(key)) {
        quarterMap.set(key, { agendas: 0, pagos: 0, cuotas: 0, clientes: 0, historia: 0 })
      }
      const quarter = quarterMap.get(key)!
      for (const moduleKey of Object.keys(MODULES) as Module[]) quarter[moduleKey] += row[moduleKey]
    }

    const sb = createSupabaseAdmin()
    const [
      allCalls,
      readyCalls,
      identityLinkedCalls,
      reviewCalls,
      salesCalls,
      onboardingCalls,
      transcriptCalls,
      traceRows,
      people,
      identities,
      contentAssets,
    ] = await Promise.all([
      sb.from("crm_call_records").select("*", { count: "exact", head: true }),
      sb.from("crm_call_records").select("*", { count: "exact", head: true }).eq("needs_review", false),
      sb.from("crm_call_records").select("*", { count: "exact", head: true }).not("person_id", "is", null),
      sb.from("crm_call_records").select("*", { count: "exact", head: true }).eq("needs_review", true),
      sb.from("crm_call_records").select("*", { count: "exact", head: true }).eq("call_type", "sales"),
      sb.from("crm_call_records").select("*", { count: "exact", head: true }).eq("call_type", "onboarding"),
      sb.from("crm_call_records").select("*", { count: "exact", head: true }).not("transcript", "is", null),
      sb.from("crm_call_records").select("trace_analysis,person_id,agenda_id,needs_review").limit(5000),
      sb.from("crm_people").select("*", { count: "exact", head: true }),
      sb.from("crm_identities").select("*", { count: "exact", head: true }),
      sb.from("crm_content_assets").select("*", { count: "exact", head: true }),
    ])

    const count = (result: { count: number | null; error: { message: string } | null }) => {
      if (result.error) throw new Error(result.error.message)
      return result.count || 0
    }
    if (traceRows.error) throw new Error(traceRows.error.message)

    const required = [
      "analisis", "primary_angle", "consumed_angles", "pain_points",
      "desired_outcomes", "objections", "buying_triggers", "outcome",
      "evidence_quotes", "trace_confidence",
    ]
    const structured = (traceRows.data || []).filter((row) => {
      const value = row.trace_analysis as Record<string, unknown> | null
      return value
        && value.analysis_status !== "pending"
        && required.every((field) => field in value)
    }).length
    const pending = (traceRows.data || []).filter((row) => {
      const value = row.trace_analysis as Record<string, unknown> | null
      return value?.analysis_status === "pending"
    }).length

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      runtime: {
        preview: isPreviewRuntime(),
        vercel_env: process.env.VERCEL_ENV || null,
        supabase_project_ref: supabaseProjectRef(),
      },
      period: { start: "2024-08-01", end: "2026-07-31" },
      source_of_truth: {
        agendas: "agendas.fecha_agenda",
        pagos: "pagos.fecha",
        cuotas: "plan_pago_items.fecha_planeada",
        clientes: "clientes.fecha_ingreso",
        historia: "crm_events.occurred_at",
      },
      months,
      quarters: [...quarterMap.entries()].map(([quarter, values]) => ({ quarter, ...values })),
      fathom: {
        total: count(allCalls),
        ready_without_review: count(readyCalls),
        identity_linked: count(identityLinkedCalls),
        needs_review: count(reviewCalls),
        sales: count(salesCalls),
        onboarding: count(onboardingCalls),
        with_full_transcript: count(transcriptCalls),
        with_required_trace_fields: structured,
        analysis_pending: pending,
        trace_sample_size: (traceRows.data || []).length,
      },
      canonical: {
        people: count(people),
        identities: count(identities),
        content_assets: count(contentAssets),
      },
      caveats: [
        "Los conteos mensuales son filas fuente, no personas únicas.",
        "Sin filas significa sin datos observados; no se rellena con estimaciones.",
        "La tabla histórica cuotas no se usa como deuda operativa.",
        "La cobertura estructurada se calcula sobre las llamadas retornadas por la consulta de auditoría.",
      ],
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo auditar el preview" },
      { status: 500 },
    )
  }
}
