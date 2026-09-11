import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { paginatedPayload, parsePagination } from "@/lib/pagination"
import { createSupabaseServer } from "@/lib/supabase-server"
import { canonicalPhone } from "@/lib/crm-phone"

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error("Supabase credentials not configured")
  return createClient(url, key)
}

function normalizePhone(value: unknown) {
  return canonicalPhone(value) || ""
}

function normalizeName(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function clientIdentityKeys(cliente: Record<string, unknown>) {
  const phone = normalizePhone(cliente.telefono)
  const personId = String(cliente.person_id || "").trim()
  const name = normalizeName(cliente.nombre)

  // El teléfono es la identidad operativa más confiable entre importaciones.
  // Si falta, el nombre completo exacto sirve como último respaldo: algunas
  // importaciones duplicadas generaron person_id distintos para la misma ficha.
  if (phone.length >= 7) return [`phone:${phone}`, personId ? `person:${personId}` : ""].filter(Boolean)
  if (personId) return [`person:${personId}`, name ? `name:${name}` : ""].filter(Boolean)
  return name ? [`name:${name}`] : []
}

async function phonesByPersonId(sb: ReturnType<typeof getSupabase>, personIds: string[]) {
  const result = new Map<string, string>()
  const uniqueIds = [...new Set(personIds.filter(Boolean))]

  for (let from = 0; from < uniqueIds.length; from += 200) {
    const batch = uniqueIds.slice(from, from + 200)
    const [{ data: people, error: peopleError }, { data: identities, error: identitiesError }] = await Promise.all([
      sb.from("crm_people").select("id,primary_phone").in("id", batch),
      sb.from("crm_identities").select("person_id,value,last_seen_at").eq("kind", "phone").in("person_id", batch).order("last_seen_at", { ascending: false }),
    ])
    if (peopleError) throw peopleError
    if (identitiesError) throw identitiesError

    for (const person of people || []) {
      const phone = normalizePhone(person.primary_phone)
      if (phone.length >= 7) result.set(person.id, phone)
    }
    for (const identity of identities || []) {
      const phone = normalizePhone(identity.value)
      if (phone.length >= 7 && !result.has(identity.person_id)) result.set(identity.person_id, phone)
    }
  }

  return result
}

type CloserCandidate = { closer: string; timestamp: number; sourcePriority: number }

function candidateTimestamp(...values: unknown[]) {
  for (const value of values) {
    const timestamp = Date.parse(String(value || ""))
    if (Number.isFinite(timestamp)) return timestamp
  }
  return 0
}

function keepLatest(map: Map<string, CloserCandidate>, key: string, candidate: CloserCandidate) {
  if (!key) return
  const current = map.get(key)
  if (!current || candidate.timestamp > current.timestamp ||
    (candidate.timestamp === current.timestamp && candidate.sourcePriority > current.sourcePriority)) {
    map.set(key, candidate)
  }
}

async function closerByClientIdentity(sb: ReturnType<typeof getSupabase>) {
  const [plansResult, paymentsResult, agendasResult] = await Promise.all([
    sb.from("planes_pago").select("person_id,cliente,telefono,closer,fecha_alta,created_at").limit(2000),
    sb.from("pagos").select("person_id,cliente,telefono,closer,fecha,created_at,record_status").eq("record_status", "active").limit(2000),
    sb.from("agendas").select("person_id,nombre,telefono,closer,fecha_closer,fecha_agenda,created_at").limit(2000),
  ])
  if (plansResult.error) throw plansResult.error
  if (paymentsResult.error) throw paymentsResult.error
  if (agendasResult.error) throw agendasResult.error

  const byPerson = new Map<string, CloserCandidate>()
  const byPhone = new Map<string, CloserCandidate>()
  const byName = new Map<string, CloserCandidate>()
  const rows = [
    ...(plansResult.data || []).map((row) => ({ ...row, identityName: row.cliente, eventAt: row.fecha_alta, sourcePriority: 3 })),
    ...(paymentsResult.data || []).map((row) => ({ ...row, identityName: row.cliente, eventAt: row.fecha, sourcePriority: 2 })),
    ...(agendasResult.data || []).map((row) => ({ ...row, identityName: row.nombre, eventAt: row.fecha_closer || row.fecha_agenda, sourcePriority: 1 })),
  ]

  for (const row of rows) {
    const closer = String(row.closer || "").trim()
    if (!closer) continue
    const candidate = {
      closer,
      timestamp: candidateTimestamp(row.eventAt, row.created_at),
      sourcePriority: row.sourcePriority,
    }
    keepLatest(byPerson, String(row.person_id || "").trim(), candidate)
    const phone = normalizePhone(row.telefono)
    if (phone.length >= 7) keepLatest(byPhone, phone, candidate)
    keepLatest(byName, normalizeName(row.identityName), candidate)
  }
  return { byPerson, byPhone, byName }
}

export async function GET(request: Request) {
  try {
    const sb = getSupabase()
    const { searchParams } = new URL(request.url)
    const scope = searchParams.get("scope") || "active"
    const search = String(searchParams.get("search") || "").trim()
    const pagination = parsePagination(searchParams)
    let query = sb
      .from("clientes")
      .select("*")
      .order("fecha_ingreso", { ascending: false })
      .order("id", { ascending: false })
      .neq("record_status", "merged")
    if (scope === "active") query = query.eq("record_status", "active")
    else if (scope === "historical") query = query.eq("record_status", "historical")
    if (search) query = query.ilike("nombre", `%${search}%`)
    // La deduplicación debe ocurrir ANTES de paginar. Si se pagina en SQL,
    // dos filas de la misma persona pueden caer en páginas distintas y volver
    // a aparecer visualmente como clientes diferentes.
    query = query.limit(2000)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // `onboardeado` quedó como valor histórico: onboarding completo es un hito,
    // mientras que la etapa operativa única es Entrega activa.
    const normalized = (data || []).map((cliente) =>
      cliente.etapa === "onboardeado" ? { ...cliente, etapa: "calls_pendientes" } : cliente
    )

    // Algunas importaciones dejaron `clientes.telefono` vacío aunque el número
    // sí quedó preservado en la identidad canónica de la persona. El CSM debe
    // poder abrir WhatsApp desde la ficha, por eso recuperamos únicamente por
    // person_id exacto (nunca por nombre) antes de deduplicar y responder.
    const missingPhonePersonIds = normalized
      .filter((cliente) => normalizePhone(cliente.telefono).length < 7)
      .map((cliente) => String(cliente.person_id || ""))
      .filter(Boolean)
    const recoveredPhones = await phonesByPersonId(sb, missingPhonePersonIds)
    const withRecoveredPhones = normalized.map((cliente) => {
      if (normalizePhone(cliente.telefono).length >= 7 || !cliente.person_id) return cliente
      const recoveredPhone = recoveredPhones.get(String(cliente.person_id))
      return recoveredPhone ? { ...cliente, telefono: recoveredPhone } : cliente
    })

    // `clientes` conserva filas históricas/importadas para trazabilidad. En la
    // vista operativa, sin embargo, una persona debe aparecer una sola vez. La
    // consulta ya viene ordenada por ingreso/id descendente, por lo que se
    // conserva el registro activo más reciente y no se borra ninguna fila.
    const seenPeople = new Set<string>()
    const unique = withRecoveredPhones.filter((cliente) => {
      const identityKeys = clientIdentityKeys(cliente)
      if (identityKeys.some((key) => seenPeople.has(key))) return false
      identityKeys.forEach((key) => seenPeople.add(key))
      return true
    })

    // El closer se deriva de la operación comercial más reciente. Evitamos
    // duplicarlo en `clientes`, para que la pestaña siempre refleje el dato
    // canónico de planes/pagos (y agenda como respaldo histórico).
    const closerIndex = await closerByClientIdentity(sb)
    const withCloser = unique.map((cliente) => {
      const personId = String(cliente.person_id || "").trim()
      const phone = normalizePhone(cliente.telefono)
      const name = normalizeName(cliente.nombre)
      const candidate = (personId ? closerIndex.byPerson.get(personId) : undefined) ||
        (phone.length >= 7 ? closerIndex.byPhone.get(phone) : undefined) ||
        (name ? closerIndex.byName.get(name) : undefined)
      return { ...cliente, closer: candidate?.closer || null }
    })

    if (!pagination) return NextResponse.json(withCloser)
    const pageRows = withCloser.slice(pagination.from, pagination.to + 1)
    return NextResponse.json(paginatedPayload(pageRows, withCloser.length, pagination))
  } catch (err) {
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 })
  }
}

