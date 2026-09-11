export const FECCU_TYPES = new Set([
  "Fee", "Refuerzo de Fee",
  "Venta Nueva", "Venta Nueva (En Call)", "Venta Nueva (Post Fee)",
  "Completó PIF", "Completó PIF (Post Fee)",
  "Adentro en Seguimiento", "Adentro en Seguimiento y Post Fee",
])

export const FECCPP_TYPES = new Set([
  "Completó PIF + Acceso Total Consulting",
  "Completa Total (Post Venta)",
  "Completa Total + Acceso Acción",
  "Completa Total y Finaliza Pago",
  "Cuota", "Cuota 1", "Cuota 2", "Cuota 3", "Cuota 4", "Cuota 5",
  "Cuota 6", "Cuota 7", "Cuota 8", "Cuota 9", "Cuota 10",
])

export type FrontendCohort = "FECCU" | "FECCPP" | null

export function frontendCohort(tipo: string | null | undefined): FrontendCohort {
  if (FECCU_TYPES.has(tipo || "")) return "FECCU"
  if (FECCPP_TYPES.has(tipo || "")) return "FECCPP"
  return null
}

export function closerTopTarget(month: string): number {
  return month === "2026-08" ? 45_000 : 50_000
}

export function closerUnlockedRate(ccFrontend: number, isTop: boolean, month: string): number {
  if (isTop && ccFrontend >= closerTopTarget(month)) return 0.12
  if (ccFrontend >= 40_000) return 0.11
  return 0.10
}

export function setterUnlockedRate(ccFirst30Days: number, isTop: boolean): number {
  if (isTop && ccFirst30Days >= 30_000) return 0.06
  if (ccFirst30Days >= 25_000) return 0.055
  return 0.05
}

export function applyStrikes(unlockedRate: number, strikes: number, floor: number): number {
  return Math.max(floor, unlockedRate - Math.max(0, strikes) * 0.005)
}

export function withinSetterWindow(paymentDate: string | null | undefined, firstPaymentDate: string | null | undefined): boolean {
  if (!paymentDate || !firstPaymentDate) return false
  const payment = Date.parse(`${paymentDate.slice(0, 10)}T00:00:00Z`)
  const first = Date.parse(`${firstPaymentDate.slice(0, 10)}T00:00:00Z`)
  if (!Number.isFinite(payment) || !Number.isFinite(first)) return false
  const days = Math.floor((payment - first) / 86_400_000)
  return days >= 0 && days <= 30
}
