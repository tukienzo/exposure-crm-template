import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { persistChatSummaryAttribution } from "@/lib/chat-summary-attribution"
import { autoScoreLead } from "@/lib/lead-scoring"
import { canonicalCloserName, closerForScore } from "@/lib/closer-routing"
import { attachEmailToPerson, normalizeLeadEmail } from "@/lib/crm-email"
import { updateHammerAudience } from "@/lib/meta-hammer-audience"

// Clave compartida para proteger el endpoint. Debe vivir únicamente en las
// variables cifradas de Vercel y en la automatización que envía los datos.
const INGEST_KEY = process.env.CRM_INGEST_KEY

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  // Requiere service role para saltar RLS en escritura
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error("Missing Supabase config")
  return createClient(url, key)
}

// Campos válidos de la tabla agendas (lo demás se ignora)
const ALLOWED = new Set([
  "nombre", "telefono", "instagram", "fecha_agenda", "fecha_closer", "fecha_lead", "edad",
  "closer", "cuenta", "setter", "calificacion", "fuente", "ocupacion", "manychat",
  "puntos_contacto", "resumen_chat", "calificaba_realmente", "call_confirmer", "info_call_triage", "recurso", "show", "cerro",
  "estado", "motivo_no_cierre", "link_fathom", "operacion", "plan_de_pago",
  "medio_de_pago", "comprobante", "cc_dia_1", "fecha_tc", "fecha_baja", "ia_analisis",
  "problema_actual", "tiempo_problema", "intentos_previos", "motivo_urgencia", "ingresos", "inversion",
  "angulo_entrada", "campaign_id", "ad_id", "creative_id",
])

const DATE_FIELDS = new Set(["fecha_agenda", "fecha_closer", "fecha_lead", "fecha_tc", "fecha_baja"])

