"use client"

import { useEffect, useState, useMemo } from "react"
import useSWR from "swr"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DateFilter } from "@/components/date-filter"
import { cn } from "@/lib/utils"
import { Loader2, User, CalendarDays, Search, X, Phone, Mail, Instagram, Link2, Star, BriefcaseBusiness, Clock3, Sparkles, Target, WalletCards, MessageSquareText, UserRoundCheck, Radio, ArrowUpRight, CircleAlert, CircleCheck, Pencil, Save } from "lucide-react"
import type { Agenda } from "@/lib/supabase"
import { useSession } from "@/components/session-provider"
import { HelpHint } from "@/components/help-hint"

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

// ── Date filter helpers (mismo patron que cuotas/page.tsx y page.tsx) ─────────
function filterToParams(filter: string): string {
  if (!filter || filter === "all") return ""
  if (filter.startsWith("range:")) { const [s, e] = filter.slice(6).split(":"); return `?start=${s}&end=${e}` }
  const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const iso = (d: Date) => d.toISOString().split("T")[0]
  if (filter.startsWith("month:")) { const [y, m] = filter.slice(6).split("-").map(Number); return `?start=${iso(new Date(y, m - 1, 1))}&end=${iso(new Date(y, m, 0))}` }
  const som = new Date(today.getFullYear(), today.getMonth(), 1); const eom = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  const solm = new Date(today.getFullYear(), today.getMonth() - 1, 1); const eolm = new Date(today.getFullYear(), today.getMonth(), 0)
  switch (filter) {
    case "today": return `?start=${iso(today)}&end=${iso(today)}`
    case "this-week": { const w = new Date(today); w.setDate(today.getDate() - today.getDay()); return `?start=${iso(w)}&end=${iso(today)}` }
    case "this-month": return `?start=${iso(som)}&end=${iso(eom)}`
    case "last-month": return `?start=${iso(solm)}&end=${iso(eolm)}`
    case "this-year": return `?start=${iso(new Date(today.getFullYear(), 0, 1))}&end=${iso(today)}`
    default: return ""
  }
}

// ── Stage logic ───────────────────────────────────────────────────────────────
// Orden pedido por Cuenta A: Agenda Confirmada -> No se Presentó -> Se Presentó ->
// No Cerrados -> Fees -> Cerrados -> Archivados. Los leads que todavía no
// confirmaron la llamada no tienen columna propia (getStage devuelve null y
// quedan afuera del pipeline; se gestionan desde Centro de Agendas).
type Stage = "confirmado" | "no_show" | "presentado" | "no_cerrado" | "fee" | "cerrado" | "archivado"

// Strip accents for comparison (handles "Si, confirmada" vs "Sí, confirmada" etc.)
function norm(s: string) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
}

function firstWord(s: string) {
  return (s || "").trim().split(/\s+/)[0]
}

// Experimento operativo vigente desde agosto 2026: no hay etapa de Precaller.
// Los datos historicos se preservan; para agendas nuevas sin `call_confirmer`,
// el pipeline usa fecha/show/resultado para que nunca desaparezcan de la vista.
const NO_PRECALLER_FROM = "2026-08-01"
function isNoPrecallerAgenda(a: Agenda) {
  const raw = a.fecha_closer || a.fecha_agenda
  return Boolean(raw && raw.slice(0, 10) >= NO_PRECALLER_FROM)
}

// Conceptos de pago que son "seña" (fee). Todo lo demas = entro al programa.
const FEE_TIPOS = new Set(["Fee", "Refuerzo de Fee", "Fee Venta Interna"])
type Pays = Map<string, { hasFee: boolean; hasNonFee: boolean; hasPIF: boolean; hasPP: boolean; contenidoContestado: string | null }>

// Dentro de "Cerrado": distingue a quien pago todo de una (PIF) de quien
// quedo en plan de pago (PP). Prioridad: 1) drop manual del closer
// (agenda.tipo_cierre), 2) infiere del sufijo PIF/PP de `operacion` en los
// pagos ya cargados (ver lib/programas.ts en Carga de Pagos).
type CierreTipo = "pif" | "plan_pago"
function tipoCierre(a: Agenda, pays: Pays): CierreTipo {
  if (a.tipo_cierre === "pif" || a.tipo_cierre === "plan_pago") return a.tipo_cierre
  const p = pays.get(norm(a.nombre || ""))
  if (p?.hasPP) return "plan_pago"
  if (p?.hasPIF) return "pif"
  return "plan_pago"
}
const CIERRE_LABEL: Record<CierreTipo, string> = { pif: "PIF · Completo", plan_pago: "Plan de Pago" }
const CIERRE_BADGE: Record<CierreTipo, string> = {
  pif: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  plan_pago: "bg-amber-500/10 text-amber-600 border-amber-500/20",
}

// Dentro de "No Cerrados": 4 motivos fijos elegidos al soltar la tarjeta.
// Los motivos viejos (Le parecia caro, No llego al PIF, etc.) se mapean acá
// solo para que agendas historicas se sigan viendo en alguna sub-seccion.
const NO_CERRADO_MOTIVOS = [
  { key: "Descalificado", label: "Descalificado", dropId: "nocerrado_descalificado" },
  { key: "Desconfianza", label: "Desconfianza", dropId: "nocerrado_desconfianza" },
  { key: "Miedo", label: "Miedo", dropId: "nocerrado_miedo" },
  { key: "Problema logístico", label: "Problema logístico", dropId: "nocerrado_logistico" },
] as const
type NoCierreTipo = (typeof NO_CERRADO_MOTIVOS)[number]["key"]
const NOCERRADO_LEGACY_MAP: Record<string, NoCierreTipo> = {
  "No Califica": "Descalificado", "Era desempleado": "Descalificado",
  "Desconfianza": "Desconfianza", "Lo tenia que pensar": "Desconfianza",
  "Miedo": "Miedo", "Le parecia caro": "Miedo",
  "Metodo de pago": "Problema logístico", "No llego al PIF": "Problema logístico", "No llegaba a la Cuota 1": "Problema logístico",
}
function tipoNoCierre(a: Agenda): NoCierreTipo {
  const m = a.motivo_no_cierre || ""
  if (NO_CERRADO_MOTIVOS.some(x => x.key === m)) return m as NoCierreTipo
  return NOCERRADO_LEGACY_MAP[m] || "Problema logístico"
}
const NOCERRADO_BADGE: Record<NoCierreTipo, string> = {
  "Descalificado": "bg-slate-500/10 text-slate-600 border-slate-500/20",
  "Desconfianza": "bg-purple-500/10 text-purple-600 border-purple-500/20",
  "Miedo": "bg-red-500/10 text-red-500 border-red-500/20",
  "Problema logístico": "bg-blue-500/10 text-blue-600 border-blue-500/20",
}

