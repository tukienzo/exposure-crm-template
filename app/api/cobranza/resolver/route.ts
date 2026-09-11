import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { createSupabaseServer } from "@/lib/supabase-server"

function norm(value: unknown) {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim().replace(/\s+/g, " ")
}

function sameClient(a: unknown, b: unknown) {
  const left = norm(a).split(" ").filter(Boolean)
  const right = new Set(norm(b).split(" ").filter(Boolean))
  return left.join(" ") === [...right].join(" ") || left.filter((part) => right.has(part)).length >= 2
}

function ownerKey(value: unknown) {
  return String(value || "").trim().split(/\s+/)[0]
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const paymentId = String(body.paymentId || "").trim()
    const itemIds = Array.from(new Set((Array.isArray(body.itemIds) ? body.itemIds : []).map((id: unknown) => String(id).trim()).filter(Boolean)))
    if (!paymentId || itemIds.length === 0) return NextResponse.json({ error: "Elegí un pago y al menos una cuota" }, { status: 400 })

    const sb = createSupabaseAdmin()
    const [{ data: payment, error: paymentError }, { data: items, error: itemsError }] = await Promise.all([
      sb.from("pagos").select("id,cliente,monto,comprobante,record_status").eq("id", paymentId).eq("record_status", "active").maybeSingle(),
      sb.from("plan_pago_items").select("id,plan_id,monto,estado,pago_id,planes_pago!inner(cliente,closer)").in("id", itemIds),
    ])
    if (paymentError || !payment) return NextResponse.json({ error: "El pago no existe o fue anulado" }, { status: 404 })
    if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })
    if (!items || items.length !== itemIds.length) return NextResponse.json({ error: "No se encontraron todas las cuotas" }, { status: 404 })
    if (new Set(items.map((item: any) => item.plan_id)).size !== 1) return NextResponse.json({ error: "Las cuotas deben pertenecer al mismo plan" }, { status: 400 })

    const session = await createSupabaseServer()
    const { data: { user } } = await session.auth.getUser()
    if (!user?.email) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    const { data: member } = await sb.from("team_members").select("nombre,rol,estado").eq("email", user.email.toLowerCase()).maybeSingle()
    if (member?.estado !== "aprobado") return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    if (member.rol === "Cobranzas") {
      const owner = ownerKey(member.nombre)
      if (!owner || items.some((item: any) => ownerKey(item.planes_pago?.closer) !== owner)) {
        return NextResponse.json({ error: "Este cobro no pertenece a tu cartera" }, { status: 403 })
      }
    }

    const planClient = (items[0] as any).planes_pago?.cliente
    if (!sameClient(payment.cliente, planClient)) return NextResponse.json({ error: "El pago seleccionado pertenece a otro cliente" }, { status: 400 })
    const alreadyLinked = items.filter((item: any) => item.pago_id && String(item.pago_id) !== paymentId)
    if (alreadyLinked.length) return NextResponse.json({ error: "Una de las cuotas ya está vinculada a otro pago" }, { status: 409 })

    const total = items.reduce((sum: number, item: any) => sum + Number(item.monto || 0), 0)
    const paymentAmount = Number(payment.monto || 0)
    if (paymentAmount + 0.01 < total) {
      return NextResponse.json({ error: `El pago (USD ${paymentAmount}) no alcanza para las cuotas elegidas (USD ${total})` }, { status: 400 })
    }

    const { error } = await sb.from("plan_pago_items").update({
      estado: "pagado",
      pago_id: paymentId,
      ...(payment.comprobante ? { comprobante: payment.comprobante } : {}),
    }).in("id", itemIds)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, linked: itemIds.length, total, paymentId })
  } catch (error) {
    console.error("resolver-cobranza", error)
    return NextResponse.json({ error: "No se pudo conciliar el pago" }, { status: 500 })
  }
}
