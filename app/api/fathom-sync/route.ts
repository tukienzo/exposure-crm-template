import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { beginIntegrationJob, finishIntegrationJob } from "@/lib/integration-observability"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { createSupabaseServer } from "@/lib/supabase-server"
// Nombres del equipo comercial (en minúsculas) para reconocer llamadas de
// venta en Fathom por el título o los invitados: CRM_FATHOM_TEAM_HINTS="ana perez,bruno gomez"
const TEAM_HINTS = String(process.env.CRM_FATHOM_TEAM_HINTS || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)

export const maxDuration = 60

const FATHOM_URL = "https://api.fathom.ai/external/v1/meetings"
const CLAUDE_URL = "https://api.anthropic.com/v1/messages"
const CLAUDE_MODEL = "claude-sonnet-4-6"

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error("Supabase no configurado")
  return createClient(url, key)
}

async function canRunSync(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authorization = request.headers.get("authorization")
  if (cronSecret && authorization === `Bearer ${cronSecret}`) return true

  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return false
  const admin = createSupabaseAdmin()
  const { data } = await admin
    .from("team_members")
    .select("rol,estado")
    .eq("email", user.email.toLowerCase())
    .maybeSingle()
  return data?.estado === "aprobado" && data?.rol === "CEO"
}

function norm(s: string | null | undefined) {
  return (s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim()
}
function dateKey(s: string | null | undefined) {
  return s ? s.slice(0, 10) : null
}
function fathomLinkKey(value: string | null | undefined) {
  const raw = (value || "").trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    url.hash = ""
    url.search = ""
    url.pathname = url.pathname.replace(/\/+$/, "")
    return url.toString().replace(/\/$/, "")
  } catch {
    return raw.replace(/\/+$/, "")
  }
}
function addDays(iso: string, d: number) {
  const dt = new Date(iso + "T00:00:00Z"); dt.setUTCDate(dt.getUTCDate() + d)
  return dt.toISOString().slice(0, 10)
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))

// GET a Fathom con reintentos (aguanta 502/503/504 transitorios) y timeout corto por intento
async function fathomGet(url: string, apiKey: string, tries = 6): Promise<any> {
  let last = ""
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController()
      const to = setTimeout(() => ctrl.abort(), 15000)
      const r = await fetch(url, { headers: { "X-Api-Key": apiKey }, signal: ctrl.signal })
      clearTimeout(to)
      if (r.status === 429) {
        last = "Fathom 429"
        const retryAfter = Math.max(Number(r.headers.get("retry-after") || 2), 1)
        await sleep(Math.min(retryAfter * 1000, 8000))
        continue
      }
      if (r.status >= 500) { last = `Fathom ${r.status}`; await sleep(700 * (i + 1)); continue }
      if (!r.ok) throw new Error(`Fathom ${r.status}: ${(await r.text()).slice(0, 150)}`)
      return await r.json()
    } catch (e: any) {
      last = String(e?.message || e)
      if (i < tries - 1) { await sleep(700 * (i + 1)); continue }
      throw new Error(last)
    }
  }
  throw new Error(last || "Fathom sin respuesta")
}

// --- Fathom: traer reuniones (liviano, SIN transcript) desde una fecha ---
async function fetchFathom(apiKey: string, createdAfter: string, createdBefore?: string | null) {
  const out: any[] = []
  let cursor: string | null = null
  // Fathom pagina de a pocas reuniones. El backfill histórico necesita
  // recorrer todos los cursores disponibles, no quedarse en las 100 más
  // recientes. El límite evita un loop infinito ante un cursor defectuoso.
  for (let i = 0; i < 80; i++) {
    const u = new URL(FATHOM_URL)
    u.searchParams.set("created_after", createdAfter)
    if (createdBefore) u.searchParams.set("created_before", createdBefore)
    if (cursor) u.searchParams.set("cursor", cursor)
    const j = await fathomGet(u.toString(), apiKey)
    out.push(...(j.items || []))
    cursor = j.next_cursor || null
    if (!cursor) break
    await sleep(120)
  }
  return out
}