// Dentro de "Archivados": el campo real de Centro de Agendas que distingue
// esto es "Call Confirmer" (Motivo No Cierre es el que usa "No Cerrados").
// Solo hay 2 sub-secciones con dato real hoy; a futuro el closer las elige
// a mano arrastrando la tarjeta.
const ARCHIVADO_MOTIVOS = [
  { key: "Cancelado por Triage", label: "Cancelado por Triage", dropId: "archivado_triage" },
  { key: "Nunca respondió", label: "Nunca respondió", dropId: "archivado_norespondio" },
] as const
type ArchivadoTipo = (typeof ARCHIVADO_MOTIVOS)[number]["key"]
function tipoArchivado(a: Agenda): ArchivadoTipo {
  const confirmer = norm(a.call_confirmer || "")
  if (NO_RESPONDIO_VALUES.has(confirmer)) return "Nunca respondió"
  return "Cancelado por Triage"
}
const ARCHIVADO_BADGE: Record<ArchivadoTipo, string> = {
  "Cancelado por Triage": "bg-slate-500/10 text-slate-600 border-slate-500/20",
  "Nunca respondió": "bg-slate-400/10 text-slate-500 border-slate-400/20",
}

// El campo call_confirmer acumuló varias formas de escribir lo mismo a lo
// largo del tiempo (Centro de Agendas cambió las opciones del select más de
// una vez). Se reconocen todas las variantes vistas en la base para no
// perder leads viejos ni los que carga hoy Centro de Agendas.
const CONFIRMADO_VALUES = new Set(["confirmada", "si, confirmada", "confirmado por texto"])
const CANCELADO_VALUES = new Set(["cancelada por triage", "se cancelo por triage", "se cancelo"])
const NO_RESPONDIO_VALUES = new Set(["no respondio"])

function getStage(a: Agenda, pays: Pays): Stage | null {
  const p = pays.get(norm(a.nombre || ""))
  // "Entró al programa" (cierre real, no solo seña): pagó algo mas que el fee,
  // o la agenda quedó marcada explícitamente Adentro.
  const entroAlPrograma = p?.hasNonFee || a.estado === "Adentro en Call" || a.estado === "Adentro en FUP"
  // Fee: pagó la seña (o la agenda dice Fee) y todavía no entró al programa.
  // Se revisa ANTES que "cerro" — en agendas, cerro=true también queda true
  // para quien solo pagó el Fee (correcto a nivel de dato), pero en el
  // pipeline eso no debe saltar directo a la columna Cerrados.
  if (!entroAlPrograma && (p?.hasFee || a.estado === "Fee")) return "fee"
  // Cerrado: entró al programa, o la agenda lo marca adentro por algún otro lado
  if (entroAlPrograma || a.cerro) return "cerrado"
  const confirmer = norm(a.call_confirmer || "")
  // Archivado: cancelado en triage, o confirmo en algun momento pero nunca respondio despues
  if (CANCELADO_VALUES.has(confirmer) || NO_RESPONDIO_VALUES.has(confirmer)) return "archivado"
  // Se presentó y no cerró: cae en No Cerrados si tiene motivo cargado
  if (a.show && a.motivo_no_cierre) return "no_cerrado"
  if (a.show) return "presentado"
  // Centro de Agendas guarda el no-show como show=false. `estado=No Show`
  // refuerza el dato nuevo, pero los registros ya cargados deben sincronizar
  // igual aunque todavía no tengan ese segundo campo. Solo se interpreta como
  // no-show cuando la hora de la call ya pasó, para no mover futuras.
  const callAt = a.fecha_closer || a.fecha_agenda
  if (a.estado === "No Show" || (a.show === false && callAt && new Date(callAt).getTime() <= Date.now())) return "no_show"
  if (CONFIRMADO_VALUES.has(confirmer)) {
    // No Show es un resultado explícito, no una inferencia por fecha. De este
    // modo Pipeline y Centro de Agendas siempre muestran el mismo estado real.
    return "confirmado"
  }
  if (isNoPrecallerAgenda(a)) {
    return "confirmado"
  }
  // Todavia no confirmo la llamada -> no aparece en el pipeline
  return null
}

// Valores que se escriben en "agendas" al soltar una tarjeta en cada columna
// simple (una sola drop-zone). Las columnas con sub-secciones (No Cerrados,
// Cerrados, Archivados) se manejan aparte en handleDragEnd.
const STAGE_UPDATES: Record<"confirmado" | "no_show" | "presentado" | "fee", Partial<Agenda>> = {
  confirmado: { estado: null, cerro: false, call_confirmer: "Confirmada", show: false, motivo_no_cierre: null, tipo_cierre: null },
  no_show:    { estado: "No Show", cerro: false, show: false, motivo_no_cierre: null, tipo_cierre: null },
  presentado: { estado: null, cerro: false, show: true, motivo_no_cierre: null, tipo_cierre: null },
  fee:        { estado: "Fee", cerro: false, motivo_no_cierre: null, tipo_cierre: null },
}

// ── Column config ─────────────────────────────────────────────────────────────
const COLUMNS: { id: Stage; label: string; color: string; headerBg: string; dot: string }[] = [
  { id: "confirmado",  label: "Agenda Confirmada", color: "border-t-blue-500",    headerBg: "bg-blue-500/10",    dot: "bg-blue-500"    },
  { id: "no_show",     label: "No se Presentó",    color: "border-t-slate-400",  headerBg: "bg-slate-500/10",   dot: "bg-slate-400"   },
  { id: "presentado",  label: "Falta Resultado",   color: "border-t-red-500",    headerBg: "bg-red-500/10",     dot: "bg-red-500"     },
  { id: "no_cerrado",  label: "No Cerrados",       color: "border-t-orange-500", headerBg: "bg-orange-500/10",  dot: "bg-orange-500"  },
  { id: "fee",         label: "Fees",              color: "border-t-amber-500",  headerBg: "bg-amber-500/10",   dot: "bg-amber-500"   },
  { id: "cerrado",     label: "Cerrados",          color: "border-t-emerald-500",headerBg: "bg-emerald-500/10", dot: "bg-emerald-500" },
  { id: "archivado",   label: "Archivados",        color: "border-t-slate-300",  headerBg: "bg-muted/40",       dot: "bg-slate-300"   },
]
type ColumnDef = (typeof COLUMNS)[number]

const STAGE_BADGE: Record<Stage, string> = {
  confirmado:  "bg-blue-500/10 text-blue-600 border-blue-500/20",
  no_show:     "bg-slate-500/10 text-slate-600 border-slate-500/20",
  presentado:  "bg-red-500/10 text-red-600 border-red-500/20",
  no_cerrado:  "bg-orange-500/10 text-orange-600 border-orange-500/20",
  fee:         "bg-amber-500/10 text-amber-600 border-amber-500/20",
  cerrado:     "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  archivado:   "bg-slate-200/60 text-slate-500 border-slate-300/40",
}

