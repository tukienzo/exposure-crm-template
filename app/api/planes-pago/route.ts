import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { createSupabaseServer } from "@/lib/supabase-server"
import { paginatedPayload, parsePagination } from "@/lib/pagination"
import { canonicalCloserName } from "@/lib/equipo"

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error("Supabase credentials not configured")
  return createClient(url, key)
}

const ITEM_UPDATE_FIELDS = new Set(["concepto", "numero_cuota", "monto", "fecha_planeada", "medio_de_pago", "da_acceso", "estado", "pago_id", "comprobante", "cc_ars", "tipo_cambio_usd"])
const PLAN_UPDATE_FIELDS = new Set(["cliente", "telefono", "operacion", "closer", "categoria_venta", "setter", "calificacion", "fuente", "contenido_contestado", "fecha_alta", "fecha_baja"])
const CATEGORIAS_VENTA = new Set(["Front End", "Back End"])

function ownerKey(value: unknown) {
  const key = canonicalCloserName(value)
    .trim()
    .split(/\s+/)[0]
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
  return key
}

// GET: devuelve todos los planes con sus items (join). Sin filtro de fecha
// porque un plan puede tener cuotas que se extienden meses hacia adelante;
// el frontend filtra/busca por nombre en el cliente.
export async function GET(request: Request) {
  try {
    const sb = getSupabase()
    const params = new URL(request.url).searchParams
    let mine = params.get("mine") === "1"
    const pagination = parsePagination(params, { pageSize: 50, maxPageSize: 100 })
    let owner = ""
    {
      const session = await createSupabaseServer()
      const { data: { user } } = await session.auth.getUser()
      if (!user?.email) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
      const { data: member } = await sb.from("team_members").select("nombre,rol,estado").eq("email", user.email.toLowerCase()).maybeSingle()
      if (member?.rol === "Cobranzas") mine = true
      if (mine) {
        if (member?.estado !== "aprobado" || !["Closer", "Cobranzas"].includes(member?.rol || "")) return NextResponse.json({ error: "Filtro personal no disponible" }, { status: 403 })
        owner = ownerKey(member.nombre)
      }
    }
    let query = sb
      .from("planes_pago")
      .select("*, plan_pago_items(*)", pagination ? { count: "exact" } : undefined)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
    // No aplicar ilike acá: nombres históricos mezclan Tomás/Tomas. Supabase
    // no normaliza acentos en este filtro y dejaba la cartera del closer vacía.
    if (pagination) query = query.range(pagination.from, pagination.to)
    const { data, error, count } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const visible = owner ? (data || []).filter((plan: any) => ownerKey(plan.closer) === owner) : (data || [])
    const planIds = visible.map((plan: any) => String(plan.id))
    const { data: stateRows } = planIds.length
      ? await sb.from("crm_operation_requests").select("request_id,result").eq("operation", "payment_plan_status").in("request_id", planIds.map((id) => `plan_status:${id}`))
      : { data: [] as any[] }
    const states = new Map((stateRows || []).map((row: any) => [String(row.request_id).replace("plan_status:", ""), row.result?.estado_plan]))
    const enriched = visible.map((plan: any) => ({ ...plan, estado_plan: states.get(String(plan.id)) || "activo" }))
    return NextResponse.json(pagination ? paginatedPayload(enriched, owner ? enriched.length : count || 0, pagination) : enriched)
  } catch (err) {
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 })
  }
}

