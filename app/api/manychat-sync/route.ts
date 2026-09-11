import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { authorizePreviewSync, normEmail, normInstagram, normPhone } from "@/lib/integration-auth"
import { beginIntegrationJob, finishIntegrationJob } from "@/lib/integration-observability"

export const maxDuration = 60
const API = "https://api.manychat.com/fb/page"

async function manychat(path: string) {
  const key = process.env.MANYCHAT_API_KEY
  if (!key) throw new Error("Falta MANYCHAT_API_KEY en preview")
  const response = await fetch(`${API}/${path}`, {
    headers: { Authorization: `Bearer ${key}` }, cache: "no-store",
  })
  if (!response.ok) throw new Error(`ManyChat ${path}: HTTP ${response.status}`)
  const payload = await response.json()
  if (payload.status !== "success") throw new Error(`ManyChat ${path}: respuesta inválida`)
  return payload.data
}

function rows(type: string, items: any[]) {
  return items.map((item) => ({
    source: "manychat", asset_type: type,
    source_id: String(item.id ?? item.ns ?? item.key ?? item.name),
    name: String(item.name ?? item.title ?? item.id ?? ""),
    metadata: item, last_seen_at: new Date().toISOString(),
  }))
}

export async function POST(request: Request) {
  const auth = authorizePreviewSync(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const startedAt = Date.now()
  const admin = createSupabaseAdmin()
  const body = await request.json().catch(() => null)
  const subscriber = body?.subscriber || body?.full_contact_data || body?.contact || body
  const requestedSubscriberId = String(subscriber?.id || subscriber?.subscriber_id || subscriber?.contact_id || body?.subscriber_id || "").trim()
  const jobId = await beginIntegrationJob(admin, "manychat", requestedSubscriberId ? "ingest_subscriber" : "sync_assets", requestedSubscriberId || new Date().toISOString().slice(0, 13))
  try {
    // External Request puede enviar Full Contact Data directamente o envuelto.
    // Guardamos el snapshot aunque no haya match, pero solo vinculamos a una
    // persona por identidad estable; nunca por nombre.
    const subscriberId = String(
      subscriber?.id || subscriber?.subscriber_id || subscriber?.contact_id ||
      body?.subscriber_id || "",
    ).trim()
    if (subscriberId) {
      const instagram = normInstagram(
        subscriber?.instagram_username || subscriber?.ig_username ||
        subscriber?.username || subscriber?.instagram,
      )
      const candidates = [
        ["phone", normPhone(subscriber.phone || subscriber.phone_number)],
        ["email", normEmail(subscriber.email)],
        ["instagram", instagram],
        ["manychat", subscriberId],
      ].filter((x): x is [string, string] => Boolean(x[1]))
      let personId: string | null = null
      for (const [kind, value] of candidates) {
        const { data } = await admin.from("crm_identities").select("person_id").eq("kind", kind).eq("value", value).maybeSingle()
        if (data?.person_id) { personId = data.person_id; break }
      }
      const tags = body?.tags || subscriber?.tags || subscriber?.assigned_tags || []
      const now = new Date().toISOString()
      const snapshot = {
        source: "manychat",
        asset_type: "subscriber",
        source_id: subscriberId,
        name: instagram || subscriber?.name || subscriber?.full_name || subscriberId,
        metadata: { ...subscriber, tags },
        last_seen_at: now,
      }
      const { error: snapshotError } = await admin
        .from("crm_integration_assets")
        .upsert(snapshot, { onConflict: "source,asset_type,source_id" })
      if (snapshotError) throw snapshotError
      if (!personId) {
        await finishIntegrationJob(admin, { jobId, provider: "manychat", route: "/api/manychat-sync", startedAt, success: true })
        return NextResponse.json({ ok: true, matched: 0, snapshot: 1, tags: tags.length || 0 })
      }
      const identities = [
        { person_id: personId, kind: "manychat", value: subscriberId, source: "manychat", last_seen_at: now },
        instagram && { person_id: personId, kind: "instagram", value: instagram, source: "manychat", last_seen_at: now },
      ].filter((identity): identity is NonNullable<typeof identity> => Boolean(identity))
      const { error: identityError } = await admin
        .from("crm_identities")
        .upsert(identities, { onConflict: "kind,value" })
      if (identityError) throw identityError
      const events = tags.map((tag: any) => {
        const tagId = String(tag.id ?? tag)
        return { person_id: personId, event_type: "manychat_tag", occurred_at: body?.occurred_at || subscriber?.updated_at || now, source: "manychat", source_record_type: "tag", source_record_id: tagId, title: String(tag.name ?? tag), metadata: { subscriber_id: subscriberId, instagram, tag }, dedupe_key: `manychat:tag:${subscriberId}:${tagId}` }
      })
      if (events.length) await admin.from("crm_events").upsert(events, { onConflict: "dedupe_key", ignoreDuplicates: true })
      await finishIntegrationJob(admin, { jobId, provider: "manychat", route: "/api/manychat-sync", startedAt, success: true })
      return NextResponse.json({ ok: true, matched: 1, snapshot: 1, inserted: events.length })
    }

    const [tags, fields, flowData, growthTools] = await Promise.all([
      manychat("getTags"), manychat("getCustomFields"), manychat("getFlows"), manychat("getGrowthTools"),
    ])
    const flows = Array.isArray(flowData) ? flowData : (flowData.flows || [])
    const assets = [
      ...rows("tag", tags), ...rows("custom_field", fields),
      ...rows("flow", flows), ...rows("growth_tool", growthTools),
    ]
    for (let i = 0; i < assets.length; i += 400) {
      const { error } = await admin.from("crm_integration_assets").upsert(assets.slice(i, i + 400), { onConflict: "source,asset_type,source_id" })
      if (error) throw error
    }
    await finishIntegrationJob(admin, { jobId, provider: "manychat", route: "/api/manychat-sync", startedAt, success: true })
    return NextResponse.json({ ok: true, tags: tags.length, custom_fields: fields.length, flows: flows.length, growth_tools: growthTools.length, total: assets.length })
  } catch (error: any) {
    await finishIntegrationJob(admin, { jobId, provider: "manychat", route: "/api/manychat-sync", startedAt, success: false, error })
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 })
  }
}

// Vercel Cron usa GET; el mismo secreto e idempotencia protegen ambos modos.
export async function GET(request: Request) {
  return POST(new Request(request.url, { method: "POST", headers: request.headers }))
}
