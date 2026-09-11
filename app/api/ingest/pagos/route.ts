import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

// Clave compartida para proteger el endpoint. Debe vivir únicamente en las
// variables cifradas de Vercel y en la automatización que envía los datos.
const INGEST_KEY = process.env.CRM_INGEST_KEY

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error("Missing Supabase config")
  return createClient(url, key)
}

// Campos válidos de la tabla pagos (lo demás se ignora)
const ALLOWED = new Set([
  "fecha", "fecha_alta", "fecha_baja", "cliente", "telefono", "tipo", "operacion",
  "closer", "setter", "calificacion", "monto", "cc_ars", "medio_de_pago",
  "tipo_cambio_usd", "comprobante", "ppp", "fuente", "contenido_contestado",
  "otras_comisiones", "control",
])

const DATE_FIELDS = new Set(["fecha", "fecha_alta", "fecha_baja"])

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
      return NextResponse.json({ error: "Ingest no configurado" }, { status: 503 })
    }
    if (request.headers.get("x-ingest-key") !== INGEST_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const payload = await request.json()
    const mode: string = payload.mode || "insert"
    const month: string | undefined = payload.month
    let rowsIn: Record<string, unknown>[]
    if (Array.isArray(payload.rows)) rowsIn = payload.rows
    else if (payload.row && typeof payload.row === "object") rowsIn = [payload.row]
    else rowsIn = [payload]
    if (rowsIn.length === 0) return NextResponse.json({ error: "Sin filas" }, { status: 400 })

    const sb = getSupabase()
    let deleted = 0

    if (mode === "delete_ids") {
      const ids: string[] = Array.isArray(payload.ids) ? payload.ids : []
      if (ids.length === 0) return NextResponse.json({ error: "delete_ids requiere 'ids'" }, { status: 400 })
      const { data: delData, error: delErr } = await sb.from("pagos").delete().in("id", ids).select("id")
      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
      return NextResponse.json({ ok: true, mode, deleted: (delData || []).length })
    }

    if (mode === "replace_month") {
      if (!month) return NextResponse.json({ error: "replace_month requiere 'month'" }, { status: 400 })
      const [y, m] = month.split("-").map(Number)
      const lastDay = new Date(y, m, 0).getDate()
      const start = `${month}-01`
      const end = `${month}-${String(lastDay).padStart(2, "0")}`
      const { data: delData, error: delErr } = await sb
        .from("pagos")
        .delete()
        .gte("fecha", `${start}T00:00:00`)
        .lte("fecha", `${end}T23:59:59`)
        .select("id")
      if (delErr) return NextResponse.json({ error: `delete: ${delErr.message}` }, { status: 500 })
      deleted = (delData || []).length
    }

    const rows = rowsIn.map(clean).filter(r => r.cliente)
    if (rows.length === 0) return NextResponse.json({ error: "Sin filas válidas (falta cliente)" }, { status: 400 })
    let inserted = 0
    for (let i = 0; i < rows.length; i += 200) {
      const batch = rows.slice(i, i + 200)
      const { error } = await sb.from("pagos").insert(batch)
      if (error) return NextResponse.json({ error: `insert: ${error.message}`, inserted, deleted }, { status: 500 })
      inserted += batch.length
    }

    return NextResponse.json({ ok: true, mode, month: month || null, deleted, inserted })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 })
  }
}
