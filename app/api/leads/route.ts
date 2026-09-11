import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"

async function allRows(fetchPage: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>) {
  const rows: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await fetchPage(from, from + 999)
    if (error) throw error
    rows.push(...(data || []))
    if ((data || []).length < 1000) return rows
  }
}

export async function GET(request: Request) {
  try {
    const sb = createSupabaseAdmin()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    if (id) {
      if (id.startsWith("legacy:")) return NextResponse.json(await legacyDetail(sb, decodeURIComponent(id.slice(7))))
      const [person, identities, events, agendas, pagos, clientes, calls, testimonials, contentAssets, chatSummary] = await Promise.all([
        sb.from("crm_people").select("*").eq("id", id).single(),
        sb.from("crm_identities").select("kind,value,source,verified,first_seen_at,last_seen_at").eq("person_id", id).order("first_seen_at"),
        sb.from("crm_events").select("*").eq("person_id", id).order("occurred_at", { ascending: false }).limit(1500),
        sb.from("agendas").select("id,nombre,fecha_lead,fecha_agenda,fecha_closer,fuente,cuenta,recurso,manychat,puntos_contacto,resumen_chat,calificacion,closer,setter,show,cerro,estado,motivo_no_cierre,link_fathom,ia_analisis").or("estado.is.null,estado.neq.Archivada manualmente").eq("person_id", id).order("fecha_agenda", { ascending: false }),
        sb.from("pagos").select("id,fecha,monto,tipo,operacion,medio_de_pago,closer,setter,contenido_contestado").eq("person_id", id).eq("record_status", "active").order("fecha", { ascending: false }),
        sb.from("clientes").select("id,fecha_ingreso,fecha_primer_call,etapa,estado,operacion_original,link_call_onboarding").eq("person_id", id).order("fecha_ingreso", { ascending: false }),
        sb.from("crm_call_records").select("id,call_type,occurred_at,title,fathom_url,match_confidence,needs_review").eq("person_id", id).order("occurred_at", { ascending: false }),
        sb.from("crm_integration_assets").select("id,name,metadata,last_seen_at").eq("source", "loom-testimonials").eq("asset_type", "testimonial_candidate").contains("metadata", { person_id: id }),
        sb.from("crm_content_assets").select("id,title,status,source_url,planned_at,published_at,metadata").contains("metadata", { person_id: id }).order("created_at", { ascending: false }),
        sb.from("crm_integration_assets").select("metadata,last_seen_at").eq("source", "manychat").eq("asset_type", "chat_summary").eq("source_id", id).maybeSingle(),
      ])
      if (person.error) {
        if (person.error.code === "42P01" || person.error.code === "PGRST205") return NextResponse.json(await legacyDetail(sb, id))
        return NextResponse.json({ error: person.error.message }, { status: 404 })
      }
      const chatMetadata = (chatSummary.data?.metadata || {}) as Record<string, unknown>
      const personChatSummary = chatSummary.data ? {
        summary: chatMetadata.summary || null,
        tags: chatMetadata.tags || [],
        source: "manychat",
        subscriber_id: chatMetadata.subscriber_id || null,
        instagram: chatMetadata.instagram || null,
        generated_at: chatMetadata.generated_at || chatSummary.data.last_seen_at,
        metadata: chatMetadata,
      } : null
      const derivedEvents = [
        ...(agendas.data || []).flatMap((row) => [
          row.fecha_lead && { id: `agenda-${row.id}-lead`, event_type: "lead_created", occurred_at: row.fecha_lead, source: row.fuente || "CRM", title: "Primer contacto registrado", metadata: { cuenta: row.cuenta, recurso: row.recurso, manychat: row.manychat, puntos_contacto: row.puntos_contacto } },
          row.fecha_agenda && { id: `agenda-${row.id}-booked`, event_type: "call_booked", occurred_at: row.fecha_agenda, source: "CRM", title: "Agendó llamada", metadata: { setter: row.setter, closer: row.closer, calificacion: row.calificacion, cuenta: row.cuenta } },
          row.fecha_closer && row.show === true && { id: `agenda-${row.id}-showed`, event_type: "call_showed", occurred_at: row.fecha_closer, source: "CRM", title: "Se presentó a la llamada de venta", metadata: { closer: row.closer, resultado: row.estado, cerro: row.cerro } },
        ]),
        ...(pagos.data || []).map((row) => ({ id: `payment-${row.id}`, event_type: "payment_received", occurred_at: row.fecha, source: "CRM Pagos", title: "Pago recibido", metadata: { monto_usd: row.monto, tipo: row.tipo, programa: row.operacion, medio: row.medio_de_pago } })),
        ...(clientes.data || []).flatMap((row) => [
          row.fecha_ingreso && { id: `client-${row.id}-entry`, event_type: "client_entered", occurred_at: row.fecha_ingreso, source: "CRM Clientes", title: "Ingresó como cliente", metadata: { programa: row.operacion_original, estado: row.estado } },
          row.fecha_primer_call && { id: `client-${row.id}-onboarding`, event_type: "onboarding", occurred_at: row.fecha_primer_call, source: "CRM Clientes", title: "Onboarding / primera call", metadata: { programa: row.operacion_original, etapa: row.etapa, loom: row.link_call_onboarding } },
        ]),
        ...(calls.data || []).map((row) => ({ id: `call-${row.id}`, event_type: /consult/i.test(row.call_type || "") ? "consultation" : /onboard/i.test(row.call_type || "") ? "onboarding_call" : "recorded_call", occurred_at: row.occurred_at, source: "Fathom", title: row.title || row.call_type || "Llamada registrada", metadata: { fathom_url: row.fathom_url, confianza: row.match_confidence, requiere_revision: row.needs_review } })),
        ...(testimonials.data || []).map((row) => ({ id: `testimonial-${row.id}`, event_type: "testimonial", occurred_at: row.metadata?.recorded_at || row.last_seen_at, source: "Loom", title: "Testimonio detectado", metadata: { resumen: row.metadata?.summary, cita: row.metadata?.exact_quote, timestamp: `${row.metadata?.start_seconds || 0}-${row.metadata?.end_seconds || 0}`, loom_url: row.metadata?.loom_url, estado: row.metadata?.status } })),
        ...(contentAssets.data || []).map((row) => ({ id: `content-${row.id}`, event_type: "testimonial_clip", occurred_at: row.published_at || row.planned_at, source: "Contenido", title: row.title || "Clip de testimonio", metadata: { estado: row.status, url: row.source_url, edicion: row.metadata?.editing_status } })),
      ].flat().filter((row): row is Record<string, any> => Boolean(row && row.occurred_at))
      const combined = [...(events.data || []), ...derivedEvents]
      const seen = new Set<string>()
      const timeline = combined.filter((row) => {
        const key = `${row.event_type}|${String(row.occurred_at).slice(0, 16)}|${row.title || ""}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      }).sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
      return NextResponse.json({ person: person.data, identities: identities.data || [], events: timeline, agendas: agendas.data || [], pagos: pagos.data || [], clientes: clientes.data || [], calls: calls.data || [], testimonials: testimonials.data || [], content_assets: contentAssets.data || [], chat_summary: personChatSummary })
    }

    const q = (searchParams.get("q") || "").trim().replace(/[,%]/g, "").toLowerCase()
    const filter = searchParams.get("filter") || "all"
    const page = Math.max(1, Number(searchParams.get("page") || 1))
    const pageSize = 100
    const [agendas, calls, payments, clients, summaries, traceEvents] = await Promise.all([
      allRows((from, to) => sb.from("agendas").select("id,person_id,nombre,telefono,instagram,fecha_agenda,calificacion,cuenta,resumen_chat,link_fathom,fuente,recurso").not("person_id", "is", null).or("estado.is.null,estado.neq.Archivada manualmente").range(from, to)),
      allRows((from, to) => sb.from("crm_call_records").select("person_id,call_type,fathom_url,occurred_at").not("person_id", "is", null).range(from, to)),
      allRows((from, to) => sb.from("pagos").select("person_id,fecha,monto").not("person_id", "is", null).eq("record_status", "active").range(from, to)),
      allRows((from, to) => sb.from("clientes").select("person_id,link_call_onboarding,onboarding_completed_at").not("person_id", "is", null).neq("record_status", "merged").range(from, to)),
      allRows((from, to) => sb.from("crm_integration_assets").select("source_id,metadata").eq("source", "manychat").eq("asset_type", "chat_summary").range(from, to)),
      allRows((from, to) => sb.from("crm_events").select("person_id,event_type,occurred_at,metadata").not("person_id", "is", null).in("event_type", ["content_replied","content_attributed","sales_angle"]).range(from, to)),
    ])
    const callsByPerson = new Map<string,any[]>(), paymentsByPerson = new Map<string,any[]>(), clientsByPerson = new Map<string,any[]>(), tracesByPerson = new Map<string,any[]>()
    const summariesByPerson = new Map(summaries.map((row) => [row.source_id, row.metadata]))
    for (const row of calls) callsByPerson.set(row.person_id, [...(callsByPerson.get(row.person_id) || []), row])
    for (const row of payments) paymentsByPerson.set(row.person_id, [...(paymentsByPerson.get(row.person_id) || []), row])
    for (const row of clients) clientsByPerson.set(row.person_id, [...(clientsByPerson.get(row.person_id) || []), row])
    for (const row of traceEvents) tracesByPerson.set(row.person_id, [...(tracesByPerson.get(row.person_id) || []), row])
    const byPerson = new Map<string,any[]>()
    for (const agenda of agendas) byPerson.set(agenda.person_id, [...(byPerson.get(agenda.person_id) || []), agenda])
    let rows = [...byPerson.entries()].map(([personId, personAgendas]) => {
      personAgendas.sort((a,b) => String(b.fecha_agenda).localeCompare(String(a.fecha_agenda)))
      const latest = personAgendas[0]
      const personCalls = callsByPerson.get(personId) || []
      const personPayments = paymentsByPerson.get(personId) || []
      const personClients = clientsByPerson.get(personId) || []
      const personTraces = tracesByPerson.get(personId) || []
      const hasChat = personAgendas.some((row) => Boolean(row.resumen_chat)) || summariesByPerson.has(personId)
      const hasSalesFathom = personAgendas.some((row) => Boolean(row.link_fathom)) || personCalls.some((row) => row.call_type === "sales" && row.fathom_url)
      const hasOnboardingFathom = personClients.some((row) => Boolean(row.link_call_onboarding)) || personCalls.some((row) => row.call_type === "onboarding" && row.fathom_url)
      const paid = personPayments.some((row) => Number(row.monto || 0) > 0)
      const angles = [...new Set(personTraces.flatMap((row) => [row.metadata?.angle, row.metadata?.angulo, row.metadata?.sales_angle]).filter(Boolean))]
      return { id: personId, display_name: latest.nombre, primary_phone: latest.telefono, primary_instagram: latest.instagram, agenda_count: personAgendas.length, first_agenda_at: personAgendas.at(-1)?.fecha_agenda, last_agenda_at: latest.fecha_agenda, calificacion: latest.calificacion, cuenta: latest.cuenta, has_chat: hasChat, has_sales_fathom: hasSalesFathom, has_onboarding_fathom: hasOnboardingFathom, paid, has_content_trace: personTraces.length > 0, angles, cash: personPayments.reduce((sum,row) => sum + Number(row.monto || 0), 0), complete_trace: hasChat && hasSalesFathom && paid }
    })
    const matchesFilter = (row:any) => filter === "all" || (filter === "chat" && row.has_chat) || (filter === "sales_fathom" && row.has_sales_fathom) || (filter === "paid" && row.paid) || (filter === "onboarding_fathom" && row.has_onboarding_fathom) || (filter === "content" && row.has_content_trace) || (filter === "complete" && row.complete_trace)
    if (q) rows = rows.filter((row) => `${row.display_name} ${row.primary_phone || ""} ${row.primary_instagram || ""}`.toLowerCase().includes(q))
    rows = rows.filter(matchesFilter).sort((a,b) => Number(b.complete_trace)-Number(a.complete_trace) || String(b.last_agenda_at).localeCompare(String(a.last_agenda_at)))
    const totals = { agendas: agendas.length, people: byPerson.size, chat: 0, sales_fathom: 0, paid: 0, onboarding_fathom: 0, content: 0, complete: 0 }
    for (const row of [...byPerson.keys()].map((id) => {
      const personAgendas = byPerson.get(id) || [], personCalls = callsByPerson.get(id) || [], personClients = clientsByPerson.get(id) || []
      const hasChat = personAgendas.some((item) => item.resumen_chat) || summariesByPerson.has(id), hasSales = personAgendas.some((item) => item.link_fathom) || personCalls.some((item) => item.call_type === "sales" && item.fathom_url), paid = (paymentsByPerson.get(id) || []).some((item) => Number(item.monto || 0)>0), onboarding = personClients.some((item) => item.link_call_onboarding) || personCalls.some((item) => item.call_type === "onboarding" && item.fathom_url), content = (tracesByPerson.get(id) || []).length>0
      return {hasChat,hasSales,paid,onboarding,content}
    })) { if(row.hasChat)totals.chat++; if(row.hasSales)totals.sales_fathom++; if(row.paid)totals.paid++; if(row.onboarding)totals.onboarding_fathom++; if(row.content)totals.content++; if(row.hasChat&&row.hasSales&&row.paid)totals.complete++ }
    const totalFiltered = rows.length
    rows = rows.slice((page-1)*pageSize, page*pageSize)
    return NextResponse.json({ rows, totals, pagination: { page, page_size: pageSize, total: totalFiltered, pages: Math.ceil(totalFiltered/pageSize) } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error de servidor" }, { status: 500 })
  }
}

const phone = (value: string | null | undefined) => (value || "").replace(/\D/g, "")
const text = (value: string | null | undefined) => (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase()
const legacyKey = (row: { telefono?: string | null; nombre?: string | null }) => phone(row.telefono) ? `p:${phone(row.telefono)}` : `n:${text(row.nombre)}`

async function legacyRows(sb: ReturnType<typeof createSupabaseAdmin>) {
  const [{ data: agendas }, { data: pagos }, { data: clientes }] = await Promise.all([
    sb.from("agendas").select("id,nombre,telefono,instagram,fecha_lead,fecha_agenda,fecha_closer,fuente,cuenta,recurso,manychat,puntos_contacto,resumen_chat,calificacion,closer,setter,show,cerro,estado,motivo_no_cierre,link_fathom,ia_analisis,created_at").or("estado.is.null,estado.neq.Archivada manualmente").gte("fecha_agenda", "2026-01-01").order("fecha_agenda", { ascending: false }).limit(1000),
    sb.from("pagos").select("id,cliente,telefono,fecha,fecha_alta,monto,tipo,operacion,medio_de_pago,closer,setter,contenido_contestado").eq("record_status", "active").gte("fecha", "2026-01-01").order("fecha", { ascending: false }).limit(1000),
    sb.from("clientes").select("id,nombre,telefono,fecha_ingreso,fecha_primer_call,etapa,estado,operacion_original,link_call_onboarding,created_at").order("fecha_ingreso", { ascending: false }).limit(2000),
  ])
  return { agendas: agendas || [], pagos: pagos || [], clientes: clientes || [] }
}

async function legacyList(sb: ReturnType<typeof createSupabaseAdmin>, q: string) {
  const { agendas, pagos, clientes } = await legacyRows(sb)
  const map = new Map<string, any>()
  for (const a of agendas) {
    const key = legacyKey(a); if (!key || key === "n:") continue
    const current = map.get(key) || { id: `legacy:${encodeURIComponent(key)}`, internal_code: "2026", display_name: a.nombre, primary_phone: phone(a.telefono) || null, primary_instagram: text(a.instagram) || null, event_count: 0, content_touches: 0, booked_at: null, paid_at: null, time_to_book_hours: null }
    current.event_count++; current.booked_at ||= a.fecha_agenda; map.set(key, current)
  }
  for (const p of pagos) {
    const key = legacyKey({ telefono: p.telefono, nombre: p.cliente }); if (!key || key === "n:") continue
    const current = map.get(key) || { id: `legacy:${encodeURIComponent(key)}`, internal_code: "2026", display_name: p.cliente, primary_phone: phone(p.telefono) || null, primary_instagram: null, event_count: 0, content_touches: 0, booked_at: null, paid_at: null, time_to_book_hours: null }
    current.event_count++; current.paid_at ||= p.fecha; map.set(key, current)
  }
  for (const c of clientes) {
    const key = legacyKey(c); if (!key || key === "n:") continue
    const current = map.get(key) || { id: `legacy:${encodeURIComponent(key)}`, internal_code: "2026", display_name: c.nombre, primary_phone: phone(c.telefono) || null, primary_instagram: null, event_count: 0, content_touches: 0, booked_at: null, paid_at: null, time_to_book_hours: null }
    current.event_count++; map.set(key, current)
  }
  const needle = text(q)
  return [...map.values()].filter(row => !needle || text(`${row.display_name} ${row.primary_phone} ${row.primary_instagram}`).includes(needle)).slice(0, 300)
}

async function legacyDetail(sb: ReturnType<typeof createSupabaseAdmin>, rawKey: string) {
  const key = rawKey.startsWith("p:") || rawKey.startsWith("n:") ? rawKey : `n:${text(rawKey)}`
  const rows = await legacyRows(sb)
  const agendas = rows.agendas.filter((row: any) => legacyKey(row) === key)
  const pagos = rows.pagos.filter((row: any) => legacyKey({ telefono: row.telefono, nombre: row.cliente }) === key)
  const clientes = rows.clientes.filter((row: any) => legacyKey(row) === key)
  const seed: any = agendas[0] || clientes[0] || pagos[0] || {}
  const displayName = seed.nombre || seed.cliente || "Sin nombre"
  const primaryPhone = phone(seed.telefono) || null
  const primaryInstagram = text(seed.instagram) || null
  const events = [
    ...agendas.flatMap((a: any) => [
      { id: `a-${a.id}-book`, event_type: "call_booked", occurred_at: a.fecha_agenda || a.created_at, source: "CRM", title: "Agendó llamada", metadata: { closer: a.closer, setter: a.setter, calificacion: a.calificacion } },
      ...(a.show === true || a.estado === "No Show" ? [{ id: `a-${a.id}-result`, event_type: a.show ? "call_showed" : "call_no_show", occurred_at: a.fecha_closer || a.fecha_agenda, source: "CRM", title: a.show ? "Se presentó a la llamada" : "No se presentó", metadata: { resultado: a.estado, motivo: a.motivo_no_cierre, closer: a.closer } }] : []),
    ]),
    ...pagos.map((p: any) => ({ id: `p-${p.id}`, event_type: "payment_received", occurred_at: p.fecha || p.fecha_alta, source: "CRM", title: "Pago recibido", metadata: { monto: p.monto, tipo: p.tipo, operacion: p.operacion, closer: p.closer } })),
    ...clientes.map((c: any) => ({ id: `c-${c.id}`, event_type: "onboarding", occurred_at: c.fecha_primer_call || c.fecha_ingreso || c.created_at, source: "CRM", title: "Ingreso / onboarding", metadata: { etapa: c.etapa, programa: c.operacion_original } })),
  ].filter(e => e.occurred_at).sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
  return {
    person: { id: `legacy:${encodeURIComponent(key)}`, internal_code: "HIST-2026", display_name: displayName, primary_phone: primaryPhone, primary_instagram: primaryInstagram, created_at: events.at(-1)?.occurred_at || "2026-01-01" },
    identities: [primaryPhone && { kind: "phone", value: primaryPhone }, primaryInstagram && { kind: "instagram", value: primaryInstagram }].filter(Boolean),
    events, agendas, pagos, clientes,
  }
}
