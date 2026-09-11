import { canonicalSalesAngle, SALES_ANGLES } from "@/lib/sales-angles"

export const BUYER_ARCHETYPES = [
  "A1 · Está en cero / no se anima",
  "A2 · Genera interés pero no convierte",
  "A3 · Tiene resultados pero no con las que quiere",
  "A4 · Profesional aislado / depende del azar",
  "A5 · Post-separación / reconstrucción",
] as const

export type BuyerArchetype = (typeof BUYER_ARCHETYPES)[number]

const ARCHETYPE_RULES: Array<{ archetype: BuyerArchetype; patterns: RegExp[] }> = [
  {
    archetype: BUYER_ARCHETYPES[4],
    patterns: [/post.?separ/i, /separad[oa]/i, /divorci/i, /ruptura/i, /relaci[oó]n (?:muy )?larga/i, /mi ex\b/i],
  },
  {
    archetype: BUYER_ARCHETYPES[3],
    patterns: [/depende del azar/i, /entorno (?:social )?(?:chico|limitado|impredecible)/i, /profesional/i, /trabajo remoto/i, /poco tiempo/i, /c[ií]rculo (?:social )?(?:chico|reducido)/i, /apps? como [uú]nico/i],
  },
  {
    archetype: BUYER_ARCHETYPES[2],
    patterns: [/no con las que (?:quiere|le gustan)/i, /se conforma/i, /por descarte/i, /calidad de (?:las )?mujeres/i, /mujeres que realmente/i, /poder elegir/i, /selectiv/i],
  },
  {
    archetype: BUYER_ARCHETYPES[1],
    patterns: [/no (?:sabe|logra) escalar/i, /genera inter[eé]s/i, /no convierte/i, /modo entrevista/i, /no genera emoci[oó]n/i, /contactos? (?:pero|sin)/i, /no concreta/i, /friend.?zone/i, /buena onda.*no pasa nada/i],
  },
  {
    archetype: BUYER_ARCHETYPES[0],
    patterns: [/no se anima/i, /miedo al rechazo/i, /se paraliza/i, /se bloquea/i, /no sabe qu[eé] decir/i, /cero citas/i, /nunca (?:tuvo|encar[oó])/i, /timidez/i, /verg[uü]enza/i],
  },
]

export function classifyBuyerArchetype(value: unknown) {
  const text = String(value ?? "")
  const scores = ARCHETYPE_RULES.map((rule) => ({
    archetype: rule.archetype,
    evidence: rule.patterns
      .filter((pattern) => pattern.test(text))
      .map((pattern) => pattern.source.replaceAll("\\b", "")),
  })).map((row) => ({ ...row, score: row.evidence.length }))
    .sort((left, right) => right.score - left.score)
  const winner = scores[0]
  const runnerUp = scores[1]
  if (!winner || winner.score === 0) {
    return { primary: null, secondary: null, confidence: 0, evidence: [] as string[] }
  }
  const confidence = Math.min(0.98, 0.45 + winner.score * 0.13 + (winner.score > (runnerUp?.score || 0) ? 0.08 : 0))
  return {
    primary: winner.archetype,
    secondary: runnerUp?.score ? runnerUp.archetype : null,
    confidence: Math.round(confidence * 100) / 100,
    evidence: winner.evidence.slice(0, 4),
  }
}

export const BUYING_MOTIVES = [
  "Urgencia personal / no postergar",
  "Estructura, guía y feedback",
  "Plan personalizado",
  "Prueba social y casos",
  "Acompañamiento y comunidad",
  "Flexibilidad de pago",
  "Transformación de largo plazo",
  "Otro motivo con evidencia",
] as const

export function buyingMotive(value: unknown) {
  const text = String(value ?? "").toLowerCase()
  if (!text.trim()) return null
  if (/ahora|urg|posterg|estanc|cambiar|no seguir|momento/.test(text)) return BUYING_MOTIVES[0]
  if (/estructura|gu[ií]a|feedback|correcci[oó]n|paso a paso|m[eé]todo/.test(text)) return BUYING_MOTIVES[1]
  if (/personaliz|individual|a su medida|rutina/.test(text)) return BUYING_MOTIVES[2]
  if (/caso|testimonio|prueba social|resultado/.test(text)) return BUYING_MOTIVES[3]
  if (/acompa|comunidad|soporte|seguimiento|entorno/.test(text)) return BUYING_MOTIVES[4]
  if (/cuota|pago|descuento|seña|financ/.test(text)) return BUYING_MOTIVES[5]
  if (/vida|largo plazo|habilidad|para siempre|identidad/.test(text)) return BUYING_MOTIVES[6]
  return BUYING_MOTIVES[7]
}

export function knownSalesAngle(value: unknown) {
  const raw = String(value ?? "").trim()
  if (!raw) return null
  const canonical = canonicalSalesAngle(raw)
  return (SALES_ANGLES as readonly string[]).includes(canonical) ? canonical : null
}

export function unknownSalesAngle(value: unknown) {
  const raw = String(value ?? "").trim()
  if (!raw) return null
  return knownSalesAngle(raw) ? null : raw
}

export function callEvidenceText(trace: Record<string, unknown> | null | undefined, fallback = "") {
  if (!trace) return fallback
  return [
    trace.analisis,
    trace.primary_angle,
    ...(Array.isArray(trace.pain_points) ? trace.pain_points : []),
    ...(Array.isArray(trace.desired_outcomes) ? trace.desired_outcomes : []),
    ...(Array.isArray(trace.buying_triggers) ? trace.buying_triggers : []),
    trace.why_bought,
    trace.why_not_bought,
    ...(Array.isArray(trace.evidence_quotes) ? trace.evidence_quotes : []),
    fallback,
  ].filter(Boolean).join("\n")
}
