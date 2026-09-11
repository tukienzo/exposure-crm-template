export const SALES_ANGLES = [
  "P1 · Dependencia del azar/entorno",
  "P2 · Parálisis con la mujer que le gusta",
  "P3 · Conversación sin emoción",
  "P4 · Genera interés pero no escala",
  "P5 · Contactos que no se convierten en citas",
  "P6 · Tiene citas pero no con las que quiere",
  "P7 · Pierde el marco cuando ella importa",
  "P8 · Post-separación",
  "S1 · Sistema predecible de oportunidades",
  "S2 · Exposición progresiva",
  "S3 · Comunicación emocional e intención",
  "S4 · Ruta de interacción a cita",
  "S5 · Marco y autoliderazgo",
  "M1 · Actuar antes de sentir confianza",
  "M2 · Información sin feedback no alcanza",
  "M3 · Depender del entorno no es tener opciones",
  "M4 · El costo de seguir conformándose",
  "M5 · Es una habilidad entrenable",
  "PR1 · Diagnóstico individual",
  "PR2 · Feedback sobre situaciones reales",
  "PR3 · Reconstrucción post-separación",
  "PR4 · De contactos a citas consistentes",
  "PR5 · De conformarse a poder elegir",
  "PR6 · Un día entrenando clientes",
] as const

const aliases: Array<[RegExp, string]> = [
  [/^P1\b|depend(e|é)s? del azar|entorno impredecible|apps? de citas/i, SALES_ANGLES[0]],
  [/^P2\b|no te anim(a|á)s|par(a|á)lisis|miedo al rechazo/i, SALES_ANGLES[1]],
  [/^P3\b|conversaci(o|ó)n sin emoci(o|ó)n|modo entrevista/i, SALES_ANGLES[2]],
  [/^P4\b|^game$|game\s*\/\s*escalada|no escala|gener(a|á)s inter(e|é)s/i, SALES_ANGLES[3]],
  [/^P5\b|contacto sin cita|el visto|ghosting/i, SALES_ANGLES[4]],
  [/^P6\b|falta de elecci(o|ó)n|no con las que quer(e|é)s|hombre bueno/i, SALES_ANGLES[5]],
  [/^P7\b|escasez|needy|pierde el marco/i, SALES_ANGLES[6]],
  [/^P8\b|post.?separaci(o|ó)n/i, SALES_ANGLES[7]],
  [/^S1\b|sistema predecible/i, SALES_ANGLES[8]],
  [/^S2\b|exposici(o|ó)n progresiva/i, SALES_ANGLES[9]],
  [/^S3\b|comunicaci(o|ó)n emocional/i, SALES_ANGLES[10]],
  [/^S4\b|ruta (concreta )?de interacci(o|ó)n/i, SALES_ANGLES[11]],
  [/^S5\b|marco y autoliderazgo/i, SALES_ANGLES[12]],
  [/^M1\b|esperar confianza/i, SALES_ANGLES[13]],
  [/^M2\b|informaci(o|ó)n sin feedback|^feedback$/i, SALES_ANGLES[14]],
  [/^M3\b|^opciones$/i, SALES_ANGLES[15]],
  [/^M4\b|costo de conformarse/i, SALES_ANGLES[16]],
  [/^M5\b|habilidad entrenable|looks?/i, SALES_ANGLES[17]],
  [/^broad$/i, SALES_ANGLES[17]],
  [/shit.?test/i, SALES_ANGLES[6]],
  [/^PR1\b|diagn(o|ó)stico individual/i, SALES_ANGLES[18]],
  [/^PR2\b|feedback sobre situaciones/i, SALES_ANGLES[19]],
  [/^PR3\b|caso post.?separaci(o|ó)n/i, SALES_ANGLES[20]],
  [/^PR4\b|caso game|de contactos a citas/i, SALES_ANGLES[21]],
  [/^PR5\b|caso falta de elecci(o|ó)n|de conformarse a poder elegir/i, SALES_ANGLES[22]],
  [/^PR6\b|acompa(ñ|n)ame un d(i|í)a|entrenando clientes/i, SALES_ANGLES[23]],
]

export function canonicalSalesAngle(value: unknown) {
  const raw = String(value ?? "").trim()
  if (!raw) return "Sin ángulo"
  if ((SALES_ANGLES as readonly string[]).includes(raw)) return raw
  return aliases.find(([pattern]) => pattern.test(raw))?.[1] || raw
}
