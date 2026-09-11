"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import useSWR, { mutate } from "swr"
import { DateFilter } from "@/components/date-filter"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Pencil, Filter, BarChart2, X, Search, FileText, Check, ChevronDown, Plus, ExternalLink, Download, UserRound, CalendarClock, Waypoints, ArrowLeft, ArrowRight, Sparkles, Phone, Instagram, UserCheck, MessageSquareText, BriefcaseBusiness, Archive } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { useSession } from "@/components/session-provider"
import { canExportAgendas } from "@/lib/export-access"
import type { Agenda } from "@/lib/supabase"
import { exportRowsToCSV, exportRowsToXLSX } from "@/lib/csv-export"
import { FuenteSelect, FuenteInlineCell, FuenteFilter } from "@/components/fuente-picker"
import { HelpHint } from "@/components/help-hint"
import { SALES_ANGLES } from "@/lib/sales-angles"
import { getPrecallSequence } from "@/lib/precall-angle-sequences"
import { CLOSERS_ACTIVOS, SETTERS_ACTIVOS, CUENTAS } from "@/lib/equipo"

const norm = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
const formatDate = (value: string | null) => value ? new Date(value).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" }) : "Sin fecha"

// Todos los campos de la agenda, salvo los del Precaller (call_confirmer /
// info_call_triage) que Lisan pidió excluir explícitamente.
const AGENDAS_CSV_COLUMNS = [
  { label: "Nombre", get: (a: any) => a.nombre },
  { label: "Teléfono", get: (a: any) => a.telefono },
  { label: "Instagram", get: (a: any) => a.instagram },
  { label: "F. Agenda", get: (a: any) => a.fecha_agenda },
  { label: "F. Closer", get: (a: any) => a.fecha_closer },
  { label: "F. Lead", get: (a: any) => a.fecha_lead },
  { label: "Edad", get: (a: any) => a.edad },
  { label: "Closer", get: (a: any) => a.closer },
  { label: "Cuenta", get: (a: any) => a.cuenta },
  { label: "Setter", get: (a: any) => a.setter },
  { label: "Calificación", get: (a: any) => a.calificacion },
  { label: "Ángulo de entrada", get: (a: any) => a.angulo_entrada },
  { label: "Campaign ID", get: (a: any) => a.campaign_id },
  { label: "Ad ID", get: (a: any) => a.ad_id },
  { label: "Creative ID", get: (a: any) => a.creative_id },
  { label: "Fuente", get: (a: any) => a.fuente },
  { label: "Ocupación", get: (a: any) => a.ocupacion },
  { label: "Manychat", get: (a: any) => a.manychat },
  { label: "Puntos de Contacto", get: (a: any) => a.puntos_contacto },
  { label: "Resumen de Chat", get: (a: any) => a.resumen_chat },
  { label: "Contenido de origen", get: (a: any) => a.recurso || "Contenido no identificado" },
  { label: "Show", get: (a: any) => a.estado === "Cancelado" ? "CANCELADO POR TRIAGE" : a.show === true ? "SÍ" : a.show === false ? "NO" : "PENDIENTE" },
  { label: "Cerró", get: (a: any) => a.cerro ? "Sí" : "No" },
  { label: "Estado", get: (a: any) => a.estado },
  { label: "Motivo No Cierre", get: (a: any) => a.motivo_no_cierre },
  { label: "Calificaba Realmente", get: (a: any) => a.calificaba_realmente },
  { label: "Score real post-call", get: (a: any) => a.calificacion_real },
  { label: "Motivo score real", get: (a: any) => a.motivo_calificacion_real },
  { label: "Link Fathom", get: (a: any) => a.link_fathom },
  { label: "Operación", get: (a: any) => a.operacion },
  { label: "Plan de Pago (PPP)", get: (a: any) => a.plan_de_pago },
  { label: "Tipo de Cierre", get: (a: any) => a.tipo_cierre },
  { label: "Medio de Pago", get: (a: any) => a.medio_de_pago },
  { label: "Comprobante", get: (a: any) => a.comprobante },
  { label: "CC Día 1", get: (a: any) => a.cc_dia_1 },
  { label: "Fecha TC", get: (a: any) => a.fecha_tc },
  { label: "Fecha Baja", get: (a: any) => a.fecha_baja },
  { label: "IA Análisis", get: (a: any) => a.ia_analisis },
  { label: "Problema Actual", get: (a: any) => a.problema_actual },
  { label: "Tiempo sin solucionarlo", get: (a: any) => a.tiempo_problema },
  { label: "Intentos previos", get: (a: any) => a.intentos_previos },
  { label: "Por qué ahora", get: (a: any) => a.motivo_urgencia },
  { label: "Ingresos", get: (a: any) => a.ingresos },
  { label: "Inversión", get: (a: any) => a.inversion },
]

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.error || "No se pudieron cargar las agendas")
  }
  if (!Array.isArray(payload)) {
    throw new Error("La respuesta de agendas no tiene el formato esperado")
  }
  return payload as Agenda[]
}

// El equipo y las cuentas salen de .env (NEXT_PUBLIC_CRM_CLOSERS, _SETTERS, _CUENTA_A_HANDLE, _CUENTA_B_HANDLE)
const CLOSERS = [...CLOSERS_ACTIVOS, "Sin Closer", "Libre / Recontacto"]
const SETTERS = [...SETTERS_ACTIVOS, "Sin Setter"]
const settersFor = (_d?: string | null) => SETTERS
const CUENTA = CUENTAS.length ? CUENTAS : ["Cuenta A", "Cuenta B"]
const CALIFICACION = ["LEAD S","LEAD A","LEAD B","LEAD C","LEAD D"]
const OCUPACION = ["Negocio","Empleado","Estudiante","No se le envió"]
const MANYCHAT_OPTS = ["AUDIO 1","AUDIO 2","AUDIO CUENTA A","OPCIÓN 1","OPCIÓN 2","OPCIONES","FOLLOW MANY FILTRADO","RECURSO FOLLOWER",'FOLLOWERS DM "QUÉ HAGO?"','🐍 | NEW FOLLOWER',"No Respondió","No se le envió"]
const CALL_CONFIRMER = ["Confirmada","Cancelada por Triage","No Respondió","Pendiente"]
const NO_PRECALLER_FROM = "2026-08-01"
function isNoPrecallerAgenda(a: Partial<Agenda> | null | undefined) {
  const raw = a?.fecha_closer || a?.fecha_agenda
  return Boolean(raw && String(raw).slice(0, 10) >= NO_PRECALLER_FROM)
}
const CALIFICABA = ["Si","No"]
const ESTADO_AG = ["Adentro en Call","Adentro en FUP","Fee"]
const MOTIVO = ["Le parecia caro","No llego al PIF","No llegaba a la Cuota 1","Lo tenia que pensar","Desconfianza","Miedo","Metodo de pago","No Califica","Era desempleado"]
const OPERACION = ["Consulting | $1,800 PIF","Consulting | $1,800 PP","Consulting | $2,300 PP","Consulting | $2,450 PP","Consulting | $1,600 PP","Consulting | 1x$850 (2 meses)","Consulting | $850 PP (2 meses)","Consulting | 2 Meses Extra","Mastermind | $3,500 PIF","Acción | $530 PIF","Especial","Rollover - 8 meses (Consulting)"]
const MEDIO_PAGO = ["Pesos","Stripe","USDT","Efectivo USD","Efectivo ARS","Transferencia Bancaria USD","Western Unión","PayPal"]
const PROBLEMA = [
  "Tengo opciones pero no salgo con mujeres",
  "Tengo Citas con mujeres que no me gustan",
  "Tengo Citas y no paso la 2nda cita o a algo serio",
  "No paso la 2nda cita o algo Serio",
  "Soy muy tímido en ambientes sociales",
  "Soy tímido fuera de mi trabajo / zona de confort",
  "No entiendo el mundo de citas moderno",
  "Comunicación y Oratoria",
  "Citas / Vida Amorosa y Social",
  "🙋🏼‍♀️ Citas / Vida Amorosa y Social",
  "😃 Motivación y Disciplina",
  "🔥 Ventas y Marketing",
  "Todas al mismo tiempo",
]
const RESULTADO = [
  "Ser una versión 10X más sociable y carismática",
  "Elegir desde la abundancia a una Novia Tradicional",
  "2 Citas/Semana con mujeres que me gusten",
  "Tener una rotación de mujeres (Círculo Social)",
  "Vencer Ansiedad Social y Ganar Confianza",
  "Tener de 2 a 5 Citas x Semana con Modelos",
  "Tener una Novia para formar Familia",
  "Conocer Gente en todo momento y lugar",
  "Tener de 2 a 5 Citas x Semana con 9/10 y 10/10",
  "Mejorar en Comunicación y Ventas",
]
const RELEVANCIA = [
  "Sí, quiero volverme un Hombre de Alto Valor YA",
  "Sí, quiero mejorar esto ahora",
  "Me gustaría resolverlo en estos días",
  "Quiero verlo en 2-4 semanas",
  "Quiero resolverlo en unos meses",
  "Me gustaría verlo más adelante",
  "Aún no sé cuándo resolverlo",
  "No quiero resolverlo todavía",
]
const PROFESION = [
  "Dueño de Negocio (Físico o E-Commerce/Agencia)",
  "Dueño de Negocio Físico",
  "Ecommerce",
  "Marca Personal / E-Commerce / Agencia",
  "Marca Personal / Agencia / Consultoría",
  "Profesional Independiente Ocupado",
  "Programador",
  "Empleado en Relación de Dependencia",
  "Empleado Relación Dependencia",
  "Hago Changas / Tengo trabajos cada tanto",
  "Trabajo Independiente / Hago changas",
  "Estoy desempleado / No tengo ingresos",
]
const INGRESOS = [
  "Estoy desempleado / No tengo ingresos",
  "Estoy desempleado / No tengo ningún ingreso",
  "Estoy desempleado y me mantienen mis padres",
  "Hago menos de $500 USD mes / Estoy desempleado",
  "Hago menos de $600,000",
  "Hago menos de $750 USD al mes",
  "Hago entre $300,000 y $750,000",
  "Hago entre $300,000 y $1,000,000 al mes",
  "Hago entre $500 USD y $750 USD al mes",
  "Hago entre $500 y $1,000 USD al mes",
  "Hago entre $750 USD y $1,000 USD al mes",
  "Hago entre $1,000 USD y $1,500 USD al mes",
  "Hago entre $1,000 y $1,500 USD al mes",
  "Hago entre $1,000 y $2,500 USD al mes",
  "Hago entre $1,500 USD y $2,000 USD al mes",
  "Hago entre $1,500 y $2,500 USD al mes",
  "Hago entre $2,000 USD y $2,500+ USD al mes",
  "Hago más de $2,500 USD al mes",
  "Hago entre $1,000,000 y $1,500,000 al mes",
  "Hago entre $1,000,000 y $2,000,000 al mes",
  "Hago entre $1,100,000 y $1,500,000 al mes",
  "Hago entre $1,500,000 y $2,000,000 al mes",
  "Hago entre $2,000,000 y $2,500,000 al mes",
  "Hago entre $2,000,000 y $3,000,000 al mes",
  "Hago entre $2,500,000 y $3,000,000+ al mes",
  "Hago más de $2,000,000 al mes",
  "Hago más de $3,000,000 al mes",
]
const INVERSION = [
  "No tengo para invertir ni siquiera $500 USD",
  "No tengo para invertir ni siquiera $500,000",
  "Menos de $600 USD",
  "Menos de $500,000",
  "Invertiría en algo de $450 a $650 USD",
  "Invertiría en algo de $500,000 a $800,000",
  "Invertiría $500,000 y sumaría algunos ahorros",
  "Tengo de $600 a $850",
  "Tengo de $850 a $1,200",
  "Tengo de $1,200 a $1,500",
  "Tengo más de $1500",
  "Podría juntar entre $1,000,000 y $1,500,000",
  "Tengo para invertir pero no se si aún",
  "Tengo para invertir pero no se si hacerlo aún",
  "Tengo para invertir pero no sé si hacerlo aún",
  "Quiero invertir no más de $1,000 USD",
  "Podría juntar entre $1,500 USD y $2,000 USD",
  "Invertiría entre $500 y $2,000 USD",
  "Invertiría entre $500,000 y $2,000,000",
  "Invertiría +$2,000 USD (Quiero lo mejor)",
  "Invertiría +$2,000 USD (Quiero trabajar 1-1)",
  "Invertiría +$2,000,000 (Quiero trabajar 1-1)",
  "No más de $950,000 o US$650 (Crédito o Débito)",
  "Entre $1,000,000 y $1,500,000 (Débito o Crédito)",
  "Entre $1,500,000 y $2,000,000 (Débito o Crédito)",
]

