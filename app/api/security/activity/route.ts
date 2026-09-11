import { NextResponse } from "next/server"
import { createHash } from "crypto"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { createSupabaseServer } from "@/lib/supabase-server"
import { effectiveCRMRole } from "@/lib/role-access"

function clientIp(request: Request) {
  return (request.headers.get("x-forwarded-for")?.split(",")[0] || request.headers.get("x-real-ip") || "").trim() || null
}

function opaqueDeviceId(value: unknown) {
  const raw = String(value || "").slice(0, 200)
  return raw ? createHash("sha256").update(raw).digest("hex") : null
}

async function currentUser() {
  const session = await createSupabaseServer()
  const { data: { user } } = await session.auth.getUser()
  return user
}

async function requireCEO() {
  const user = await currentUser()
  if (!user?.email) return null
  const admin = createSupabaseAdmin()
  const { data } = await admin.from("team_members").select("rol,estado,nombre").eq("email", user.email.toLowerCase()).maybeSingle()
  return data?.estado === "aprobado" && effectiveCRMRole(data.rol, data.nombre) === "CEO" ? admin : null
}

export async function POST(request: Request) {
  const user = await currentUser()
  if (!user?.email) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const device = opaqueDeviceId(body.deviceId)
  if (!device) return NextResponse.json({ error: "Dispositivo inválido" }, { status: 400 })
  const admin = createSupabaseAdmin()
  const email = user.email.toLowerCase()
  const now = new Date().toISOString()
  // Se usa el registro de auditoría ya presente en producción. Cada muestra es
  // inmutable: esto evita que alguien pueda borrar el rastro actualizando fila.
  const { error } = await admin.from("finance_audit_log").insert({
    table_name: "crm_security_activity", record_id: email, action: "INSERT", changed_by: user.id,
    new_data: { user_id: user.id, email, device_id: device, ip_address: clientIp(request), user_agent: request.headers.get("user-agent")?.slice(0, 500) || null, event: body.event === "login" ? "login" : "heartbeat", seen_at: now },
  })
  if (error) return NextResponse.json({ error: "No se pudo registrar la actividad" }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function GET(request: Request) {
  const admin = await requireCEO()
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase()
  if (!email) return NextResponse.json({ error: "Mail requerido" }, { status: 400 })
  const { data, error } = await admin.from("finance_audit_log")
    .select("id,changed_at,new_data").eq("table_name", "crm_security_activity").eq("record_id", email)
    .order("changed_at", { ascending: false }).limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const raw = data || []
  const grouped = new Map<string, any>()
  for (const item of raw) {
    const value = item.new_data as Record<string, any>
    const id = String(value.device_id || "")
    if (!id) continue
    const current = grouped.get(id)
    if (!current) grouped.set(id, { id: String(item.id), device_id: id, ip_address: value.ip_address || null, user_agent: value.user_agent || null, first_seen_at: item.changed_at, last_seen_at: item.changed_at, last_login_at: value.event === "login" ? item.changed_at : null, login_count: value.event === "login" ? 1 : 0 })
    else {
      current.first_seen_at = item.changed_at
      if (value.event === "login") { current.login_count += 1; current.last_login_at ||= item.changed_at }
    }
  }
  const rows = [...grouped.values()]
  const active = rows.filter(row => Date.now() - new Date(row.last_seen_at).getTime() < 15 * 60 * 1000)
  return NextResponse.json({ rows, simultaneous: new Set(active.map(row => row.device_id)).size > 1 })
}