// POST: crea un plan nuevo + sus items en un solo llamado.
// Body esperado: { plan: {cliente, telefono, operacion, closer, setter, calificacion, fuente, contenido_contestado, fecha_alta, fecha_baja}, items: [{orden, concepto, numero_cuota, monto, fecha_planeada, medio_de_pago, da_acceso, estado, pago_id}, ...] }
export async function POST(request: Request) {
  try {
    const sb = getSupabase()
    const body = await request.json()

    // Agrega una nueva cuota/fila a un plan existente sin recrear el plan.
    if (body.planId) {
      // Los IDs de planes son UUID. Antes se intentaba convertirlos a Number,
      // lo que producía NaN y devolvía siempre "Plan inválido" al agregar una
      // fila a cualquier plan existente.
      const planId = String(body.planId || "").trim()
      const item = body.item || {}
      if (!planId) return NextResponse.json({ error: "Plan inválido" }, { status: 400 })
      if (!item.concepto || item.monto == null || !item.fecha_planeada) {
        return NextResponse.json({ error: "Completá concepto, monto y fecha planeada" }, { status: 400 })
      }

      const { data: lastItem, error: orderError } = await sb
        .from("plan_pago_items")
        .select("orden")
        .eq("plan_id", planId)
        .order("orden", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 })

      const { data, error } = await sb
        .from("plan_pago_items")
        .insert([{
          plan_id: planId,
          orden: Number(lastItem?.orden || 0) + 1,
          concepto: item.concepto,
          numero_cuota: item.numero_cuota != null ? Number(item.numero_cuota) : null,
          monto: Number(item.monto),
          fecha_planeada: item.fecha_planeada,
          medio_de_pago: item.medio_de_pago || null,
          da_acceso: !!item.da_acceso,
          estado: "pendiente",
          pago_id: null,
        }])
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(data, { status: 201 })
    }

    const plan = body.plan || {}
    const items = Array.isArray(body.items) ? body.items : []
    if (!plan.cliente) return NextResponse.json({ error: "Falta cliente" }, { status: 400 })
    if (!CATEGORIAS_VENTA.has(plan.categoria_venta)) return NextResponse.json({ error: "Elegí una Categoría de Venta válida" }, { status: 400 })
    if (items.length === 0) return NextResponse.json({ error: "El plan necesita al menos una fila" }, { status: 400 })

    // Evitar que un doble envío o reintento genere dos planes idénticos.
    // No fusionamos planes históricos: solo reutilizamos uno cuando cliente,
    // operación, closer y todas las cuotas coinciden exactamente.
    const { data: candidates } = await sb
      .from("planes_pago")
      .select("*,plan_pago_items(*)")
      .ilike("cliente", String(plan.cliente).trim())
      .eq("operacion", plan.operacion || "")
      .eq("closer", plan.closer || "")
      .order("created_at", { ascending: false })
      .limit(10)
    const itemSignature = (rows: any[]) => JSON.stringify([...rows]
      .sort((a, b) => Number(a.orden || 0) - Number(b.orden || 0))
      .map((item) => ({
        orden: Number(item.orden || 0), concepto: item.concepto || "",
        numero_cuota: item.numero_cuota == null ? null : Number(item.numero_cuota),
        monto: Number(item.monto || 0), fecha_planeada: item.fecha_planeada || null,
        medio_de_pago: item.medio_de_pago || null, da_acceso: Boolean(item.da_acceso),
      })))
    const duplicate = (candidates || []).find((candidate: any) =>
      candidate.categoria_venta === plan.categoria_venta &&
      itemSignature(candidate.plan_pago_items || []) === itemSignature(items),
    )
    if (duplicate) return NextResponse.json({ ...duplicate, deduplicated: true })

    const { data: planData, error: planError } = await sb
      .from("planes_pago")
      .insert([{
        cliente: plan.cliente,
        telefono: plan.telefono || null,
        operacion: plan.operacion || null,
        closer: plan.closer || null,
        categoria_venta: plan.categoria_venta,
        setter: plan.setter || null,
        calificacion: plan.calificacion || null,
        fuente: plan.fuente || null,
        contenido_contestado: plan.contenido_contestado || null,
        fecha_alta: plan.fecha_alta || null,
        fecha_baja: plan.fecha_baja || null,
      }])
      .select()
      .single()
    if (planError) return NextResponse.json({ error: planError.message }, { status: 500 })

    const itemsToInsert = items.map((it: any) => ({
      plan_id: planData.id,
      orden: it.orden,
      concepto: it.concepto,
      numero_cuota: it.numero_cuota ?? null,
      monto: it.monto != null ? parseFloat(it.monto) : null,
      fecha_planeada: it.fecha_planeada || null,
      medio_de_pago: it.medio_de_pago || null,
      da_acceso: !!it.da_acceso,
      estado: it.estado || "pendiente",
      pago_id: it.pago_id || null,
    }))

    const { data: itemsData, error: itemsError } = await sb
      .from("plan_pago_items")
      .insert(itemsToInsert)
      .select()
    if (itemsError) {
      // Evitar planes fantasma 0/0 si falla la inserción de sus cuotas.
      await sb.from("planes_pago").delete().eq("id", planData.id)
      return NextResponse.json({ error: itemsError.message }, { status: 500 })
    }

    return NextResponse.json({ ...planData, plan_pago_items: itemsData })
  } catch (err) {
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 })
  }
}

