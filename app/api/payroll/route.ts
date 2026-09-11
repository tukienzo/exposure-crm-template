import { NextResponse } from "next/server"
import { requireFinanzas } from "@/lib/finanzas-guard"
import { createSupabaseAdmin } from "@/lib/supabase-admin"

export async function GET() {
  const admin = await requireFinanzas()
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  const { data, error } = await admin
    .from("payroll")
    .select("*")
    .order("mes_orden", { ascending: false })
    .order("total_usd", { ascending: false, nullsFirst: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function PATCH(request: Request) {
  const admin = await requireFinanzas()
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  const body = await request.json()
  const { id } = body
  if (!id) return NextResponse.json({ error: "Datos invalidos" }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (typeof body.pagado === "boolean") updates.pagado = body.pagado
  if (typeof body.total_usd === "number" && !Number.isNaN(body.total_usd)) updates.total_usd = body.total_usd
  if (typeof body.total_ars === "number" && !Number.isNaN(body.total_ars)) updates.total_ars = body.total_ars
  if (typeof body.nombre === "string" && body.nombre.trim()) updates.nombre = body.nombre.trim()
  if ("departamento" in body) updates.departamento = body.departamento || null
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 })

  const { error } = await admin.from("payroll").update(updates).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function POST(request: Request) {
  const admin = await requireFinanzas()
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  const body = await request.json()
  const { mes, nombre } = body
  if (!mes || !nombre || !String(nombre).trim()) {
    return NextResponse.json({ error: "Falta mes o nombre" }, { status: 400 })
  }
  const row = {
    mes,
    mes_orden: typeof body.mes_orden === "number" ? body.mes_orden : null,
    nombre: String(nombre).trim(),
    departamento: body.departamento || null,
    total_usd: typeof body.total_usd === "number" ? body.total_usd : 0,
    total_ars: typeof body.total_ars === "number" ? body.total_ars : null,
    pagado: false,
  }
  const { data, error } = await admin.from("payroll").insert(row).select("id").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}

export async function DELETE(request: Request) {
  const admin = await requireFinanzas()
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 })
  const { error } = await admin.from("payroll").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
