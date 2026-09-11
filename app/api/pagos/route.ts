import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { createSupabaseServer } from "@/lib/supabase-server"
import { paginatedPayload, parsePagination } from "@/lib/pagination"


function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error("Supabase credentials not configured")
  return createClient(url, key)
}

function ownerKey(value: unknown) {
  return String(value || "").trim().split(/\s+/)[0]
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

async function currentMember(sb: ReturnType<typeof getSupabase>) {
  const session = await createSupabaseServer()
  const { data: { user } } = await session.auth.getUser()
  if (!user?.email) return null
  const { data } = await sb.from("team_members").select("nombre,rol,estado").eq("email", user.email.toLowerCase()).maybeSingle()
  return data?.estado === "aprobado" ? data : null
}

export async function GET(request: Request) {
  try {
    const sb = getSupabase()
    const { searchParams } = new URL(request.url)
    const start = searchParams.get("start")
    const end = searchParams.get("end")
    const cliente = searchParams.get("cliente")
    const pagination = parsePagination(searchParams)
    const member = await currentMember(sb)

    let query = sb.from("pagos").select("*", pagination ? { count: "exact" } : undefined).eq("record_status", "active").order("fecha", { ascending: false }).order("id", { ascending: false })
    if (start) query = query.gte("fecha", start)
    if (end)   query = query.lte("fecha", end)
    if (cliente) query = query.ilike("cliente", `%${cliente}%`)
    if (member?.rol === "Cobranzas") query = query.ilike("closer", `%${String(member.nombre || "").trim().split(/\s+/)[0]}%`)
    if (pagination) query = query.range(pagination.from, pagination.to)
    else if (!start && !end && !cliente) query = query.limit(1000)

    const { data, error, count } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(pagination ? paginatedPayload(data || [], count || 0, pagination) : data || [])
  } catch (err) {
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 })
  }
}

// Tipos de pago que tambien deben reflejarse en la agenda del cliente (plan de
// pago pactado, medio de pago, comprobante y el monto del primer pago).
const AGENDA_FEE_TIPOS = new Set(["Fee", "Refuerzo de Fee", "Fee Venta Interna"])
const AGENDA_CIERRE_TIPOS = new Set([
  "Venta Nueva", "Venta Nueva (En Call)", "Venta Nueva (Post Fee)",
  "Completó PIF", "Completó PIF (Post Fee)", "Completa Total (Post Venta)",
  "Completó PIF + Acceso Total Consulting",
  "Completa Total + Acceso Acción",
  "Completa Total y Finaliza Pago",
  "Venta Nueva Interna", "Venta Nueva Interna (Post Fee)",
])
const AGENDA_SYNC_TIPOS = new Set([...AGENDA_FEE_TIPOS, ...AGENDA_CIERRE_TIPOS])

const ALLOWED_UPDATE = new Set([
  "fecha", "fecha_alta", "fecha_baja", "cliente", "telefono", "tipo", "operacion",
  "closer", "setter", "calificacion", "monto", "cc_ars", "medio_de_pago",
  "tipo_cambio_usd", "comprobante", "ppp", "fuente", "contenido_contestado",
  "otras_comisiones", "control", "es_reactivacion",
])

// Normaliza nombres para matchear agenda <-> pago aunque difieran en tildes,
// mayusculas o espacios (los closers rara vez tipean tal cual esta en la
// agenda original que cargo el setter).
function normName(s: string): string {
  return (s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, " ")
}

// Matchea nombres aunque uno tenga menos "palabras" que el otro (ej: el closer
// tipea "Miguel Angel Rincon" y en la agenda esta "Miguel Angel Rincon Henao").
// Alcanza con que compartan al menos 2 palabras (nombre+nombre, nombre+apellido,
// etc.) — no hace falta que coincidan todas.
function namesMatch(a: string, b: string): boolean {
  const wa = normName(a).split(" ").filter(Boolean)
  const wb = normName(b).split(" ").filter(Boolean)
  if (wa.length === 0 || wb.length === 0) return false
  if (wa.join(" ") === wb.join(" ")) return true
  const setB = new Set(wb)
  const common = wa.filter((w) => setB.has(w))
  return common.length >= 2
}

function normPhone(value: unknown): string {
  return String(value || "").replace(/\D/g, "").slice(-10)
}

