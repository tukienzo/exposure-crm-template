import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { createSupabaseServer } from "@/lib/supabase-server"
import { isContentOnlyAccount } from "@/lib/role-access"

export const dynamic = "force-dynamic"

const SOURCE = "loom-testimonials"
const statuses = new Set(["detected", "reviewed", "published", "discarded"])
const editStatuses = new Set(["pending", "edited"])

type Candidate = {
  id: string
  source_id: string
  name: string | null
  metadata: Record<string, unknown> | null
  first_seen_at: string | null
  last_seen_at: string | null
}

function secondsLabel(raw: unknown) {
  const total = Math.max(0, Math.floor(Number(raw || 0)))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`
}

function escapeHtml(value: unknown) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character)
}

function normalize(row: Candidate): Record<string, any> {
  return { id: row.id, fingerprint: row.source_id, name: row.name, ...(row.metadata || {}), created_at: row.first_seen_at, updated_at: row.last_seen_at }
}

async function isContentOnly() {
  const session = await createSupabaseServer()
  const { data: { user } } = await session.auth.getUser()
  return isContentOnlyAccount(user?.email?.toLowerCase())
}

export async function GET(request: Request) {
  const admin = createSupabaseAdmin()
  const contentOnly = await isContentOnly()
  const { searchParams } = new URL(request.url)
  if (searchParams.get("mode") === "clients") {
    const { data, error } = await admin
      .from("clientes")
      .select("id,person_id,nombre,record_status,fecha_ingreso")
      .neq("record_status", "merged")
      .not("person_id", "is", null)
      .order("fecha_ingreso", { ascending: false })
      .limit(3000)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const seen = new Set<string>()
    const clients = (data || []).filter((client) => {
      if (!client.person_id || seen.has(client.person_id)) return false
      seen.add(client.person_id)
      return true
    }).map((client) => ({ id: client.id, person_id: client.person_id, name: client.nombre, historical: client.record_status === "historical" }))
    return NextResponse.json({ clients })
  }
  const status = searchParams.get("status")
  const category = searchParams.get("category")
  const editStatus = searchParams.get("edit_status")
  const q = String(searchParams.get("q") || "").trim().toLowerCase()
  const { data: candidateRows, error } = await admin
    .from("crm_integration_assets")
    .select("id,source_id,name,metadata,first_seen_at,last_seen_at")
    .eq("source", SOURCE)
    .eq("asset_type", "testimonial_candidate")
    .order("last_seen_at", { ascending: false })
    .limit(3000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { count: consultationCount } = await admin
    .from("crm_integration_assets")
    .select("id", { count: "exact", head: true })
    .eq("source", SOURCE)
    .eq("asset_type", "loom_consultation")
  let rows = (candidateRows || []).map((row) => normalize(row as Candidate))
  if (contentOnly) rows = rows.filter((row) => row.content_account !== "CUENTA_A")
  if (status) rows = rows.filter((row) => row.status === status)
  else rows = rows.filter((row) => row.status !== "discarded")
  if (category) rows = rows.filter((row) => row.category === category)
  if (editStatus === "not_imported") rows = rows.filter((row) => !row.content_asset_id)
  else if (editStatus) rows = rows.filter((row) => row.edit_status === editStatus)
  if (q) rows = rows.filter((row) => JSON.stringify(row).toLowerCase().includes(q))
  rows.sort((a, b) => Number(b.strength || 0) - Number(a.strength || 0) || String(b.recorded_at || "").localeCompare(String(a.recorded_at || "")))

  if (["md", "doc"].includes(String(searchParams.get("export")))) {
    const included = rows.filter((row) => row.status !== "discarded")
    if (searchParams.get("export") === "doc") {
      const sections = included.map((row) => {
        const start = secondsLabel(row.start_seconds)
        const end = secondsLabel(row.end_seconds)
        const url = `${row.loom_url}?t=${Math.floor(Number(row.start_seconds || 0))}`
        return `<h2>${escapeHtml(start)}–${escapeHtml(end)} — ${escapeHtml(row.speaker || row.title || "Testimonio")}</h2><p>${escapeHtml(row.summary)}</p><blockquote>“${escapeHtml(row.exact_quote)}”</blockquote><p><a href="${escapeHtml(url)}">Abrir Loom en el timestamp</a></p>`
      }).join("<hr>")
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Banco de Testimonios</title><style>body{font-family:Arial,sans-serif;max-width:900px;margin:40px auto;line-height:1.5}h1{font-size:28px}h2{font-size:18px;margin-top:28px}blockquote{border-left:4px solid #7c3aed;margin:16px 0;padding:8px 16px;background:#f5f3ff}hr{border:0;border-top:1px solid #ddd;margin:32px 0}</style></head><body><h1>Banco de Testimonios</h1><p>Exportado: ${escapeHtml(new Date().toISOString())}</p>${sections}</body></html>`
      return new Response(html, { headers: { "Content-Type": "application/msword; charset=utf-8", "Content-Disposition": 'attachment; filename="banco-testimonios.doc"' } })
    }
    const lines = ["# Banco de Testimonios", "", `Exportado: ${new Date().toISOString()}`, ""]
    for (const row of included) {
      const start = secondsLabel(row.start_seconds)
      const end = secondsLabel(row.end_seconds)
      const url = `${row.loom_url}?t=${Math.floor(Number(row.start_seconds || 0))}`
      lines.push(`## ${start}–${end} — ${row.speaker || row.title || "Testimonio"}`)
      lines.push("")
      lines.push(String(row.summary || ""))
      lines.push("")
      lines.push(`> ${String(row.exact_quote || "").replace(/\n/g, " ")}`)
      lines.push("")
      lines.push(`Loom: ${url}`)
      lines.push("")
    }
    return new Response(lines.join("\n"), { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": 'attachment; filename="banco-testimonios.md"' } })
  }

  const totals = { detected: 0, reviewed: 0, published: 0, discarded: 0, imported: 0, pending_edit: 0, edited: 0 }
  for (const row of (candidateRows || []).map((item) => normalize(item as Candidate)).filter((row) => !contentOnly || row.content_account !== "CUENTA_A")) {
    const key = String(row.status || "detected") as keyof typeof totals
    if (key in totals) totals[key] += 1
    if (row.content_asset_id) totals.imported += 1
    if (row.edit_status === "pending") totals.pending_edit += 1
    if (row.edit_status === "edited") totals.edited += 1
  }
  return NextResponse.json({ rows, total: rows.length, consultations: consultationCount || 0, totals })
}