// --- Fathom: transcript de UNA grabación (solo para las que se procesan) ---
async function fetchTranscript(apiKey: string, recordingId: number) {
  const j = await fathomGet(`https://api.fathom.ai/external/v1/recordings/${recordingId}/transcript`, apiKey)
  return (j.transcript || []) as any[]
}

// --- IA: extrae trazabilidad comercial sin reemplazar la evidencia bruta ---
const CRITERIO = `Sos analista de revenue y trazabilidad para CRM Base.
Recibís una transcripción de una llamada de venta u onboarding. No inventes ni completes
por descarte. Si no hay evidencia, usá null o [].

Devolvé un JSON con:
- "analisis": resumen ejecutivo de 6 a 12 líneas: situación, dolor, objetivo, qué pasó,
  objeciones, resultado, capacidad de pago y siguiente acción.
- "calificaba": "Si", "No" o null. Solo significa capacidad económica real de conseguir
  al menos USD 500 ese día o dentro de 7 días.
- "motivo": una línea justificando calificaba.
- "primary_angle": un ángulo de problema canónico: "P1 · Dependencia del azar/entorno",
  "P2 · Parálisis con la mujer que le gusta", "P3 · Conversación sin emoción",
  "P4 · Genera interés pero no escala", "P5 · Contactos que no se convierten en citas",
  "P6 · Tiene citas pero no con las que quiere", "P7 · Pierde el marco cuando ella importa",
  "P8 · Post-separación", o null.
- "consumed_angles": array de ángulos canónicos mencionados o claramente evidenciados.
- "primary_archetype": uno de "A1 · Está en cero / no se anima",
  "A2 · Genera interés pero no convierte", "A3 · Tiene resultados pero no con las que quiere",
  "A4 · Profesional aislado / depende del azar", "A5 · Post-separación / reconstrucción", o null.
- "secondary_archetype": otro arquetipo con evidencia real, o null.
- "archetype_evidence": hasta 4 citas o hechos que justifican el arquetipo.
- "content_cited": piezas, videos, historias o ideas que el lead dice explícitamente haber visto.
- "pain_points": dolores textuales o parafraseados, máximo 6.
- "desired_outcomes": resultados deseados, máximo 5.
- "objections": objeciones reales, máximo 5.
- "buying_triggers": frases, ideas, videos o estímulos que explican por qué agendó/compró.
- "why_bought": explicación breve si compró; null si no compró o no se sabe.
- "why_not_bought": explicación breve si no compró; null si compró o no se sabe.
- "offer": programa/oferta mencionada.
- "amount_usd": número o null.
- "payment_plan": texto o null.
- "outcome": uno de ["closed","fee","follow_up","not_closed","no_show","onboarding","unknown"].
- "next_action": texto o null.
- "evidence_quotes": hasta 5 citas breves literales con speaker.
- "trace_confidence": número 0 a 1 según calidad de evidencia.

Criterio para "calificaba" (NO es si cerró ni si le gustó):
- Si pagó / cerró / hizo seña -> "Si" (obviamente podía).
- Freno por miedo, dudas, "lo quiero pensar", pareja, le pareció caro, o mala gestión del closer PERO tenía la plata o forma de conseguirla -> "Si".
- Menciona deuda (tarjeta a tope, endeudado) -> "No".
- Sin ingresos, desempleado, dijo que no puede juntar el dinero, no llega ni a la seña -> "No".
- Si no hay info suficiente para saber su capacidad de pago -> calificaba: null.

Respondé SOLO con JSON válido.`

