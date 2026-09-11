import crypto from "node:crypto"

const AUDIENCE_ID = process.env.META_HAMMER_AUDIENCE_ID || ""
const API = `https://graph.facebook.com/v21.0/${AUDIENCE_ID}/users`

const sha = (value: string) => crypto.createHash("sha256").update(value).digest("hex")
const email = (value: unknown) => String(value || "").trim().toLowerCase()
const phone = (value: unknown) => String(value || "").replace(/\D/g, "").replace(/^00/, "")
const CALL_DURATION_MS = 60 * 60 * 1000

// `fecha_closer` se guarda como hora de Argentina sin offset. Interpretarla
// como UTC dejaría a la persona tres horas extra dentro de Hammer Them.
export function hammerCallEndAt(value?: string | null) {
  if (!value) return NaN
  const raw = String(value).trim()
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)
  const callAt = new Date(hasZone ? raw : `${raw.replace(" ", "T")}-03:00`).getTime()
  return Number.isFinite(callAt) ? callAt + CALL_DURATION_MS : NaN
}

export async function updateHammerAudience(
  action: "add" | "remove",
  identifiers: { email?: unknown; telefono?: unknown },
) {
  const token = process.env.META_ADS_ACCESS_TOKEN
  if (!token) return { ok: false, skipped: "missing_token" }
  const em = email(identifiers.email), ph = phone(identifiers.telefono)
  if (!em && !ph) return { ok: false, skipped: "missing_identity" }

  const schema: string[] = [], row: string[] = []
  if (em) { schema.push("EMAIL"); row.push(sha(em)) }
  if (ph) { schema.push("PHONE"); row.push(sha(ph)) }
  const body = new URLSearchParams({
    access_token: token,
    payload: JSON.stringify({ schema, data: [row] }),
  })
  const response = await fetch(API, {
    method: action === "add" ? "POST" : "DELETE",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  const result = await response.json().catch(() => null)
  if (!response.ok) throw new Error(`Meta audience ${response.status}: ${result?.error?.message || "error"}`)
  return { ok: true, action, received: result?.num_received ?? 1 }
}

export function shouldRemainInHammerAudience(row: { fecha_closer?: string | null; estado?: string | null; call_confirmer?: string | null }, now = new Date()) {
  const status = `${row.estado || ""} ${row.call_confirmer || ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  if (/cancel|archivad/.test(status)) return false
  const callEndAt = hammerCallEndAt(row.fecha_closer)
  return Number.isFinite(callEndAt) && callEndAt > now.getTime()
}
