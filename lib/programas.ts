// Catalogo de Programas y sus Operaciones preconfiguradas, usado en Carga de
// Pagos (selector en cascada Programa -> Operacion). Cada operacion define el
// total del plan (usado en el mensaje PPP) y el programa define la duracion
// (usada para calcular Fecha de Baja).

export type ProgramaId = "consulting" | "mastermind" | "accion"

export type OperacionCatalogo = { label: string; total: number }

export type ProgramaDef = {
  id: ProgramaId
  nombreCompleto: string
  nombreCorto: string
  duracionMeses: number | null
  operaciones: OperacionCatalogo[]
}

export const PROGRAMAS: ProgramaDef[] = [
  {
    id: "consulting",
    nombreCompleto: "CRM Base Consulting",
    nombreCorto: "Consulting",
    duracionMeses: 4,
    operaciones: [
      { label: "Consulting | $1,800 PIF", total: 1800 },
      { label: "Consulting | $2,450 PP", total: 2450 },
      { label: "Consulting | $2,300 PP", total: 2300 },
      { label: "Consulting | $1,800 PP", total: 1800 },
    ],
  },
  {
    id: "mastermind",
    nombreCompleto: "CRM Base Mastermind",
    nombreCorto: "Mastermind",
    duracionMeses: 6,
    operaciones: [{ label: "Mastermind | $3,500 PIF", total: 3500 }],
  },
  {
    id: "accion",
    nombreCompleto: "CRM Base Acción",
    nombreCorto: "Acción",
    duracionMeses: 3,
    operaciones: [{ label: "Acción | $530 PIF", total: 530 }],
  },
]

const OPERACIONES_HISTORICAS: Array<{ programaId: ProgramaId; operacion: OperacionCatalogo }> = [
  { programaId: "consulting", operacion: { label: "Consulting | $1,700 PIF", total: 1700 } },
  { programaId: "consulting", operacion: { label: "Consulting | $1,700 PP", total: 1700 } },
]

export function buscarPrograma(id: ProgramaId | string | null | undefined): ProgramaDef | undefined {
  return PROGRAMAS.find((p) => p.id === id)
}

// Busca a que Programa/Operacion pertenece un string de operacion ya guardado
// (ej el campo `operacion` de un plan/pago existente). Devuelve null si no
// matchea ninguna operacion del catalogo actual (planes viejos con strings
// de operacion que ya no estan en este catalogo).
export function buscarProgramaPorOperacion(
  operacionLabel: string | null | undefined,
): { programa: ProgramaDef; operacionDef: OperacionCatalogo } | null {
  if (!operacionLabel) return null
  for (const programa of PROGRAMAS) {
    const operacionDef = programa.operaciones.find((o) => o.label === operacionLabel)
    if (operacionDef) return { programa, operacionDef }
  }
  const historical = OPERACIONES_HISTORICAS.find((item) => item.operacion.label === operacionLabel)
  if (historical) {
    const programa = PROGRAMAS.find((item) => item.id === historical.programaId)
    if (programa) return { programa, operacionDef: historical.operacion }
  }
  return null
}

// Resuelve nombre de programa + duracion + total a partir de un string de
// operacion guardado, con fallback (suma de filas) para planes viejos que no
// matcheen el catalogo actual.
export function resolverInfoPrograma(
  operacionLabel: string | null | undefined,
  filasFallback: { monto: number }[],
): { nombrePrograma: string; duracionLabel: string | null; total: number } {
  const match = buscarProgramaPorOperacion(operacionLabel)
  if (match) {
    return {
      nombrePrograma: match.programa.nombreCompleto,
      duracionLabel: match.programa.duracionMeses != null ? `${match.programa.duracionMeses} Meses` : null,
      total: match.operacionDef.total,
    }
  }
  return {
    nombrePrograma: operacionLabel || "",
    duracionLabel: null,
    total: filasFallback.reduce((s, f) => s + (f.monto || 0), 0),
  }
}

// Suma `meses` a una fecha ISO (YYYY-MM-DD). null si meses es null (sin baja).
export function calcularFechaBajaPrograma(fechaAltaISO: string | null, meses: number | null): string | null {
  if (!fechaAltaISO || meses == null) return null
  const [y, m, d] = fechaAltaISO.split("-").map(Number)
  const dt = new Date(y, m - 1 + meses, d)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}