// Checklist operativo del closer. El pipeline no debe limitarse a ubicar la
// tarjeta: también tiene que decir, sin abrirla, qué falta completar.
function pipelineMissing(a: Agenda, stage: Stage): string[] {
  if (stage === "presentado") {
    return [!a.link_fathom && "Fathom", "resultado de la call"].filter(Boolean) as string[]
  }
  if (stage === "no_cerrado") {
    return [!a.motivo_no_cierre && "motivo", !a.link_fathom && "Fathom"].filter(Boolean) as string[]
  }
  if (stage === "fee" || stage === "cerrado") {
    const missing = [
      !a.estado && "estado", !a.link_fathom && "Fathom", !a.operacion && "operación",
      !a.plan_de_pago && "plan de pago", !a.medio_de_pago && "medio de pago",
      !a.comprobante && "comprobante", !a.cc_dia_1 && "CC día 1",
    ].filter(Boolean) as string[]
    if (stage === "cerrado" && !a.fecha_tc) missing.push("fecha TC")
    return missing
  }
  return []
}

const calColors: Record<string, string> = {
  S: "bg-fuchsia-600 text-white border-fuchsia-700",
  A: "bg-green-600 text-white border-green-700",
  B: "bg-yellow-400 text-black border-yellow-500",
  C: "bg-blue-600 text-white border-blue-700",
  D: "bg-red-600 text-white border-red-700",
}

function parseLocalDate(str: string | null): Date | null {
  if (!str) return null
  const s = str.split("T")[0]
  const parts = s.split("-").map(Number)
  if (parts.length !== 3) return null
  return new Date(parts[0], parts[1] - 1, parts[2])
}

function formatDate(str: string | null): string {
  const d = parseLocalDate(str)
  if (!d) return "-"
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" })
}

function formatDateTime(str: string | null): string {
  if (!str) return "-"
  const [datePart, timePart] = str.split("T")
  const d = parseLocalDate(datePart)
  if (!d) return "-"
  const fecha = d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })
  if (!timePart) return fecha
  const hhmm = timePart.slice(0, 5)
  return hhmm === "00:00" ? fecha : `${fecha} · ${hhmm}`
}

function calKey(cal: string | null): string {
  return (cal || "C").replace(/^lead\s*/i, "").trim() || "C"
}

// ── Card content (compartido entre la tarjeta arrastrable y el overlay) ───────
function LeadCardContent({ agenda, stage, pays }: { agenda: Agenda; stage: Stage; pays: Pays }) {
  const ck = calKey(agenda.calificacion)
  const cierre = stage === "cerrado" ? tipoCierre(agenda, pays) : null
  const noCierre = stage === "no_cerrado" ? tipoNoCierre(agenda) : null
  const archivo = stage === "archivado" ? tipoArchivado(agenda) : null
  const missing = pipelineMissing(agenda, stage)
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-sm font-black shadow-sm", calColors[ck] || calColors.C)}>{ck}</span>
          <p className="truncate text-sm font-black leading-tight text-foreground">{agenda.nombre}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {agenda.rescatado && (
            <Star className="h-3.5 w-3.5 text-fuchsia-500 fill-fuchsia-500" aria-label="Rescatado" />
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <User className="h-3 w-3 flex-shrink-0" />
        <span className="truncate">
          {agenda.closer || "—"}{agenda.setter ? ` · ${agenda.setter}` : ""}
        </span>
      </div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <CalendarDays className="h-3 w-3 flex-shrink-0" />
        <span title="Fecha y hora de la llamada">Call: {formatDateTime(agenda.fecha_closer || agenda.fecha_agenda)}</span>
      </div>
      {stage === "fee" && (
        <p className="text-xs text-amber-600 font-medium">Fee pagado — pendiente conversión</p>
      )}
      {cierre && (
        <Badge variant="outline" className={cn("text-xs font-semibold", CIERRE_BADGE[cierre])}>{CIERRE_LABEL[cierre]}</Badge>
      )}
      {noCierre && (
        <Badge variant="outline" className={cn("text-xs font-semibold", NOCERRADO_BADGE[noCierre])}>{noCierre}</Badge>
      )}
      {archivo && (
        <Badge variant="outline" className={cn("text-xs font-semibold", ARCHIVADO_BADGE[archivo])}>{archivo}</Badge>
      )}
      {(stage === "presentado" || stage === "no_cerrado" || stage === "fee" || stage === "cerrado") && (
        <div className={cn(
          "rounded-xl border px-2.5 py-2 text-[11px] font-bold leading-4",
          missing.length
            ? "border-red-500/20 bg-red-500/[.07] text-red-600 dark:text-red-300"
            : "border-emerald-500/20 bg-emerald-500/[.07] text-emerald-700 dark:text-emerald-300",
        )}>
          <div className="flex items-start gap-1.5">
            {missing.length ? <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
            <span>{missing.length ? `Falta: ${missing.join(" · ")}` : "Carga completa"}</span>
          </div>
        </div>
      )}
    </>
  )
}

// ── Card (arrastrable + click para abrir detalle) ─────────────────────────────
function LeadCard({ agenda, stage, pays, onOpenDetail }: { agenda: Agenda; stage: Stage; pays: Pays; onOpenDetail: (a: Agenda) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: agenda.id as number,
    data: { stage },
  })
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => { if (!isDragging) onOpenDetail(agenda) }}
      className={cn(
        "bg-card/90 border border-border rounded-2xl p-3.5 border-t-4 shadow-sm hover:-translate-y-0.5 hover:shadow-xl transition-all duration-200 space-y-2 cursor-grab active:cursor-grabbing touch-none select-none backdrop-blur",
        isDragging && "opacity-30",
        COLUMNS.find(c => c.id === stage)?.color
      )}
    >
      <LeadCardContent agenda={agenda} stage={stage} pays={pays} />
    </div>
  )
}

// Copia visual que se muestra flotando mientras se arrastra (via DragOverlay,
// que renderiza en un portal — asi la tarjeta no queda recortada por el
// overflow-x-auto del tablero al cruzar de columna).
function LeadCardOverlay({ agenda, stage, pays }: { agenda: Agenda; stage: Stage; pays: Pays }) {
  return (
    <div
      className={cn(
        "bg-card border border-border rounded-lg p-3 border-t-4 shadow-2xl space-y-2 w-60 cursor-grabbing",
        COLUMNS.find(c => c.id === stage)?.color
      )}
    >
      <LeadCardContent agenda={agenda} stage={stage} pays={pays} />
    </div>
  )
}

