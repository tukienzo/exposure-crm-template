import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { SALES_ANGLES } from "@/lib/sales-angles"
import { BUYER_ARCHETYPES } from "@/lib/trace-intelligence"

const STATUSES = new Set(["resolved", "ignored", "pending"])

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const personId = String(body.person_id || "").trim()
    const status = String(body.status || "resolved").trim()
    const angle = body.angle_override ? String(body.angle_override).trim() : null
    const archetype = body.archetype_override ? String(body.archetype_override).trim() : null
    if (!/^[0-9a-f-]{36}$/i.test(personId)) return NextResponse.json({ error: "Persona inválida" }, { status: 400 })
    if (!STATUSES.has(status)) return NextResponse.json({ error: "Estado inválido" }, { status: 400 })
    if (angle && !(SALES_ANGLES as readonly string[]).includes(angle)) return NextResponse.json({ error: "Ángulo no canónico" }, { status: 400 })
    if (archetype && !(BUYER_ARCHETYPES as readonly string[]).includes(archetype)) return NextResponse.json({ error: "Arquetipo no canónico" }, { status: 400 })

    const sb = createSupabaseAdmin()
    const now = new Date().toISOString()
    const { data: existing } = await sb.from("crm_integration_assets")
      .select("metadata")
      .eq("source", "trace_review")
      .eq("asset_type", "decision")
      .eq("source_id", personId)
      .maybeSingle()
    const metadata = {
      ...(existing?.metadata || {}), status,
      angle_override: angle, archetype_override: archetype,
      note: body.note ? String(body.note).slice(0, 1000) : null,
      reviewed_at: now,
      review_source: "crm_valen_queue",
    }
    const { error } = await sb.from("crm_integration_assets").upsert({
      source: "trace_review", asset_type: "decision", source_id: personId,
      name: String(body.name || "Revisión de trazabilidad").slice(0, 200),
      metadata, last_seen_at: now,
    }, { onConflict: "source,asset_type,source_id" })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, metadata })
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 })
  }
}