// Opciones VIGENTES (formulario nuevo de iClosed, desde julio 2026). Son las
// unicas que se ofrecen para elegir en agendas nuevas/editadas. Las listas de
// arriba (PROBLEMA, RESULTADO, PROFESION, INGRESOS, INVERSION) se mantienen
// completas — no se borra nada — para que las agendas viejas con esas
// respuestas se sigan viendo bien; `withCurrent()` inyecta el valor ya
// guardado de una agenda vieja si no esta en la lista vigente, asi el
// selector no lo muestra en blanco pero tampoco lo ofrece para elegir de cero.
const PROBLEMA_VIGENTE = [
  "No me animo a encarar a la que me gusta",
  "Encaro y hablo pero no logro escalar",
  "No salgo con las mujeres que me gustan",
  "Soy demasiado bueno y me ven como amigo",
]
const TIEMPO_PROBLEMA_VIGENTE = [
  "Es reciente, todavía no pasó nada grave",
  "Hace varios meses, ya molesta bastante seguido",
  "Hace +1 año, ya perdí muchas oportunidades",
  "Nunca lo pensé así, es más curiosidad",
]
const INTENTOS_PREVIOS_VIGENTE = [
  "Probé varias cosas y no logré sostenerlo",
  "Intenté algo, pero no en serio",
  "Nada concreto, prefiero que me guíen",
  "El problema es mi entorno, no yo",
]
const MOTIVO_URGENCIA_VIGENTE = [
  "Algo cambió hace poco y quiero resolver esto ahora",
  "Estoy cansado que se repita, quiero encararlo",
  "Me gustaría mejorar, sin apuro puntual",
  "Es más curiosidad que necesidad real",
]
const RESULTADO_VIGENTE = [
  "Animarme a encarar sin miedo ni ansiedad",
  "Salir con las mujeres que realmente me gustan",
  "Escalar y liderar más en mis interacciones",
  "Dejar de ser \"opción\" y que me elijan en serio",
]
const PROFESION_VIGENTE = [
  "Dueño de negocio (físico o digital)",
  "Marca personal / agencia / consultoría",
  "Empleado en relación de dependencia",
  "Profesional independiente / freelance",
  "Estoy desempleado / sin ingresos",
]
const INGRESOS_VIGENTE = [
  "Maso, hago entre $500 y $1.500 USD / mes",
  "No, hago menos de $350.000/mes",
  "Maso, hago entre $350.000 y $1.000.000 / mes",
  "Sí, hago entre $1.000.000 y $2.000.000 / mes",
  "Obvio, hago más de $2.000.000 ARS / mes",
  "No, hago menos de $500 USD /mes",
  "Sí, hago entre $1.500 y $3.000 USD / mes",
  "Obvio, hago más de $3.000 USD / mes",
]
const INVERSION_VIGENTE = [
  "Tengo, pero no sé si hacerlo aún",
  "No tengo para invertir ni $500.000",
  "Invertiría entre $500.000 y $2.000.000",
  "Invertiría +$3.000.000 (quiero lo más 1-1)",
  "Invertiría entre $500 y $2.000 USD",
  "Invertiría +$3.000 USD (quiero el mejor 1-1)",
  "No tengo para invertir ni $500 USD",
]

// Si el valor ya guardado no esta en la lista vigente (agenda vieja con una
// opcion que ya no se ofrece), lo agrega al final para que el selector lo
// siga mostrando seleccionado en vez de en blanco.
function withCurrent(vigentes: string[], valorActual: string | null | undefined): string[] {
  if (valorActual && !vigentes.includes(valorActual)) return [...vigentes, valorActual]
  return vigentes
}

// Colores definitivos de lead — sólidos, bien distinguibles del fondo blanco
const calColors: Record<string, string> = {
  S: "bg-violet-600 text-white border-violet-700",
  A: "bg-green-600 text-white border-green-700",
  B: "bg-yellow-400 text-black border-yellow-500",
  C: "bg-blue-600 text-white border-blue-700",
  D: "bg-red-600 text-white border-red-700",
}
// Colores de Ocupación (mismos que el Sheets)
const ocupColors = (v: string): string => ({
  "Negocio": "bg-green-600 text-white border-green-700",
  "Empleado": "bg-yellow-400 text-black border-yellow-500",
  "Estudiante": "bg-red-600 text-white border-red-700",
  "No se le envió": "bg-violet-600 text-white border-violet-700",
}[v] || "")

// Lead con show/cierre marcado pero al que le falta algun dato que le
// corresponde completar al closer — se marca con un asterisco rojo en la
// lista para que salte a la vista sin tener que abrir cada fila.
function faltantesCloser(a: Agenda): string[] {
  if (!a.show) return []
  if (a.cerro) {
    return [
      !a.estado && "Estado",
      !a.link_fathom && "Fathom",
      !a.operacion && "Operación",
      !a.plan_de_pago && "Plan de pago",
      !a.medio_de_pago && "Medio de pago",
      !a.comprobante && "Comprobante",
      !a.cc_dia_1 && "CC día 1",
    ].filter(Boolean) as string[]
  }
  return [!a.motivo_no_cierre && "Motivo", !a.link_fathom && "Fathom"].filter(Boolean) as string[]
}

function callYaOcurrio(a: Agenda) {
  const scheduled = a.fecha_closer ? new Date(a.fecha_closer).getTime() : NaN
  return Number.isFinite(scheduled) && scheduled <= Date.now()
}

// Solo campos manuales accionables. No incluye datos automáticos de iClosed ni
// Call Confirmer, que dejó de operar el 07/08/2026.
function faltantesManuales(a: Agenda): string[] {
  if (a.estado === "Cancelado") return []
  if (callYaOcurrio(a) && a.show == null) return ["Resultado (Show)"]
  return faltantesCloser(a)
}

async function patchAgenda(id: number, updates: Record<string, unknown>) {
  await fetch("/api/agendas", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...updates }),
  })
  await mutate((key: string) => typeof key === "string" && key.startsWith("/api/agendas"))
}

// ── Inline text: ancho fijo compacto (el valor completo se ve/edita al hacer foco)
function InlineText({ agendaId, field, value, placeholder, widthClass }: {
  agendaId: number; field: string; value: string | null; placeholder?: string; widthClass?: string
}) {
  const [v, setV] = useState(value || "")
  const [saving, setSaving] = useState(false)
  useEffect(() => { setV(value || "") }, [value])
  const handleBlur = async () => {
    const newVal = v.trim() || null
    if (newVal === (value?.trim() || null)) return
    setSaving(true)
    await patchAgenda(agendaId, { [field]: newVal })
    setSaving(false)
  }
  return (
    <div className="flex items-center gap-1">
      <input
        value={v}
        onChange={e => setV(e.target.value)}
        onBlur={handleBlur}
        placeholder={placeholder || "—"}
        title={v}
        className={cn("text-sm bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none", widthClass || "w-36")}
      />
      {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground flex-shrink-0" />}
    </div>
  )
}

// ── Inline number (edad)
function InlineNum({ agendaId, field, value }: { agendaId: number; field: string; value: number | null }) {
  const [v, setV] = useState(value != null ? String(value) : "")
  const [saving, setSaving] = useState(false)
  useEffect(() => { setV(value != null ? String(value) : "") }, [value])
  const handleBlur = async () => {
    const n = v.trim() === "" ? null : parseInt(v)
    if (n === (value ?? null)) return
    setSaving(true)
    await patchAgenda(agendaId, { [field]: n })
    setSaving(false)
  }
  return (
    <div className="flex items-center gap-1">
      <input type="number" value={v} onChange={e => setV(e.target.value)} onBlur={handleBlur} placeholder="—"
        className="text-sm bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none w-14" />
      {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
    </div>
  )
}

// ── Inline select: muestra el valor como botón liviano; monta el <Select> (pesado) SOLO al hacer clic
function InlineSel({ agendaId, field, value, options, getColor }: {
  agendaId: number; field: string; value: string | null | undefined
  options: string[]; getColor?: (v: string) => string
}) {
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const handleChange = async (v: string) => {
    setEditing(false); setSaving(true)
    await patchAgenda(agendaId, { [field]: v })
    setSaving(false)
  }
  if (saving) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
  const color = getColor ? getColor(value || "") : ""
  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)}
        className={cn(
          "h-7 text-xs px-2 border rounded min-w-[110px] w-auto inline-flex items-center whitespace-nowrap hover:opacity-80",
          color || "border-border text-foreground"
        )}>
        {value || "—"}
      </button>
    )
  }
  const opts = value && !options.includes(value) ? [value, ...options] : options
  return (
    <Select value={value || ""} defaultOpen onValueChange={handleChange} onOpenChange={(o) => { if (!o) setEditing(false) }}>
      <SelectTrigger className={cn(
        "h-7 text-xs px-2 border rounded min-w-[110px] w-auto focus:ring-0 gap-1 whitespace-nowrap",
        color || "border-border text-foreground"
      )}>
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>{opts.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
    </Select>
  )
}

