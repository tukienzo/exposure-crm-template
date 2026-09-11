export type EstadoSemaforo = "rojo" | "amarillo" | "verde"

export type DatosSemaforo = {
  dias: number
  ultimo_contacto_at?: string | null
  responsable_cobranza?: string | null
  proxima_accion?: string | null
  proxima_accion_fecha?: string | null
}

export function semaforoCobranza(item: DatosSemaforo): EstadoSemaforo {
  if (item.dias < 0 && !item.ultimo_contacto_at) return "rojo"
  if (!item.responsable_cobranza || !item.proxima_accion || !item.proxima_accion_fecha) return "amarillo"
  return "verde"
}
