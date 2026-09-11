// Utilidades compartidas para el formato "Mes Año" (ej. "Junio 2026") que usan
// las secciones de Gastos y Payroll para agrupar por mes.
const MESES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

export function parseMesLabel(label: string): { idx: number; year: number } | null {
  const m = label.trim().match(/^([A-Za-zÁÉÍÓÚáéíóúñÑ]+)\s+(\d{4})$/)
  if (!m) return null
  const idx = MESES_ES.findIndex((x) => x.toLowerCase() === m[1].toLowerCase())
  if (idx < 0) return null
  return { idx, year: parseInt(m[2], 10) }
}

// Devuelve el label "Mes Año" que resulta de sumarle `n` meses a `label`.
export function sumarMeses(label: string, n: number): string {
  const parsed = parseMesLabel(label)
  if (!parsed) return label
  const total = parsed.year * 12 + parsed.idx + n
  const year = Math.floor(total / 12)
  const idx = ((total % 12) + 12) % 12
  return `${MESES_ES[idx]} ${year}`
}

// Convierte "8/6/2026" o "08/06/2026" (dd/mm/aaaa, como lo pega un humano
// desde una planilla) a "2026-06-08" (ISO, lo que espera la columna fecha).
export function ddmmyyyyAIso(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (!m) return null
  const [, d, mo, y] = m
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`
}
