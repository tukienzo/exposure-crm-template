import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  const admin = createSupabaseAdmin()
  const startedAt = Date.now()
  const [signals, notifications] = await Promise.all([
    admin.rpc("crm_refresh_client_engagement_signals"),
    admin.rpc("crm_queue_exception_notifications"),
  ])
  const error = signals.error || notifications.error
  await admin.from("crm_api_observations").insert({
    route: "/api/operations-refresh",
    provider: "crm",
    status_code: error ? 500 : 200,
    duration_ms: Date.now() - startedAt,
    error_code: error?.code || null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, refreshed_clients: signals.data || 0, queued_notifications: notifications.data || 0 })
}