async function syncAgendaFromPayment(sb: ReturnType<typeof getSupabase>, b: any) {
  if (!b?.cliente || !AGENDA_SYNC_TIPOS.has(String(b.tipo || ""))) return { synced: false, reason: "not_applicable" }

  try {
    let match: { id: number } | null = null

    // Si el formulario conoce la agenda, no hacemos matching heurístico.
    if (b.agenda_id) {
      const { data } = await sb.from("agendas").select("id").eq("id", b.agenda_id).maybeSingle()
      match = data || null
    }

    // La RPC atómica ya resolvió la identidad canónica. Usarla primero evita
    // depender de cómo escribió el closer el nombre (Javier vs Javier Alejandro,
    // Christian vs Cuenta B, etc.).
    if (!match && b.person_id) {
      const { data } = await sb.from("agendas")
        .select("id")
        .eq("person_id", b.person_id)
        .order("fecha_agenda", { ascending: false })
        .limit(1)
        .maybeSingle()
      match = data || null
    }

    if (!match) {
      const { data: candidatos } = await sb
        .from("agendas")
        .select("id,nombre,telefono,closer,fecha_agenda")
        .order("fecha_agenda", { ascending: false })
        .limit(3000)

      const phone = normPhone(b.telefono)
      const closer = normName(b.closer || "")
      const ranked = (candidatos || [])
        .filter((a) => (phone && normPhone(a.telefono) === phone) || namesMatch(a.nombre, b.cliente))
        .sort((a, z) => {
          const aPhone = phone && normPhone(a.telefono) === phone ? 4 : 0
          const zPhone = phone && normPhone(z.telefono) === phone ? 4 : 0
          const aCloser = closer && normName(a.closer || "").includes(closer) ? 2 : 0
          const zCloser = closer && normName(z.closer || "").includes(closer) ? 2 : 0
          return (zPhone + zCloser) - (aPhone + aCloser)
        })
      match = ranked[0] || null
    }

    if (!match) {
      console.error("No se encontró agenda para sincronizar pago", { cliente: b.cliente, tipo: b.tipo })
      return { synced: false, reason: "agenda_not_found" }
    }

    const esFee = AGENDA_FEE_TIPOS.has(String(b.tipo))
    const esSeguimiento = /Post Fee/i.test(String(b.tipo))
    const estadoAgenda = esFee ? "Fee" : esSeguimiento ? "Adentro en FUP" : "Adentro en Call"
    const updates: Record<string, unknown> = {
      show: true,
      cerro: true,
      estado: estadoAgenda,
      motivo_no_cierre: null,
      ...(!esFee ? { fecha_tc: b.fecha || new Date().toISOString().slice(0, 10) } : {}),
      ...(!esSeguimiento && b.monto != null ? { cc_dia_1: b.monto } : {}),
    }
    if (b.operacion) updates.operacion = b.operacion
    if (b.ppp) updates.plan_de_pago = b.ppp
    if (b.medio_de_pago) updates.medio_de_pago = b.medio_de_pago
    if (b.comprobante) updates.comprobante = b.comprobante
    if (b.fecha_baja) updates.fecha_baja = b.fecha_baja
    const fathomInContent = String(b.contenido_contestado || "").match(/Fathom:\s*(https?:\/\/\S+)/i)?.[1]?.replace(/[|,;]+$/, "")
    const fathom = String(b.link_fathom || fathomInContent || "").trim()
    if (fathom) updates.link_fathom = fathom

    const { data: syncedAgenda, error } = await sb.from("agendas")
      .update(updates)
      .eq("id", match.id)
      .select("id,show,cerro,estado,comprobante,link_fathom")
      .maybeSingle()
    if (error) throw error
    if (!syncedAgenda) {
      console.error("La agenda fue localizada pero no se actualizó", { agenda_id: match.id, cliente: b.cliente })
      return { synced: false, reason: "agenda_update_missed", agenda_id: match.id }
    }
    return { synced: true, agenda_id: match.id }
  } catch (agendaErr) {
    console.error("Error sincronizando agenda desde pago:", agendaErr)
    return { synced: false, reason: "sync_error" }
  }
}