const BASE_FIELDS = new Set([
  "nombre", "calificacion", "telefono", "fecha_ingreso", "duracion",
  "fecha_baja", "fecha_proxima_call", "fecha_3ra_call", "fecha_4ta_call",
  "medio_de_pago", "operacion_original", "pitch", "fecha_primer_call",
])

const EXTENDED_FIELDS = new Set([
  "estado", "operacion_resell", "medio_pago_resell", "monto_con_descuento",
  "etapa", "link_call_onboarding", "onboarding_form_at",
  "contract_client_signed_at", "contract_ceo_signed_at",
  "discord_access_at", "skool_access_at", "onboarding_completed_at",
  "csm_owner", "health_status", "last_contact_at", "next_action", "next_action_at",
  "backend_priority", "backend_status", "backend_potential_usd", "backend_offer",
  "backend_owner", "lifecycle_notes",
  "renewal_status", "renewal_potential_usd", "renewal_probability", "renewal_loss_reason",
])

export async function PATCH(request: Request) {
  try {
    const sb = getSupabase()
    const { id, ...rawUpdates } = await request.json()
    if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 })
    if (rawUpdates.archive === true) {
      const reason = String(rawUpdates.reason || "").trim()
      if (!reason) return NextResponse.json({ error: "Motivo requerido" }, { status: 400 })
      const session = await createSupabaseServer()
      const { data: { user } } = await session.auth.getUser()
      if (!user?.email) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
      const { data: current, error: readError } = await sb
        .from("clientes")
        .select("record_status,fecha_baja,lifecycle_notes")
        .eq("id", id)
        .maybeSingle()
      if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })
      if (!current) return NextResponse.json({ error: "Ficha no encontrada" }, { status: 404 })
      if (current.record_status !== "active") return NextResponse.json({ error: "La ficha ya no está activa" }, { status: 409 })
      const today = new Date().toISOString().slice(0, 10)
      const auditLine = `[${today}] Ficha archivada por ${user.email.toLowerCase()}: ${reason}`
      const lifecycleNotes = [String(current.lifecycle_notes || "").trim(), auditLine].filter(Boolean).join("\n")
      const { error: archiveError } = await sb.from("clientes").update({
        record_status: "historical",
        fecha_baja: current.fecha_baja || today,
        lifecycle_notes: lifecycleNotes,
      }).eq("id", id).eq("record_status", "active")
      if (archiveError) return NextResponse.json({ error: archiveError.message }, { status: 500 })
      return NextResponse.json({ success: true, archived: true })
    }
    const allowedFields = new Set([...BASE_FIELDS, ...EXTENDED_FIELDS])
    const updates = Object.fromEntries(Object.entries(rawUpdates).filter(([key]) => allowedFields.has(key)))
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 })

    const { error } = await sb.from("clientes").update(updates).eq("id", id)

    if (error) {
      // If a new column doesn't exist yet (42703), retry with only base fields
      if (error.code === "42703") {
        const safeUpdates = Object.fromEntries(
          Object.entries(updates).filter(([k]) => BASE_FIELDS.has(k))
        )
        const { error: e2 } = await sb.from("clientes").update(safeUpdates).eq("id", id)
        if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
        return NextResponse.json({ success: true })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 })
  }
}
