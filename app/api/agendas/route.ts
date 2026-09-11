// deploy: región de funciones -> pdx1 (us-west-2) para matchear Supabase
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { sendLeadScoreEvent } from "@/lib/meta-capi"
import { extractBookingContentOrigin, persistChatSummaryAttribution } from "@/lib/chat-summary-attribution"
import { createSupabaseServer } from "@/lib/supabase-server"
import { paginatedPayload, parsePagination } from "@/lib/pagination"
import { attachEmailToPerson, exposeAgendaEmail, normalizeLeadEmail } from "@/lib/crm-email"
import { shouldRemainInHammerAudience, updateHammerAudience } from "@/lib/meta-hammer-audience"


function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error("Supabase credentials not configured")
  return createClient(url, key)
}

// Columnas livianas para la LISTA. Excluye los textos gigantes (ia_analisis,
// info_call_triage, resumen_chat) que solo se usan en los modales.
// link_fathom y plan_de_pago SI van acá — hacen falta para marcar en la lista
// qué leads cerrados les faltan datos al closer.
const LIST_COLS =
  "id,person_id,nombre,telefono,instagram,fecha_agenda,fecha_closer,fecha_lead,edad,closer,cuenta,setter,calificacion,fuente,ocupacion,manychat,puntos_contacto,call_confirmer,recurso,show,cerro,estado,motivo_no_cierre,calificaba_realmente,operacion,medio_de_pago,comprobante,cc_dia_1,fecha_tc,fecha_baja,link_fathom,plan_de_pago,problema_actual,tiempo_problema,intentos_previos,motivo_urgencia,ingresos,inversion,created_at,crm_people(primary_email)"

// Campos que se pueden setear al crear una agenda a mano desde el CRM (botón
// "Agenda Manual" en Centro Agendas — leads que se agendaron por fuera de
// iClosed y no llegan por el ingest normal).
const ALLOWED_CREATE = new Set([
  "nombre", "telefono", "instagram", "fecha_agenda", "fecha_closer", "fecha_lead", "edad",
  "closer", "cuenta", "setter", "calificacion", "fuente", "ocupacion", "manychat",
  "puntos_contacto", "resumen_chat", "call_confirmer", "info_call_triage", "recurso",
  "motivo_urgencia", "problema_actual", "tiempo_problema", "intentos_previos", "ingresos", "inversion",
])

const ALLOWED_UPDATE = new Set([
  ...ALLOWED_CREATE,
  "show", "cerro", "estado", "motivo_no_cierre", "calificaba_realmente",
  "operacion", "plan_de_pago", "tipo_cierre", "medio_de_pago", "comprobante",
  "cc_dia_1", "fecha_tc", "fecha_baja", "link_fathom", "ia_analisis",
  "rescatado", "motivo_inclusion", "calificacion_crm_original",
])