export async function POST(request: Request) {
  try {
    const sb = getSupabase()
    const b = await request.json()
    const member = await currentMember(sb)
    if (member?.rol === "Cobranzas") {
      if (b.plan) return NextResponse.json({ error: "Este acceso solo permite cobrar cuotas existentes" }, { status: 403 })
      const owner = ownerKey(member.nombre)
      if (!owner || ownerKey(b.closer) !== owner) return NextResponse.json({ error: "Este cobro no pertenece a tu cartera" }, { status: 403 })
      const { data: plans } = await sb.from("planes_pago").select("cliente,closer").ilike("closer", `%${String(member.nombre || "").trim().split(/\s+/)[0]}%`).limit(1000)
      if (!(plans || []).some((plan: any) => ownerKey(plan.closer) === owner && namesMatch(plan.cliente, b.cliente))) {
        return NextResponse.json({ error: "No encontré una cuota de tu cartera para este cliente" }, { status: 403 })
      }
    }
    const row = {
      fecha: b.fecha||null, fecha_alta: b.fecha_alta||null, fecha_baja: b.fecha_baja||null,
      cliente: b.cliente||null, telefono: b.telefono||null, tipo: b.tipo||null,
      operacion: b.operacion||null, closer: b.closer||null, setter: b.setter||null,
      calificacion: b.calificacion||null,
      monto: b.monto!=null ? parseFloat(b.monto) : null,
      cc_ars: b.cc_ars!=null ? parseFloat(b.cc_ars) : null,
      medio_de_pago: b.medio_de_pago||null,
      tipo_cambio_usd: b.tipo_cambio_usd!=null ? parseFloat(b.tipo_cambio_usd) : null,
      comprobante: b.comprobante||null, ppp: b.ppp||null, fuente: b.fuente||null,
      contenido_contestado: b.contenido_contestado||null, otras_comisiones: b.otras_comisiones||null,
      es_reactivacion: b.es_reactivacion === true,
    }
    if (b.plan && Array.isArray(b.items) && b.items.length > 0) {
      if (!["Front End", "Back End"].includes(b.plan?.categoria_venta)) return NextResponse.json({ error: "Elegí una Categoría de Venta válida" }, { status: 400 })
      const requestId = String(b.request_id || "").trim()
      if (!requestId) return NextResponse.json({ error: "request_id requerido" }, { status: 400 })
      const { data: atomic, error: atomicError } = await sb.rpc("crm_create_payment_plan_atomic", {
        p_request_id: requestId,
        p_payment: { ...row, person_id: b.person_id || null, agenda_id: b.agenda_id || null, link_fathom: b.link_fathom || null },
        p_plan: b.plan,
        p_items: b.items,
      })
      if (atomicError) return NextResponse.json({ error: atomicError.message }, { status: 500 })
      const atomicResult = Array.isArray(atomic) ? atomic[0] : atomic
      // El flujo principal de Carga de Pagos usa la RPC atómica. Antes se
      // retornaba acá y nunca ejecutaba la sincronización con Agenda.
      const agendaSync = await syncAgendaFromPayment(sb, {
        ...b,
        person_id: atomicResult?.person_id || b.person_id || null,
        agenda_id: atomicResult?.agenda_id || b.agenda_id || null,
      })
      return NextResponse.json({ ...atomicResult, id: atomicResult?.payment_id, agenda_sync: agendaSync })
    }
    let { data, error } = await sb.from("pagos").insert([row]).select()
    if (error?.code === "42703") {
      // es_reactivacion todavia no existe en la DB (migracion pendiente) — reintenta sin ella.
      const { es_reactivacion, ...rowSinReactivacion } = row
      ;({ data, error } = await sb.from("pagos").insert([rowSinReactivacion]).select())
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Cuando el pago nace desde una cuota concreta de Cobranza, el servidor
    // vincula el item inmediatamente. No dependemos de un segundo PATCH del
    // navegador para que la deuda desaparezca de Recordatorios.
    let planItemSync: { linked: boolean; error?: string } = { linked: false }
    const paymentId = data?.[0]?.id
    if (paymentId && b.plan_item_id) {
      const { error: itemError } = await sb.from("plan_pago_items")
        .update({ estado: "pagado", pago_id: paymentId })
        .eq("id", b.plan_item_id)
      planItemSync = itemError ? { linked: false, error: itemError.message } : { linked: true }
    }

    // Best-effort: sincroniza la agenda del cliente cuando el pago es uno de
    // los 4 tipos que arrancan/destraban un plan (Fee, Venta Nueva En Call,
    // Fee Venta Interna, Venta Nueva Interna). Si no existe agenda para ese
    // nombre, no hace nada; si algo falla, no debe romper la respuesta del pago.
    // Replica lo que hacia la landing vieja: al cargar el primer pago real, se
    // completa Cerro/Estado/Fecha TC/Fecha Baja/Fathom en la fila que el
    // setter ya habia cargado en Centro Agendas (no crea una fila nueva).
    const agendaSync = await syncAgendaFromPayment(sb, {
      ...b,
      person_id: data?.[0]?.person_id || b.person_id || null,
    })

    return NextResponse.json({ ...(data?.[0] || { success: true }), agenda_sync: agendaSync, plan_item_sync: planItemSync })
  } catch (err) {
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const sb = getSupabase()
    const { id, ...rawUpdates } = await request.json()
    if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 })
    const updates = Object.fromEntries(Object.entries(rawUpdates).filter(([key]) => ALLOWED_UPDATE.has(key)))
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 })
    const { error } = await sb.from("pagos").update(updates).eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const sb = getSupabase()
    const { id, reason } = await request.json()
    if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 })
    // Si alguna cuota de un plan de pago estaba vinculada a este pago, hay que
    // soltar el vinculo al borrarlo — sino queda un pago_id fantasma apuntando
    // a un pago que ya no existe, y la cuota se queda "pagado" sin respaldo real.
    await sb.from("plan_pago_items").update({ pago_id: null, estado: "pendiente" }).eq("pago_id", id)
    const session = await createSupabaseServer()
    const { data: { user } } = await session.auth.getUser()
    const { error } = await sb.from("pagos").update({
      record_status: "voided",
      voided_at: new Date().toISOString(),
      voided_by: user?.email || "CEO",
      void_reason: String(reason || "Anulado desde CRM").trim(),
    }).eq("id", id).eq("record_status", "active")
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 })
  }
}
