export type AgendaCompliance = {
  closer: string | null
  setter: string | null
  call_confirmer: string | null
  fecha_agenda: string | null
  fecha_closer: string | null
  show: boolean | null
  cerro: boolean | null
  estado: string | null
  motivo_no_cierre: string | null
  link_fathom: string | null
  operacion: string | null
  plan_de_pago: string | null
  medio_de_pago: string | null
  comprobante: string | null
  cc_dia_1: number | null
  fecha_tc: string | null
  calificacion: string | null
  motivo_urgencia: string | null
  problema_actual: string | null
  tiempo_problema: string | null
  intentos_previos: string | null
  ingresos: string | null
  inversion: string | null
  _has_resumen?: boolean
}

export type OperationalStage = "confirmado" | "no_show" | "presentado" | "no_cerrado" | "fee" | "cerrado" | "archivado" | null

const norm = (value: string | null | undefined) => (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase()
const CONFIRMADO = new Set(["confirmada", "si, confirmada", "confirmado por texto"])
const ARCHIVADO = new Set(["cancelada por triage", "se cancelo por triage", "se cancelo", "no respondio"])

function localDay(value: string | null) {
  if (!value) return null
  const parts = value.slice(0, 10).split("-").map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null
  return new Date(parts[0], parts[1] - 1, parts[2])
}

// Debe coincidir con lo que la persona ve en Pipeline. Esta es la única fuente
// para decidir si un resultado de llamada está pendiente.
export function operationalStage(a: AgendaCompliance, now = new Date()): OperationalStage {
  // Cancelado es un resultado final cargado por el closer. `show` queda null
  // porque la llamada no ocurrió, pero nunca debe volver a caer en Pendiente.
  if (a.estado === "Cancelado") return "archivado"
  if (a.estado === "Fee") return "fee"
  if (a.estado === "Adentro en Call" || a.estado === "Adentro en FUP" || a.cerro === true) return "cerrado"
  const confirmer = norm(a.call_confirmer)
  if (ARCHIVADO.has(confirmer)) return "archivado"
  if (a.estado === "No Show") return "no_show"
  if (a.show === true && a.motivo_no_cierre) return "no_cerrado"
  if (a.show === true) return "presentado"
  if (CONFIRMADO.has(confirmer)) {
    const callDay = localDay(a.fecha_closer) || localDay(a.fecha_agenda)
    const today = new Date(now); today.setHours(0, 0, 0, 0)
    return callDay && callDay < today ? "no_show" : "confirmado"
  }
  return null
}

export function closerMissing(a: AgendaCompliance, now = new Date()): string[] {
  const stage = operationalStage(a, now)
  if (stage === "presentado" || stage === "no_cerrado") {
    return [!a.motivo_no_cierre && "motivo", !a.link_fathom && "Fathom"].filter(Boolean) as string[]
  }
  if (stage === "fee" || stage === "cerrado") {
    const missing = [
      !a.estado && "estado", !a.link_fathom && "Fathom", !a.operacion && "operación",
      !a.plan_de_pago && "plan de pago", !a.medio_de_pago && "medio de pago",
      !a.comprobante && "comprobante", !a.cc_dia_1 && "CC día 1",
    ].filter(Boolean) as string[]
    // Fee es una seña. Fecha TC existe solamente cuando el trato fue cerrado.
    if (stage === "cerrado" && !a.fecha_tc) missing.push("Fecha TC")
    return missing
  }
  return []
}

export function setterMissing(a: AgendaCompliance): string[] {
  return [
    !a.calificacion && "calificación", !a._has_resumen && "resumen",
  ].filter(Boolean) as string[]
}

export const firstName = (value: string | null | undefined) => (value || "").trim().split(/\s+/)[0]