// ── Columna genérica (una sola drop-zone) ─────────────────────────────────────
function KanbanColumn({ col, leads, pays, onOpenDetail }: { col: ColumnDef; leads: Agenda[]; pays: Pays; onOpenDetail: (a: Agenda) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id })
  return (
    <div ref={setNodeRef} className={cn("flex-shrink-0 w-64 rounded-xl transition-colors", isOver && "ring-2 ring-primary/40 bg-primary/5")}>
      <div
        className={cn(
          "space-y-2 min-h-48 rounded-lg transition-colors",
        )}
      >
        {leads.map((a) => (
          <LeadCard key={a.id} agenda={a} stage={col.id} pays={pays} onOpenDetail={onOpenDetail} />
        ))}
        {leads.length === 0 && (
          <div className="h-20 border border-dashed border-border rounded-lg flex items-center justify-center">
            <p className="text-xs text-muted-foreground">Sin leads</p>
          </div>
        )}
      </div>
    </div>
  )
}

function ColumnHeader({ col, count }: { col: ColumnDef; count: number }) {
  return (
    <div className={cn("flex w-64 flex-shrink-0 items-center justify-between rounded-lg border border-background/60 px-3 py-2 shadow-sm backdrop-blur-xl", col.headerBg)}>
      <div className="flex items-center gap-2">
        <span className={cn("w-2 h-2 rounded-full flex-shrink-0", col.dot)} />
        <span className="font-semibold text-sm text-foreground">{col.label}</span>
      </div>
      <span className="text-xs font-bold text-muted-foreground bg-background/60 px-2 py-0.5 rounded-full">{count}</span>
    </div>
  )
}

