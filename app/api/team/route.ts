import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { createSupabaseServer } from "@/lib/supabase-server"
import { effectiveCRMRole } from "@/lib/role-access"

const ROLES = ["Closer", "Setter", "CEO", "Sales Manager", "Contaduria", "Cobranzas", "Manager MKT", "CSM", "Editor"]
const REQUEST_ROLES = ROLES.filter(role => !["CEO", "Cobranzas"].includes(role))

// POST publico: pedir acceso (crea el usuario auth + fila pendiente)
export async function POST(request: Request) {
  try {
    const { nombre, email, rol, password } = await request.json()
    const mail = (email || "").trim().toLowerCase()
    if (
      !nombre || String(nombre).trim().length > 100
      || !mail || mail.length > 254
      || !REQUEST_ROLES.includes(rol)
      || !password || password.length < 12 || password.length > 128
    ) {
      return NextResponse.json({ error: "Datos incompletos." }, { status: 400 })
    }
    const admin = createSupabaseAdmin()

    const { data: existing } = await admin
      .from("team_members")
      .select("estado")
      .eq("email", mail)
      .maybeSingle()
    if (existing?.estado === "aprobado") {
      return NextResponse.json({ error: "Ese mail ya tiene acceso. Ingresá desde la pantalla de login." }, { status: 400 })
    }

    // Crear el usuario de login (ya confirmado). Si ya existe, seguimos igual.
    const { error: cerr } = await admin.auth.admin.createUser({
      email: mail,
      password,
      email_confirm: true,
    })
    if (cerr && !/registered|already|exists/i.test(cerr.message)) {
      return NextResponse.json({ error: "No se pudo crear la solicitud." }, { status: 500 })
    }

    const { error } = await admin
      .from("team_members")
      .upsert({ email: mail, nombre, rol, estado: "pendiente" }, { onConflict: "email" })
    if (error) return NextResponse.json({ error: "No se pudo guardar la solicitud." }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}

// Verifica que quien llama sea un CEO aprobado
async function requireCEO() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null
  const admin = createSupabaseAdmin()
  const { data } = await admin
    .from("team_members")
    .select("rol,estado,nombre")
    .eq("email", user.email.toLowerCase())
    .maybeSingle()
  if (data?.estado === "aprobado" && effectiveCRMRole(data?.rol, data?.nombre) === "CEO") return { admin, callerEmail: user.email.toLowerCase() }
  return null
}

// GET: lista de miembros (solo CEO)
export async function GET() {
  const ctx = await requireCEO()
  if (!ctx) return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  const { data } = await ctx.admin
    .from("team_members")
    .select("id,email,nombre,rol,estado,created_at")
    .order("created_at", { ascending: false })
  return NextResponse.json(data || [])
}

// PATCH: aprobar / rechazar / cambiar rol (solo CEO)
export async function PATCH(request: Request) {
  const ctx = await requireCEO()
  if (!ctx) return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  const { email, estado, rol } = await request.json()
  const mail = (email || "").trim().toLowerCase()
  const updates: Record<string, string> = {}
  if (estado) updates.estado = estado
  if (rol && ROLES.includes(rol)) updates.rol = rol
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 })
  const { error } = await ctx.admin.from("team_members").update(updates).eq("email", mail)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE: revoca tanto la membresía como el usuario de Auth (solo CEO).
export async function DELETE(request: Request) {
  const ctx = await requireCEO()
  if (!ctx) return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  const { email } = await request.json()
  const mail = (email || "").trim().toLowerCase()
  if (!mail) return NextResponse.json({ error: "Mail requerido" }, { status: 400 })
  if (mail === ctx.callerEmail) {
    return NextResponse.json({ error: "No podés eliminar tu propio acceso mientras estás logueado con él." }, { status: 400 })
  }
  const { data: users, error: listError } = await ctx.admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (listError) return NextResponse.json({ error: listError.message }, { status: 500 })
  const authUser = users.users.find(user => user.email?.toLowerCase() === mail)
  if (authUser) {
    const { error: authError } = await ctx.admin.auth.admin.deleteUser(authUser.id)
    if (authError) return NextResponse.json({ error: authError.message }, { status: 500 })
  }
  const { error } = await ctx.admin.from("team_members").delete().eq("email", mail)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