// ── Inline calificación badge select
function InlineCalif({ agendaId, value }: { agendaId: number; value: string | null }) {
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const calKey = (v: string | null) => (v || "C").replace(/^lead\s*/i, "").trim() || "C"
  const handleChange = async (v: string) => {
    setEditing(false); setSaving(true)
    await patchAgenda(agendaId, { calificacion: v })
    setSaving(false)
  }
  if (saving) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
  const ck = calKey(value)
  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)}
        className={cn("h-7 text-xs px-2 border rounded w-[84px] font-semibold inline-flex items-center justify-center hover:opacity-80", calColors[ck] || calColors.C)}>
        {value || "LEAD C"}
      </button>
    )
  }
  return (
    <Select value={value || ""} defaultOpen onValueChange={handleChange} onOpenChange={(o) => { if (!o) setEditing(false) }}>
      <SelectTrigger className={cn("h-7 text-xs px-2 border rounded w-[84px] font-semibold focus:ring-0 gap-1 data-[placeholder]:text-white", calColors[ck] || calColors.C)}>
        <SelectValue placeholder="LEAD C" />
      </SelectTrigger>
      <SelectContent>{CALIFICACION.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
    </Select>
  )
}

// ── Inline date input
function InlineDate({ agendaId, field, value }: { agendaId: number; field: string; value: string | null }) {
  const [saving, setSaving] = useState(false)
  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value || null
    if (newVal === (value?.split("T")[0] || null)) return
    setSaving(true)
    await patchAgenda(agendaId, { [field]: newVal })
    setSaving(false)
  }
  return (
    <div className="flex items-center gap-1">
      <input type="date" defaultValue={value?.split("T")[0] || ""} onChange={handleChange}
        className="text-sm bg-transparent border border-transparent hover:border-border focus:border-primary focus:outline-none rounded px-1 cursor-pointer" />
      {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
    </div>
  )
}

// ── Modal helper components
function Req() { return <span className="text-red-500"> *</span> }

function Sel({ label, value, options, onChange, req }: { label: string; value: string | null | undefined; options: string[]; onChange: (v: string) => void; req?: boolean }) {
  const visibleOptions = value && !options.includes(value) ? [value, ...options] : options
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-muted-foreground">{label}{req && <Req />}</Label>
      <Select value={value || ""} onValueChange={onChange}>
        <SelectTrigger className={cn("h-11 rounded-xl bg-muted/35 text-sm shadow-sm", req && !value ? "border-red-500/50" : "")}><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
        <SelectContent>{visibleOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  )
}

function Txt({ label, value, onChange, placeholder, req }: { label: string; value: string | null | undefined; onChange: (v: string) => void; placeholder?: string; req?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-muted-foreground">{label}{req && <Req />}</Label>
      <Input className={cn("h-11 rounded-xl bg-muted/35 text-sm shadow-sm", req && !value ? "border-red-500/50" : "")} value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder || ""} />
    </div>
  )
}

// Campos tipo link (Comprobante, Fathom): si ya hay un link cargado, se ve
// como un boton que abre directo en una pestaña nueva en vez de un cuadro de
// texto — con un lapiz al lado para editarlo si hace falta cambiarlo.
function LinkField({ label, value, onChange, req, cta }: { label: string; value: string | null | undefined; onChange: (v: string) => void; req?: boolean; cta: string }) {
  const [editing, setEditing] = useState(false)
  const isUrl = !!value && /^https?:\/\//.test(value)
  if (isUrl && !editing) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{label}{req && <Req />}</Label>
        <div className="flex items-center gap-2">
          <a href={value as string} target="_blank" rel="noopener noreferrer"
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-md border border-primary/40 text-primary bg-primary/5 hover:bg-primary/10 text-sm font-medium">
            <ExternalLink className="h-3.5 w-3.5" /> {cta}
          </a>
          <button type="button" onClick={() => setEditing(true)} title="Editar link"
            className="h-9 w-9 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted">
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}{req && <Req />}</Label>
      <Input
        className={cn("h-9 text-sm", req && !value ? "border-red-500\\50" : "")}
        value={value || ""}
        onChange={e => onChange(e.target.value)}
        onBlur={() => { if (/^https?:\/\//.test(value || "")) setEditing(false) }}
        placeholder="https://..."
      />
    </div>
  )
}

function TxtArea({ label, value, onChange, rows, req }: { label: string; value: string | null | undefined; onChange: (v: string) => void; rows?: number; req?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-muted-foreground">{label}{req && <Req />}</Label>
      <Textarea className={cn("resize-none rounded-xl bg-muted/35 text-sm shadow-sm", req && !value ? "border-red-500/50" : "")} rows={rows || 3} value={value || ""} onChange={e => onChange(e.target.value)} />
    </div>
  )
}

function ResultChoice({ value, estado, onChange }: { value: boolean | null | undefined; estado?: string | null; onChange: (v: "pendiente" | "si" | "no" | "cancelado") => void }) {
  const selected = estado === "Cancelado" ? "cancelado" : value === true ? "si" : value === false ? "no" : "pendiente"
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">Show</Label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button type="button" onClick={() => onChange("pendiente")} className={cn("rounded-xl border py-2.5 text-xs font-bold transition-all", selected === "pendiente" ? "border-amber-500/30 bg-amber-500/10 text-amber-700 shadow-sm" : "border-border text-muted-foreground hover:bg-muted")}>PENDIENTE</button>
        <button type="button" onClick={() => onChange("si")} className={cn("rounded-xl border py-2.5 text-xs font-bold transition-all", selected === "si" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 shadow-sm" : "border-border text-muted-foreground hover:bg-muted")}>SÍ</button>
        <button type="button" onClick={() => onChange("no")} className={cn("rounded-xl border py-2.5 text-xs font-bold transition-all", selected === "no" ? "border-red-500/30 bg-red-500/10 text-red-600 shadow-sm" : "border-border text-muted-foreground hover:bg-muted")}>NO</button>
        <button type="button" onClick={() => onChange("cancelado")} className={cn("rounded-xl border px-2 py-2.5 text-xs font-bold transition-all", selected === "cancelado" ? "border-slate-500/30 bg-slate-500/10 text-slate-600 shadow-sm" : "border-border text-muted-foreground hover:bg-muted")}>CANCELADO POR TRIAGE</button>
      </div>
    </div>
  )
}

function YesNo({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">{label}</Label><div className="flex gap-2">
    <button type="button" onClick={() => onChange(true)} className={cn("flex-1 rounded-xl border py-2.5 text-sm font-bold", value ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" : "border-border text-muted-foreground")}>Sí</button>
    <button type="button" onClick={() => onChange(false)} className={cn("flex-1 rounded-xl border py-2.5 text-sm font-bold", !value ? "border-red-500/30 bg-red-500/10 text-red-600" : "border-border text-muted-foreground")}>No</button>
  </div></div>
}

// Section separator — only the title carries the color
function Sec({ title, role, hint }: { title: string; role?: "setter" | "precaller" | "closer" | "auto"; hint?: string }) {
  const tag = role === "precaller" ? { txt: "PRECALLER", color: "text-emerald-700", border: "border-emerald-500/20", bg: "bg-emerald-500/10", grad: "from-emerald-500 to-teal-400", icon: CalendarClock }
            : role === "setter" ? { txt: "SETTER + ASIGNACIÓN", color: "text-blue-600", border: "border-blue-500/20", bg: "bg-blue-500/10", grad: "from-blue-500 to-cyan-400", icon: UserCheck }
            : role === "closer" ? { txt: "CLOSER", color: "text-red-600", border: "border-red-500/20", bg: "bg-red-500/10", grad: "from-red-500 to-orange-400", icon: UserRound }
            : role === "auto"   ? { txt: "DECLARADO POR EL LEAD", color: "text-violet-600", border: "border-violet-500/20", bg: "bg-violet-500/10", grad: "from-violet-500 to-fuchsia-400", icon: Sparkles }
            : null
  const Icon = tag?.icon || FileText
  return (
    <div className={cn("mt-7 mb-4 flex items-center gap-3 rounded-2xl border p-3.5 shadow-sm", tag ? `${tag.border} ${tag.bg}` : "border-border bg-muted/35")}>
      <span className={cn("grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br text-white shadow-md", tag?.grad || "from-zinc-500 to-zinc-700")}><Icon className="h-4 w-4" /></span>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div><p className="text-sm font-black tracking-tight">{title}</p>{tag && <p className={cn("mt-0.5 text-[9px] font-bold uppercase tracking-[.18em]", tag.color)}>{tag.txt}</p>}</div>
        {hint && <HelpHint text={hint} />}
      </div>
    </div>
  )
}

function StepHeading({ icon: Icon, title, detail }: { icon: typeof UserRound; title: string; detail: string }) {
  return <div className="flex items-center gap-3"><span className="metal-icon grid h-11 w-11 place-items-center rounded-2xl"><Icon className="h-5 w-5" /></span><div><h3 className="text-lg font-black tracking-tight">{title}</h3><p className="text-xs text-muted-foreground">{detail}</p></div></div>
}

// ── Column stats popover
function ColStats({ data, label, getVal }: {
  data: Agenda[]; label: string; getVal: (a: Agenda) => string | null | undefined
}) {
  const counts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const row of data) {
      const raw = getVal(row)
      const val = (raw === null || raw === undefined || raw === "") ? "(sin dato)" : String(raw)
      map[val] = (map[val] || 0) + 1
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [data, getVal])
  const total = data.length
  const max = counts[0]?.[1] || 1
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="ml-1 text-white/60 hover:text-white transition-colors" onClick={e => e.stopPropagation()}>
          <BarChart2 className="h-3 w-3 inline" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <p className="text-xs font-semibold uppercase tracking-wide mb-3 text-muted-foreground">{label} — distribución</p>
        <div className="space-y-2">
          {counts.slice(0, 15).map(([val, count]) => (
            <div key={val} className="space-y-0.5">
              <div className="flex justify-between text-xs">
                <span className="truncate max-w-[160px]">{val}</span>
                <span className="text-muted-foreground ml-2 flex-shrink-0">{count} · {Math.round(count / total * 100)}%</span>
              </div>
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary/60" style={{ width: `${count / max * 100}%` }} />
              </div>
            </div>
          ))}
          {counts.length > 15 && <p className="text-xs text-muted-foreground">+{counts.length - 15} más…</p>}
        </div>
        <p className="text-xs text-muted-foreground mt-3 pt-2 border-t border-border">Total en vista: {total}</p>
      </PopoverContent>
    </Popover>
  )
}

// ── Filters
type AgendaFilters = {
  closer: string[]; setter: string[]; cuenta: string[]; calificacion: string[]; fuente: string[]
  call_confirmer: string[]; show: string[]; cerro: string[]
  ocupacion: string[]; manychat: string[]; faltantes: string[]
}
const EMPTY_AG_FILTERS: AgendaFilters = {
  closer: [], setter: [], cuenta: [], calificacion: [], fuente: [],
  call_confirmer: [], show: [], cerro: [], ocupacion: [], manychat: [], faltantes: []
}

function FilterSel({ label, value, options, onToggle, onClear }: {
  label: string; value: string[]; options: string[]; onToggle: (v: string) => void; onClear: () => void
}) {
  const count = value.length
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "h-8 w-full text-xs px-2 rounded-md border flex items-center justify-between gap-1 bg-background",
              count ? "border-primary/50 text-primary" : "border-input text-muted-foreground"
            )}
          >
            <span className="truncate">
              {count === 0 ? "Todos" : count === 1 ? value[0] : `${count} seleccionados`}
            </span>
            <ChevronDown className="h-3 w-3 opacity-50 flex-shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-48 p-1 max-h-72 overflow-auto">
          {count > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="flex items-center gap-2 w-full text-left text-xs px-2 py-1.5 rounded text-muted-foreground hover:bg-muted"
            >
              <X className="h-3 w-3" /> Limpiar
            </button>
          )}
          {options.map(o => {
            const sel = value.includes(o)
            return (
              <button
                key={o}
                type="button"
                onClick={() => onToggle(o)}
                className={cn(
                  "flex items-center gap-2 w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted whitespace-nowrap",
                  sel ? "text-primary font-medium" : ""
                )}
              >
                <span
                  className={cn(
                    "h-3.5 w-3.5 rounded border flex items-center justify-center flex-shrink-0",
                    sel ? "bg-primary border-primary" : "border-input"
                  )}
                >
                  {sel && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                </span>
                {o}
              </button>
            )
          })}
        </PopoverContent>
      </Popover>
    </div>
  )
}

