import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Agenda = {
  id?: number
  nombre: string
  email: string | null
  telefono: string | null
  instagram: string | null
  puntos_contacto: string | null
  fecha_agenda: string | null
  fecha_closer: string | null
  fecha_lead: string | null
  edad: string | null
  closer: string | null
  cuenta: string | null
  setter: string | null
  calificacion: string | null
  calificacion_real: string | null
  motivo_calificacion_real: string | null
  angulo_entrada: string | null
  campaign_id: string | null
  ad_id: string | null
  creative_id: string | null
  fuente: string | null
  ocupacion: string | null
  manychat: string | null
  resumen_chat: string | null
  calificaba_realmente: string | null
  call_confirmer: string | null
  info_call_triage: string | null
  recurso: string | null
  show: boolean
  cerro: boolean
  estado: string | null
  motivo_no_cierre: string | null
  seguimiento_estado: "Pendiente" | "Contactado" | "Reagendado" | "Cerrado" | "Descartado" | null
  seguimiento_fecha: string | null
  seguimiento_nota: string | null
  seguimiento_responsable: string | null
  seguimiento_actualizado_at: string | null
  link_fathom: string | null
  operacion: string | null
  plan_de_pago: string | null
  tipo_cierre: string | null
  medio_de_pago: string | null
  comprobante: string | null
  cc_dia_1: number | null
  fecha_tc: string | null
  fecha_baja: string | null
  ia_analisis: string | null
  problema_actual: string | null
  tiempo_problema: string | null
  intentos_previos: string | null
  motivo_urgencia: string | null
  ingresos: string | null
  inversion: string | null
  rescatado: boolean | null
  motivo_inclusion: string | null
  calificacion_crm_original: string | null
}

export type Pago = {
  id?: number
  fecha: string | null
  fecha_alta: string | null
  fecha_baja: string | null
  cliente: string | null
  telefono: string | null
  tipo: string | null
  operacion: string | null
  closer: string | null
  setter: string | null
  calificacion: string | null
  monto: number | null
  cc_ars: number | null
  medio_de_pago: string | null
  tipo_cambio_usd: number | null
  comprobante: string | null
  ppp: string | null
  fuente: string | null
  contenido_contestado: string | null
  otras_comisiones: string | null
  control: string | null
  es_reactivacion?: boolean | null
}

export type Cuota = {
  id?: number; cliente: string; operacion: string; monto: number
  fecha_vencimiento: string; estado: string; medio_de_pago: string; closer: string
  plan_de_pago?: string | null; monto_cobrado?: number | null; telefono?: string | null
}

export type Cliente = {
  id?: number
  person_id?: string | null
  nombre: string
  calificacion: string | null
  telefono: string | null
  fecha_ingreso: string | null
  duracion: string | null
  fecha_baja: string | null
  fecha_proxima_call: string | null
  fecha_3ra_call: string | null
  fecha_4ta_call: string | null
  medio_de_pago: string | null
  operacion_original: string | null
  pitch: string | null
  fecha_primer_call: string | null
  created_at?: string
  // Columns added via migration:
  estado?: string | null
  operacion_resell?: string | null
  medio_pago_resell?: string | null
  monto_con_descuento?: string | null
  etapa?: string | null
  link_call_onboarding?: string | null
  onboarding_form_at?: string | null
  contract_client_signed_at?: string | null
  contract_ceo_signed_at?: string | null
  discord_access_at?: string | null
  skool_access_at?: string | null
  onboarding_completed_at?: string | null
  csm_owner?: string | null
  health_status?: string | null
  last_contact_at?: string | null
  next_action?: string | null
  next_action_at?: string | null
  backend_priority?: string | null
  backend_status?: string | null
  backend_potential_usd?: number | null
  backend_offer?: string | null
  backend_owner?: string | null
  lifecycle_notes?: string | null
  last_observed_activity_at?: string | null
  inactivity_days?: number | null
  engagement_signal?: "actividad_reciente" | "inactividad_7d" | "inactividad_14d" | "sin_evidencia" | null
  engagement_signal_reason?: string | null
  renewal_status?: string | null
  renewal_potential_usd?: number | null
  renewal_probability?: number | null
  renewal_loss_reason?: string | null
  record_status?: "active" | "historical" | "merged" | "review" | null
  merged_into_client_id?: number | null
}

export type Strike = {
  id: number; nombre: string; rol: string; count: number; updated_at?: string
}
