import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { createSupabaseServer } from "@/lib/supabase-server"
import { effectiveCRMRole } from "@/lib/role-access"
import { paginatedPayload, parsePagination } from "@/lib/pagination"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const sb = createSupabaseAdmin()
  const session = await createSupabaseServer()
  const { data: { user } } = await session.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  const { data: member } = await sb.from("team_members").select("nombre,rol,estado").eq("email", user.email.toLowerCase()).maybeSingle()
  if (member?.estado !== "aprobado") return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  const effectiveRole = effectiveCRMRole(member.rol, member.nombre)
  const params = new URL(request.url).searchParams
  const status = params.get("status") || "open"
  const role = effectiveRole === "CSM" ? "CSM" : params.get("role")
  const pagination = parsePagination(params, { pageSize: 100, maxPageSize: 250 })
  let query = sb.from("crm_exception_queue").select("*", pagination ? { count: "exact" } : undefined).order("due_at", { ascending: true }).order("issue_key", { ascending: true })
  if (status !== "all") query = query.eq("status", status)
  if (role) query = query.eq("assigned_role", role)
  query = pagination ? query.range(pagination.from, pagination.to) : query.limit(1000)
  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(pagination ? paginatedPayload(data || [], count || 0, pagination) : data || [])
}

export async function PATCH(request: Request) {
  const sb = createSupabaseAdmin()
  const session = await createSupabaseServer()
  const { data: { user } } = await session.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  const body = await request.json()
  if (!body.issue_key || !["resolved", "ignored"].includes(body.status)) {
    return NextResponse.json({ error: "Resolución inválida" }, { status: 400 })
  }
  const [{ data: member }, { data: issue }] = await Promise.all([
    sb.from("team_members").select("nombre,rol,estado").eq("email", user.email.toLowerCase()).maybeSingle(),
    sb.from("crm_exception_queue").select("assigned_role,owner_name").eq("issue_key", body.issue_key).maybeSingle(),
  ])
  const role = effectiveCRMRole(member?.rol, member?.nombre)
  const allowed = member?.estado === "aprobado" && issue && (
    role === "CEO"
    || role === "Sales Manager" && ["Setter", "Closer", "CSM"].includes(issue.assigned_role)
    || role === "Manager MKT" && issue.assigned_role === "Manager MKT"
    || role === "CSM" && issue.assigned_role === "CSM"
  )
  if (!allowed) return NextResponse.json({ error: "La excepción no pertenece a tu alcance" }, { status: 403 })
  const { error } = await sb.from("crm_quality_resolutions").upsert({
    issue_key: body.issue_key,
    status: body.status,
    note: String(body.note || "").trim() || null,
    resolved_by: user?.email || "CRM",
    resolved_at: new Date().toISOString(),
  }, { onConflict: "issue_key" })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await sb.from("crm_notification_outbox").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("source_issue_key", body.issue_key).eq("status", "pending")
  return NextResponse.json({ success: true })
}
