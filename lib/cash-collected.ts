// Tipos de `pagos.tipo` que representan dinero efectivamente cobrado (Cash
// Collected). Única fuente de verdad compartida por tablero-semanal,
// home-ceo-reconciliacion y el asistente interno, para que los tres nunca
// diverjan en qué cuenta como "cobrado".
export const CC_TIPOS = new Set([
  "Fee", "Refuerzo de Fee", "Venta Nueva", "Venta Nueva (En Call)",
  "Venta Nueva (Post Fee)", "Completó PIF (Post Fee)",
  "Completó PIF + Acceso Total Consulting",
  "Completa Total (Post Venta)",
  "Completa Total + Acceso Acción",
  "Completa Total y Finaliza Pago",
  "Cuota", "Cuota 1", "Cuota 2", "Cuota 3", "Cuota 4", "Cuota 5",
  "Cuota 6", "Cuota 7", "Cuota 8", "Cuota 9", "Cuota 10",
  "Fee Venta Interna", "Venta Nueva Interna", "Cuota Venta Interna",
])

export function isCashCollectedType(tipo: string | null | undefined): boolean {
  return CC_TIPOS.has(tipo || "")
}

export function sumCashCollected(rows: Array<{ tipo?: string | null; monto?: number | null }>): number {
  const total = rows
    .filter(row => isCashCollectedType(row.tipo))
    .reduce((sum, row) => sum + (row.monto || 0), 0)
  return Math.round(total * 100) / 100
}