function filterToParams(filter: string): string {
  if (!filter || filter === "all") return ""
  if (filter.startsWith("range:")) { const [s,e]=filter.slice(6).split(":"); return `?start=${s}&end=${e}` }
  const now=new Date(); const today=new Date(now.getFullYear(),now.getMonth(),now.getDate())
  const iso=(d:Date)=>d.toISOString().split("T")[0]
  if (filter.startsWith("month:")) { const [y,m]=filter.slice(6).split("-").map(Number); return `?start=${iso(new Date(y,m-1,1))}&end=${iso(new Date(y,m,0))}` }
  return ""
}

const TH = "text-xs font-semibold uppercase text-white whitespace-nowrap"

const leadGrade = (value?: string | null) => (value || "").replace(/^LEAD\s*/i, "").trim() || "—"
const leadStatus = (a: Agenda) => {
  if (a.estado === "Fee") return { label: "Fee", emoji: "💳", tone: "border-violet-400/25 bg-violet-500/10 text-violet-700 dark:text-violet-300" }
  if (a.cerro) return { label: "Trato cerrado", emoji: "🤝", tone: "border-emerald-400/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" }
  if (a.estado === "No Show") return { label: "No se presentó", emoji: "🚫", tone: "border-slate-400/25 bg-slate-500/10 text-slate-700 dark:text-slate-300" }
  if (a.show) return { label: a.estado || "Se presentó", emoji: "✅", tone: "border-blue-400/25 bg-blue-500/10 text-blue-700 dark:text-blue-300" }
  if (/cancelad|se cancelo/i.test(a.call_confirmer || "")) return { label: "Cancelada", emoji: "⛔", tone: "border-red-400/25 bg-red-500/10 text-red-700 dark:text-red-300" }
  if (/confirmad/i.test(a.call_confirmer || "")) return { label: "Confirmada", emoji: "📌", tone: "border-cyan-400/25 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300" }
  if (/no respond/i.test(a.call_confirmer || "")) return { label: "Nunca respondió", emoji: "📵", tone: "border-slate-400/25 bg-slate-500/10 text-slate-700 dark:text-slate-300" }
  return { label: a.call_confirmer || "Pendiente", emoji: "⏳", tone: "border-zinc-400/25 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300" }
}

