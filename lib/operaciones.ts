// Catalogo unico de operaciones. "familia" determina la duracion del programa
// para calcular fecha_baja automaticamente.
export type Familia = "consulting" | "mastermind" | "accion" | "circulo_privado"

export type OperacionDef = { label: string; familia: Familia; mesesOverride?: number }

export const OPERACIONES: OperacionDef[] = [
  { label: "Consulting | $1,700 PIF", familia: "consulting" },
  { label: "Consulting | $1,700 PP", familia: "consulting" },
  { label: "Consulting | $2,300 PP", familia: "consulting" },
  { label: "Consulting | $1,800 PP", familia: "consulting" },
  { label: "Consulting | $1,600 PP", familia: "consulting" },
  { label: "Consulting | $2,450 PP", familia: "consulting" },
  { label: "Consulting | $1,800 PIF", familia: "consulting" },
  { label: "Consulting | 1x$850 (2 meses)", familia: "consulting", mesesOverride: 2 },
  { label: "Consulting | $850 PP (2 meses)", familia: "consulting", mesesOverride: 2 },
  { label: "Consulting | 2 Meses Extra", familia: "consulting", mesesOverride: 2 },
  { label: "Consulting | 1 x $1500", familia: "consulting" },
  { label: "Consulting | $1,500 PP", familia: "consulting" },
  { label: "Consulting | $2,000 PP", familia: "consulting" },
  { label: "Rollover - 8 meses (Consulting)", familia: "consulting" },
  { label: "Mastermind | $3,500 PIF", familia: "mastermind" },
  // Etiquetas históricas: se conservan para reconocer pagos ya cargados.
  { label: "Mastermind | $3,000 PIF", familia: "mastermind" },
  { label: "Mastermind | $3,000 PP", familia: "mastermind" },
  { label: "Acción | $530 PIF", familia: "accion" },
  // Etiqueta histórica: se conserva para reconocer pagos anteriores.
  { label: "Downsell | $500 PIF", familia: "accion" },

  // --- Encontrados en cuotas/page.tsx ---
  { label: "Consulting | 1 x $1700 (PIF)", familia: "consulting" },
  { label: "Consulting | 1x$850 (60d)", familia: "consulting", mesesOverride: 2 },
  { label: "Consulting | 1x$897 (60d)", familia: "consulting", mesesOverride: 2 },
  { label: "Consulting | 4 x $547", familia: "consulting" },

  // --- Encontrado en todos-pagos/page.tsx: valor comodin, familia sin confirmar ---
  // Pendiente de definicion del negocio (por ahora sin fecha de baja automatica).
  { label: "Especial", familia: "circulo_privado" },

  // --- Encontrados en clientes/page.tsx (OPERACION_OPTS) ---
  { label: "Consulting | 1 x $1500 (PIF)", familia: "consulting" },
  { label: "Consulting | 2 x $849", familia: "consulting" },
  { label: "Consulting | 3 x $667", familia: "consulting" },
  { label: "Consulting | 1 x $849 (2 meses)", familia: "consulting", mesesOverride: 2 },
  { label: "Consulting | 3 x $500", familia: "consulting" },
  { label: "Consulting | 6 x $417", familia: "consulting" },
  { label: "Consulting | 4 x $500", familia: "consulting" },
  { label: "Consulting | 1 x $500 (PIF)", familia: "consulting" },
  { label: "Consulting | 2 x $750", familia: "consulting" },
  { label: "Consulting | 1 x $1000", familia: "consulting" },
  { label: "Consulting | 2 x $500", familia: "consulting" },
  { label: "Consulting | 1 x $1200", familia: "consulting" },
  { label: "Consulting | 3 x $300", familia: "consulting" },
  { label: "Consulting | $2300 (PP)", familia: "consulting" },
  { label: "Consulting | 1 x $1600 (PIF)", familia: "consulting" },
  { label: "Consulting | 2 x $250 1x500", familia: "consulting" },
  { label: "Consulting | 1 x $600 (PIF)", familia: "consulting" },

  // --- Encontrados en clientes/page.tsx (OPERACION_RESELL_OPTS) ---
  { label: "Consulting | $1700 (PIF)", familia: "consulting" },
  { label: "Rollover | $4600 (PP)", familia: "consulting" },
  { label: "Rollover | $3400 (PIF)", familia: "consulting" },
]

export const OPERACION_LABELS = OPERACIONES.map(o => o.label)

export function familiaDeOperacion(operacionLabel: string | null | undefined): Familia | null {
  if (!operacionLabel) return null
  const found = OPERACIONES.find(o => o.label === operacionLabel)
  if (found) return found.familia
  const s = operacionLabel.toLowerCase()
  if (s.includes("mastermind")) return "mastermind"
  if (s.includes("circulo privado") || s.includes("círculo privado")) return "circulo_privado"
  if (s.includes("downsell") || s.includes("accion") || s.includes("acción")) return "accion"
  if (s.includes("consulting")) return "consulting"
  return null
}

// Si se pasa el label de la operacion y esa operacion tiene un mesesOverride
// definido en OPERACIONES (casos puntuales de duracion corta, ej "2 meses",
// "60d"), se respeta ese valor por sobre la duracion estandar de la familia.
export function mesesDuracion(familia: Familia | null, operacionLabel?: string | null): number | null {
  if (operacionLabel) {
    const found = OPERACIONES.find(o => o.label === operacionLabel)
    if (found?.mesesOverride != null) return found.mesesOverride
  }
  switch (familia) {
    case "consulting": return 4
    case "mastermind": return 6
    case "accion": return 3
    case "circulo_privado": return null
    default: return null
  }
}

export function calcularFechaBaja(fechaAltaISO: string | null, familia: Familia | null, operacionLabel?: string | null): string | null {
  if (!fechaAltaISO) return null
  const meses = mesesDuracion(familia, operacionLabel)
  if (meses == null) return null
  const [y, m, d] = fechaAltaISO.split("-").map(Number)
  const dt = new Date(y, m - 1 + meses, d)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}
