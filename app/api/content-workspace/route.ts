import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { canonicalSalesAngle, SALES_ANGLES } from "@/lib/sales-angles"
import { nextVolumeAngle } from "@/lib/content-volume-angle"
import { createSupabaseServer } from "@/lib/supabase-server"
import { isContentOnlyAccount } from "@/lib/role-access"

// Espacio operativo semanal de Contenido (Cuenta B / Editor). Vive dentro de
// crm_content_assets (mismo catálogo que /contenido-angulos usa para
// trazabilidad), pero acá se lee/escribe el detalle operativo: guion, quién
// lo hace, estado de producción, calendario. El middleware ya protege esta
// ruta (login+aprobado en producción; solo-lectura en preview).

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error("Supabase credentials not configured")
  return createClient(url, key)
}

async function isContentOnly() {
  const session = await createSupabaseServer()
  const { data: { user } } = await session.auth.getUser()
  return isContentOnlyAccount(user?.email?.toLowerCase())
}

function isPaulContent(row: { source_key?: string | null; metadata?: Record<string, unknown> | null }) {
  return String(row.source_key || "").startsWith("manual:cuenta-a:") || row.metadata?.content_account === "CUENTA_A"
}

// Filas que este workspace puede crear/editar/borrar directamente: piezas
// nuevas cargadas a mano (`manual:`) o importadas del planificador de Notion
// (`notion-planner:`). Las filas `notion:` son el stub original del árbol de
// páginas del export comprimido (solo título, sin guion) — se muestran igual
// en el catálogo de /contenido-angulos por trazabilidad, pero no se editan
// desde acá para no pisar ese rastro histórico.
function isWorkspaceManaged(sourceKey: string) {
  return sourceKey.startsWith("manual:") || sourceKey.startsWith("notion-planner:")
}

function canonicalFeedFormat(value: string) {
  const normalized = value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
  const map: Record<string, string> = { REACCION: "REACCIÓN", "TALKING HEAD": "TALKING HEAD", "VOZ EN OFF": "B-ROLL + VOZ EN OFF", "B-ROLL + VOZ EN OFF": "B-ROLL + VOZ EN OFF", ANALISIS: "ANÁLISIS", VOLUMEN: "VOLUMEN", "CAMARA + PC": "CÁMARA + PC", CARRUSEL: "CARRUSEL", ESTRATEGIA: "ESTRATEGIA", TESTIMONIO: "TESTIMONIO", "CASO DE EXITO": "CASO DE ÉXITO", "TOP TIER": "TOP TIER" }
  return map[normalized] || value.trim().toUpperCase()
}

