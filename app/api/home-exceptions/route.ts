import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { createSupabaseServer } from "@/lib/supabase-server"
import { effectiveCRMRole } from "@/lib/role-access"

export const dynamic = "force-dynamic"

type ExceptionRow = {
  issue_key: string
  issue_type: string
  severity: string
  assigned_role: string
  owner_name: string | null
  entity_name: string
  due_at: string
  is_overdue: boolean
  status: string
}

export async function GET() {
  const session = await createSupabaseServer()
  const { data: { user } } = await session.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  const admin = createSupabaseAdmin()
  const { data: member } = await admin.from("team_members").select("nombre,rol,estado").eq("email", user.email.toLowerCase()).maybeSingle()
  if (member?.estado !== "aprobado") return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  const role = effectiveCRMRole(member.rol, member.nombre)
  const owner = String(member.nombre || "").trim().split(/\s+/)[0].toLowerCase()
  const { data, error } = await admin.from("crm_exception_queue").select("issue_key,issue_type,severity,assigned_role,owner_name,entity_name,due_at,is_overdue,status").eq("status", "open").order("due_at", { ascending: true }).limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const visible = ((data || []) as ExceptionRow[]).filter((row) => {
    if (role === "CEO") return true
    if (role === "Sales Manager") return ["Setter", "Closer", "CSM"].includes(row.assigned_role)
    if (role === "Manager MKT") return row.assigned_role === "Manager MKT"
    if (role === "CSM") return row.assigned_role === "CSM" && (!row.owner_name || row.owner_name.toLowerCase().startsWith(owner))
    if (role === "Setter" || role === "Closer") return row.assigned_role === role && Boolean(owner) && String(row.owner_name || "").toLowerCase().startsWith(owner)
    return false
  })
  return NextResponse.json({
    role,
    total: visible.length,
    overdue: visible.filter((row) => row.is_overdue).length,
    high: visible.filter((row) => row.severity === "alta").length,
    items: visible.slice(0, 12),
  })
}