function SubZone({ dropId, label, count, leads, pays, onOpenDetail, stage, ringClass }: {
  dropId: string; label: string; count: number; leads: Agenda[]; pays: Pays
  onOpenDetail: (a: Agenda) => void; stage: Stage; ringClass: string
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId })
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 px-0.5">
        {label} · {count}
      </p>
      <div
        ref={setNodeRef}
        className={cn("space-y-2 min-h-20 rounded-lg transition-colors p-1", isOver && ringClass)}
      >
        {leads.map((a) => (
          <LeadCard key={a.id} agenda={a} stage={stage} pays={pays} onOpenDetail={onOpenDetail} />
        ))}
        {leads.length === 0 && (
          <div className="h-16 border border-dashed border-border rounded-lg flex items-center justify-center">
            <p className="text-xs text-muted-foreground">Soltá acá</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Columna "Cerrados" — 2 sub-secciones (PIF / Plan de Pago) ─────────────────
// Cada columna con sub-secciones es su propio componente (no una rama
// condicional dentro de KanbanColumn) para que los useDroppable de cada
// sub-zona se registren una sola vez — si se llaman dentro de un componente
// compartido por varias columnas, las otras columnas tambien registran esos
// mismos ids (con ref=null al no renderizarlos), pisando el registro real y
// rompiendo el drop entero (nos paso una vez, por eso el patron separado).
function CerradoColumn({ col, leads, pays, onOpenDetail }: { col: ColumnDef; leads: Agenda[]; pays: Pays; onOpenDetail: (a: Agenda) => void }) {
  const pifLeads = leads.filter(a => tipoCierre(a, pays) === "pif")
  const ppLeads = leads.filter(a => tipoCierre(a, pays) === "plan_pago")
  return (
    <div className="flex-shrink-0 w-64">
      <div className="space-y-4">
        <SubZone dropId="cerrado_pif" label="Completo (PIF)" count={pifLeads.length} leads={pifLeads} pays={pays} onOpenDetail={onOpenDetail} stage={col.id} ringClass="ring-2 ring-emerald-500/40 bg-emerald-500/5" />
        <SubZone dropId="cerrado_pp" label="Plan de Pago" count={ppLeads.length} leads={ppLeads} pays={pays} onOpenDetail={onOpenDetail} stage={col.id} ringClass="ring-2 ring-amber-500/40 bg-amber-500/5" />
      </div>
    </div>
  )
}

// ── Columna "No Cerrados" — 4 sub-secciones ───────────────────────────────────
function NoCerradoColumn({ col, leads, pays, onOpenDetail }: { col: ColumnDef; leads: Agenda[]; pays: Pays; onOpenDetail: (a: Agenda) => void }) {
  const grupos = NO_CERRADO_MOTIVOS.map(m => ({ ...m, leads: leads.filter(a => tipoNoCierre(a) === m.key) }))
  return (
    <div className="flex-shrink-0 w-64">
      <div className="space-y-4">
        {grupos.map(g => (
          <SubZone key={g.dropId} dropId={g.dropId} label={g.label} count={g.leads.length} leads={g.leads} pays={pays} onOpenDetail={onOpenDetail} stage={col.id} ringClass="ring-2 ring-orange-500/40 bg-orange-500/5" />
        ))}
      </div>
    </div>
  )
}

// ── Columna "Archivados" — 4 sub-secciones ────────────────────────────────────
function ArchivadoColumn({ col, leads, pays, onOpenDetail }: { col: ColumnDef; leads: Agenda[]; pays: Pays; onOpenDetail: (a: Agenda) => void }) {
  const grupos = ARCHIVADO_MOTIVOS.map(m => ({ ...m, leads: leads.filter(a => tipoArchivado(a) === m.key) }))
  return (
    <div className="flex-shrink-0 w-64">
      <div className="space-y-4">
        {grupos.map(g => (
          <SubZone key={g.dropId} dropId={g.dropId} label={g.label} count={g.leads.length} leads={g.leads} pays={pays} onOpenDetail={onOpenDetail} stage={col.id} ringClass="ring-2 ring-slate-400/40 bg-slate-400/5" />
        ))}
      </div>
    </div>
  )
}

// ── Search result row ─────────────────────────────────────────────────────────
function SearchRow({ agenda, stage, pays, onOpenDetail }: { agenda: Agenda; stage: Stage; pays: Pays; onOpenDetail: (a: Agenda) => void }) {
  const ck = calKey(agenda.calificacion)
  const col = COLUMNS.find(c => c.id === stage)
  const cierre = stage === "cerrado" ? tipoCierre(agenda, pays) : null
  const noCierre = stage === "no_cerrado" ? tipoNoCierre(agenda) : null
  const archivo = stage === "archivado" ? tipoArchivado(agenda) : null
  return (
    <button
      type="button"
      onClick={() => onOpenDetail(agenda)}
      className={cn(
        "w-full text-left bg-card border border-border rounded-lg px-4 py-3 border-l-4 flex items-center gap-4 hover:bg-muted/30 transition-colors",
        col?.color.replace("border-t-", "border-l-")
      )}
    >
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-foreground">{agenda.nombre}</p>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
          <span>{agenda.closer || "—"}{agenda.setter ? ` · ${agenda.setter}` : ""}</span>
          <span>Call: {formatDateTime(agenda.fecha_closer || agenda.fecha_agenda)}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
        <Badge variant="outline" className={cn("text-xs font-semibold", calColors[ck] || calColors.C)}>{ck}</Badge>
        <Badge variant="outline" className={cn("text-xs font-semibold", STAGE_BADGE[stage])}>{col?.label}</Badge>
        {cierre && <Badge variant="outline" className={cn("text-xs font-semibold", CIERRE_BADGE[cierre])}>{CIERRE_LABEL[cierre]}</Badge>}
        {noCierre && <Badge variant="outline" className={cn("text-xs font-semibold", NOCERRADO_BADGE[noCierre])}>{noCierre}</Badge>}
        {archivo && <Badge variant="outline" className={cn("text-xs font-semibold", ARCHIVADO_BADGE[archivo])}>{archivo}</Badge>}
      </div>
    </button>
  )
}

// ── Detalle del lead (modal al hacer click en la tarjeta) ─────────────────────
function DetailField({ label, value, icon: Icon, wide = false }: { label: string; value: React.ReactNode; icon?: React.ElementType; wide?: boolean }) {
  if (value === null || value === undefined || value === "") return null
  return (
    <div className={cn("group rounded-2xl border border-white/70 bg-white/65 p-3.5 shadow-[0_8px_30px_rgba(15,23,42,.04)] backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-[0_12px_35px_rgba(124,58,237,.09)] dark:border-white/10 dark:bg-white/[.045]", wide && "sm:col-span-2")}>
      <div className="mb-2 flex items-center gap-2">
        {Icon && <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-violet-500/15 to-fuchsia-400/10 text-violet-600 dark:text-violet-300"><Icon className="h-3.5 w-3.5" /></span>}
        <p className="text-[9px] font-black uppercase tracking-[.16em] text-muted-foreground">{label}</p>
      </div>
      <div className="break-words text-[13px] font-semibold leading-relaxed text-foreground">{value}</div>
    </div>
  )
}

function DetailSection({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2 px-1">
        <span className="grid h-8 w-8 place-items-center rounded-xl border border-violet-200/70 bg-violet-500/10 text-violet-600 shadow-sm dark:border-violet-400/15 dark:text-violet-300"><Icon className="h-4 w-4" /></span>
        <h3 className="text-[11px] font-black uppercase tracking-[.18em] text-foreground/75">{title}</h3>
        <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
      </div>
      {children}
    </section>
  )
}

function LeadDetailDialog({ agenda, stage, pays, onClose, onSaved }: { agenda: Agenda | null; stage: Stage | null; pays: Pays; onClose: () => void; onSaved: (agenda: Agenda) => void }) {
  const missing = agenda && stage ? pipelineMissing(agenda, stage) : []
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Agenda>>({})
  const [saving, setSaving] = useState(false)
  const editIsTriageCancelled = CANCELADO_VALUES.has(norm(editForm.call_confirmer || ""))
  useEffect(() => { setEditForm(agenda ? { ...agenda } : {}); setEditMode(false) }, [agenda])
  const ef = (key: keyof Agenda, value: unknown) => setEditForm(prev => ({ ...prev, [key]: value }))
  const saveDirect = async () => {
    if (!agenda?.id) return
    setSaving(true)
    const updates = { ...editForm }
    if (updates.show === false) Object.assign(updates, { estado: "No Show", cerro: false, motivo_no_cierre: null })
    if (updates.show === true && updates.estado === "No Show") updates.estado = null
    const { id: _id, ...body } = updates
    const response = await fetch("/api/agendas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: agenda.id, ...body }) })
    setSaving(false)
    if (!response.ok) return
    const updated = { ...agenda, ...body } as Agenda
    onSaved(updated)
    setEditMode(false)
  }
  const inputClass = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
  return (
    <Dialog open={!!agenda} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="grid max-h-[90vh] max-w-3xl grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden border-white/60 bg-gradient-to-br from-white via-white to-violet-50/80 p-0 shadow-[0_30px_100px_rgba(15,23,42,.28)] dark:border-white/10 dark:from-zinc-950 dark:via-zinc-950 dark:to-violet-950/30 [&>button]:right-5 [&>button]:top-5 [&>button]:z-20 [&>button]:grid [&>button]:h-10 [&>button]:w-10 [&>button]:place-items-center [&>button]:rounded-xl [&>button]:border [&>button]:bg-background/80 [&>button]:shadow-lg [&>button]:backdrop-blur">
        {agenda && (
          <>
            <DialogHeader className="relative overflow-hidden border-b border-violet-100/70 px-6 pb-6 pt-7 text-left dark:border-white/10 sm:px-8">
              <div className="absolute -right-12 -top-20 h-52 w-52 rounded-full bg-violet-400/20 blur-3xl" />
              <div className="absolute left-1/3 top-0 h-24 w-48 rounded-full bg-cyan-300/10 blur-3xl" />
              <div className="relative flex items-center gap-4 pr-12">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 via-fuchsia-500 to-cyan-400 text-xl font-black text-white shadow-[0_12px_30px_rgba(124,58,237,.28)] ring-4 ring-white/70 dark:ring-white/10">
                  {(agenda.nombre || "?").trim().charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-[10px] font-black uppercase tracking-[.2em] text-violet-600/80 dark:text-violet-300">Ficha del lead</p>
                  <DialogTitle className="truncate text-2xl font-black tracking-tight sm:text-3xl">{agenda.nombre}</DialogTitle>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={cn("rounded-full px-3 py-1 text-xs font-black shadow-sm", calColors[calKey(agenda.calificacion)] || calColors.C)}>
                  {calKey(agenda.calificacion)}
                </Badge>
                {stage && <Badge variant="outline" className={cn("rounded-full px-3 py-1 text-xs font-bold shadow-sm", STAGE_BADGE[stage])}>{COLUMNS.find(c => c.id === stage)?.label}</Badge>}
                {agenda.rescatado && (
                  <Badge variant="outline" className="rounded-full border-fuchsia-500/20 bg-fuchsia-500/10 px-3 py-1 text-xs font-bold text-fuchsia-600 shadow-sm">
                    <Star className="h-3 w-3 mr-1 fill-fuchsia-600" />Rescatado
                  </Badge>
                )}
                <button type="button" onClick={() => setEditMode(v => !v)} className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-black text-white shadow-sm hover:bg-violet-700">
                  <Pencil className="h-3.5 w-3.5" />{editMode ? "Ver ficha" : "Editar ahora"}
                </button>
                  </div>
                </div>
              </div>
            </DialogHeader>
            <div className="min-h-0 space-y-7 overflow-y-auto overscroll-contain px-6 py-6 [-webkit-overflow-scrolling:touch] sm:px-8">
              {editMode && (
                <div className="rounded-3xl border border-violet-500/20 bg-violet-500/[.055] p-5">
                  <div className="mb-4"><p className="text-sm font-black">Completar sin salir del Pipeline</p><p className="mt-1 text-xs text-muted-foreground">Solo datos manuales del resultado y la operación.</p></div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <button type="button" onClick={() => { ef("show", null); ef("call_confirmer", null); if (editForm.estado === "No Show") ef("estado", null) }} className={cn("rounded-xl border py-2 text-xs font-bold", editForm.show == null && !editIsTriageCancelled ? "border-amber-500 bg-amber-500/10 text-amber-700" : "border-border")}>Pendiente</button>
                      <button type="button" onClick={() => { ef("show", true); ef("call_confirmer", null) }} className={cn("rounded-xl border py-2 text-xs font-bold", editForm.show === true && !editIsTriageCancelled ? "border-emerald-500 bg-emerald-500/10 text-emerald-700" : "border-border")}>Se presentó</button>
                      <button type="button" onClick={() => { ef("show", false); ef("cerro", false); ef("call_confirmer", null) }} className={cn("rounded-xl border py-2 text-xs font-bold", editForm.show === false && !editIsTriageCancelled ? "border-red-500 bg-red-500/10 text-red-600" : "border-border")}>No se presentó</button>
                      <button type="button" onClick={() => { ef("show", null); ef("cerro", false); ef("estado", null); ef("motivo_no_cierre", null); ef("call_confirmer", "Cancelada por Triage") }} className={cn("rounded-xl border px-2 py-2 text-xs font-bold", editIsTriageCancelled ? "border-slate-500 bg-slate-500/10 text-slate-700" : "border-border")}>Cancelado por Triage</button>
                    </div>
                    {editForm.show === true && <>
                      <select className={inputClass} value={editForm.cerro ? "si" : "no"} onChange={e => ef("cerro", e.target.value === "si")}><option value="no">No cerró</option><option value="si">Cerró</option></select>
                      <input className={inputClass} value={editForm.link_fathom || ""} onChange={e => ef("link_fathom", e.target.value)} placeholder="Link Fathom" />
                      {!editForm.cerro && <input className={inputClass} value={editForm.motivo_no_cierre || ""} onChange={e => ef("motivo_no_cierre", e.target.value)} placeholder="Motivo de no cierre" />}
                      {editForm.cerro && <>
                        <input className={inputClass} value={editForm.estado || ""} onChange={e => ef("estado", e.target.value)} placeholder="Estado (Fee / Adentro)" />
                        <input className={inputClass} value={editForm.operacion || ""} onChange={e => ef("operacion", e.target.value)} placeholder="Operación" />
                        <input className={inputClass} value={editForm.plan_de_pago || ""} onChange={e => ef("plan_de_pago", e.target.value)} placeholder="Plan de pago" />
                        <input className={inputClass} value={editForm.medio_de_pago || ""} onChange={e => ef("medio_de_pago", e.target.value)} placeholder="Medio de pago" />
                        <input className={inputClass} value={editForm.comprobante || ""} onChange={e => ef("comprobante", e.target.value)} placeholder="Link comprobante" />
                        <input type="number" className={inputClass} value={editForm.cc_dia_1 || ""} onChange={e => ef("cc_dia_1", Number(e.target.value) || null)} placeholder="CC día 1" />
                        <input type="date" className={inputClass} value={String(editForm.fecha_tc || "").slice(0, 10)} onChange={e => ef("fecha_tc", e.target.value)} />
                      </>}
                    </>}
                  </div>
                  <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setEditMode(false)} className="rounded-xl border border-border px-4 py-2 text-xs font-bold">Cancelar</button><button type="button" onClick={saveDirect} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Guardar cambios</button></div>
                </div>
              )}
              {stage && (stage === "presentado" || stage === "no_cerrado" || stage === "fee" || stage === "cerrado") && (
                <div className={cn(
                  "rounded-2xl border p-4",
                  missing.length ? "border-red-500/25 bg-red-500/[.07]" : "border-emerald-500/25 bg-emerald-500/[.07]",
                )}>
                  <div className="flex items-start gap-3">
                    {missing.length ? <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-500" /> : <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />}
                    <div>
                      <p className="text-sm font-black">{missing.length ? "Qué falta completar" : "Registro completo"}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {missing.length ? missing.join(" · ") : "No quedan campos operativos pendientes para el closer."}
                      </p>
                      {missing.length > 0 && (
                        <a
                          href="#"
                          onClick={(event) => { event.preventDefault(); setEditMode(true) }}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-red-500 px-3 py-2 text-xs font-black text-white shadow-sm transition hover:bg-red-600"
                        >
                          Completar acá <Pencil className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )}
              <DetailSection icon={User} title="Contacto y responsables">
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailField icon={Phone} label="WhatsApp" value={agenda.telefono} />
                <DetailField icon={Mail} label="Email" value={agenda.email} />
                <DetailField icon={Instagram} label="Instagram" value={agenda.instagram} />
                <DetailField icon={UserRoundCheck} label="Closer" value={agenda.closer} />
                <DetailField icon={Sparkles} label="Setter" value={agenda.setter} />
              </div>
              </DetailSection>
              {agenda.calificacion_crm_original && agenda.calificacion_crm_original !== agenda.calificacion && (
                <DetailField label="Calificación Original (CRM)" value={agenda.calificacion_crm_original} />
              )}
              <DetailSection icon={CalendarDays} title="Agenda y llamada">
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailField icon={CalendarDays} label="Agendó" value={formatDateTime(agenda.fecha_agenda)} />
                <DetailField icon={Clock3} label="Fecha de llamada" value={formatDateTime(agenda.fecha_closer)} />
                <DetailField icon={Radio} label="Fuente" value={agenda.fuente} />
                <DetailField
                  icon={Link2}
                  label="Contenido de origen"
                  value={agenda.recurso || pays.get(norm(agenda.nombre || ""))?.contenidoContestado || "Contenido no identificado"}
                  wide
                />
                <DetailField icon={UserRoundCheck} label="Confirmación" value={agenda.call_confirmer} />
              </div>
              {agenda.link_fathom && (
                <a href={agenda.link_fathom} target="_blank" rel="noopener noreferrer" className="mt-3 flex w-full items-center justify-between rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-3 text-sm font-bold text-white shadow-[0_10px_25px_rgba(124,58,237,.22)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(124,58,237,.3)]">
                    <span className="inline-flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white/15"><Link2 className="h-4 w-4" /></span>Ver grabación de la llamada</span><ArrowUpRight className="h-4 w-4" />
                  </a>
              )}
              </DetailSection>
              <DetailSection icon={Target} title="Contexto del lead">
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailField icon={MessageSquareText} label="Problema actual" value={agenda.problema_actual} wide />
                <DetailField icon={Clock3} label="Hace cuánto arrastra el problema" value={agenda.tiempo_problema} wide />
                <DetailField icon={MessageSquareText} label="Intentos previos" value={agenda.intentos_previos} wide />
                <DetailField icon={Target} label="Motivo de urgencia" value={agenda.motivo_urgencia} wide />
                <DetailField icon={BriefcaseBusiness} label="Ocupación" value={agenda.ocupacion} />
                <DetailField icon={WalletCards} label="Ingresos" value={agenda.ingresos} />
                <DetailField icon={WalletCards} label="Capacidad de inversión" value={agenda.inversion} wide />
              </div>
              </DetailSection>
              {(agenda.motivo_no_cierre || agenda.motivo_inclusion || agenda.resumen_chat) && <DetailSection icon={MessageSquareText} title="Resultado y notas">
              <div className="grid gap-3 sm:grid-cols-2">
              {agenda.motivo_no_cierre && <DetailField label="Motivo de no cierre" value={agenda.motivo_no_cierre} />}
              <DetailField label="Motivo de inclusión" value={agenda.motivo_inclusion} />
              {agenda.resumen_chat && (
                <div className="rounded-2xl border border-violet-200/60 bg-violet-500/[.045] p-4 sm:col-span-2 dark:border-violet-400/15">
                  <p className="mb-2 text-[9px] font-black uppercase tracking-[.16em] text-violet-600 dark:text-violet-300">Resumen de la conversación</p>
                  <div className="max-h-64 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {agenda.resumen_chat}
                  </div>
                </div>
              )}
              </div>
              </DetailSection>}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PipelinePage() {
  const session = useSession()
  const [search, setSearch] = useState("")
  const [dateFilter, setDateFilter] = useState("this-month")
  const [closerFiltro, setCloserFiltro] = useState<string[]>([])
  const [califFiltro, setCalifFiltro] = useState<string[]>([])
  const [soloPendientes, setSoloPendientes] = useState(false)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [detailAgenda, setDetailAgenda] = useState<Agenda | null>(null)

  const params = filterToParams(dateFilter)
  const apiUrl = `/api/agendas${params}`

  const { data: agendasAll, isLoading, error, mutate: mutateAgendas } = useSWR<Agenda[]>(apiUrl, fetcher, {
    revalidateOnMount: true,
    revalidateOnFocus: true,
    refreshInterval: 10_000,
    dedupingInterval: 0,
  })
  const { data: pagos } = useSWR<any[]>("/api/pagos", fetcher, { revalidateOnFocus: true, refreshInterval: 10_000 })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // Mapa nombre -> tiene pago fee / tiene pago real (no-fee) / PIF / plan de pago
  const pays = useMemo<Pays>(() => {
    const m: Pays = new Map()
    for (const pg of (pagos || [])) {
      const key = norm(pg.cliente || "")
      if (!key || !pg.tipo) continue
      const cur = m.get(key) || { hasFee: false, hasNonFee: false, hasPIF: false, hasPP: false, contenidoContestado: null }
      if (!cur.contenidoContestado && pg.contenido_contestado) {
        cur.contenidoContestado = String(pg.contenido_contestado).trim() || null
      }
      if (FEE_TIPOS.has(pg.tipo)) {
        cur.hasFee = true
      } else {
        cur.hasNonFee = true
        const op = String(pg.operacion || "")
        if (/\bPIF\b/i.test(op)) cur.hasPIF = true
        if (/\bPP\b/i.test(op)) cur.hasPP = true
      }
      m.set(key, cur)
    }
    return m
  }, [pagos])

  const closersDisponibles = useMemo(() => {
    const set = new Set<string>()
    for (const a of agendasAll || []) {
      const c = (a.closer || "").trim()
      if (c) set.add(c)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [agendasAll])

  useEffect(() => {
    if (session.rol === "CEO" || session.rol === "Contaduria" || !session.nombre || closersDisponibles.length === 0) return
    const ownFirstName = firstWord(session.nombre).toLowerCase()
    const ownCloser = closersDisponibles.find((name) => firstWord(name).toLowerCase() === ownFirstName)
    if (ownCloser) setCloserFiltro([ownCloser])
  }, [session.nombre, session.rol, closersDisponibles])

  const CALIF_OPCIONES = ["LEAD S", "LEAD A", "LEAD B", "LEAD C"]

  const agendas = useMemo(() => {
    if (!agendasAll) return undefined
    return agendasAll.filter(a => {
      const stage = getStage(a, pays)
      return (!closerFiltro.length || closerFiltro.includes((a.closer || "").trim())) &&
        (!califFiltro.length || califFiltro.includes(a.calificacion || "")) &&
        (!soloPendientes || Boolean(stage && pipelineMissing(a, stage).length))
    })
  }, [agendasAll, closerFiltro, califFiltro, soloPendientes, pays])

  const pendingCount = useMemo(() => (agendasAll || []).filter(a => {
    const stage = getStage(a, pays)
    return (!closerFiltro.length || closerFiltro.includes((a.closer || "").trim())) &&
      Boolean(stage && pipelineMissing(a, stage).length)
  }).length, [agendasAll, closerFiltro, pays])

  const grouped = useMemo(() => {
    const result: Record<Stage, Agenda[]> = {
      confirmado: [], no_show: [], presentado: [], no_cerrado: [], fee: [], cerrado: [], archivado: [],
    }
    if (!agendas) return result
    for (const a of agendas) {
      const stage = getStage(a, pays)
      if (stage) result[stage].push(a)
    }
    return result
  }, [agendas, pays])

  const searchResults = useMemo(() => {
    const q = norm(search)
    if (!q || !agendas) return []
    return agendas
      .map(a => ({ agenda: a, stage: getStage(a, pays) }))
      .filter((x): x is { agenda: Agenda; stage: Stage } => x.stage !== null && norm(x.agenda.nombre || "").includes(q))
      .sort((a, b) => (b.agenda.fecha_agenda || "").localeCompare(a.agenda.fecha_agenda || ""))
  }, [search, agendas, pays])

  const isSearching = search.trim().length > 0

  const activeAgenda = useMemo(
    () => (activeId != null ? agendas?.find(a => a.id === activeId) : undefined),
    [activeId, agendas]
  )
  const activeStage = activeAgenda ? getStage(activeAgenda, pays) : null
  const detailStage = detailAgenda ? getStage(detailAgenda, pays) : null

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as number)
  }

  // Aplica una actualizacion de etapa: optimista en el cache local + PATCH al
  // backend, con revert si falla.
  async function applyStageUpdate(agendaId: number, updates: Partial<Agenda>) {
    if (!agendasAll) return
    const previousAgendas = agendasAll
    const optimisticAgendas = agendasAll.map(a => (a.id === agendaId ? { ...a, ...updates } : a))
    mutateAgendas(optimisticAgendas, { revalidate: false })
    try {
      const res = await fetch("/api/agendas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: agendaId, ...updates }),
      })
      if (!res.ok) throw new Error(`PATCH /api/agendas fallo con status ${res.status}`)
      mutateAgendas()
    } catch (err) {
      console.error("Error al mover el lead en el pipeline:", err)
      mutateAgendas(previousAgendas, { revalidate: false })
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    if (!over || !agendas) return

    const overId = over.id as string
    const agendaId = active.id as number
    const agenda = agendas.find(a => a.id === agendaId)
    if (!agenda) return

    const currentStage = getStage(agenda, pays)

    // Sub-secciones de Cerrados: PIF vs Plan de Pago
    if (overId === "cerrado_pif" || overId === "cerrado_pp") {
      const targetSub: CierreTipo = overId === "cerrado_pif" ? "pif" : "plan_pago"
      if (currentStage === "cerrado" && tipoCierre(agenda, pays) === targetSub) return
      await applyStageUpdate(agendaId, { estado: "Adentro en Call", cerro: true, motivo_no_cierre: null, tipo_cierre: targetSub })
      return
    }

    // Sub-secciones de No Cerrados: motivo elegido a mano
    const noCerradoMatch = NO_CERRADO_MOTIVOS.find(m => m.dropId === overId)
    if (noCerradoMatch) {
      if (currentStage === "no_cerrado" && tipoNoCierre(agenda) === noCerradoMatch.key) return
      await applyStageUpdate(agendaId, { estado: null, cerro: false, show: true, motivo_no_cierre: noCerradoMatch.key, tipo_cierre: null })
      return
    }

    // Sub-secciones de Archivados: eligen el call_confirmer real (unico campo
    // que distingue "cancelado en triage" de "nunca respondio" en la base)
    const archivadoMatch = ARCHIVADO_MOTIVOS.find(m => m.dropId === overId)
    if (archivadoMatch) {
      if (currentStage === "archivado" && tipoArchivado(agenda) === archivadoMatch.key) return
      const confirmerValue = archivadoMatch.key === "Nunca respondió" ? "No Respondió" : "Cancelada por Triage"
      await applyStageUpdate(agendaId, { estado: null, cerro: false, call_confirmer: confirmerValue, motivo_no_cierre: null, tipo_cierre: null })
      return
    }

    // Columnas simples: Agenda Confirmada, No se Presentó, Se Presentó, Fees
    if (overId === "confirmado" || overId === "no_show" || overId === "presentado" || overId === "fee") {
      if (currentStage === overId) return
      await applyStageUpdate(agendaId, STAGE_UPDATES[overId])
    }
  }

  return (
    <div className="page-enter mx-auto max-w-[1700px] p-4 sm:p-6 lg:p-8 xl:p-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-black tracking-[-.04em] text-foreground sm:text-4xl">Pipeline
            <HelpHint text="Arrastrá la tarjeta del lead a la columna correcta según el resultado: Confirmada → No se presentó, No Cerrado, Fee o Cerrado. Falta Resultado no es una etapa comercial: reúne llamadas presentadas cuyo desenlace todavía no fue cargado." />
          </h1>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <DateFilter onFilterChange={setDateFilter} />
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar lead por nombre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-sm bg-muted/40 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filtros de Closer y Calificación */}
      <div className="glass mb-6 flex flex-wrap gap-5 rounded-2xl p-4">
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground font-medium">Closer</p>
          <div className="flex flex-wrap gap-1.5">
            <FilterPill active={!closerFiltro.length} onClick={() => setCloserFiltro([])}>Todos</FilterPill>
            {closersDisponibles.map(c => (
              <FilterPill key={c} active={closerFiltro.includes(c)} onClick={() => setCloserFiltro(values => values.includes(c) ? values.filter(v => v !== c) : [...values, c])}>{c}</FilterPill>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground font-medium">Calificación</p>
          <div className="flex flex-wrap gap-1.5">
            <FilterPill active={!califFiltro.length} onClick={() => setCalifFiltro([])}>Todos</FilterPill>
            {CALIF_OPCIONES.map(c => (
              <FilterPill key={c} active={califFiltro.includes(c)} onClick={() => setCalifFiltro(values => values.includes(c) ? values.filter(v => v !== c) : [...values, c])}>{c.replace("LEAD ", "")}</FilterPill>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground font-medium">Trabajo pendiente</p>
          <FilterPill active={soloPendientes} onClick={() => setSoloPendientes(v => !v)}>
            {soloPendientes ? "Mostrando pendientes" : "Solo pendientes"} · {pendingCount}
          </FilterPill>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="text-center py-20 text-muted-foreground">Error al cargar el pipeline</div>
      ) : isSearching ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground mb-3">
            {searchResults.length} resultado{searchResults.length !== 1 ? "s" : ""} para &quot;{search}&quot;
          </p>
          {searchResults.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground text-sm">No se encontraron leads</div>
          ) : (
            searchResults.map(({ agenda, stage }) => (
              <SearchRow key={agenda.id} agenda={agenda} stage={stage} pays={pays} onOpenDetail={setDetailAgenda} />
            ))
          )}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="max-h-[calc(100vh-18rem)] min-h-[28rem] overflow-auto rounded-3xl bg-muted/25 [scrollbar-gutter:stable]">
            <div className="min-w-max p-4 pb-5">
              <div className="sticky top-0 z-40 -mx-4 mb-3 bg-background/95 px-4 pb-3 pt-1 shadow-[0_10px_20px_-18px_rgba(0,0,0,.8)] backdrop-blur-xl">
                <div className="flex gap-4">
                  {COLUMNS.map(col => <ColumnHeader key={col.id} col={col} count={(grouped[col.id] || []).length} />)}
                </div>
              </div>
              <div className="flex gap-4">
                {COLUMNS.map((col) => {
                  const leads = grouped[col.id] || []
                  if (col.id === "cerrado") return <CerradoColumn key={col.id} col={col} leads={leads} pays={pays} onOpenDetail={setDetailAgenda} />
                  if (col.id === "no_cerrado") return <NoCerradoColumn key={col.id} col={col} leads={leads} pays={pays} onOpenDetail={setDetailAgenda} />
                  if (col.id === "archivado") return <ArchivadoColumn key={col.id} col={col} leads={leads} pays={pays} onOpenDetail={setDetailAgenda} />
                  return <KanbanColumn key={col.id} col={col} leads={leads} pays={pays} onOpenDetail={setDetailAgenda} />
                })}
              </div>
            </div>
          </div>

          <DragOverlay>
            {activeAgenda && activeStage ? (
              <LeadCardOverlay agenda={activeAgenda} stage={activeStage} pays={pays} />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <LeadDetailDialog agenda={detailAgenda} stage={detailStage} pays={pays} onClose={() => setDetailAgenda(null)} onSaved={(updated) => { setDetailAgenda(updated); mutateAgendas() }} />
    </div>
  )
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-full border text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}