// PATCH: actualiza UN item de plan (marcar pagado + linkear pago_id) o el plan en si
// (ej fecha_alta/fecha_baja cuando se destraba el acceso). Body: {itemId, ...updates}
// o {planId, ...updates} segun cual se mande.
export async function PATCH(request: Request) {
  try {
    const sb = getSupabase()
    const body = await request.json()
    if (body.itemId) {
      const { itemId, action, ...rawUpdates } = body

      // Borrar una cuota vacía es una corrección operativa dentro del módulo,
      // no el borrado sensible de un plan completo. Se canaliza por PATCH para
      // que managers/closers autorizados al módulo puedan hacerlo, mientras el
      // DELETE del plan sigue reservado al CEO en el middleware.
      if (action === "delete_item") {
        const { data: item, error: itemError } = await sb
          .from("plan_pago_items")
          .select("id,pago_id")
          .eq("id", itemId)
          .maybeSingle()
        if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 })
        if (!item) return NextResponse.json({ error: "La cuota ya no existe" }, { status: 404 })
        if (item.pago_id) {
          return NextResponse.json({ error: "La cuota está vinculada a un pago real. Eliminá primero el pago desde Todos los Pagos." }, { status: 409 })
        }
        const { error } = await sb.from("plan_pago_items").delete().eq("id", itemId)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ success: true })
      }

      const updates = Object.fromEntries(Object.entries(rawUpdates).filter(([key]) => ITEM_UPDATE_FIELDS.has(key)))
      if (Object.keys(updates).length === 0) return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 })
      const { data: currentItem, error: currentError } = await sb
        .from("plan_pago_items")
        .select("pago_id")
        .eq("id", itemId)
        .maybeSingle()
      if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500 })

      const { data, error } = await sb.from("plan_pago_items").update(updates).eq("id", itemId).select()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      // Un ítem pagado y su fila en Registro de Pagos son la misma
      // transacción. Si se corrige fecha, monto o medio desde el plan, mantener
      // el registro sincronizado para que no queden dos verdades distintas.
      if (currentItem?.pago_id) {
        const paymentUpdates: Record<string, unknown> = {}
        if (Object.hasOwn(updates, "fecha_planeada")) paymentUpdates.fecha = updates.fecha_planeada
        if (Object.hasOwn(updates, "monto")) paymentUpdates.monto = updates.monto
        if (Object.hasOwn(updates, "medio_de_pago")) paymentUpdates.medio_de_pago = updates.medio_de_pago
        if (Object.hasOwn(updates, "concepto")) paymentUpdates.tipo = updates.concepto
        if (Object.hasOwn(updates, "comprobante")) paymentUpdates.comprobante = updates.comprobante
        if (Object.hasOwn(updates, "cc_ars")) paymentUpdates.cc_ars = updates.cc_ars
        if (Object.hasOwn(updates, "tipo_cambio_usd")) paymentUpdates.tipo_cambio_usd = updates.tipo_cambio_usd
        if (Object.keys(paymentUpdates).length > 0) {
          const { error: paymentError } = await sb
            .from("pagos")
            .update(paymentUpdates)
            .eq("id", currentItem.pago_id)
          if (paymentError) return NextResponse.json({ error: `El plan se actualizó, pero el registro de pago no: ${paymentError.message}` }, { status: 500 })
        }
      }
      return NextResponse.json(data?.[0] || { success: true })
    }
    if (body.planId) {
      const { planId, action, ...rawUpdates } = body

      // Eliminar una carga duplicada borra únicamente el plan y sus cuotas.
      // Los registros canónicos de `pagos` son independientes y se conservan,
      // incluso cuando una cuota del duplicado estaba vinculada por `pago_id`.
      if (action === "delete_duplicate_plan") {
        const { data: planItems, error: itemsLookupError } = await sb
          .from("plan_pago_items")
          .select("id,pago_id")
          .eq("plan_id", planId)
        if (itemsLookupError) return NextResponse.json({ error: itemsLookupError.message }, { status: 500 })
        const preservedPaymentIds = [...new Set((planItems || []).map((item) => item.pago_id).filter(Boolean))]
        const { error: itemsError } = await sb.from("plan_pago_items").delete().eq("plan_id", planId)
        if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })
        const { error: planError } = await sb.from("planes_pago").delete().eq("id", planId)
        if (planError) return NextResponse.json({ error: planError.message }, { status: 500 })
        await sb.from("crm_operation_requests").delete().eq("request_id", `plan_status:${planId}`)
        return NextResponse.json({ success: true, deleted_items: (planItems || []).length, preserved_payments: preservedPaymentIds.length })
      }

      if (Object.hasOwn(rawUpdates, "estado_plan")) {
        const estadoPlan = String(rawUpdates.estado_plan)
        if (!new Set(["activo", "inactivo_no_responde"]).has(estadoPlan)) {
          return NextResponse.json({ error: "Estado de plan inválido" }, { status: 400 })
        }
        const { error } = await sb.from("crm_operation_requests").upsert({
          request_id: `plan_status:${planId}`,
          operation: "payment_plan_status",
          result: { estado_plan: estadoPlan },
          completed_at: new Date().toISOString(),
        }, { onConflict: "request_id" })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        delete rawUpdates.estado_plan
        if (Object.keys(rawUpdates).length === 0) return NextResponse.json({ success: true, estado_plan: estadoPlan })
      }
      const updates = Object.fromEntries(Object.entries(rawUpdates).filter(([key]) => PLAN_UPDATE_FIELDS.has(key)))
      if (Object.keys(updates).length === 0) return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 })
      const { data, error } = await sb.from("planes_pago").update(updates).eq("id", planId).select()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(data?.[0] || { success: true })
    }
    return NextResponse.json({ error: "Falta itemId o planId" }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 })
  }
}

