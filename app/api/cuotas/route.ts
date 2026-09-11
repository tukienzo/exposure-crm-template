import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

// Clave compartida para proteger la ingesta. Se configura como secreto en Vercel
// y se envía en el header x-ingest-key.
const INGEST_KEY = process.env.CRM_INGEST_KEY

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error("Supabase credentials not configured")
  return createClient(url, key)
}

export async function GET(request: Request) {
  try {
    const sb = getSupabase()
    const { searchParams } = new URL(request.url)
    const start = searchParams.get("start")
    const end = searchParams.get("end")

    // Fuente canónica: planes_pago + plan_pago_items. La tabla `cuotas` es un
    // remanente histórico y no representa la deuda operativa vigente.
    const { data: plans, error } = await sb
      .from("planes_pago")
      .select("id,cliente,telefono,operacion,closer,plan_pago_items(id,orden,concepto,numero_cuota,monto,fecha_planeada,medio_de_pago,estado,pago_id)")
      .order("created_at", { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const today = new Date().toISOString().slice(0, 10)
    const rows = (plans || []).flatMap((plan: any) => {
      const ordered = [...(plan.plan_pago_items || [])].sort((a, b) => (a.orden || 0) - (b.orden || 0))
      const planText = ordered
        .map((item: any) => `${item.concepto || `Cuota ${item.numero_cuota || item.orden}`}: USD ${Number(item.monto || 0)} · ${item.fecha_planeada || "sin fecha"} · ${item.estado || "pendiente"}`)
        .join("\n")
      return ordered
        .filter((item: any) => !start || (item.fecha_planeada && item.fecha_planeada >= start))
        .filter((item: any) => !end || (item.fecha_planeada && item.fecha_planeada <= end))
        .map((item: any) => {
          const paid = item.estado === "pagado" || Boolean(item.pago_id)
          return {
            id: item.id,
            plan_id: plan.id,
            cliente: plan.cliente,
            telefono: plan.telefono,
            operacion: plan.operacion,
            monto: Number(item.monto || 0),
            monto_cobrado: paid ? Number(item.monto || 0) : 0,
            fecha_vencimiento: item.fecha_planeada,
            estado: paid ? "Cobrado" : item.fecha_planeada && item.fecha_planeada < today ? "Vencido" : "Por Cobrar",
            medio_de_pago: item.medio_de_pago,
            closer: plan.closer,
            plan_de_pago: planText,
            source_table: "planes_pago",
          }
        })
    })
    return NextResponse.json(rows)
  } catch (err) {
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const sb = getSupabase()
    const { id, ...updates } = await request.json()
    if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 })
    const { data: item, error: itemError } = await sb
      .from("plan_pago_items")
      .select("plan_id")
      .eq("id", id)
      .maybeSingle()
    if (itemError || !item) {
      return NextResponse.json({ error: itemError?.message || "Cuota canónica no encontrada" }, { status: 404 })
    }

    const itemUpdates: Record<string, unknown> = {}
    const planUpdates: Record<string, unknown> = {}
    if ("monto" in updates) itemUpdates.monto = updates.monto
    if ("fecha_vencimiento" in updates) itemUpdates.fecha_planeada = updates.fecha_vencimiento
    if ("medio_de_pago" in updates) itemUpdates.medio_de_pago = updates.medio_de_pago
    if ("estado" in updates) {
      itemUpdates.estado = updates.estado === "Cobrado" ? "pagado" : "pendiente"
    }
    if ("closer" in updates) planUpdates.closer = updates.closer
    if ("operacion" in updates) planUpdates.operacion = updates.operacion

    if (Object.keys(itemUpdates).length) {
      const { error } = await sb.from("plan_pago_items").update(itemUpdates).eq("id", id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (Object.keys(planUpdates).length) {
      const { error } = await sb.from("planes_pago").update(planUpdates).eq("id", item.plan_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true, source_table: "planes_pago" })
  } catch (err) {
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 })
  }
}

// Campos válidos de la tabla cuotas (lo demás se ignora)
const ALLOWED = new Set([
  "cliente", "operacion", "monto", "fecha_vencimiento", "estado", "medio_de_pago", "closer",
  "plan_de_pago", "monto_cobrado", "telefono",
])

const DATE_FIELDS = new Set(["fecha_vencimiento"])

// Normaliza fechas a ISO. Acepta ISO ya o DD/MM/YY[YY] [HH:mm].
function normDate(v: unknown): unknown {
  if (typeof v !== "string") return v
  const s = v.trim()
  if (!s || s === "-") return null
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (m) {
    const pad = (x: string) => x.padStart(2, "0")
    const yr = m[3].length === 2 ? "20" + m[3] : m[3]
    const time = m[4] ? `T${pad(m[4])}:${pad(m[5])}:${pad(m[6] || "00")}` : "T00:00:00"
    return `${yr}-${pad(m[2])}-${pad(m[1])}${time}`
  }
  return null
}

function clean(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(row)) {
    if (!ALLOWED.has(k)) continue
    out[k] = DATE_FIELDS.has(k) ? normDate(row[k]) : row[k]
  }
  return out
}

export async function POST(request: Request) {
  try {
    if (!INGEST_KEY) {
      return NextResponse.json({ error: "CRM_INGEST_KEY no configurada" }, { status: 503 })
    }
    if (request.headers.get("x-ingest-key") !== INGEST_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const payload = await request.json()
    const mode: string = payload.mode || "insert"
    // Acepta: { rows: [...] } (backfill), { row: {...} }, o campos planos al tope
    let rowsIn: Record<string, unknown>[]
    if (Array.isArray(payload.rows)) rowsIn = payload.rows
    else if (payload.row && typeof payload.row === "object") rowsIn = [payload.row]
    else rowsIn = [payload]

    const sb = getSupabase()

    if (mode === "delete_ids") {
      const ids: string[] = Array.isArray(payload.ids) ? payload.ids : []
      if (ids.length === 0) return NextResponse.json({ error: "delete_ids requiere 'ids'" }, { status: 400 })
      const { data: delData, error: delErr } = await sb.from("cuotas").delete().in("id", ids).select("id")
      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
      return NextResponse.json({ ok: true, mode, deleted: (delData || []).length })
    }

    if (rowsIn.length === 0) return NextResponse.json({ error: "Sin filas" }, { status: 400 })

    // Limpia a campos válidos y descarta filas sin cliente
    const rows = rowsIn.map(clean).filter(r => r.cliente)
    if (rows.length === 0) return NextResponse.json({ error: "Sin filas válidas (falta cliente)" }, { status: 400 })

    // Insertar en lotes de 200
    let inserted = 0
    for (let i = 0; i < rows.length; i += 200) {
      const batch = rows.slice(i, i + 200)
      const { error } = await sb.from("cuotas").insert(batch)
      if (error) return NextResponse.json({ error: `insert: ${error.message}`, inserted }, { status: 500 })
      inserted += batch.length
    }

    return NextResponse.json({ ok: true, mode, deleted: 0, inserted })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 })
  }
}
