import crypto from "crypto"

// Dataset de Meta "🟢 | LEAD CALIF. RMKT JULY 26" — el dataset dedicado a esta tarea.
const DATASET_ID = ""
const CAPI_URL = `https://graph.facebook.com/v23.0/${DATASET_ID}/events`

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex")
}

// Manda a Meta CAPI el resultado comercial que queremos repetir: show real + S/A/B.
// Nunca lanza: si falla Meta o falta el token, no debe romper el guardado de la agenda.
export async function sendLeadScoreEvent({
  agendaId,
  telefono,
  instagram,
  calificacion,
  show,
}: {
  agendaId: string | number
  telefono?: string | null
  instagram?: string | null
  calificacion: string
  show: boolean
}) {
  try {
    const token = process.env.META_CAPI_ACCESS_TOKEN
    if (!token) {
      console.error("[meta-capi] META_CAPI_ACCESS_TOKEN no está configurado, se omite el envío")
      return
    }

    const score = calificacion.match(/LEAD\s+([SAB])\b/i)?.[1]?.toUpperCase() || null
    if (!show || !score) return

    const phone = (telefono || "").replace(/\D/g, "")
    const ig = (instagram || "").toLowerCase().replace("@", "").trim()
    if (!phone && !ig) {
      console.error("[meta-capi] sin teléfono ni instagram, se omite el envío")
      return
    }

    const userData: Record<string, string[]> = {}
    if (phone) userData.ph = [sha256(phone)]
    if (ig) userData.external_id = [sha256(ig)]

    const body = {
      access_token: token,
      data: [
        {
          event_name: "QualifiedLead",
          event_time: Math.floor(Date.now() / 1000),
          event_id: `qualified-show-agenda-${agendaId}`,
          action_source: "system_generated",
          event_source_url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
          user_data: userData,
          custom_data: {
            lead_score: score,
            show: true,
            value: score === "S" ? 100 : score === "A" ? 85 : 65,
            currency: "USD",
          },
        },
      ],
    }

    const res = await fetch(CAPI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const resJson = await res.json().catch(() => null)
    if (!res.ok) {
      console.error("[meta-capi] Meta respondió con error", res.status, JSON.stringify(resJson))
    } else {
      console.log("[meta-capi] evento enviado ok", JSON.stringify(resJson))
    }
  } catch (e) {
    console.error("[meta-capi] excepción al enviar evento", e instanceof Error ? e.message : e)
  }
}
