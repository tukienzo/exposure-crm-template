// Scoring automático CRM (confirmado por Cuenta A 2026-08-04).
// Fuente exclusiva: respuestas literales del calendario/iClosed.

export type ScoreInput = {
  edad?: unknown
  problema_actual?: unknown
  tiempo_problema?: unknown
  intentos_previos?: unknown
  motivo_urgencia?: unknown
  ocupacion?: unknown
  ingresos?: unknown
  inversion?: unknown
}

export type LeadGrade = "LEAD S" | "LEAD A" | "LEAD B" | "LEAD C" | "LEAD D"
export type ScoreResult = {
  calificacion: LeadGrade
  motivo: string
  puntos: number
  desglose: Record<string, number>
} | null

const norm = (value: unknown) => String(value ?? "").trim().toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[’‘]/g, "'").replace(/\s+/g, " ")
const has = (value: unknown, terms: string[]) => terms.some(term => norm(value).includes(norm(term)))

function capitalPoints(value: unknown): number | null {
  const v = norm(value)
  if (!v) return null
  if (has(v, ["no tengo", "no tiene ni", "no puedo conseguir"])) return 0
  if (has(v, ["duda", "no se si", "no sé si"])) return 16
  if (has(v, ["mas de usd 2.000", "más de usd 2.000", "+$3.000 usd", "+$3,000 usd", "+3.000.000", "mas de $3.000.000", "más de $3.000.000"])) return 30
  if (has(v, ["entre usd 500", "entre $500 y $2.000", "entre $500 y $2,000", "entre $700.000", "entre ars 700.000", "entre $500.000 y $2.000.000"])) return 24
  return null
}

function professionPoints(value: unknown): number | null {
  const v = norm(value)
  if (!v) return null
  if (has(v, ["desempleado", "sin ingresos"])) return 0
  if (has(v, ["negocio propio", "dueño de negocio", "dueno de negocio", "marca personal"])) return 20
  if (has(v, ["empleado", "relacion de dependencia", "ingreso estable"])) return 17
  if (has(v, ["freelance", "independiente", "ingreso variable"])) return 12
  return null
}

function urgencyPoints(value: unknown): number | null {
  const v = norm(value)
  if (!v) return null
  if (has(v, ["algo cambio", "resolverlo ahora", "alto valor ya"])) return 20
  if (has(v, ["cansado de repetir", "estos dias"])) return 17
  if (has(v, ["sin apuro", "2-4 semanas", "unos meses", "mas adelante"])) return 8
  if (has(v, ["curiosidad", "no quiero resolver", "aun no se cuando"])) return 0
  return null
}

function durationPoints(value: unknown): number | null {
  const v = norm(value)
  if (!v) return null
  if (has(v, ["+1 año", "mas de 1 año", "más de 1 año", "perdi oportunidades", "perdí oportunidades"])) return 12
  if (has(v, ["varios meses", "molesta seguido"])) return 9
  if (has(v, ["reciente", "sin consecuencias graves"])) return 4
  if (has(v, ["curiosidad"])) return 0
  return null
}

function attemptsPoints(value: unknown): number | null {
  const v = norm(value)
  if (!v) return null
  if (has(v, ["probe varias", "probé varias", "probo varias", "probó varias", "no logro sostener", "no logró sostener"])) return 10
  if (has(v, ["intente algo", "intenté algo", "intento algo", "intentó algo", "no en serio"])) return 7
  if (has(v, ["nada concreto", "prefiere guia", "prefiere guía"])) return 5
  if (has(v, ["culpa al entorno"])) return 0
  return null
}

function problemPoints(value: unknown): number | null {
  const v = norm(value)
  if (!v) return null
  if (has(v, ["encaro y hablo", "no logro escalar", "no salgo con las mujeres que me gustan"])) return 5
  if (has(v, ["no me animo a encarar"])) return 4
  if (has(v, ["demasiado bueno", "me ven como amigo"])) return 3
  return null
}

function agePoints(value: unknown): number | null {
  const v = norm(value)
  if (!v) return null
  if (has(v, ["-18", "menor de 18"])) return -100
  if (has(v, ["18-26", "18–26"])) return 1
  if (has(v, ["27-37", "27–37", "38 o mas", "38 o más"])) return 3
  const n = Number.parseInt(v, 10)
  if (!Number.isFinite(n)) return null
  if (n < 18) return -100
  return n >= 27 ? 3 : 1
}

export function autoScoreLead(row: ScoreInput): ScoreResult {
  const capital = capitalPoints(row.inversion)
  const profesion = professionPoints(row.ocupacion)
  const edad = agePoints(row.edad)
  const parts = {
    capital: capital ?? 0,
    profesion: profesion ?? 0,
    urgencia: urgencyPoints(row.motivo_urgencia) ?? 0,
    antiguedad: durationPoints(row.tiempo_problema) ?? 0,
    intentos: attemptsPoints(row.intentos_previos) ?? 0,
    problema: problemPoints(row.problema_actual) ?? 0,
    edad: Math.max(0, edad ?? 0),
  }
  const recognized = [capital, profesion, edad, urgencyPoints(row.motivo_urgencia), durationPoints(row.tiempo_problema), attemptsPoints(row.intentos_previos), problemPoints(row.problema_actual)].filter(v => v !== null).length
  if (!recognized) return null
  if (edad === -100) return { calificacion: "LEAD D", motivo: "auto: menor de 18, bloqueado", puntos: 0, desglose: parts }
  if (profesion === 0 && capital === 0) return { calificacion: "LEAD D", motivo: "auto: sin ingresos y sin capital mínimo", puntos: 0, desglose: parts }
  // No inventar una D por ausencia de respuestas. El formulario debe aportar
  // evidencia suficiente antes de emitir cualquier calificación automática.
  if (recognized < 4 || capital === null || profesion === null) return null
  const puntos = Object.values(parts).reduce((sum, value) => sum + value, 0)
  let grade: LeadGrade = puntos >= 85 ? "LEAD S" : puntos >= 70 ? "LEAD A" : puntos >= 55 ? "LEAD B" : puntos >= 35 ? "LEAD C" : "LEAD D"
  if (grade === "LEAD S" && !(capital === 30 && (profesion ?? 0) >= 12)) grade = "LEAD A"
  if (grade === "LEAD A" && !((capital ?? 0) >= 24 || (capital === 16 && (profesion ?? 0) >= 17 && parts.urgencia >= 17))) grade = "LEAD B"
  return { calificacion: grade, motivo: `auto calendario: ${puntos}/100`, puntos, desglose: parts }
}
