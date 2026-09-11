import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}

export async function GET() {
  const sb = db()
  const { data: events, error } = await sb.from("crm_events")
    .select("source_record_id,occurred_at,metadata,created_at")
    .eq("event_type", "agenda_followup")
    .order("occurred_at", { ascending: true })
    .limit(2000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const ids = (events || []).map(row => Number(row.source_record_id)).filter(Boolean)
  if (!ids.length) return NextResponse.json([])
  const { data: agendas, error: agendaError } = await sb.from("agendas")
    .select("id,person_id,nombre,telefono,instagram,fecha_agenda,fecha_closer,closer,calificacion,show,cerro,motivo_no_cierre")
    .in("id", ids)
  if (agendaError) return NextResponse.json({ error: agendaError.message }, { status: 500 })
  const byId = new Map((agendas || []).map(row => [String(row.id), row]))
  return NextResponse.json((events || []).flatMap(event => {
    const agenda = byId.get(String(event.source_record_id))
    if (!agenda) return []
    const metadata = event.metadata as Record<string, string> || {}
    return [{
      ...agenda,
      seguimiento_estado: metadata.estado || "Pendiente",
      seguimiento_fecha: String(event.occurred_at).slice(0, 10),
      seguimiento_nota: metadata.nota || null,
      seguimiento_responsable: metadata.responsable || null,
      seguimiento_actualizado_at: event.created_at || null,
    }]
  }))
}
