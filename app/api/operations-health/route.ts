import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"

export const dynamic = "force-dynamic"

export async function GET() {
  const admin = createSupabaseAdmin()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const [jobs, observations, notifications, cache] = await Promise.all([
    admin.from("crm_integration_jobs").select("provider,status,attempts,created_at,updated_at,last_error,duration_ms").gte("created_at", since).order("created_at", { ascending: false }).limit(500),
    admin.from("crm_api_observations").select("route,provider,status_code,duration_ms,error_code,observed_at").gte("observed_at", since).order("observed_at", { ascending: false }).limit(1000),
    admin.from("crm_notification_outbox").select("status,assigned_role,account_id,created_at,last_error").gte("created_at", since).limit(500),
    admin.from("crm_metric_cache").select("cache_key,computed_at,expires_at,computation_ms,row_count,last_error").order("computed_at", { ascending: false }),
  ])
  const error = jobs.error || observations.error || notifications.error || cache.error
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const observationRows = observations.data || []
  const jobRows = jobs.data || []
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    jobs: {
      total24h: jobRows.length,
      errors: jobRows.filter((row) => ["error", "dead"].includes(row.status)).length,
      processing: jobRows.filter((row) => row.status === "processing").length,
      rows: jobRows.slice(0, 50),
    },
    api: {
      calls24h: observationRows.length,
      errors: observationRows.filter((row) => row.status_code >= 500).length,
      p95Ms: percentile95(observationRows.map((row) => row.duration_ms)),
      rows: observationRows.slice(0, 50),
    },
    notifications: notifications.data || [],
    cache: cache.data || [],
  })
}

export async function POST() {
  const admin = createSupabaseAdmin()
  const started = Date.now()
  const [signals, notifications] = await Promise.all([
    admin.rpc("crm_refresh_client_engagement_signals"),
    admin.rpc("crm_queue_exception_notifications"),
  ])
  const error = signals.error || notifications.error
  await admin.from("crm_api_observations").insert({
    route: "/api/operations-health",
    provider: "crm",
    status_code: error ? 500 : 200,
    duration_ms: Date.now() - started,
    error_code: error?.code || null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ refreshedClients: signals.data || 0, queuedNotifications: notifications.data || 0 })
}

function percentile95(values: number[]) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]
}
