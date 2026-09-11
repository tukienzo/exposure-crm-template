export type Severity = "alta" | "media" | "baja"

export function slaHours(severity: Severity) {
  return severity === "alta" ? 2 : severity === "media" ? 24 : 72
}

export function engagementSignal(lastActivity: Date | null, now = new Date()) {
  if (!lastActivity) return "sin_evidencia" as const
  const days = Math.max(0, Math.floor((now.getTime() - lastActivity.getTime()) / 86_400_000))
  if (days >= 14) return "inactividad_14d" as const
  if (days >= 7) return "inactividad_7d" as const
  return "actividad_reciente" as const
}

// Reparto de la utilidad entre las dos cuentas dueñas (A = "paul", B =
// "cristian" son las claves internas de las tablas de finanzas). Todo se
// configura en .env:
//   CRM_SPLIT_DESDE          fecha desde la que rigen las excepciones (AAAA-MM-DD)
//   CRM_CUENTA_A_VENDEDORES  nombres (coma) que, al cerrar una renovación, activan el reparto de renovación
//   CRM_CUENTA_A_ORIGENES    handles (coma) de origen que activan el reparto por origen
//   CRM_SPLIT_RENOVACION_A / CRM_SPLIT_ORIGEN_A / CRM_SPLIT_DEFAULT_A  parte de la cuenta A (0 a 1)
const listaEnv = (v: string | undefined) => String(v || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)
const r2 = (n: number) => Math.round(n * 100) / 100
const num = (v: string | undefined, d: number) => { const n = Number(v); return Number.isFinite(n) && v !== undefined && v !== "" ? n : d }
export const SPLITS = {
  desde: process.env.CRM_SPLIT_DESDE || "2000-01-01",
  vendedoresA: listaEnv(process.env.CRM_CUENTA_A_VENDEDORES),
  origenesA: listaEnv(process.env.CRM_CUENTA_A_ORIGENES).map((h) => h.replace(/^@/, "")),
  renovacionA: num(process.env.CRM_SPLIT_RENOVACION_A, 0.65),
  origenA: num(process.env.CRM_SPLIT_ORIGEN_A, 0.8),
  defaultA: num(process.env.CRM_SPLIT_DEFAULT_A, 0.5),
}
export function financeDistribution(input: { occurredOn: string; isRenewal: boolean | null; soldBy?: string | null; originAccount?: string | null }) {
  const active = input.occurredOn >= SPLITS.desde
  const soldBy = String(input.soldBy || "").trim().toLowerCase()
  const origin = String(input.originAccount || "").trim().toLowerCase().replace(/^@/, "")
  if (active && input.isRenewal === true && SPLITS.vendedoresA.includes(soldBy)) {
    return { rule: "paul_renewal", paul: SPLITS.renovacionA, cristian: r2(1 - SPLITS.renovacionA), priority: 1 }
  }
  if (active && origin && SPLITS.origenesA.includes(origin)) {
    return { rule: "paul_origin", paul: SPLITS.origenA, cristian: r2(1 - SPLITS.origenA), priority: 2 }
  }
  return { rule: "default", paul: SPLITS.defaultA, cristian: r2(1 - SPLITS.defaultA), priority: 3 }
}