// Convierte un instante con zona explícita a la hora calendario de Argentina.
// `agendas` guarda timestamps sin zona y el CRM agrupa la fecha de booking por
// día/mes argentino; conservar UTC hacía que reservas de 21:00–23:59 ARG
// aparecieran recién en el día o mes siguiente.
function argentinaWallTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || ""
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}:${value("second")}`
}

// Normaliza fechas a ISO. Acepta ISO ya (backfill) o DD/MM/YY[YY] HH:mm (Zapier/AR).
function normDate(v: unknown, field: string): unknown {
  if (typeof v !== "string") return v
  const s = v.trim()
  if (!s || s === "-") return null
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const hasExplicitTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(s)
    return field === "fecha_agenda" && hasExplicitTimezone ? argentinaWallTime(s) : s
  }
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (m) {
    const pad = (x: string) => x.padStart(2, "0")
    const yr = m[3].length === 2 ? "20" + m[3] : m[3]
    const time = m[4] ? `T${pad(m[4])}:${pad(m[5])}:${pad(m[6] || "00")}` : "T00:00:00"
    return `${yr}-${pad(m[2])}-${pad(m[1])}${time}`
  }
  return s
}

function clean(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(row)) {
    if (!ALLOWED.has(k)) continue
    out[k] = DATE_FIELDS.has(k) ? normDate(row[k], k) : row[k]
  }
  if (out.closer) out.closer = canonicalCloserName(out.closer)
  return out
}

function withAutoScore(row: Record<string, unknown>): Record<string, unknown> {
  const calificacion = row.calificacion || autoScoreLead(row)?.calificacion
  if (!calificacion) return row
  // Respeta una asignación explícita de iClosed y no reescribe histórico.
  return { ...row, calificacion, closer: row.closer || closerForScore(String(calificacion)) || row.closer }
}

function normKey(value: unknown): string {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
}

// Una agenda exacta no puede entrar dos veces aunque el webhook se reintente
// o el archivo fuente traiga la misma fila repetida. La identidad prioriza
// teléfono, luego Instagram y finalmente nombre; además exige mismo booking,
// misma call y mismo closer para no bloquear reagendas reales.
function agendaExactKey(row: Record<string, unknown>): string | null {
  const identity = normKey(row.telefono) || normKey(row.instagram) || normKey(row.nombre)
  const booking = String(row.fecha_agenda || "").slice(0, 19)
  const call = String(row.fecha_closer || "").slice(0, 19)
  if (!identity || (!booking && !call)) return null
  return [identity, booking, call, normKey(row.closer)].join("|")
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
    // Acepta: { rows: [...] } (backfill), { row: {...} }, o campos planos al tope (Zapier)
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
      const { data: delData, error: delErr } = await sb.from("agendas").delete().in("id", ids).select("id")
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
        .from("agendas")
        .delete()
        .gte("fecha_closer", `${start}T00:00:00`)
        .lte("fecha_closer", `${end}T23:59:59`)
        .select("id")
      if (delErr) return NextResponse.json({ error: `delete: ${delErr.message}` }, { status: 500 })
      deleted = (delData || []).length
    }

    // Limpia a campos válidos, descarta filas sin nombre ni teléfono, y
    // aplica auto-scoring de calificación cuando no viene ya cargada.
    const preparedRaw = rowsIn
      .map((input) => ({ row: withAutoScore(clean(input)), email: normalizeLeadEmail(input.email) }))
      .filter(({ row }) => row.nombre || row.telefono)
    const seenInPayload = new Set<string>()
    const prepared = preparedRaw.filter(({ row }) => {
      const key = agendaExactKey(row)
      if (!key) return true
      if (seenInPayload.has(key)) return false
      seenInPayload.add(key)
      return true
    })
    let ignoredDuplicates = preparedRaw.length - prepared.length
    let rows = prepared.map(({ row }) => row)
    if (rows.length === 0) return NextResponse.json({ error: "Sin filas válidas (falta nombre/telefono)" }, { status: 400 })

    // En modo normal también se compara contra la base. `replace_month` ya
    // borró el período, por lo que solo necesita el filtro interno de arriba.
    let preparedToInsert = prepared
    if (mode !== "replace_month") {
      const callDates = rows.map((row) => String(row.fecha_closer || "")).filter(Boolean).sort()
      const bookingDates = rows.map((row) => String(row.fecha_agenda || "")).filter(Boolean).sort()
      let existingQuery = sb.from("agendas").select("nombre,telefono,instagram,fecha_agenda,fecha_closer,closer")
      if (callDates.length) existingQuery = existingQuery.gte("fecha_closer", callDates[0]).lte("fecha_closer", callDates.at(-1)!)
      else if (bookingDates.length) existingQuery = existingQuery.gte("fecha_agenda", bookingDates[0]).lte("fecha_agenda", bookingDates.at(-1)!)
      const { data: existing, error: existingError } = await existingQuery.limit(5000)
      if (existingError) return NextResponse.json({ error: `dedupe: ${existingError.message}` }, { status: 500 })
      const existingKeys = new Set((existing || []).map((row) => agendaExactKey(row)).filter(Boolean))
      preparedToInsert = prepared.filter(({ row }) => {
        const key = agendaExactKey(row)
        return !key || !existingKeys.has(key)
      })
      ignoredDuplicates += prepared.length - preparedToInsert.length
      rows = preparedToInsert.map(({ row }) => row)
    }
    if (rows.length === 0) return NextResponse.json({ ok: true, mode, deleted, inserted: 0, ignored_duplicates: ignoredDuplicates, attribution: { inserted: 0 } })
    // Insertar en lotes de 200
    let inserted = 0
    const insertedAgendas: any[] = []
    for (let i = 0; i < rows.length; i += 200) {
      const batch = rows.slice(i, i + 200)
      const { data, error } = await sb
        .from("agendas")
        .insert(batch)
        .select("id,person_id,fecha_agenda,created_at,resumen_chat")
      if (error) return NextResponse.json({ error: `insert: ${error.message}`, inserted, deleted }, { status: 500 })
      inserted += batch.length
      insertedAgendas.push(...(data || []))
    }
    for (let i = 0; i < insertedAgendas.length; i++) {
      if (preparedToInsert[i]?.email) {
        await attachEmailToPerson(sb, insertedAgendas[i].person_id, preparedToInsert[i].email, "zapier_iclosed")
      }
      await updateHammerAudience("add", { email: preparedToInsert[i]?.email, telefono: rows[i]?.telefono }).catch((error) => {
        console.error("[hammer-audience] no se pudo agregar agenda", error instanceof Error ? error.message : error)
      })
    }
    const attribution = await persistChatSummaryAttribution(sb, insertedAgendas)

    return NextResponse.json({ ok: true, mode, month: month || null, deleted, inserted, ignored_duplicates: ignoredDuplicates, attribution })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 })
  }
}