export default function CentroAgendasPage() {
  // Arranca en el mes actual (no "all") para no disparar la consulta de 1000 filas al abrir
  const [dateFilter, setDateFilter] = useState(() => {
    const n = new Date()
    return `month:${n.getFullYear()}-${n.getMonth() + 1}`
  })
  const params = filterToParams(dateFilter)
  const { data: agendas = [], isLoading, error } = useSWR<Agenda[]>(`/api/agendas${params}${params ? "&" : "?"}light=1`, fetcher)
  const [editing, setEditing] = useState<Agenda | null>(null)
  const { rol, email } = useSession()
  const canExport = canExportAgendas(rol, email)
  const [form, setForm] = useState<Partial<Agenda>>({})
  const [modalErr, setModalErr] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [chatLead, setChatLead] = useState<Agenda | null>(null)
  const [chatText, setChatText] = useState("")
  const [chatSaving, setChatSaving] = useState(false)
  const [colFilters, setColFilters] = useState<AgendaFilters>(EMPTY_AG_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState<"date_desc" | "date_asc" | "closer" | "lead">("date_desc")
  // Si llegamos desde Métricas con ?q=nombre (clic en una fila del detalle),
  // precargamos la búsqueda. Se lee del navegador, no de useSearchParams, para
  // no tener que envolver toda la página en un Suspense boundary.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q")
    if (q) setSearch(q)
  }, [])
  const [newOpen, setNewOpen] = useState(false)
  const [newForm, setNewForm] = useState<Partial<Agenda>>({})
  const [newStep, setNewStep] = useState(1)
  const [newErr, setNewErr] = useState<string | null>(null)
  const [newSaving, setNewSaving] = useState(false)

  const activeFilterCount = useMemo(() => Object.values(colFilters).filter(v => v.length > 0).length, [colFilters])
  const setFilt = (k: keyof AgendaFilters, v: string) => setColFilters(p => {
    const cur = p[k]
    return { ...p, [k]: cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v] }
  })
  const clearFilt = (k: keyof AgendaFilters) => setColFilters(p => ({ ...p, [k]: [] }))

  const filtered = useMemo(() => {
    const f = colFilters
    const q = search.trim().toLowerCase()
    const rows = agendas.filter(a => {
      if (q && !(a.nombre || "").toLowerCase().includes(q) && !(a.instagram || "").toLowerCase().includes(q)) return false
      if (f.closer.length && !f.closer.includes(a.closer || "")) return false
      if (f.setter.length && !f.setter.includes(a.setter || "")) return false
      if (f.cuenta.length && !f.cuenta.includes((a as any).cuenta || "")) return false
      if (f.calificacion.length && !f.calificacion.includes(a.calificacion || "")) return false
      if (f.fuente.length && !f.fuente.includes(a.fuente || "")) return false
      if (f.call_confirmer.length && !f.call_confirmer.includes(a.call_confirmer || "")) return false
      const showValue = a.estado === "Cancelado" ? "cancelado" : a.show === true ? "si" : a.show === false ? "no" : "pendiente"
      if (f.show.length && !f.show.includes(showValue)) return false
      if (f.cerro.length && !f.cerro.includes(a.cerro ? "si" : "no")) return false
      if (f.ocupacion.length && !f.ocupacion.includes((a as any).ocupacion || "")) return false
      if (f.manychat.length && !f.manychat.includes((a as any).manychat || "")) return false
      if (f.faltantes.length) {
        const missing = faltantesManuales(a)
        const matches = f.faltantes.some(value =>
          value === "Cualquier dato manual" ? missing.length > 0
          : value === "Resultado sin cargar" ? missing.includes("Resultado (Show)")
          : value === "Datos posteriores a la call" ? missing.length > 0 && !missing.includes("Resultado (Show)")
          : false
        )
        if (!matches) return false
      }
      return true
    })
    return rows.sort((a, b) => {
      if (sortBy === "closer") return (a.closer || "").localeCompare(b.closer || "", "es")
      if (sortBy === "lead") return (a.nombre || "").localeCompare(b.nombre || "", "es")
      const delta = String(a.fecha_agenda || "").localeCompare(String(b.fecha_agenda || ""))
      return sortBy === "date_asc" ? delta : -delta
    })
  }, [agendas, colFilters, search, sortBy])

  // Paginado client-side (sobre el resultado ya filtrado) para no dibujar cientos de filas juntas
  const PAGE_SIZE = 50
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  useEffect(() => { setPage(1) }, [colFilters, search, dateFilter])
  const safePage = Math.min(page, totalPages)
  const paged = useMemo(() => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), [filtered, safePage])

  // El export necesita TODOS los campos (resumen_chat, ia_analisis, etc.) que
  // la lista liviana (light=1) no trae — por eso pide la data completa aparte,
  // solo al momento de exportar, y aplica el mismo filtro visible. La paginación
  // es únicamente de pantalla: el archivo siempre incluye todo el resultado filtrado.
  const exportAgendas = async (format: "csv" | "xlsx") => {
    setExporting(true)
    try {
      const full: Agenda[] = await fetch(`/api/agendas${params}`).then(r => r.json())
      const fullById = new Map(full.map(agenda => [String(agenda.id), agenda]))
      const fullFiltered = filtered.map(agenda => fullById.get(String(agenda.id)) || agenda)
      const filename = `agendas_filtradas_${new Date().toISOString().slice(0, 10)}`
      if (format === "csv") exportRowsToCSV(fullFiltered, AGENDAS_CSV_COLUMNS, filename)
      else await exportRowsToXLSX(fullFiltered, AGENDAS_CSV_COLUMNS, filename)
    } finally {
      setExporting(false)
    }
  }

  const openEdit = async (a: Agenda) => {
    setEditing(a); setForm({ ...a })
    // La lista viene liviana (sin ia_analisis, etc.). Traigo la fila completa para el modal.
    try {
      const full = await fetch(`/api/agendas?id=${a.id}`).then(r => r.json())
      if (full && full.id) {
        // Mantener también el encabezado sincronizado con la ficha cargada.
        // Es esencial al usar “Guardar y siguiente”, donde cambia el registro
        // sin que el usuario cierre manualmente el flujo.
        setEditing({ ...full })
        setForm({ ...full })
      }
    } catch {}
  }
  const setF = (k: keyof Agenda, v: unknown) => setForm(p => ({ ...p, [k]: v }))

  const pendingRows = useMemo(() => filtered.filter(a => faltantesManuales(a).length > 0), [filtered])
  const pendingPosition = editing ? pendingRows.findIndex(a => a.id === editing.id) : -1

  const handleSave = async (goNext = false) => {
    if (!editing?.id) return
    const id = editing.id
    // --- Validacion por rol (obligatorios) ---
    const s = !!form.show, c = !!form.cerro
    const miss: string[] = []
    if (rol === "Precaller") {
      if (!form.call_confirmer) miss.push("Call Confirmer")
      if (!form.info_call_triage) miss.push("Info Call Triage")
    }
    if (rol === "Closer") {
      if (s && c) {
        if (!form.estado) miss.push("Estado")
        if (!form.link_fathom) miss.push("Link Fathom")
        if (!form.operacion) miss.push("Operación")
        if (!form.plan_de_pago) miss.push("Plan de Pago (PPP)")
        if (!form.medio_de_pago) miss.push("Medio de Pago")
        if (!form.comprobante) miss.push("Comprobante")
        if (!form.cc_dia_1) miss.push("CC Día 1")
      } else if (s && !c) {
        if (!form.motivo_no_cierre) miss.push("Motivo No Cierre")
        if (!form.link_fathom) miss.push("Link Fathom")
        if (form.seguimiento_fecha && !form.seguimiento_nota) miss.push("Nota de seguimiento")
        if (form.seguimiento_nota && !form.seguimiento_fecha) miss.push("Fecha de seguimiento")
      }
    }
    if (miss.length > 0) {
      setModalErr("Faltan completar: " + miss.join(", ") + ".")
      return
    }
    setModalErr(null)
    setSaving(true)
    const { id: _discard, ...updateFields } = form
    if (form.show === false) {
      updateFields.show = false
      updateFields.cerro = false
      updateFields.estado = "No Show"
      updateFields.motivo_no_cierre = null
    } else if (form.show === true && updateFields.estado === "No Show") {
      updateFields.estado = null
    }
    const saveResponse = await fetch("/api/agendas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updateFields }),
    })
    const savePayload = await saveResponse.json().catch(() => null)
    if (!saveResponse.ok) {
      setSaving(false)
      setModalErr(savePayload?.error || "No se guardaron los cambios. Volvé a intentar.")
      return
    }
    await mutate((key: string) => typeof key === "string" && key.startsWith("/api/agendas"))
    const nextAgenda = goNext
      ? pendingRows.find(a => a.id !== id && String(a.fecha_closer || "").localeCompare(String(editing.fecha_closer || "")) >= 0)
        || pendingRows.find(a => a.id !== id)
      : null
    setSaving(false)
    if (nextAgenda) {
      // Radix puede conservar el contenido del modal anterior si cambiamos de
      // registro en el mismo ciclo del guardado. Cerrarlo y reabrirlo fuerza
      // una ficha limpia y evita que el nombre anterior quede visible.
      setEditing(null)
      setForm({})
      setModalErr(null)
      window.setTimeout(() => { void openEdit(nextAgenda) }, 80)
    } else { setEditing(null); setForm({}) }
  }
  const handleClose = () => { setEditing(null); setForm({}); setModalErr(null) }
  const handleArchive = async () => {
    if (!editing?.id) return
    const reason = window.prompt(`¿Por qué archivás la agenda de "${editing.nombre}"?\n\nNo se borra: queda auditada y deja de contar en todas las métricas.`)
    if (reason === null) return
    if (!reason.trim()) return setModalErr("Indicá el motivo para archivar la agenda.")
    setArchiving(true)
    setModalErr(null)
    const response = await fetch("/api/agendas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editing.id, archive: true, reason: reason.trim() }) })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      setArchiving(false)
      return setModalErr(payload?.error || "No se pudo archivar la agenda.")
    }
    await mutate((key: string) => typeof key === "string" && key.startsWith("/api/agendas"))
    setArchiving(false)
    handleClose()
  }

  // ── Nueva agenda a mano (leads que se agendaron "por izquierda", fuera de iClosed)
  const setNewF = (k: keyof Agenda, v: unknown) => setNewForm(p => ({ ...p, [k]: v }))
  const manualMatches = useMemo(() => {
    const query = norm(newForm.nombre || "")
    if (query.length < 2) return []
    const seen = new Set<string>()
    return agendas
      .filter(a => norm(a.nombre || "").includes(query) || norm(a.telefono || "").includes(query) || norm(a.email || "").includes(query) || norm(a.instagram || "").includes(query))
      .filter(a => { const key = (a.telefono || norm(a.nombre || "")); if (seen.has(key)) return false; seen.add(key); return true })
      .slice(0, 6)
  }, [agendas, newForm.nombre])
  const chooseExistingLead = (lead: Agenda) => {
    setNewForm(current => ({
      ...current,
      nombre: lead.nombre,
      email: lead.email,
      telefono: lead.telefono,
      instagram: lead.instagram,
      edad: lead.edad,
      calificacion: lead.calificacion,
      fuente: lead.fuente,
      ocupacion: lead.ocupacion,
      manychat: lead.manychat,
      puntos_contacto: lead.puntos_contacto,
    }))
    setNewErr(null)
  }
  const closeNew = () => { setNewOpen(false); setNewForm({}); setNewStep(1); setNewErr(null) }
  const handleCreateNew = async () => {
    if (!newForm.nombre?.trim()) { setNewErr("Falta el nombre."); return }
    if (!newForm.fecha_agenda) { setNewErr("Falta la fecha de agenda."); return }
    setNewErr(null); setNewSaving(true)
    const res = await fetch("/api/agendas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newForm),
    })
    setNewSaving(false)
    if (!res.ok) { const j = await res.json().catch(() => ({})); setNewErr(j.error || "Error al guardar."); return }
    await mutate((key: string) => typeof key === "string" && key.startsWith("/api/agendas"))
    closeNew()
  }

  const openChat = async (a: Agenda) => {
    setChatLead(a); setChatText(((a as any).resumen_chat as string) || "")
    // La lista viene sin resumen_chat (es pesado). Traigo la fila completa.
    try {
      const full = await fetch(`/api/agendas?id=${a.id}`).then(r => r.json())
      if (full && full.id) setChatText((full.resumen_chat as string) || "")
    } catch {}
  }
  const saveChat = async () => {
    if (!chatLead?.id) return
    setChatSaving(true)
    await patchAgenda(chatLead.id, { resumen_chat: chatText.trim() || null } as any)
    setChatSaving(false); setChatLead(null)
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Centro Agendas</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" className="h-10 gap-2 rounded-xl bg-gradient-to-r from-red-600 to-orange-500 px-4 shadow-lg shadow-red-500/20 hover:shadow-xl" onClick={() => { setNewForm({}); setNewStep(1); setNewErr(null); setNewOpen(true) }}>
            <span className="grid h-6 w-6 place-items-center rounded-lg bg-white/15"><Plus className="h-3.5 w-3.5" /></span>Agenda Manual
          </Button>
          <DateFilter onFilterChange={setDateFilter} />
        </div>
      </div>

      <Card className="overflow-hidden border-white/70 bg-white/65 shadow-xl shadow-black/[.04] backdrop-blur-xl dark:border-white/10 dark:bg-white/[.035]">
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-lg font-black tracking-tight whitespace-nowrap"><span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 text-lg shadow-lg shadow-blue-500/20">🗓️</span>Vista de agendas</CardTitle>
            {!isLoading && !error && agendas.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar lead..."
                    className="h-8 w-44 sm:w-52 pl-8 pr-7 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  {search && (
                    <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <button onClick={() => setFiltersOpen(o => !o)}
                  className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors",
                    activeFilterCount > 0 ? "bg-primary/10 text-primary border-primary/30" : "border-border text-muted-foreground hover:bg-muted")}>
                  <Filter className="h-3.5 w-3.5" />Filtros
                  {activeFilterCount > 0 && (
                    <span className="bg-primary text-primary-foreground text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold leading-none">{activeFilterCount}</span>
                  )}
                </button>
                <select aria-label="Orden local" value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} className="h-8 rounded-lg border border-border bg-background px-2 text-xs font-bold">
                  <option value="date_desc">Más recientes</option>
                  <option value="date_asc">Más antiguas</option>
                  <option value="closer">Por closer</option>
                  <option value="lead">Por lead</option>
                </select>
                {activeFilterCount > 0 && (
                  <button onClick={() => setColFilters(EMPTY_AG_FILTERS)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <X className="h-3 w-3" />Limpiar
                  </button>
                )}
                <span className="text-xs text-muted-foreground">{filtered.length} de {agendas.length}</span>
                {canExport && <button
                  onClick={() => exportAgendas("csv")}
                  disabled={exporting}
                  title="Exporta todas las agendas filtradas a CSV, aunque estén divididas en varias páginas"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50">
                  {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Exportar CSV
                </button>}
                {canExport && <button
                  onClick={() => exportAgendas("xlsx")}
                  disabled={exporting}
                  title="Exporta todas las agendas filtradas a Excel, aunque estén divididas en varias páginas"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50">
                  {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Exportar Excel
                </button>}
                {totalPages > 1 && (
                  <div className="flex items-center gap-1 ml-2">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1}
                      className="px-2 py-0.5 text-xs rounded border border-border disabled:opacity-40 hover:bg-muted">‹</button>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">Pág {safePage}/{totalPages}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}
                      className="px-2 py-0.5 text-xs rounded border border-border disabled:opacity-40 hover:bg-muted">›</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          {!isLoading && !error && agendas.length > 0 && filtersOpen && (
            <div className="mb-4">
              <div className="p-4 bg-muted/30 border border-border rounded-lg grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <FilterSel label="Closer" value={colFilters.closer} options={CLOSERS} onToggle={v => setFilt("closer", v)} onClear={() => clearFilt("closer")} />
                <FilterSel label="Cuenta" value={colFilters.cuenta} options={CUENTA} onToggle={v => setFilt("cuenta", v)} onClear={() => clearFilt("cuenta")} />
                <FilterSel label="Setter" value={colFilters.setter} options={SETTERS} onToggle={v => setFilt("setter", v)} onClear={() => clearFilt("setter")} />
                <FilterSel label="Calificación" value={colFilters.calificacion} options={CALIFICACION} onToggle={v => setFilt("calificacion", v)} onClear={() => clearFilt("calificacion")} />
                <FuenteFilter value={colFilters.fuente} onToggle={v => setFilt("fuente", v)} onClear={() => clearFilt("fuente")} />
                <FilterSel label="Call Confirmer" value={colFilters.call_confirmer} options={CALL_CONFIRMER} onToggle={v => setFilt("call_confirmer", v)} onClear={() => clearFilt("call_confirmer")} />
                <FilterSel label="Show" value={colFilters.show} options={["pendiente","si","no","cancelado"]} onToggle={v => setFilt("show", v)} onClear={() => clearFilt("show")} />
                <FilterSel label="Cerró" value={colFilters.cerro} options={["si","no"]} onToggle={v => setFilt("cerro", v)} onClear={() => clearFilt("cerro")} />
                <FilterSel label="Ocupación" value={colFilters.ocupacion} options={OCUPACION} onToggle={v => setFilt("ocupacion", v)} onClear={() => clearFilt("ocupacion")} />
                <FilterSel label="Manychat" value={colFilters.manychat} options={MANYCHAT_OPTS} onToggle={v => setFilt("manychat", v)} onClear={() => clearFilt("manychat")} />
                <FilterSel label="Datos faltantes" value={colFilters.faltantes} options={["Resultado sin cargar","Datos posteriores a la call","Cualquier dato manual"]} onToggle={v => setFilt("faltantes", v)} onClear={() => clearFilt("faltantes")} />
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : error ? (
            <div className="text-center py-12 text-muted-foreground">Error al cargar agendas</div>
          ) : agendas.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No hay agendas en este periodo</div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 2xl:grid-cols-2">
              {paged.map((a) => {
                const status = leadStatus(a)
                const grade = leadGrade(a.calificacion)
                const faltantes = faltantesManuales(a)
                return <article key={a.id} className="group relative overflow-hidden rounded-[20px] border border-white/80 bg-gradient-to-br from-white via-white to-zinc-50/80 p-3 shadow-sm shadow-black/[.035] transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-300/60 hover:shadow-lg hover:shadow-blue-500/[.08] dark:border-white/10 dark:from-white/[.075] dark:via-white/[.045] dark:to-white/[.02]">
                  <div className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-gradient-to-b from-blue-500 to-cyan-400 opacity-70" />
                  <div className="flex min-w-0 items-start gap-3 pl-1">
                    <div className={cn(
                      "grid h-11 w-11 shrink-0 place-items-center rounded-2xl border text-xl font-black shadow-md shadow-black/[.07]",
                      calColors[grade] || "border-zinc-300 bg-zinc-100 text-zinc-500 dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-400",
                    )} title={grade === "—" ? "Calificación pendiente de iClosed" : `Lead ${grade}`}>
                      {grade === "—" ? "—" : grade}
                    </div>

                    <div className="min-w-0 flex-1 pr-20">
                      <div className="flex min-w-0 items-center gap-2">
                        <h3 className="truncate text-sm font-black tracking-tight">{a.nombre || "Lead sin nombre"}</h3>
                        {faltantes.length > 0 && <span title={`Falta: ${faltantes.join(", ")}`} className="shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-black text-white">* FALTA {faltantes.join(" · ")}</span>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{a.telefono || "Sin teléfono"}</span>
                        <span className="flex items-center gap-1"><Instagram className="h-3 w-3" />{a.instagram || "Sin Instagram"}</span>
                      </div>
                    </div>

                    <button onClick={() => openEdit(a)} className="absolute right-3 top-3 flex h-9 items-center gap-1.5 rounded-xl border border-blue-400/20 bg-blue-500 px-3 text-xs font-bold text-white shadow-md shadow-blue-500/20 transition hover:scale-[1.03] hover:bg-blue-600" title={`Editar a ${a.nombre}`}>
                      <Pencil className="h-3.5 w-3.5" /><span>Editar</span>
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
                    <div className="min-w-0 rounded-xl border border-black/[.045] bg-black/[.025] px-2.5 py-2 dark:border-white/[.05] dark:bg-white/[.035]">
                      <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground"><CalendarClock className="h-3 w-3" />Agenda</span>
                      <p className="mt-0.5 truncate text-[11px] font-bold">{formatDate(a.fecha_agenda)}</p>
                    </div>
                    <div className="min-w-0 rounded-xl border border-black/[.045] bg-black/[.025] px-2.5 py-2 dark:border-white/[.05] dark:bg-white/[.035]">
                      <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground"><CalendarClock className="h-3 w-3" />Llamada</span>
                      <p className="mt-0.5 truncate text-[11px] font-bold">{formatDate(a.fecha_closer)}</p>
                    </div>
                    <div className="min-w-0 rounded-xl border border-black/[.045] bg-black/[.025] px-2.5 py-2 dark:border-white/[.05] dark:bg-white/[.035]">
                      <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground"><UserCheck className="h-3 w-3" />Equipo</span>
                      <p className="mt-0.5 truncate text-[11px] font-bold">{a.closer || "Sin closer"} · {a.setter || "Sin setter"}</p>
                    </div>
                    <div className="min-w-0 rounded-xl border border-black/[.045] bg-black/[.025] px-2.5 py-2 dark:border-white/[.05] dark:bg-white/[.035]">
                      <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground"><BriefcaseBusiness className="h-3 w-3" />Origen</span>
                      <p className={cn("mt-0.5 truncate text-[11px] font-bold", !a.fuente && "text-red-500")}>{a.fuente || "Pendiente"}</p>
                    </div>
                    <button onClick={() => openChat(a)} className="min-w-0 rounded-xl border border-black/[.045] bg-black/[.025] px-2.5 py-2 text-left transition hover:bg-blue-500/10 dark:border-white/[.05] dark:bg-white/[.035]">
                      <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground"><MessageSquareText className="h-3 w-3" />Chat</span>
                      <p className={cn("mt-0.5 truncate text-[11px] font-bold", (a as any)._has_resumen ? "text-blue-600 dark:text-blue-300" : "text-red-500")}>{(a as any)._has_resumen ? "Ver resumen" : "Pendiente"}</p>
                    </button>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold", status.tone)}><span>{status.emoji}</span>{status.label}</span>
                    <span className="max-w-[48%] truncate text-[10px] text-muted-foreground">{(a as any).ocupacion || "Sin ocupación cargada"}</span>
                  </div>
                  {!isNoPrecallerAgenda(a) && (!(a as any)._has_precall || !a.call_confirmer) && <div className="mt-2 flex flex-wrap gap-1.5">
                    {!(a as any)._has_precall && <span className="rounded-full border border-red-500/25 bg-red-500/10 px-2 py-1 text-[10px] font-black text-red-500">Precall · Pendiente</span>}
                    {!a.call_confirmer && <span className="rounded-full border border-red-500/25 bg-red-500/10 px-2 py-1 text-[10px] font-black text-red-500">Confirmación · Pendiente</span>}
                  </div>}
                </article>
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resumen de Chat modal */}
      <Dialog open={!!chatLead} onOpenChange={(o) => { if (!o) setChatLead(null) }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="sticky -top-6 z-20 bg-card pt-6 pb-3 -mt-6 border-b border-border">
            <div className="flex items-center justify-between gap-2 pr-6">
              <DialogTitle className="text-lg">Resumen de chat: {chatLead?.nombre}</DialogTitle>
              <button onClick={() => setChatLead(null)} className="absolute right-4 top-5 text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
          </DialogHeader>
          <Textarea className="text-sm min-h-[55vh] resize-none" value={chatText} onChange={e => setChatText(e.target.value)}
            placeholder="Pegá acá el resumen del chat con el lead..." />
          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" onClick={() => setChatLead(null)}>Cancelar</Button>
            <Button onClick={saveChat} disabled={chatSaving}>
              {chatSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</> : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal — Pre-Call (precaller) + Resultado (closer) + iClosed (auto) */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) handleClose() }}>
        <DialogContent className="grid max-h-[92dvh] max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden border-white/60 bg-background/95 p-0 shadow-2xl backdrop-blur-2xl dark:border-white/10">
          <DialogHeader className="z-20 border-b border-white/10 bg-[#151217]/95 px-6 pb-5 pt-6 text-white backdrop-blur-2xl">
            <div className="flex items-center justify-between gap-2 pr-6">
              <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-red-500 to-orange-400 font-black shadow-lg">{editing?.nombre?.charAt(0)}</span><div><DialogTitle className="text-lg font-black">{editing?.nombre}</DialogTitle><p className="mt-0.5 text-[10px] uppercase tracking-[.18em] text-white/35">Ficha operativa del lead</p></div></div>
              <button onClick={handleClose} className="absolute right-4 top-5 rounded-xl bg-white/5 p-2 text-white/50 hover:bg-white/10 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto overscroll-contain px-6 pb-6 [-webkit-overflow-scrolling:touch]" data-agenda-scroll>
            <Sec title="Asignación y trazabilidad" role="setter" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Txt label="Email" value={form.email} onChange={v => setF("email", v)} placeholder="nombre@email.com" />
              <Sel label="Setter" value={form.setter} options={settersFor(form.fecha_agenda)} onChange={v => setF("setter", v)} />
              <Sel label="Closer" value={form.closer} options={CLOSERS} onChange={v => setF("closer", v)} />
              <Sel label="Cuenta" value={form.cuenta} options={CUENTA} onChange={v => setF("cuenta", v)} />
              <Sel label="Calificación" value={form.calificacion} options={CALIFICACION} onChange={v => setF("calificacion", v)} />
              <Sel label="Ángulo de entrada" value={form.angulo_entrada} options={[...SALES_ANGLES.slice(0, 8)]} onChange={v => setF("angulo_entrada", v)} />
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Fecha de agenda</Label>
                <Input type="date" className="h-9 text-sm" value={form.fecha_agenda?.split("T")[0] || ""} onChange={e => setF("fecha_agenda", e.target.value ? `${e.target.value}T00:00:00` : null)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Fecha y hora de llamada</Label>
                <Input type="datetime-local" className="h-9 text-sm" value={form.fecha_closer?.slice(0, 16) || ""} onChange={e => setF("fecha_closer", e.target.value ? `${e.target.value}:00` : null)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Fuente</Label>
                <FuenteSelect value={form.fuente} onChange={v => setF("fuente", v)} />
              </div>
              <div className="sm:col-span-2">
                <TxtArea label="Contenido de origen (pieza, URL/ID, cuenta, campaña y fecha)" value={form.recurso} onChange={v => setF("recurso", v)} />
                <p className="mt-1 text-[11px] text-muted-foreground">Si no se puede identificar, escribí “Contenido no identificado”.</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-3">
                <Txt label="Campaign ID" value={form.campaign_id} onChange={v => setF("campaign_id", v)} />
                <Txt label="Ad ID" value={form.ad_id} onChange={v => setF("ad_id", v)} />
                <Txt label="Creative ID" value={form.creative_id} onChange={v => setF("creative_id", v)} />
              </div>
              <Sel label="Ocupación" value={form.ocupacion} options={OCUPACION} onChange={v => setF("ocupacion", v)} />
              <Sel label="Manychat / automatización" value={form.manychat} options={MANYCHAT_OPTS} onChange={v => setF("manychat", v)} />
              <div className="sm:col-span-2">
                <TxtArea label="Puntos de contacto / seguimiento del setter" value={form.puntos_contacto} onChange={v => setF("puntos_contacto", v)} />
              </div>
            </div>

            {!isNoPrecallerAgenda(form) && <>
            <Sec title="Pre-Call" role="precaller" />
            {getPrecallSequence(form.angulo_entrada) && (() => {
              const sequence = getPrecallSequence(form.angulo_entrada)!
              return <div className="sm:col-span-2 rounded-2xl border border-violet-500/20 bg-violet-500/[.06] p-4 text-sm">
                <p className="font-bold text-violet-700">Secuencia sugerida · {sequence.angle}</p>
                <p className="mt-2 text-muted-foreground">{sequence.message}</p>
                <p className="mt-2 text-xs"><b>Activo:</b> {sequence.asset} · <b>Pregunta:</b> {sequence.setterPrompt}</p>
              </div>
            })()}
              <div className="grid grid-cols-1 gap-3">
                <Sel label="Call Confirmer" value={form.call_confirmer} options={CALL_CONFIRMER} onChange={v => setF("call_confirmer", v)} req={rol === "Precaller"} />
                <TxtArea label="Info Call Triage" value={form.info_call_triage} onChange={v => setF("info_call_triage", v)} req={rol === "Precaller"} />
              </div>
            </>}

            {(() => {
              const reqClose = rol === "Closer" && !!form.show && !!form.cerro
              const reqNoClose = rol === "Closer" && !!form.show && !form.cerro
              const reqFechaTC = reqClose && form.estado !== "Fee"
              return (
            <>
            <Sec title="Resultado de la Llamada" role="closer" hint='Marcá "Show" solo si el lead se presentó a la llamada. Si no se presentó, no hace falta llenar nada más de esta sección. Si se presentó pero no cerró, elegi el motivo real (no "No Califica" salvo que sea literal).' />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><ResultChoice value={form.show} estado={form.estado} onChange={v => {
                if (v === "si") { setF("show", true); if (form.estado === "No Show" || form.estado === "Cancelado") setF("estado", null) }
                if (v === "no") { setF("show", false); setF("cerro", false); setF("estado", "No Show") }
                if (v === "pendiente") { setF("show", null); setF("cerro", false); if (form.estado === "No Show" || form.estado === "Cancelado") setF("estado", null) }
                if (v === "cancelado") { setF("show", null); setF("cerro", false); setF("estado", "Cancelado"); setF("motivo_no_cierre", null) }
              }} /></div>
              {form.show === false && <div className="sm:col-span-2 flex items-center rounded-xl border border-red-500/20 bg-red-500/[.07] px-3 py-2 text-xs font-bold text-red-500">No-show: al guardar sale de pendientes y no requiere ningún otro dato.</div>}
              {form.show && <>
                <YesNo label="Cerró" value={!!form.cerro} onChange={v => setF("cerro", v)} />
                {form.cerro
                  ? <Sel label="Estado" value={form.estado} options={ESTADO_AG} onChange={v => setF("estado", v)} req={reqClose} />
                  : <Sel label="Motivo No Cierre" value={form.motivo_no_cierre} options={MOTIVO} onChange={v => setF("motivo_no_cierre", v)} req={reqNoClose} />}
                <Sel label="Calificaba Realmente? (según IA)" value={(form as any).calificaba_realmente} options={CALIFICABA} onChange={v => setF("calificaba_realmente" as any, v)} />
                <Sel label="Score real post-call" value={form.calificacion_real} options={CALIFICACION} onChange={v => setF("calificacion_real", v)} />
                <div className="sm:col-span-2"><TxtArea label="Motivo / evidencia del score real" value={form.motivo_calificacion_real} onChange={v => setF("motivo_calificacion_real", v)} /></div>
                <LinkField label="Link Fathom" value={form.link_fathom} onChange={v => setF("link_fathom", v)} req cta="Ver llamada" />
              </>}
              {form.show && !form.cerro && <div className="sm:col-span-2 mt-2 rounded-2xl border border-amber-500/25 bg-amber-500/[.06] p-4">
                <div className="mb-3"><p className="text-sm font-black text-amber-600">Seguimiento futuro</p><p className="text-xs text-muted-foreground">Usalo cuando vale la pena retomar a esta persona más adelante.</p></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Volver a contactar</Label><Input type="date" className="h-9" value={form.seguimiento_fecha?.split("T")[0] || ""} onChange={e => { setF("seguimiento_fecha", e.target.value || null); if (e.target.value) { setF("seguimiento_estado", "Pendiente"); if (!form.seguimiento_responsable) setF("seguimiento_responsable", form.closer || "") } }} /></div>
                  <div className="sm:col-span-2"><TxtArea label="Nota de seguimiento" value={form.seguimiento_nota} onChange={v => setF("seguimiento_nota", v)} /></div>
                  <div className="sm:col-span-2"><Label className="text-xs text-muted-foreground">Responsable</Label><Input className="mt-1.5 h-9" value={form.seguimiento_responsable || ""} onChange={e => setF("seguimiento_responsable", e.target.value)} placeholder="Ej. Cuenta A, un closer, closer asignado" /></div>
                </div>
              </div>}
              {form.show && form.cerro && <>
                <Sel label="Operación" value={form.operacion} options={OPERACION} onChange={v => setF("operacion", v)} req={reqClose} />
                <Sel label="Medio de Pago" value={form.medio_de_pago} options={MEDIO_PAGO} onChange={v => setF("medio_de_pago", v)} req={reqClose} />
                <LinkField label="Comprobante" value={form.comprobante} onChange={v => setF("comprobante", v)} req={reqClose} cta="Ver comprobante" />
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">CC Día 1{reqClose && <span className="text-red-500"> *</span>}<HelpHint text="Monto que efectivamente entró en la tarjeta/cuenta el mismo día del cierre (fee o primer pago). Si todavía no se cobró nada, dejá este campo en 0, no lo dejes vacío." /></Label>
                  <Input type="number" step="0.01" className={cn("h-9 text-sm", reqClose && !form.cc_dia_1 ? "border-red-500/50" : "")} value={form.cc_dia_1 || ""} onChange={e => setF("cc_dia_1", parseFloat(e.target.value) || null)} placeholder="0.00" />
                </div>
              </>}
              {form.show && form.cerro && form.estado !== "Fee" && <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">Fecha TC (solo trato cerrado){reqFechaTC && <span className="text-red-500"> *</span>}<HelpHint text='Fecha del "trato cerrado": cuando quedó definido el programa/plan de pago, no necesariamente el día que se cobró el primer pago. No aplica a Fees (por eso este campo se oculta si el Estado es Fee).' /></Label>
                <Input type="date" className={cn("h-9 text-sm", reqFechaTC && !form.fecha_tc ? "border-red-500/50" : "")} value={form.fecha_tc?.split("T")[0] || ""} onChange={e => setF("fecha_tc", e.target.value)} />
              </div>}
              {form.show && form.cerro && <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Fecha Baja</Label>
                <Input type="date" className="h-9 text-sm" value={form.fecha_baja?.split("T")[0] || ""} onChange={e => setF("fecha_baja", e.target.value)} />
              </div>}
            </div>
            {form.show && form.cerro && <div className="mt-3">
              <TxtArea label="PPP Plan de Pago Personalizado" value={form.plan_de_pago} onChange={v => setF("plan_de_pago", v)} req={reqClose} />
            </div>}
            </>
              )
            })()}
            <div className="mt-3">
              <TxtArea label="IA Análisis" value={form.ia_analisis} onChange={v => setF("ia_analisis", v)} rows={8} />
            </div>

            <Sec title="Respuestas de iClosed" role="auto" />
            <p className="mb-3 text-xs text-muted-foreground">Se completan automáticamente desde las respuestas del formulario de iClosed. Solo corregilas acá si el dato de origen está mal.</p>
            <div className="grid grid-cols-1 gap-3">
              <Sel label="Problema Actual" value={form.problema_actual} options={withCurrent(PROBLEMA_VIGENTE, form.problema_actual)} onChange={v => setF("problema_actual", v)} />
              <Sel label="¿Hace cuánto arrastrás esto sin solucionarlo?" value={form.tiempo_problema} options={withCurrent(TIEMPO_PROBLEMA_VIGENTE, form.tiempo_problema)} onChange={v => setF("tiempo_problema", v)} />
              <Sel label="¿Qué hiciste hasta ahora para resolverlo?" value={form.intentos_previos} options={withCurrent(INTENTOS_PREVIOS_VIGENTE, form.intentos_previos)} onChange={v => setF("intentos_previos", v)} />
              <Sel label="¿Por qué querés resolverlo ahora?" value={form.motivo_urgencia} options={withCurrent(MOTIVO_URGENCIA_VIGENTE, form.motivo_urgencia)} onChange={v => setF("motivo_urgencia", v)} />
              <Sel label="Ingresos" value={form.ingresos} options={withCurrent(INGRESOS_VIGENTE, form.ingresos)} onChange={v => setF("ingresos", v)} />
              <Sel label="Inversión" value={form.inversion} options={withCurrent(INVERSION_VIGENTE, form.inversion)} onChange={v => setF("inversion", v)} />
            </div>
            {modalErr && (
              <div className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600">{modalErr}</div>
            )}
          </div>
          <DialogFooter className="z-20 block border-t border-border/70 bg-background/95 px-6 py-4 backdrop-blur-xl">
            <div className="flex w-full items-center gap-2">
              <Button variant="destructive" onClick={handleArchive} disabled={saving || archiving} className="gap-2">
                {archiving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                {archiving ? "Archivando..." : "Archivar agenda"}
              </Button>
              {pendingPosition >= 0 && <span className="ml-auto text-xs font-bold text-muted-foreground">Pendiente {pendingPosition + 1} de {pendingRows.length}</span>}
            </div>
            <div className="mt-2 flex w-full justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>Cancelar</Button>
              <Button variant="outline" onClick={() => handleSave(true)} disabled={saving || pendingRows.length < 2}>Guardar y siguiente</Button>
              <Button onClick={() => handleSave(false)} disabled={saving}>
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</> : "Guardar"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nueva agenda a mano — leads que se agendaron por izquierda, fuera de iClosed */}
      <Dialog open={newOpen} onOpenChange={(o) => { if (!o) closeNew() }}>
        <DialogContent className="grid max-h-[calc(100dvh-1rem)] max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden border-white/60 bg-background/92 p-0 shadow-2xl backdrop-blur-2xl dark:border-white/10 sm:max-h-[92dvh]">
          <div className="relative overflow-hidden bg-[#151217] px-6 pb-7 pt-6 text-white sm:px-8">
            <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-red-500/25 blur-3xl" /><div className="absolute bottom-0 left-1/3 h-20 w-48 rounded-full bg-orange-400/10 blur-2xl" />
            <DialogHeader className="relative"><div className="flex items-start gap-4 pr-8"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-red-500 to-orange-400 shadow-xl shadow-red-950/40"><Sparkles className="h-5 w-5" /></span><div><DialogTitle className="text-xl font-black tracking-tight">Crear agenda manual</DialogTitle><p className="mt-1 text-xs leading-relaxed text-white/45">Carga rápida para un lead agendado fuera del flujo automático.</p></div></div></DialogHeader>
            <button onClick={closeNew} className="absolute right-5 top-5 rounded-xl border border-white/10 bg-white/5 p-2 text-white/55 transition hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
            <div className="relative mt-6 grid grid-cols-3 gap-2">{[
              { n: 1, label: "Persona", icon: UserRound }, { n: 2, label: "Llamada", icon: CalendarClock }, { n: 3, label: "Origen", icon: Waypoints },
            ].map(({ n, label, icon: Icon }) => <button key={n} onClick={() => n < newStep && setNewStep(n)} className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition", newStep === n ? "border-white/20 bg-white/12" : n < newStep ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : "border-white/[.06] bg-white/[.03] text-white/30")}><span className={cn("grid h-7 w-7 place-items-center rounded-lg", newStep === n ? "bg-white text-black" : "bg-white/[.07]")}>{n < newStep ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}</span><span className="hidden text-xs font-bold sm:block">{label}</span></button>)}</div>
          </div>

          <div className="min-h-0 overflow-y-auto overscroll-contain p-6 [-webkit-overflow-scrolling:touch] sm:min-h-[310px] sm:p-8">
            {newStep === 1 && <div className="page-enter"><StepHeading icon={UserRound} title="¿Quién es el lead?" detail="Buscá una persona existente o creá una nueva sin duplicados." /><div className="mt-6 grid gap-4 sm:grid-cols-2"><div className="relative sm:col-span-2"><Label className="text-xs font-semibold text-muted-foreground">Buscar por nombre, teléfono o Instagram<Req /></Label><div className="relative mt-1.5"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus className={cn("h-12 rounded-xl bg-muted/35 pl-10 pr-24 text-sm shadow-sm", !newForm.nombre && "border-red-500/40")} value={newForm.nombre || ""} onChange={e => setNewF("nombre", e.target.value)} placeholder="Ej: Jairo Menéndez" /><span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg bg-background px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground shadow-sm">Buscador</span></div>{manualMatches.length > 0 && <div className="absolute inset-x-0 top-[70px] z-30 overflow-hidden rounded-2xl border bg-popover/98 p-1.5 shadow-2xl backdrop-blur-xl"><p className="px-3 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">Personas encontradas</p>{manualMatches.map(lead => <button type="button" key={String(lead.id)} onClick={() => chooseExistingLead(lead)} className="group flex w-full items-center gap-3 rounded-xl p-3 text-left transition hover:bg-muted"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-400 font-black text-white shadow-md">{lead.nombre?.charAt(0)}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{lead.nombre}</span><span className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground"><span>{lead.telefono || "Sin teléfono"}</span>{lead.instagram && <span>{lead.instagram}</span>}<span>Última: {formatDate(lead.fecha_agenda)}</span></span></span><span className="rounded-lg border px-2 py-1 text-[10px] font-bold text-muted-foreground transition group-hover:border-primary/30 group-hover:text-primary">Usar</span></button>)}</div>}</div><Txt label="Teléfono / WhatsApp" value={newForm.telefono} onChange={v => setNewF("telefono", v)} placeholder="+54 11..." /><Txt label="Instagram" value={newForm.instagram} onChange={v => setNewF("instagram", v)} placeholder="@usuario" /><Txt label="Edad" value={newForm.edad as any} onChange={v => setNewF("edad", v || null)} placeholder="ej: 27" />{newForm.telefono && <div className="flex items-end"><div className="w-full rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3"><p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Identidad vinculada</p><p className="mt-1 text-xs text-muted-foreground">La nueva agenda quedará asociada por teléfono y no creará otra persona.</p></div></div>}</div></div>}
            {newStep === 2 && <div className="page-enter"><StepHeading icon={CalendarClock} title="¿Cuándo y con quién?" detail="Asigná la llamada al equipo correcto." /><div className="mt-6 grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label className="text-xs font-semibold">Fecha de agenda<Req /></Label><Input type="date" className={cn("h-11 rounded-xl bg-muted/35", !newForm.fecha_agenda && "border-red-500/50")} value={newForm.fecha_agenda?.split("T")[0] || ""} onChange={e => setNewF("fecha_agenda", e.target.value ? `${e.target.value}T00:00:00` : null)} /></div><div className="space-y-1.5"><Label className="text-xs font-semibold">Fecha y hora de llamada</Label><Input type="datetime-local" className="h-11 rounded-xl bg-muted/35" value={newForm.fecha_closer?.slice(0, 16) || ""} onChange={e => setNewF("fecha_closer", e.target.value ? `${e.target.value}:00` : null)} /></div><Sel label="Closer" value={newForm.closer} options={CLOSERS} onChange={v => setNewF("closer", v)} /><Sel label="Setter" value={newForm.setter} options={settersFor(newForm.fecha_agenda)} onChange={v => setNewF("setter", v)} /><Sel label="Cuenta" value={(newForm as any).cuenta} options={CUENTA} onChange={v => setNewF("cuenta" as any, v)} /><Sel label="Calificación" value={newForm.calificacion} options={CALIFICACION} onChange={v => setNewF("calificacion", v)} /></div></div>}
            {newStep === 3 && <div className="page-enter"><StepHeading icon={Waypoints} title="¿De dónde vino?" detail="Esto permite medir calidad y atribución sin ensuciar la ficha." /><div className="mt-6 grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label className="text-xs font-semibold">Fuente</Label><FuenteSelect value={newForm.fuente} onChange={v => setNewF("fuente", v)} /></div><Sel label="Ocupación" value={(newForm as any).ocupacion} options={OCUPACION} onChange={v => setNewF("ocupacion" as any, v)} /><Sel label="Manychat" value={(newForm as any).manychat} options={MANYCHAT_OPTS} onChange={v => setNewF("manychat" as any, v)} /></div></div>}
          {newErr && (
            <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-600">{newErr}</div>
          )}
          </div>
          <DialogFooter className="flex-row items-center justify-between border-t bg-muted/25 px-6 py-4 sm:px-8"><Button variant="ghost" onClick={newStep === 1 ? closeNew : () => setNewStep(s => s - 1)}>{newStep > 1 && <ArrowLeft className="mr-2 h-4 w-4" />}{newStep === 1 ? "Cancelar" : "Atrás"}</Button>{newStep < 3 ? <Button className="bg-foreground text-background hover:bg-foreground/90" onClick={() => { if (newStep === 1 && !newForm.nombre?.trim()) return setNewErr("Ingresá el nombre para continuar."); if (newStep === 2 && !newForm.fecha_agenda) return setNewErr("Elegí la fecha de agenda para continuar."); setNewErr(null); setNewStep(s => s + 1) }}>Continuar<ArrowRight className="ml-2 h-4 w-4" /></Button> : <Button className="bg-gradient-to-r from-red-600 to-orange-500 text-white shadow-lg shadow-red-500/20" onClick={handleCreateNew} disabled={newSaving}>{newSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</> : <><Check className="mr-2 h-4 w-4" />Crear agenda</>}</Button>}</DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