// DELETE: borra un item/cuota individual o un plan completo.
// Los items vinculados a un pago real no se borran desde acá: primero debe
// anularse/eliminarse el pago en el registro financiero.
export async function DELETE(request: Request) {
  try {
    const sb = getSupabase()
    const { planId, itemId } = await request.json()
    if (itemId) {
      const { data: item, error: itemError } = await sb
        .from("plan_pago_items")
        .select("id,pago_id")
        .eq("id", itemId)
        .maybeSingle()
      if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 })
      if (!item) return NextResponse.json({ error: "La cuota ya no existe" }, { status: 404 })
      if (item.pago_id) {
        return NextResponse.json({ error: "La cuota está vinculada a un pago real. Eliminá primero el pago desde Todos los Pagos." }, { status: 409 })
      }
      const { error } = await sb.from("plan_pago_items").delete().eq("id", itemId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }
    if (!planId) return NextResponse.json({ error: "Falta planId" }, { status: 400 })
    const { error: itemsError } = await sb.from("plan_pago_items").delete().eq("plan_id", planId)
    if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })
    const { error: planError } = await sb.from("planes_pago").delete().eq("id", planId)
    if (planError) return NextResponse.json({ error: planError.message }, { status: 500 })
    await sb.from("crm_operation_requests").delete().eq("request_id", `plan_status:${planId}`)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 })
  }
}