export async function GET(request: Request) {
  try {
    const sb = getSupabase()
    const { searchParams } = new URL(request.url)

    // Fila completa por id (para los modales — trae ia_analisis, resumen_chat, etc.)
    const id = searchParams.get("id")
    if (id) {
      const { data, error } = await sb.from("agendas").select("*,crm_people(primary_email)").eq("id", id).single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const { data: followup } = await sb.from("crm_events").select("occurred_at,metadata,created_at").eq("dedupe_key", `agenda_followup:${id}`).maybeSingle()
      return NextResponse.json(withFollowup(exposeAgendaEmail(data), followup))
    }

    const light = searchParams.get("light")
    const mine = searchParams.get("mine") === "1"
    const start = searchParams.get("start")
    const end = searchParams.get("end")
    const pagination = parsePagination(searchParams)
    const includeArchived = searchParams.get("include_archived") === "1"

    // Incluir el día completo: start desde 00:00, end hasta 23:59:59
    const startTs = start ? (start.length === 10 ? `${start}T00:00:00` : start) : null
    const endTs = end ? (end.length === 10 ? `${end}T23:59:59` : end) : null

    let ownerFilter: { column: "setter" | "closer"; name: string } | null = null
    if (mine) {
      const session = await createSupabaseServer()
      const { data: { user } } = await session.auth.getUser()
      if (!user?.email) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
      const { data: member } = await sb.from("team_members").select("nombre,rol,estado").eq("email", user.email.toLowerCase()).maybeSingle()
      if (member?.estado !== "aprobado" || !["Setter", "Closer"].includes(member?.rol || "")) return NextResponse.json({ error: "Filtro personal no disponible" }, { status: 403 })
      ownerFilter = { column: member.rol === "Setter" ? "setter" : "closer", name: String(member.nombre || "").trim().split(/\s+/)[0] }
    }

    const applyDates = (q: any) => {
      if (!includeArchived) q = q.or("estado.is.null,estado.neq.Archivada manualmente")
      if (startTs) q = q.gte("fecha_agenda", startTs)
      if (endTs) q = q.lte("fecha_agenda", endTs)
      if (ownerFilter?.name) q = q.ilike(ownerFilter.column, `${ownerFilter.name}%`)
      if (pagination) q = q.range(pagination.from, pagination.to)
      else if (!start && !end) q = q.limit(1000)
      return q
    }

    if (light) {
      // Lista liviana + flags de completitud (consultas paralelas de solo IDs)
      const listQ = applyDates(sb.from("agendas").select(LIST_COLS, pagination ? { count: "exact" } : undefined).order("fecha_agenda", { ascending: false }).order("id", { ascending: false }))
      const listR = await listQ
      if (listR.error) return NextResponse.json({ error: listR.error.message }, { status: 500 })
      const ids = (listR.data || []).map((row: any) => row.id)
      const [resR, precallR] = ids.length
        ? await Promise.all([
            sb.from("agendas").select("id").in("id", ids).not("resumen_chat", "is", null),
            sb.from("agendas").select("id").in("id", ids).not("info_call_triage", "is", null),
          ])
        : [{ data: [], error: null }, { data: [], error: null }]
      const { data: followups } = ids.length
        ? await sb.from("crm_events").select("source_record_id,occurred_at,metadata,created_at").eq("event_type", "agenda_followup").in("source_record_id", ids.map(String))
        : { data: [] }
      const followupByAgenda = new Map((followups || []).map((row: any) => [String(row.source_record_id), row]))
      const withResumen = new Set((resR.data || []).map((r: any) => r.id))
      const withPrecall = new Set((precallR.data || []).map((r: any) => r.id))
      const data = (listR.data || []).map((r: any) => ({
        ...withFollowup(exposeAgendaEmail(r), followupByAgenda.get(String(r.id))),
        _has_resumen: withResumen.has(r.id),
        _has_precall: withPrecall.has(r.id),
      }))
      return NextResponse.json(pagination ? paginatedPayload(data, listR.count || 0, pagination) : data)
    }

    // Full (sin light): comportamiento de siempre, todas las columnas
    let query = sb.from("agendas").select("*,crm_people(primary_email)", pagination ? { count: "exact" } : undefined).order("fecha_agenda", { ascending: false }).order("id", { ascending: false })
    query = applyDates(query)
    const { data, error, count } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const fullIds = (data || []).map((row: any) => String(row.id))
    const { data: fullFollowups } = fullIds.length ? await sb.from("crm_events").select("source_record_id,occurred_at,metadata,created_at").eq("event_type", "agenda_followup").in("source_record_id", fullIds) : { data: [] }
    const fullFollowupByAgenda = new Map((fullFollowups || []).map((row: any) => [String(row.source_record_id), row]))
    const exposed = (data || []).map((row: any) => withFollowup(exposeAgendaEmail(row), fullFollowupByAgenda.get(String(row.id))))
    return NextResponse.json(pagination ? paginatedPayload(exposed, count || 0, pagination) : exposed)
  } catch (err) {
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const sb = getSupabase()
    const body = await request.json()
    const email = body.email == null || body.email === "" ? null : normalizeLeadEmail(body.email)
    if (body.email && !email) return NextResponse.json({ error: "Email inválido" }, { status: 400 })
    if (!body.nombre || !String(body.nombre).trim()) {
      return NextResponse.json({ error: "Falta el nombre" }, { status: 400 })
    }
    const row: Record<string, unknown> = {}
    for (const k of Object.keys(body)) {
      if (ALLOWED_CREATE.has(k)) row[k] = body[k]
    }
    if (!String(row.recurso || "").trim() && row.resumen_chat) {
      row.recurso = extractBookingContentOrigin(row.resumen_chat)
    }
    // Protección para altas manuales repetidas: una misma persona puede
    // reagendar, pero no debe existir dos veces con el mismo booking, call y closer.
    let duplicateQuery = sb.from("agendas").select("id").limit(1)
    if (row.telefono) duplicateQuery = duplicateQuery.eq("telefono", row.telefono)
    else if (row.instagram) duplicateQuery = duplicateQuery.ilike("instagram", String(row.instagram).trim())
    else duplicateQuery = duplicateQuery.ilike("nombre", String(row.nombre).trim())
    if (row.fecha_agenda) duplicateQuery = duplicateQuery.eq("fecha_agenda", row.fecha_agenda)
    if (row.fecha_closer) duplicateQuery = duplicateQuery.eq("fecha_closer", row.fecha_closer)
    if (row.closer) duplicateQuery = duplicateQuery.eq("closer", row.closer)
    const { data: duplicate, error: duplicateError } = await duplicateQuery.maybeSingle()
    if (duplicateError) return NextResponse.json({ error: duplicateError.message }, { status: 500 })
    if (duplicate) return NextResponse.json({ success: true, id: duplicate.id, duplicate_ignored: true })
    const { data, error } = await sb
      .from("agendas")
      .insert(row)
      .select("id,person_id,fecha_agenda,created_at,resumen_chat")
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await persistChatSummaryAttribution(sb, [data])
    if (email) await attachEmailToPerson(sb, data.person_id, email, "agenda_manual")
    await updateHammerAudience("add", { email, telefono: row.telefono }).catch((error) => console.error("[hammer-audience] add", error))
    return NextResponse.json({ success: true, id: data.id })
  } catch (err) {
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const sb = getSupabase()
    const { id, email: rawEmail, archive, reason, ...rawUpdates } = await request.json()
    if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 })
    if (archive === true) {
      if (!String(reason || "").trim()) return NextResponse.json({ error: "Indicá el motivo del archivado" }, { status: 400 })
      const session = await createSupabaseServer()
      const { data: { user } } = await session.auth.getUser()
      if (!user?.email) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
      const { data: existing, error: readError } = await sb.from("agendas").select("id,person_id,telefono,estado").eq("id", id).maybeSingle()
      if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })
      if (!existing || existing.estado === "Archivada manualmente") return NextResponse.json({ error: "La agenda no existe o ya estaba archivada" }, { status: 404 })
      const archivedAt = new Date().toISOString()
      const { data: archived, error: archiveError } = await sb.from("agendas").update({ estado: "Archivada manualmente" }).eq("id", id).select("id,person_id,telefono").maybeSingle()
      if (archiveError) return NextResponse.json({ error: archiveError.message }, { status: 500 })
      if (!archived) return NextResponse.json({ error: "No se pudo archivar la agenda" }, { status: 500 })
      if (archived?.person_id) await sb.from("crm_events").upsert({
        person_id: archived.person_id,
        event_type: "agenda_archived",
        occurred_at: archivedAt,
        source: "CRM",
        source_record_type: "agendas",
        source_record_id: String(id),
        title: "Agenda archivada",
        metadata: { reason: String(reason).trim(), actor: user.email.toLowerCase(), previous_estado: existing.estado },
        dedupe_key: `agenda_archived:${id}`,
      }, { onConflict: "dedupe_key" })
      await updateHammerAudience("remove", { telefono: archived.telefono }).catch((audienceError) => console.error("[hammer-audience] archive", audienceError))
      return NextResponse.json({ success: true, archived: true })
    }
    const followupKeys = ["seguimiento_estado", "seguimiento_fecha", "seguimiento_nota", "seguimiento_responsable"] as const
    const hasFollowupUpdate = followupKeys.some(key => key in rawUpdates)
    const updates = Object.fromEntries(Object.entries(rawUpdates).filter(([key]) => ALLOWED_UPDATE.has(key)))
    // El resultado y el estado deben ser coherentes para todas las vistas.
    // Nunca dejamos un `show=true` etiquetado a la vez como No Show.
    if (updates.show === false) {
      updates.cerro = false
      updates.estado = "No Show"
      updates.motivo_no_cierre = null
    } else if (updates.show === true && updates.estado === "No Show") {
      updates.estado = null
    }
    if (!String(updates.recurso || "").trim() && updates.resumen_chat) {
      const contentOrigin = extractBookingContentOrigin(updates.resumen_chat)
      if (contentOrigin) updates.recurso = contentOrigin
    }
    const email = rawEmail == null || rawEmail === "" ? null : normalizeLeadEmail(rawEmail)
    if (rawEmail && !email) return NextResponse.json({ error: "Email inválido" }, { status: 400 })
    if (Object.keys(updates).length === 0 && !email && !hasFollowupUpdate) return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 })

    // Guardamos el resultado anterior para emitir CAPI solo al cruzar por primera
    // vez a la condición valiosa: show real + calificación S/A/B.
    let prevCalificacion: string | null = null
    let prevShow: boolean | null = null
    if ("calificacion" in updates || "show" in updates) {
      const { data: prev } = await sb.from("agendas").select("calificacion,show").eq("id", id).maybeSingle()
      prevCalificacion = prev?.calificacion ?? null
      prevShow = prev?.show ?? null
    }

    const updateResult = Object.keys(updates).length
      ? await sb.from("agendas").update(updates).eq("id", id)
        .select("id,person_id,fecha_agenda,fecha_closer,created_at,resumen_chat,telefono,instagram,calificacion,show,estado,call_confirmer")
        .maybeSingle()
      : await sb.from("agendas")
        .select("id,person_id,fecha_agenda,fecha_closer,created_at,resumen_chat,telefono,instagram,calificacion,show,estado,call_confirmer")
        .eq("id", id)
        .maybeSingle()
    const { data: updated, error } = updateResult
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (updates.resumen_chat && updated) {
      await persistChatSummaryAttribution(sb, [updated])
    }
    if (email && updated) await attachEmailToPerson(sb, updated.person_id, email, "crm_agenda")
    if (updated) {
      const { data: person } = await sb.from("crm_people").select("primary_email").eq("id", updated.person_id).maybeSingle()
      const target = shouldRemainInHammerAudience({ ...updated, ...updates }) ? "add" : "remove"
      await updateHammerAudience(target, { email: email || person?.primary_email, telefono: updated.telefono }).catch((audienceError) => console.error("[hammer-audience] patch", audienceError))
      if (hasFollowupUpdate) {
        const estado = String(rawUpdates.seguimiento_estado || "").trim()
        const fecha = String(rawUpdates.seguimiento_fecha || "").slice(0, 10)
        const nota = String(rawUpdates.seguimiento_nota || "").trim()
        const responsable = String(rawUpdates.seguimiento_responsable || "").trim()
        if (!estado && !fecha && !nota && !responsable) {
          await sb.from("crm_events").delete().eq("dedupe_key", `agenda_followup:${id}`)
        } else {
          if (!fecha || !nota) return NextResponse.json({ error: "El seguimiento necesita fecha y nota" }, { status: 400 })
          await sb.from("crm_events").upsert({
            person_id: updated.person_id,
            event_type: "agenda_followup",
            occurred_at: `${fecha}T12:00:00-03:00`,
            source: "CRM",
            source_record_type: "agendas",
            source_record_id: String(id),
            title: `Seguimiento: ${estado || "Pendiente"}`,
            metadata: { estado: estado || "Pendiente", nota, responsable },
            dedupe_key: `agenda_followup:${id}`,
          }, { onConflict: "dedupe_key" })
        }
      }
    }

    // CAPI Meta: premiar únicamente show real + S/A/B. No-show, pendiente y C/D
    // no generan ningún evento positivo. event_id estable evita duplicados.
    const wasQualifiedShow = prevShow === true && /LEAD [SAB]/.test(prevCalificacion || "")
    const isQualifiedShow = updated?.show === true && /LEAD [SAB]/.test(updated?.calificacion || "")
    if (
      updated &&
      !wasQualifiedShow &&
      isQualifiedShow
    ) {
      await sendLeadScoreEvent({
        agendaId: updated.id,
        telefono: updated.telefono,
        instagram: updated.instagram,
        calificacion: updated.calificacion,
        show: true,
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 })
  }
}

function withFollowup(row: any, event: any) {
  const metadata = event?.metadata || {}
  return {
    ...row,
    seguimiento_estado: metadata.estado || null,
    seguimiento_fecha: event?.occurred_at ? String(event.occurred_at).slice(0, 10) : null,
    seguimiento_nota: metadata.nota || null,
    seguimiento_responsable: metadata.responsable || null,
    seguimiento_actualizado_at: event?.created_at || null,
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json()
    if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 })
    const sb = getSupabase()
    const { data: row, error: readError } = await sb.from("agendas").select("id,nombre,fuente").eq("id", id).maybeSingle()
    if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })
    const isControlledQa = row && row.fuente === "QA interna" && String(row.nombre || "").startsWith("QA TORO ")
    if (!isControlledQa) {
      return NextResponse.json(
        { error: "El borrado permanente de agendas reales está deshabilitado para preservar la trazabilidad." },
        { status: 405 },
      )
    }
    const { error } = await sb.from("agendas").delete().eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, deleted: id, qa_only: true })
  } catch {
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 })
  }
}