function weekBounds(plannedAt: string) {
  if (!plannedAt) return null
  const date = new Date(`${plannedAt.slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return null
  const weekday = (date.getUTCDay() + 6) % 7
  const monday = new Date(date)
  monday.setUTCDate(date.getUTCDate() - weekday)
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) }
}

async function volumeAngleAssignment(sb: ReturnType<typeof getSupabase>, plannedAt: string, excludeId?: string | null, contentOnly = false) {
  let query = sb
    .from("crm_content_assets")
    .select("angle")
    .ilike("format", "%VOLUMEN%")
    .neq("status", "historical")
  if (contentOnly) {
    query = query
      .not("source_key", "like", "manual:cuenta-a:%")
      .or("metadata->>content_account.is.null,metadata->>content_account.neq.PAUL")
  }
  const bounds = weekBounds(plannedAt)
  if (bounds) query = query.gte("planned_at", bounds.start).lte("planned_at", bounds.end)
  if (excludeId) query = query.neq("id", excludeId)
  const { data, error } = await query.limit(500)
  if (error) throw new Error(error.message)
  return nextVolumeAngle((data || []).map((item) => item.angle))
}

const SELECT_COLS =
  "id,source_key,title,platform,angle,format,topic,cta,planned_at,published_at,source_url,status,assigned_to,script_text,insight_notes,awareness_level,week_label,day_of_week,metadata,created_at,updated_at"

export async function GET(request: Request) {
  try {
    const sb = getSupabase()
    const { searchParams } = new URL(request.url)
    const contentOnly = await isContentOnly()
    if (searchParams.get("options") === "next-volume-angle") {
      const assignment = await volumeAngleAssignment(
        sb,
        searchParams.get("planned_at") || "",
        searchParams.get("exclude_id"),
        contentOnly,
      )
      return NextResponse.json(assignment)
    }
    if (searchParams.get("options") === "formats") {
      let formatQuery = sb
        .from("crm_content_assets")
        .select("format")
        .not("format", "is", null)
      if (contentOnly) {
        formatQuery = formatQuery
          .not("source_key", "like", "manual:cuenta-a:%")
          .or("metadata->>content_account.is.null,metadata->>content_account.neq.PAUL")
      }
      const { data, error } = await formatQuery.limit(5000)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const storyOnly = /^(¿QUÉ HAGO\??|HAND RAISER|CTA|WHY NOW|AUDITORÍA)$/i
      const formats = [...new Set(
        (data || []).map((row) => canonicalFeedFormat(String(row.format || ""))).filter((format) => format && !storyOnly.test(format)),
      )].sort((a, b) => a.localeCompare(b, "es"))
      return NextResponse.json({ formats })
    }
    const start = searchParams.get("start")
    const end = searchParams.get("end")
    const assignedTo = searchParams.get("assigned_to")
    const angle = searchParams.get("angle")
    const format = searchParams.get("format")
    const status = searchParams.get("status")
    const q = searchParams.get("q")
    const contentAssetId = searchParams.get("content_asset_id")
    const managedOnly = searchParams.get("managed_only") === "1"
    const contentAccount = searchParams.get("content_account")
    const contentKind = searchParams.get("content_kind")
    if (contentOnly && contentAccount === "CUENTA_A") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }
    const limit = Math.min(Number(searchParams.get("limit") || 200), 500)

    let query = sb.from("crm_content_assets").select(SELECT_COLS, { count: "exact" })
    if (contentAssetId) query = query.eq("id", contentAssetId)
    if (managedOnly) query = query.or("source_key.like.manual:%,source_key.like.notion-planner:%")
    if (contentAccount === "CUENTA_A") query = query.like("source_key", "manual:cuenta-a:%")
    if (contentAccount === "CUENTA_B" || contentOnly) {
      query = query
        .not("source_key", "like", "manual:cuenta-a:%")
        .or("metadata->>content_account.is.null,metadata->>content_account.neq.PAUL")
    }
    if (contentKind === "stories") query = query.eq("metadata->>content_type", "stories")
    if (contentKind === "feed") {
      query = query.or("metadata->>content_type.is.null,metadata->>content_type.neq.stories")
    }
    if (start) query = query.gte("planned_at", start)
    if (end) query = query.lte("planned_at", end)
    if (assignedTo) query = query.in("assigned_to", assignedTo.split(",").filter(Boolean))
    if (angle) query = query.eq("angle", angle)
    if (format) query = query.eq("format", format)
    if (status) query = query.in("status", status.split(",").filter(Boolean))
    if (q) query = query.or(`title.ilike.%${q}%,script_text.ilike.%${q}%`)
    query = query
      .order("planned_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(limit)

    const { data, error, count } = await query
    if (error) {
      if (error.code === "42P01" || error.message?.includes("schema cache")) {
        return NextResponse.json({ schemaReady: false, rows: [], total: 0 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ schemaReady: true, rows: data || [], total: count ?? (data || []).length })
  } catch {
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const sb = getSupabase()
    const body = await request.json()
    if (await isContentOnly() && body.content_account === "CUENTA_A") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }
    const title = String(body.title || "").trim()
    if (!title) return NextResponse.json({ error: "Falta título/concepto" }, { status: 400 })

    const requestedFormat = String(body.format || "")
    const isStories = body.content_type === "stories"
    const format = isStories ? requestedFormat : canonicalFeedFormat(requestedFormat)
    const storyNeedsAvatar = ["Hand Raiser", "Caso de éxito"].includes(format)
    const storyStatuses = new Set(["idea", "grabado", "edicion", "completo"])
    if (isStories && !["Hand Raiser", "Caso de éxito", "¿Qué hago?", "CTA", "WHY NOW", "AUDITORÍA"].includes(format)) {
      return NextResponse.json({ error: "Formato de stories inválido" }, { status: 400 })
    }
    if (isStories && storyNeedsAvatar && (!body.avatar || !body.angle)) {
      return NextResponse.json({ error: "Hand Raiser y Caso de éxito requieren avatar y ángulo" }, { status: 400 })
    }
    if (isStories && body.status && !storyStatuses.has(String(body.status))) {
      return NextResponse.json({ error: "Estado de stories inválido" }, { status: 400 })
    }
    const isVolume = /VOLUMEN/i.test(format)
    const hasNoAngle = /(?:^|\b)CLIP(?:\b|\s*·)|TESTIMONIO/i.test(format)
    let angle = body.angle ? canonicalSalesAngle(body.angle) : null
    let volumeAssignment: ReturnType<typeof nextVolumeAngle> | null = null
    if (isVolume && !angle) {
      const plannedAt = String(body.planned_at || "").slice(0, 10)
      volumeAssignment = await volumeAngleAssignment(sb, plannedAt, null, await isContentOnly())
      angle = volumeAssignment.angle
    }
    if (hasNoAngle) angle = null
    if (!isStories && !hasNoAngle && !(SALES_ANGLES as readonly string[]).includes(String(angle || ""))) {
      return NextResponse.json({ error: "Elegí un ángulo del mapa oficial antes de guardar" }, { status: 400 })
    }
    const scriptText = body.script_text ? String(body.script_text) : null
    const row = {
      source_key: body.content_account === "CUENTA_A"
        ? `manual:cuenta-a:${crypto.randomUUID()}`
        : `manual:${crypto.randomUUID()}`,
      title,
      platform: body.platform || null,
      angle,
      format: format || null,
      topic: body.topic || null,
      cta: body.cta || null,
      planned_at: body.planned_at || null,
      published_at: body.published_at || null,
      source_url: body.source_url || null,
      status: body.status || (scriptText ? "guion_listo" : "idea"),
      assigned_to: body.assigned_to || null,
      script_text: scriptText,
      insight_notes: body.insight_notes || null,
      awareness_level: volumeAssignment?.awarenessLevel || body.awareness_level || null,
      week_label: body.week_label || null,
      day_of_week: body.day_of_week || null,
      metadata: {
        import_source: "angle_map_v3",
        created_via: "content-workspace",
        content_account: body.content_account === "CUENTA_A" ? "CUENTA_A" : "CUENTA_B",
        ...(isStories ? {
          content_type: "stories",
          avatar: storyNeedsAvatar ? String(body.avatar) : null,
          idea: String(body.idea || title),
          script_blocks: Array.isArray(body.script_blocks) ? body.script_blocks.map(String) : [String(body.idea || title)],
        } : {}),
        funnel_stage: body.funnel_stage || (isVolume ? "TOFU" : null),
        ...(volumeAssignment ? {
          angle_assignment: "automatic_weekly_weighted",
          angle_mix: volumeAssignment.mix,
        } : {}),
      },
    }
    const { data, error } = await sb.from("crm_content_assets").insert(row).select("id").single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: data.id })
  } catch {
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 })
  }
}

const EDITABLE_FIELDS = [
  "title", "platform", "angle", "format", "topic", "cta", "planned_at", "published_at",
  "source_url", "status", "assigned_to", "script_text", "insight_notes", "awareness_level",
  "week_label", "day_of_week",
] as const

export async function PATCH(request: Request) {
  try {
    const sb = getSupabase()
    const body = await request.json()
    const { id } = body
    if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 })

    const { data: existing, error: fetchError } = await sb
      .from("crm_content_assets")
      .select(SELECT_COLS)
      .eq("id", id)
      .maybeSingle()
    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
    if (!existing) return NextResponse.json({ error: "Pieza no encontrada" }, { status: 404 })
    if (await isContentOnly() && isPaulContent(existing)) return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    if (!isWorkspaceManaged(existing.source_key)) {
      return NextResponse.json({
        error: "Esta pieza viene del árbol original de Notion (solo título, sin guion) y no se edita desde el workspace.",
      }, { status: 409 })
    }

    const updates: Record<string, unknown> = {}
    for (const field of EDITABLE_FIELDS) {
      if (field in body) {
        updates[field] = field === "angle" && body[field]
          ? (canonicalSalesAngle(body[field]) === "Sin ángulo" ? null : canonicalSalesAngle(body[field]))
          : (body[field] === "" ? null : body[field])
      }
    }
    const priorMetadata = (existing.metadata && typeof existing.metadata === "object") ? existing.metadata : {}
    if (priorMetadata.content_type !== "stories" && "format" in updates && updates.format) updates.format = canonicalFeedFormat(String(updates.format))
    if (priorMetadata.content_type === "stories" && "status" in body && !["idea", "grabado", "edicion", "completo"].includes(String(body.status))) {
      return NextResponse.json({ error: "Estado de stories inválido" }, { status: 400 })
    }
    const revisionHistory = Array.isArray((priorMetadata as Record<string, unknown>).revision_history)
      ? (priorMetadata as Record<string, unknown>).revision_history as unknown[]
      : []
    updates.metadata = {
      ...priorMetadata,
      ...( "funnel_stage" in body ? { funnel_stage: body.funnel_stage || null } : {}),
      ...(priorMetadata.content_type === "stories" ? {
        avatar: ["Hand Raiser", "Caso de éxito"].includes(String(body.format ?? existing.format)) ? (body.avatar || priorMetadata.avatar || null) : null,
        idea: "idea" in body ? (body.idea || null) : priorMetadata.idea,
        script_blocks: "script_blocks" in body && Array.isArray(body.script_blocks)
          ? body.script_blocks.map(String)
          : priorMetadata.script_blocks,
      } : {}),
      revision_history: [...revisionHistory, {
        saved_at: new Date().toISOString(),
        action: "before_update",
        snapshot: Object.fromEntries(EDITABLE_FIELDS.map((field) => [field, existing[field]])),
      }],
    }
    const resultingFormat = String(("format" in updates ? updates.format : existing.format) || "")
    const hasNoAngle = /(?:^|\b)CLIP(?:\b|\s*·)|TESTIMONIO/i.test(resultingFormat)
    const isStories = priorMetadata.content_type === "stories"
    if (hasNoAngle || (isStories && !["Hand Raiser", "Caso de éxito"].includes(resultingFormat))) updates.angle = null
    if (!isStories && "angle" in body && !/VOLUMEN/i.test(resultingFormat) && !hasNoAngle && !(SALES_ANGLES as readonly string[]).includes(String(updates.angle || ""))) {
      return NextResponse.json({ error: "Elegí un ángulo del mapa oficial antes de guardar" }, { status: 400 })
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 })
    }

    const { error } = await sb.from("crm_content_assets").update(updates).eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const sb = getSupabase()
    const { id } = await request.json()
    if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 })

    const { data: existing, error: fetchError } = await sb
      .from("crm_content_assets")
      .select(SELECT_COLS)
      .eq("id", id)
      .maybeSingle()
    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
    if (!existing) return NextResponse.json({ error: "Pieza no encontrada" }, { status: 404 })
    if (await isContentOnly() && isPaulContent(existing)) return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    if (!isWorkspaceManaged(existing.source_key)) {
      return NextResponse.json({
        error: "Esta pieza viene del árbol original de Notion y no se borra desde el workspace.",
      }, { status: 409 })
    }

    const priorMetadata = (existing.metadata && typeof existing.metadata === "object") ? existing.metadata : {}
    const revisionHistory = Array.isArray((priorMetadata as Record<string, unknown>).revision_history)
      ? (priorMetadata as Record<string, unknown>).revision_history as unknown[]
      : []
    const { error } = await sb.from("crm_content_assets").update({
      status: "historical",
      metadata: {
        ...priorMetadata,
        archived_at: new Date().toISOString(),
        archived_from_status: existing.status,
        revision_history: [...revisionHistory, {
          saved_at: new Date().toISOString(),
          action: "before_archive",
          snapshot: Object.fromEntries(EDITABLE_FIELDS.map((field) => [field, existing[field]])),
        }],
      },
    }).eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 })
  }
}
