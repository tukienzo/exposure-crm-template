type AgendaSummary = {
  id: string
  person_id?: string | null
  fecha_agenda?: string | null
  created_at?: string | null
  resumen_chat?: string | null
}

export type ChatSummaryTouch = {
  tag: string
  format: string
  angle: string | null
  tagDate: string | null
  isTrigger: boolean
  evidence: string
}

const MONTHS: Record<string, number> = {
  ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3,
  abr: 4, abril: 4, may: 5, mayo: 5, jun: 6, junio: 6,
  jul: 7, julio: 7, ago: 8, agosto: 8, sep: 9, sept: 9,
  septiembre: 9, oct: 10, octubre: 10, nov: 11, noviembre: 11,
  dic: 12, diciembre: 12,
}

function isoDate(value: string) {
  const numeric = value.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/)
  if (numeric) {
    const year = Number(numeric[3]) < 100 ? 2000 + Number(numeric[3]) : Number(numeric[3])
    return `${year}-${numeric[2].padStart(2, "0")}-${numeric[1].padStart(2, "0")}`
  }
  const spanish = value.toLowerCase().match(
    /\b(\d{1,2})\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sep|sept|oct|nov|dic)\s+(?:de\s+)?(\d{4})\b/,
  )
  if (!spanish) return null
  return `${spanish[3]}-${String(MONTHS[spanish[2]]).padStart(2, "0")}-${spanish[1].padStart(2, "0")}`
}

function normalizeFormat(label: string, tag: string) {
  const source = `${label} ${tag}`.toLowerCase()
  if (/carrusel/.test(source)) return "Carrusel"
  if (/histor(?:ia|ias)|story/.test(source)) return "Historia"
  if (/reel|reels|re subido|volumen/.test(source)) return "Reel"
  if (/follow|seguidor|sígueme|sigueme/.test(source)) return "Follow"
  return "Contenido"
}

function cleanAngle(tag: string) {
  const quoted = tag.match(/[“"'«]([^”"'»]+)[”"'»]/u)
  if (quoted?.[1]) return quoted[1].trim()
  const parts = tag.split(/\s+[-–—]\s+/u).map((part) => part.trim()).filter(Boolean)
  // El contrato observado es FORMATO/TÍTULO - ÁNGULO - FECHA. Sin fecha o
  // comillas no asumimos que el segundo fragmento sea un ángulo.
  if (parts.length >= 3 && isoDate(parts.slice(2).join(" - "))) return parts[1]
  return null
}

function splitTags(value: string) {
  return value
    .replace(/\s+\((?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+\d{4}[^)]*\)/gi, "")
    .split(/,\s+(?=(?:REEL|REELS|RE SUBIDO|VOLUMEN|CARRUSEL|HISTORIA|QUÉ|QUE|[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]+)\b)/u)
    .map((tag) => tag.trim().replace(/[.;]\s*$/u, ""))
    .filter(Boolean)
}

export function parseChatSummaryAttribution(summary: unknown): ChatSummaryTouch[] {
  const text = String(summary ?? "").replace(/\r/g, "")
  if (!text.trim()) return []
  const section = text.match(
    /Contenido consumido[\s\S]*?:\s*([\s\S]*?)(?=\n(?:Material enviado|Origen(?: de la primera interacción)?|Contenido gatillo de agenda|Ciclo de agenda|Seguimientos para agendar|Historial de chat)\s*:|$)/i,
  )?.[1] || ""
  if (/no hay etiquetas de contenido orgánico/i.test(section)) return []

  const touches: ChatSummaryTouch[] = []
  const lines = section.split("\n").map((line) => line.trim()).filter(Boolean)
  for (const line of lines) {
    const match = line.match(/^(Reels?|Carruseles?|Historias?|Contenido)\s*:\s*(.+)$/i)
    if (!match) continue
    for (const tag of splitTags(match[2])) {
      touches.push({
        tag,
        format: normalizeFormat(match[1], tag),
        angle: cleanAngle(tag),
        tagDate: isoDate(tag),
        isTrigger: false,
        evidence: line,
      })
    }
  }

  const trigger = text.match(/Contenido gatillo de agenda\s*:\s*([^\n]+)/i)?.[1]?.trim()
  if (trigger && !/follow me ads|sígueme ads|sigueme ads|no hay contenido orgánico/i.test(trigger)) {
    for (const touch of touches) {
      const normalizedTag = touch.tag.toLowerCase().replace(/[“”"']/g, "")
      const normalizedTrigger = trigger.toLowerCase().replace(/[“”"']/g, "")
      if (normalizedTrigger.includes(normalizedTag) || (
        touch.angle && normalizedTrigger.includes(touch.angle.toLowerCase())
      )) touch.isTrigger = true
    }
  }
  return touches
}

export function extractBookingContentOrigin(summary: unknown) {
  const text = String(summary ?? "").replace(/\r/g, "")
  const trigger = text.match(/Contenido gatillo de agenda\s*:\s*([^\n]+)/i)?.[1]?.trim()
  if (!trigger || /^(?:no identificado|no se identifica|sin identificar|no hay contenido orgánico)/i.test(trigger)) {
    return null
  }
  return trigger
}

export async function persistChatSummaryAttribution(
  sb: any,
  agendas: AgendaSummary[],
) {
  const rows: Record<string, unknown>[] = []
  for (const agenda of agendas) {
    if (!agenda.id || !agenda.person_id || !agenda.resumen_chat) continue
    const touches = parseChatSummaryAttribution(agenda.resumen_chat)
    for (const touch of touches) {
      const occurredAt = touch.tagDate
        ? `${touch.tagDate}T12:00:00.000Z`
        : agenda.fecha_agenda || agenda.created_at || new Date().toISOString()
      const fingerprint = Buffer.from(`${touch.format}|${touch.tag}`.toLowerCase())
        .toString("base64url").slice(0, 80)
      rows.push({
        person_id: agenda.person_id,
        event_type: "content_replied",
        occurred_at: occurredAt,
        source: "agenda_chat_summary",
        source_record_type: "agenda",
        source_record_id: agenda.id,
        title: touch.tag,
        metadata: {
          angle: touch.angle,
          format: touch.format,
          tag: touch.tag,
          tag_date: touch.tagDate,
          trigger_for_booking: touch.isTrigger,
          evidence_field: "agendas.resumen_chat",
          evidence: touch.evidence,
          attribution_method: "explicit_chat_summary_tag",
          occurred_at_precision: touch.tagDate ? "tag_date" : "agenda_date_fallback",
        },
        dedupe_key: `chat-summary:${agenda.id}:${fingerprint}`,
      })
    }
  }
  let persisted = 0
  for (let i = 0; i < rows.length; i += 300) {
    const { data, error } = await sb
      .from("crm_events")
      .upsert(rows.slice(i, i + 300), { onConflict: "dedupe_key" })
      .select("id")
    if (error) throw error
    persisted += (data || []).length
  }
  return { detected: rows.length, persisted }
}
