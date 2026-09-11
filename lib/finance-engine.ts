export type CloseStatus = "provisional" | "confirmado"
export type MovementClassification =
  | "ingreso"
  | "transferencia_interna"
  | "gasto_operativo"
  | "distribucion_socio"
  | "por_clasificar"

export type CloseInputs = {
  externalIncome: number
  platformFees: number
  payroll: number
  softwareMarketing: number
  operatingExpenses: number
  obligations: number
  reserves: number
  adjustments: number
}

export type ConfirmationGate = {
  totalMovements: number
  reconciledMovements: number
  unexplainedDifference: number
  payrollReconciled: boolean
  bonusesReconciled: boolean
  distributionReproducible: boolean
  bothPartnersApproved: boolean
}

export type MercuryMovement = {
  amount: number
  direction: "in" | "out"
  fromAccount?: "savings" | "checking" | "external" | null
  toAccount?: "savings" | "checking" | "external" | null
  businessPurpose?: "confirmed" | "personal" | "ambiguous" | null
}

function assertMoney(value: number, field: string) {
  if (!Number.isFinite(value)) throw new Error(`${field} debe ser un número finito`)
}

export function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function calculateClose(inputs: CloseInputs) {
  Object.entries(inputs).forEach(([field, value]) => assertMoney(value, field))
  const deductions =
    inputs.platformFees
    + inputs.payroll
    + inputs.softwareMarketing
    + inputs.operatingExpenses
    + inputs.obligations
    + inputs.reserves
  const distributable = roundCurrency(inputs.externalIncome - deductions + inputs.adjustments)
  const partnerShare = roundCurrency(distributable / 2)

  return {
    ...inputs,
    deductions: roundCurrency(deductions),
    distributable,
    partnerShare,
    formula: "ingresos - plataforma - payroll - software/marketing - gastos operativos - obligaciones - reservas + ajustes",
  }
}

export function classifyMercuryMovement(movement: MercuryMovement): MovementClassification {
  const savingsChecking =
    (movement.fromAccount === "savings" && movement.toAccount === "checking")
    || (movement.fromAccount === "checking" && movement.toAccount === "savings")
  if (savingsChecking) return "transferencia_interna"
  if (
    movement.direction === "in"
    && movement.toAccount === "savings"
    && movement.fromAccount === "external"
  ) return "ingreso"
  if (movement.businessPurpose === "confirmed") return "gasto_operativo"
  if (movement.businessPurpose === "personal" || movement.businessPurpose === "ambiguous") {
    return "por_clasificar"
  }
  return "por_clasificar"
}

export function confirmationReadiness(gate: ConfirmationGate) {
  const coverage = gate.totalMovements === 0
    ? 0
    : gate.reconciledMovements / gate.totalMovements
  const blockers = [
    coverage < 1 && "movimientos sin conciliar",
    Math.abs(gate.unexplainedDifference) > 0.005 && "diferencia sin explicar",
    !gate.payrollReconciled && "payroll pendiente",
    !gate.bonusesReconciled && "bonos pendientes",
    !gate.distributionReproducible && "distribución no reproducible",
    !gate.bothPartnersApproved && "aprobación final incompleta",
  ].filter(Boolean) as string[]

  return {
    coverage: roundCurrency(coverage * 100),
    canConfirm: blockers.length === 0,
    blockers,
  }
}
