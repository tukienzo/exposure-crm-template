export type UmbralRecordatorio = "7" | "3" | "0" | "+1" | "+3" | "+7"

// Dias entre hoy y la fecha planeada (puede ser negativo si ya vencio).
export function diasHastaFecha(fechaISO: string): number {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const [y, m, d] = fechaISO.split("-").map(Number)
  const fecha = new Date(y, m - 1, d)
  return Math.round((fecha.getTime() - hoy.getTime()) / 86400000)
}

// Umbral que corresponde HOY segun los dias restantes. null si todavia falta
// mas de 30 dias (no hace falta recordar todavia).
export function umbralActual(dias: number): UmbralRecordatorio | null {
  if (dias <= -7) return "+7"
  if (dias <= -3) return "+3"
  if (dias <= -1) return "+1"
  if (dias === 0) return "0"
  if (dias <= 3) return "3"
  if (dias <= 7) return "7"
  return null
}

export const UMBRAL_LABEL: Record<UmbralRecordatorio, string> = {
  "7": "7 días antes",
  "3": "3 días antes",
  "0": "Vence hoy",
  "+1": "1 día vencido",
  "+3": "3 días vencido",
  "+7": "7+ días vencido",
}