async function classify(apiKey: string, transcriptText: string) {
  const r = await fetch(CLAUDE_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1200,
      system: CRITERIO,
      messages: [{ role: "user", content: transcriptText.slice(0, 120000) }],
    }),
  })
  if (!r.ok) throw new Error(`Claude ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const j = await r.json()
  let txt = (j.content?.[0]?.text || "").trim()
  const m = txt.match(/\{[\s\S]*\}/)
  if (m) txt = m[0]
  return JSON.parse(txt) as Record<string, any>
}

function transcriptToText(transcript: any[]): string {
  return (transcript || [])
    .map((t: any) => `${t.speaker?.display_name || "?"}: ${t.text || ""}`)
    .join("\n")
}
function externalName(m: any): string {
  const ext = (m.calendar_invitees || []).find((c: any) => c.is_external)
  return ext?.name || (m.calendar_invitees || [])[0]?.name || m.title || ""
}

function callType(m: any) {
  const title = norm(m.title || "")
  const participants = norm((m.calendar_invitees || []).map((x:any) => x.name || x.email).join(" "))
  const haystack = `${title} ${participants}`
  if (
    title.includes("onboarding") || title.includes("on boarding")
    || title.includes("bienvenida") || title.includes("kickoff")
    || title.includes("primer call") || title.includes("primera call")
  ) return "onboarding"
  if (
    haystack.includes("venta") || haystack.includes("closer") || haystack.includes("auditoria")
    || TEAM_HINTS.some((h) => haystack.includes(h))
  ) return "sales"
  return "other"
}

async function runSync(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const days = Math.min(parseInt(searchParams.get("days") || "30", 10), 900)
    const limit = Math.min(parseInt(searchParams.get("limit") || "5", 10), 10)
    const dry = searchParams.get("dry") === "1"
    const retryPending = searchParams.get("retry_pending") === "1"

    const fathomKey = process.env.FATHOM_API_KEY
    const claudeKey = process.env.ANTHROPIC_API_KEY
    if (!fathomKey) return NextResponse.json({ error: "Falta FATHOM_API_KEY en Vercel" }, { status: 500 })
    if (!dry && !claudeKey) return NextResponse.json({ error: "Falta ANTHROPIC_API_KEY en Vercel" }, { status: 500 })

    const requestedSince = searchParams.get("since")
    const requestedUntil = searchParams.get("until")
    const validDate = (value: string | null) => value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    const sinceIso = validDate(requestedSince)
      ? requestedSince!
      : addDays(new Date().toISOString().slice(0, 10), -days)
    const untilIso = validDate(requestedUntil) ? requestedUntil! : null
    const sb = getSupabase()

    // Agendas y clientes de la ventana. Un onboarding puede no tener agenda,
    // pero sí un link exacto guardado en la ficha del cliente.
    const [
      { data: agendas, error },
      { data: clients, error: clientsError },
    ] = await Promise.all([
      sb
        .from("agendas")
        .select("id, person_id, nombre, fecha_agenda, link_fathom, ia_analisis, calificaba_realmente")
        .gte("fecha_agenda", `${sinceIso}T00:00:00`)
        .lt("fecha_agenda", `${untilIso || addDays(new Date().toISOString().slice(0, 10), 1)}T00:00:00`),
      sb
        .from("clientes")
        .select("id, person_id, nombre, fecha_ingreso, fecha_primer_call, link_call_onboarding"),
    ])
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (clientsError) return NextResponse.json({ error: clientsError.message }, { status: 500 })

    const meetings = await fetchFathom(
      fathomKey,
      `${sinceIso}T00:00:00Z`,
      untilIso ? `${untilIso}T00:00:00Z` : null,
    )
    meetings.sort((left, right) => String(
      left.scheduled_start_time || left.recording_start_time || "",
    ).localeCompare(String(
      right.scheduled_start_time || right.recording_start_time || "",
    )))
    const recordingIds = meetings
      .map((meeting) => String(meeting.recording_id || ""))
      .filter(Boolean)
    const existingByRecording = new Map<string, {
      id: string
      recording_id: string
      trace_analysis: Record<string, unknown> | null
    }>()
    if (recordingIds.length) {
      const { data: existingCalls, error: existingCallsError } = await sb
        .from("crm_call_records")
        .select("id,recording_id,trace_analysis")
        .in("recording_id", recordingIds)
      if (existingCallsError) throw new Error(existingCallsError.message)
      for (const call of existingCalls || []) {
        existingByRecording.set(String(call.recording_id), call)
      }
    }

    // Indices para emparejar
    const byLink = new Map<string, { kind: "agenda" | "client"; record: any }>()
    const byName = new Map<string, any[]>()
    for (const a of agendas || []) {
      const linkKey = fathomLinkKey(a.link_fathom)
      if (linkKey) byLink.set(linkKey, { kind: "agenda", record: a })
      const k = norm(a.nombre)
      if (!byName.has(k)) byName.set(k, [])
      byName.get(k)!.push(a)
    }
    for (const client of clients || []) {
      const linkKey = fathomLinkKey(client.link_call_onboarding)
      if (linkKey) byLink.set(linkKey, { kind: "client", record: client })
    }

    type Candidate = {
      agenda: any | null
      client: any | null
      meeting: any
      how: string | null
      confidence: number
      needsReview: boolean
      reviewReason: string | null
    }
    const toProcess: Candidate[] = []
    const skipped: any[] = []
    for (const m of meetings) {
      const link = m.share_url || m.url
      const linkKey = fathomLinkKey(link)
      const exact = linkKey ? byLink.get(linkKey) : undefined
      const agenda = exact?.kind === "agenda" ? exact.record : null
      const client = exact?.kind === "client" ? exact.record : null
      let how: string | null = exact ? "link_fathom" : null
      let confidence = exact ? 1 : 0
      let needsReview = false
      let reviewReason: string | null = null

      if (!exact) {
        const cands = byName.get(norm(externalName(m))) || []
        const mday = dateKey(m.scheduled_start_time || m.recording_start_time)
        const hit = cands.filter((c) => {
          const cd = dateKey(c.fecha_agenda)
          return cd && mday && (cd === mday || cd === addDays(mday, 1) || cd === addDays(mday, -1))
        })
        if (hit.length === 1) {
          how = "nombre+fecha_sugerido"
          confidence = 0.72
          needsReview = true
          reviewReason = "Coincidencia única por nombre y fecha; requiere confirmación humana"
        } else if (hit.length > 1) {
          how = "nombre+fecha_ambiguo"
          confidence = 0.35
          needsReview = true
          reviewReason = `${hit.length} agendas candidatas por nombre y fecha`
        }
      }

      const kind = callType(m)
      const eligible = Boolean(exact) || kind === "sales" || kind === "onboarding"
      if (!eligible) {
        skipped.push({
          meeting: externalName(m),
          fecha: m.scheduled_start_time || m.recording_start_time || null,
          motivo: "tipo no identificado como venta u onboarding",
        })
        continue
      }
      if (!exact && !needsReview) {
        needsReview = true
        reviewReason = "Sin identidad verificable en CRM"
      }

      const recordingId = String(m.recording_id || "")
      const existingCall = recordingId ? existingByRecording.get(recordingId) : null
      const existingAnalysis = existingCall?.trace_analysis as Record<string, unknown> | null | undefined
      // Repara de forma idempotente vínculos históricos cuando el mismo enlace
      // exacto se normalizó distinto (query string o slash final). Un análisis
      // pendiente conserva needs_review, pero ya queda unido a su identidad.
      if (existingCall?.id && exact) {
        const personId = exact.record?.person_id || null
        if (personId) {
          // NOTA: crm_call_records.agenda_id sigue declarado bigint en el
          // esquema de preview, pero agendas.id es uuid (migración
          // 20260723_fix_call_records_agenda_id.sql pendiente de aplicar en
          // la base). Hasta que corra esa migración, omitimos agenda_id para
          // no abortar el enlace por identidad con un error de tipo.
          await sb.from("crm_call_records").update({
            person_id: personId,
            match_method: "link_fathom",
            match_confidence: 1,
            updated_at: new Date().toISOString(),
          }).eq("id", existingCall.id)
        }
      }
      if (
        existingCall?.id
        && (!retryPending || existingAnalysis?.analysis_status !== "pending")
      ) continue
      toProcess.push({
        agenda,
        client,
        meeting: m,
        how,
        confidence,
        needsReview,
        reviewReason,
      })
    }

    if (dry) {
      return NextResponse.json({
        dry: true, ventana_dias: days, since: sinceIso, until: untilIso,
        reuniones_fathom: meetings.length,
        para_procesar: toProcess.length,
        match_exacto: toProcess.filter((item) => !item.needsReview).length,
        needs_review: toProcess.filter((item) => item.needsReview).length,
        preview: toProcess.slice(0, limit).map((x) => ({
          nombre: x.agenda?.nombre || x.client?.nombre || externalName(x.meeting),
          fecha: x.agenda?.fecha_agenda || x.client?.fecha_primer_call || x.meeting.scheduled_start_time || null,
          match: x.how,
          needs_review: x.needsReview,
        })),
        fuera_de_alcance: skipped.length,
        sin_match_detalle: skipped.slice(0, 50),
      })
    }

    let ok = 0, fail = 0, review = 0, analysisPending = 0
    const results: any[] = []
    for (const x of toProcess.slice(0, limit)) {
      const jobStartedAt = Date.now()
      const externalId = String(x.meeting.recording_id || x.meeting.share_url || x.meeting.url || "unknown")
      const jobId = await beginIntegrationJob(sb, "fathom", "analyze_recording", externalId, { call_type: callType(x.meeting) })
      try {
        const tr = await fetchTranscript(fathomKey, x.meeting.recording_id)
        const text = transcriptToText(tr)
        if (text.length < 200) {
          skipped.push({
            nombre: x.agenda?.nombre || x.client?.nombre || externalName(x.meeting),
            motivo: "transcript muy corto",
          })
          continue
        }
        let res: Record<string, any>
        let pending = false
        try {
          res = await classify(claudeKey!, text)
          res.analysis_status = "complete"
        } catch (classificationError: any) {
          pending = true
          const raw = String(classificationError?.message || classificationError)
          res = {
            analysis_status: "pending",
            analysis_error: raw.includes("401") ? "provider_authentication" : "provider_unavailable",
            analisis: null,
            calificaba: null,
            motivo: null,
            primary_angle: null,
            consumed_angles: [],
            primary_archetype: null,
            secondary_archetype: null,
            archetype_evidence: [],
            content_cited: [],
            pain_points: [],
            desired_outcomes: [],
            objections: [],
            buying_triggers: [],
            why_bought: null,
            why_not_bought: null,
            offer: null,
            amount_usd: null,
            payment_plan: null,
            outcome: "unknown",
            next_action: null,
            evidence_quotes: [],
            trace_confidence: 0,
          }
        }
        if (x.agenda && !x.needsReview && !pending) {
          const updates: any = { ia_analisis: res.analisis }
          if (res.calificaba === "Si" || res.calificaba === "No") updates.calificaba_realmente = res.calificaba
          if (!x.agenda.link_fathom) updates.link_fathom = x.meeting.share_url || x.meeting.url
          const { error: upErr } = await sb.from("agendas").update(updates).eq("id", x.agenda.id)
          if (upErr) throw new Error(upErr.message)
        }
        const recordingId = String(x.meeting.recording_id)
        const occurredAt = x.meeting.scheduled_start_time || x.meeting.recording_start_time || null
        const personId = !x.needsReview
          ? (x.agenda?.person_id || x.client?.person_id || null)
          : null
        // NOTA: agenda_id se omite del upsert (ver comentario arriba sobre
        // el desajuste bigint/uuid pendiente de migración en la base de
        // preview). person_id ya conserva la identidad verificada.
        const { error: callErr } = await sb.from("crm_call_records").upsert({
          recording_id: recordingId,
          person_id: personId,
          call_type: callType(x.meeting),
          occurred_at: occurredAt,
          fathom_url: x.meeting.share_url || x.meeting.url || null,
          title: x.meeting.title || null,
          participants: x.meeting.calendar_invitees || [],
          transcript: text,
          fathom_summary: x.meeting.default_summary?.markdown_formatted || x.meeting.summary || null,
          trace_analysis: res,
          match_method: x.how || "sin_match",
          match_confidence: x.confidence,
          needs_review: x.needsReview || pending,
          source_payload: {
            recording_id: x.meeting.recording_id,
            scheduled_start_time: x.meeting.scheduled_start_time,
            external_name: externalName(x.meeting),
            review_reason: x.reviewReason,
          },
          updated_at: new Date().toISOString(),
        }, { onConflict: "recording_id" })
        if (callErr) throw new Error(callErr.message)
        if (personId && !pending) {
          await sb.from("crm_events").upsert({
            person_id: personId,
            event_type: callType(x.meeting) === "onboarding" ? "onboarding" : "call_analyzed",
            occurred_at: occurredAt || new Date().toISOString(),
            source: "fathom",
            source_table: "crm_call_records",
            source_id: recordingId,
            title: callType(x.meeting) === "onboarding" ? "Onboarding analizado" : "Llamada analizada",
            metadata: {
              angle: res.primary_angle,
              consumed_angles: res.consumed_angles,
              outcome: res.outcome,
              pain_points: res.pain_points,
              why_bought: res.why_bought,
              trace_confidence: res.trace_confidence,
              fathom_url: x.meeting.share_url || x.meeting.url,
            },
            dedupe_key: `fathom:${recordingId}:analysis`,
          }, { onConflict: "dedupe_key" })
        }
        await finishIntegrationJob(sb, { jobId, provider: "fathom", route: "/api/fathom-sync", startedAt: jobStartedAt, success: true })
        ok++
        if (x.needsReview || pending) review++
        if (pending) analysisPending++
        results.push({
          nombre: x.agenda?.nombre || x.client?.nombre || externalName(x.meeting),
          calificaba: res.calificaba,
          angulo: res.primary_angle,
          motivo: res.motivo,
          needs_review: x.needsReview || pending,
          analysis_status: res.analysis_status,
        })
      } catch (e: any) {
        await finishIntegrationJob(sb, { jobId, provider: "fathom", route: "/api/fathom-sync", startedAt: jobStartedAt, success: false, error: e })
        fail++
        results.push({
          nombre: x.agenda?.nombre || x.client?.nombre || externalName(x.meeting),
          error: String(e?.message || e).slice(0, 160),
        })
      }
    }
    return NextResponse.json({
      ventana_dias: days, since: sinceIso, until: untilIso,
      reuniones_fathom: meetings.length,
      procesadas: ok, fallidas: fail, needs_review: review,
      analysis_pending: analysisPending,
      fuera_de_alcance: skipped.length, results,
    })
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err).slice(0, 300) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  if (!(await canRunSync(request))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  return runSync(request)
}

// Vercel Cron pega por GET (no puede disparar POST) — corre el mismo proceso
// en loop, repitiendo tandas de 10 hasta vaciar la cola del dia o quedarse sin
// tiempo (limite real de la funcion serverless, con margen para responder).
export async function GET(request: Request) {
  if (!(await canRunSync(request))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  const startedAt = Date.now()
  const { searchParams } = new URL(request.url)
  const days = searchParams.get("days") || "7"
  const origin = new URL(request.url).origin

  let totalOk = 0, totalFail = 0, totalReview = 0, totalPending = 0, fueraDeAlcance = 0
  for (let i = 0; i < 8 && Date.now() - startedAt < 45000; i++) {
    const res = await runSync(new Request(`${origin}/api/fathom-sync?limit=10&days=${days}`, { method: "POST" }))
    const j = await res.json()
    if (j.error) return NextResponse.json({ cron: true, error: j.error }, { status: 500 })
    totalOk += j.procesadas || 0
    totalFail += j.fallidas || 0
    totalReview += j.needs_review || 0
    totalPending += j.analysis_pending || 0
    fueraDeAlcance = j.fuera_de_alcance || 0
    if ((j.procesadas || 0) === 0 && (j.fallidas || 0) === 0) break
  }
  return NextResponse.json({
    cron: true,
    procesadas: totalOk,
    fallidas: totalFail,
    needs_review: totalReview,
    analysis_pending: totalPending,
    fuera_de_alcance: fueraDeAlcance,
  })
}