export async function PATCH(request: Request) {
  const admin = createSupabaseAdmin()
  const body = await request.json()
  const id = String(body.id || "")
  const status = String(body.status || "")
  const editStatus = String(body.edit_status || "")
  const personId = String(body.person_id || "").trim()
  if (!id || (!statuses.has(status) && !editStatuses.has(editStatus) && !personId)) return NextResponse.json({ error: "Cambio inválido" }, { status: 400 })
  const { data: current, error: readError } = await admin
    .from("crm_integration_assets")
    .select("metadata")
    .eq("id", id)
    .eq("source", SOURCE)
    .eq("asset_type", "testimonial_candidate")
    .single()
  if (readError) return NextResponse.json({ error: readError.message }, { status: 404 })
  if (await isContentOnly() && current.metadata?.content_account === "CUENTA_A") return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  const now = new Date().toISOString()
  let canonicalName = ""
  if (personId) {
    const { data: client, error: clientError } = await admin
      .from("clientes")
      .select("nombre")
      .eq("person_id", personId)
      .neq("record_status", "merged")
      .order("fecha_ingreso", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (clientError || !client?.nombre) return NextResponse.json({ error: "Cliente histórico no encontrado" }, { status: 404 })
    canonicalName = client.nombre
  }
  const metadata = {
    ...(current.metadata || {}),
    ...(statuses.has(status) ? { status, status_updated_at: now } : {}),
    ...(editStatuses.has(editStatus) ? { edit_status: editStatus, edit_status_updated_at: now } : {}),
    ...(personId ? { person_id: personId, speaker: canonicalName, speaker_corrected_at: now } : {}),
  }
  const { error } = await admin.from("crm_integration_assets").update({ metadata, last_seen_at: new Date().toISOString() }).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (editStatuses.has(editStatus) && metadata.content_asset_id) {
    const { data: content } = await admin.from("crm_content_assets").select("metadata").eq("id", metadata.content_asset_id).maybeSingle()
    if (content) await admin.from("crm_content_assets").update({ metadata: { ...(content.metadata || {}), editing_status: editStatus, editing_status_updated_at: now } }).eq("id", metadata.content_asset_id)
  }
  if (personId && metadata.content_asset_id) {
    const { data: content } = await admin.from("crm_content_assets").select("metadata,title,script_text").eq("id", metadata.content_asset_id).maybeSingle()
    if (content) {
      const oldSpeaker = String(current.metadata?.speaker || "")
      await admin.from("crm_content_assets").update({
        title: `TESTIMONIO · ${canonicalName}`,
        script_text: oldSpeaker ? String(content.script_text || "").replaceAll(oldSpeaker, canonicalName) : content.script_text,
        metadata: { ...(content.metadata || {}), person_id: personId, client_name: canonicalName },
      }).eq("id", metadata.content_asset_id)
    }
  }
  return NextResponse.json({ ok: true })
}

export async function POST(request: Request) {
  const admin = createSupabaseAdmin()
  const body = await request.json()
  const id = String(body.id || "")
  const account = body.content_account === "CUENTA_B" ? "CUENTA_B" : body.content_account === "CUENTA_A" ? "CUENTA_A" : null
  if (!id || !account) return NextResponse.json({ error: "Elegí CUENTA_A o CUENTA_B" }, { status: 400 })
  if (await isContentOnly() && account === "CUENTA_A") return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  const { data: candidate, error: candidateError } = await admin
    .from("crm_integration_assets")
    .select("source_id,metadata")
    .eq("id", id)
    .eq("source", SOURCE)
    .eq("asset_type", "testimonial_candidate")
    .single()
  if (candidateError || !candidate) return NextResponse.json({ error: "Testimonio no encontrado" }, { status: 404 })
  const metadata = candidate.metadata || {}
  if (metadata.content_asset_id) return NextResponse.json({ ok: true, already_imported: true, content_asset_id: metadata.content_asset_id })
  const sourceKey = account === "CUENTA_A" ? `manual:cuenta-a:testimonial:${candidate.source_id}` : `manual:testimonial:cuenta-b:${candidate.source_id}`
  const { data: existing } = await admin.from("crm_content_assets").select("id").eq("source_key", sourceKey).maybeSingle()
  let contentAssetId = existing?.id
  if (!contentAssetId) {
    const start = Number(metadata.start_seconds || 0)
    const end = Number(metadata.end_seconds || 0)
    const loomUrl = `${metadata.loom_url}?t=${Math.floor(start)}`
    const scriptText = [
      `TIMESTAMP: ${secondsLabel(start)}–${secondsLabel(end)}`,
      `RESUMEN: ${metadata.summary || ""}`,
      `CITA EXACTA: “${metadata.exact_quote || ""}”`,
      `LOOM: ${loomUrl}`,
    ].join("\n\n")
    const { data: created, error: createError } = await admin.from("crm_content_assets").insert({
      source_key: sourceKey,
      title: `TESTIMONIO · ${metadata.speaker || metadata.title || "Cliente"}`,
      platform: "Instagram",
      angle: null,
      format: "CLIP",
      topic: metadata.summary || null,
      source_url: loomUrl,
      status: "grabado",
      script_text: scriptText,
      insight_notes: `Importado desde Banco de Testimonios · fuerza ${metadata.strength || "—"}/5`,
      metadata: {
        import_source: "testimonial-bank",
        testimonial_fingerprint: candidate.source_id,
        testimonial_candidate_id: id,
        person_id: metadata.person_id || null,
        client_name: metadata.speaker || null,
        content_account: account,
        editing_status: "pending",
        loom_id: metadata.loom_id,
        start_seconds: start,
        end_seconds: end,
      },
    }).select("id").single()
    if (createError) return NextResponse.json({ error: createError.message }, { status: 500 })
    contentAssetId = created.id
  }
  const now = new Date().toISOString()
  const { error: updateError } = await admin.from("crm_integration_assets").update({
    metadata: { ...metadata, content_asset_id: contentAssetId, content_account: account, edit_status: metadata.edit_status || "pending", imported_to_content_at: now },
    last_seen_at: now,
  }).eq("id", id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  return NextResponse.json({ ok: true, content_asset_id: contentAssetId })
}
