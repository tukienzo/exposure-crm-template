import { NextResponse } from "next/server"
import { requireFinanzas } from "@/lib/finanzas-guard"

export async function GET() {
  const admin = await requireFinanzas()
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  const { data, error } = await admin
    .from("gastos")
    .select("*")
    .order("mes_orden", { ascending: true })
    .order("fecha", { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(request: Request) {
  const admin = await requireFinanzas()
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  const body = await request.json()
  const { mes, concepto } = body
  if (!mes || !concepto || !String(concepto).trim()) {
    return NextResponse.json({ error: "Falta mes o concepto" }, { status: 400 })
  }
  const row = {
    mes,
    mes_orden: typeof body.mes_orden === "number" ? body.mes_orden : null,
    fecha: body.fecha || null,
    concepto: String(concepto).trim(),
    monto_usd: typeof body.monto_usd === "number" ? body.monto_usd : 0,
    tipo_gasto: body.tipo_gasto || null,
    departamento: body.departamento || null,
  }
  const { data, error } = await admin.from("gastos").insert(row).select("id").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}

export async function PATCH(request: Request) {
  const admin = await requireFinanzas()
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  const body = await request.json()
  const { id } = body
  if (!id) return NextResponse.json({ error: "Datos invalidos" }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (typeof body.monto_usd === "number" && !Number.isNaN(body.monto_usd)) updates.monto_usd = body.monto_usd
  if (typeof body.concepto === "string") updates.concepto = body.concepto
  if (typeof body.fecha === "string") updates.fecha = body.fecha
  if ("tipo_gasto" in body) updates.tipo_gasto = body.tipo_gasto || null
  if ("departamento" in body) updates.departamento = body.departamento || null
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 })

  const { error } = await admin.from("gastos").update(updates).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const admin = await requireFinanzas()
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 })
  const { error } = await admin.from("gastos").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
