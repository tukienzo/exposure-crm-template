"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import useSWR, { mutate } from "swr"
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
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { Users, Loader2, Search, X, Save, Link2, Phone, UserRoundCheck, Activity, UserRoundX, CalendarCheck, Archive } from "lucide-react"
import type { Cliente } from "@/lib/supabase"
import { OPERACION_LABELS as OPERACION_OPTS, OPERACION_LABELS as OPERACION_RESELL_OPTS } from "@/lib/operaciones"
import { CrmPageIntro, CrmStat } from "@/components/crm-ui"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

function parseLocalDate(str: string | null | undefined): Date | null {
  if (!str) return null
  const s = str.split("T")[0]
  const parts = s.split("-").map(Number)
  if (parts.length !== 3) return null
  return new Date(parts[0], parts[1] - 1, parts[2])
}

function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
}

const calColors: Record<string, string> = {
  "LEAD S": "bg-violet-600 text-white border-violet-700",
  "LEAD A": "bg-green-600 text-white border-green-700",
  "LEAD B": "bg-yellow-400 text-black border-yellow-500",
  "LEAD C": "bg-blue-600 text-white border-blue-700",
  "LEAD D": "bg-red-600 text-white border-red-700",
}

const pitchColors: Record<string, string> = {
  "Ofrecido y Pagó": "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  "Pitcheado": "bg-blue-500/10 text-blue-600 border-blue-500/20",
  "Ofrecido y Rechazado": "bg-red-500/10 text-red-600 border-red-500/20",
  "No cualifica": "bg-muted text-muted-foreground border-border",
  "No ofrecido": "bg-muted text-muted-foreground border-border",
}

const DURACION_OPTS = ["1 Mes", "2 Meses", "4 Meses", "6 Meses", "8 Meses", "12 Meses"]

const MEDIO_PAGO_OPTS = [
  "Stripe (Tarjeta)", "Pesos (RECA)", "USDT (TRC20)", "Efectivo USD",
  "Western Union", "USD (CTA PA)", "Binance", "Pesos (CTA PA)", "PayPal (CTA PA)",
]

const PITCH_OPTS = ["No ofrecido", "Ofrecido y Pagó", "Ofrecido y Rechazado", "No cualifica", "Pitcheado"]

const CALIFICACION_OPTS = ["LEAD S", "LEAD A", "LEAD B", "LEAD C", "LEAD D"]

const ESTADO_OPTS = ["1° Llamada 1:1", "2° Llamada 1:1", "3° Llamada 1:1", "4° Llamada 1:1"]
const HEALTH_OPTS = ["verde", "amarillo", "rojo"]
const BACKEND_PRIORITY_OPTS = ["alta", "media", "baja", "no_aplica"]
const BACKEND_STATUS_OPTS = ["sin_evaluar", "contactar", "conversando", "ofertado", "cerrado", "no_ahora", "no_califica"]
const RENEWAL_STATUS_OPTS = ["sin_evaluar", "ofrecer", "ofrecido", "negociando", "renovado", "perdido", "no_aplica"]

// ── Etapas del pipeline de clientes ───────────────────────────────────────────
// El alta en onboarding_pendiente nace automáticamente de un pago que habilita
// acceso. El avance posterior sigue siendo operativo y queda visible mediante
// los hitos de formulario, contrato, accesos y llamada.
type Etapa = "onboarding_pendiente" | "primera_call_pendiente" | "segunda_call_pendiente" | "call_45d_pendiente" | "entrega_activa" | "vencido"

const ETAPAS: { id: Etapa; label: string; color: string; headerBg: string; dot: string }[] = [
  { id: "onboarding_pendiente",     label: "Onboarding pendiente", color: "border-t-amber-500",  headerBg: "bg-amber-500/10",  dot: "bg-amber-500" },
  { id: "primera_call_pendiente",   label: "1.ª call pendiente",   color: "border-t-cyan-500",   headerBg: "bg-cyan-500/10",   dot: "bg-cyan-500" },
  { id: "segunda_call_pendiente",   label: "2.ª call pendiente",   color: "border-t-blue-500",   headerBg: "bg-blue-500/10",   dot: "bg-blue-500" },
  { id: "call_45d_pendiente",       label: "Call 45 días pendiente", color: "border-t-violet-500", headerBg: "bg-violet-500/10", dot: "bg-violet-500" },
  { id: "entrega_activa",           label: "Entrega activa",       color: "border-t-emerald-500", headerBg: "bg-emerald-500/10", dot: "bg-emerald-500" },
  { id: "vencido",                  label: "Vencidos",             color: "border-t-red-500",     headerBg: "bg-red-500/10",     dot: "bg-red-500" },
]
type EtapaDef = (typeof ETAPAS)[number]

function getEtapa(c: Cliente): Etapa {
  const baja = parseLocalDate(c.fecha_baja)
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  if (baja && baja < hoy) return "vencido"
  const e = c.etapa as Etapa | null | undefined
  if (e && ETAPAS.some(x => x.id === e)) return e
  // Compatibilidad con las cuatro etapas anteriores. No se pierde el estado:
  // se lo traduce a la siguiente acción de entrega definida en la call CSM.
  if (c.etapa === "onboarding_pendiente") return "onboarding_pendiente"
  if (!c.fecha_primer_call) return "primera_call_pendiente"
  if (!c.fecha_proxima_call) return "segunda_call_pendiente"
  if (!c.fecha_3ra_call) return "call_45d_pendiente"
  return "entrega_activa"
}

function programa(c: Cliente): "Acción" | "Consulting" | "Mastermind" | "Sin definir" {
  const value = norm(c.operacion_original || "")
  if (value.includes("mastermind")) return "Mastermind"
  if (value.includes("consulting")) return "Consulting"
  if (value.includes("accion") || value.includes("downsell")) return "Acción"
  return "Sin definir"
}

function getInitials(nombre: string) {
  return nombre.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
}

function formatDate(str: string | null | undefined) {
  const d = parseLocalDate(str)
  if (!d) return "-"
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })
}

function nextOperationalDate(c: Cliente) {
  return c.next_action_at || c.fecha_proxima_call || null
}

// ── Campos del modal de edición ───────────────────────────────────────────────
function FieldSel({ label, value, opts, onChange }: {
  label: string
  value: string | null | undefined
  opts: string[]
  onChange: (v: string | null) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
      <Select
        value={value || "__none__"}
        onValueChange={(v) => onChange(v === "__none__" ? null : v)}
      >
        <SelectTrigger className="h-9 text-sm">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">—</SelectItem>
          {opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

function FieldText({ label, value, onChange }: {
  label: string
  value: string | null | undefined
  onChange: (v: string | null) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
      <input
        type="text"
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-9 px-3 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  )
}

function FieldDate({ label, value, onChange }: {
  label: string
  value: string | null | undefined
  onChange: (v: string | null) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
      <input
        type="date"
        value={value?.split("T")[0] || ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-9 px-3 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring w-full"
      />
    </div>
  )
}

function EditModal({ cliente, onClose }: { cliente: Cliente; onClose: () => void }) {
  const [form, setForm] = useState<Cliente>({ ...cliente })
  const [saving, setSaving] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [error, setError] = useState("")

  const set = (key: keyof Cliente) => (v: string | null) =>
    setForm((f) => ({ ...f, [key]: v }))

  const save = async () => {
    setSaving(true)
    const { id, created_at, ...updates } = form
    const res = await fetch("/api/clientes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    })
    if (res.ok) {
      await mutate((key: string) => typeof key === "string" && key.startsWith("/api/clientes"))
      onClose()
    }
    setSaving(false)
  }

  const archive = async () => {
    const reason = window.prompt(`¿Por qué archivás la ficha de "${cliente.nombre}"?\n\nNo se borra: conserva pagos, historial y trazabilidad.`)
    if (reason === null) return
    if (!reason.trim()) {
      setError("Indicá el motivo para archivar la ficha.")
      return
    }
    setArchiving(true)
    setError("")
    try {
      const res = await fetch("/api/clientes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cliente.id, archive: true, reason: reason.trim() }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || "No se pudo archivar la ficha")
      await mutate((key: string) => typeof key === "string" && key.startsWith("/api/clientes"))
      onClose()
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "No se pudo archivar la ficha")
    } finally {
      setArchiving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-7">
            <DialogTitle className="text-lg">{cliente.nombre}</DialogTitle>
            {cliente.person_id && <Button asChild size="sm" variant="outline">
              <Link href={`/historia-leads?person=${encodeURIComponent(cliente.person_id)}`}>
                <Activity className="mr-1.5 h-3.5 w-3.5" />Trazabilidad completa
              </Link>
            </Button>}
          </div>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 mt-2">
          <FieldText label="Nombre" value={form.nombre} onChange={set("nombre")} />
          <FieldText label="Teléfono" value={form.telefono} onChange={set("telefono")} />
          <FieldSel label="Calificación" value={form.calificacion} opts={CALIFICACION_OPTS} onChange={set("calificacion")} />
          <FieldSel label="Duración" value={form.duracion} opts={DURACION_OPTS} onChange={set("duracion")} />

          <div className="col-span-2">
            <FieldSel label="Etapa (Pipeline de Clientes)" value={form.etapa} opts={ETAPAS.map(e => e.label)} onChange={(v) => {
              const match = ETAPAS.find(e => e.label === v)
              setForm((f) => ({ ...f, etapa: match ? match.id : null }))
            }} />
          </div>

          <div className="col-span-2">
            <FieldSel label="Operación Original" value={form.operacion_original} opts={OPERACION_OPTS} onChange={set("operacion_original")} />
          </div>

          <FieldSel label="Medio de Pago" value={form.medio_de_pago} opts={MEDIO_PAGO_OPTS} onChange={set("medio_de_pago")} />
          <FieldSel label="Pitch" value={form.pitch} opts={PITCH_OPTS} onChange={set("pitch")} />
          <FieldSel label="Hito de llamadas" value={form.estado} opts={ESTADO_OPTS} onChange={(v) => setForm((f) => ({ ...f, estado: v }))} />
          <FieldDate label="Fecha Ingreso" value={form.fecha_ingreso} onChange={set("fecha_ingreso")} />
          <FieldDate label="Fecha Baja" value={form.fecha_baja} onChange={set("fecha_baja")} />
          <FieldDate label="1.ª call con CSM" value={form.fecha_primer_call} onChange={set("fecha_primer_call")} />
          <FieldDate label="2.ª call con CSM" value={form.fecha_proxima_call} onChange={set("fecha_proxima_call")} />
          <FieldDate label="Call de 45 días" value={form.fecha_3ra_call} onChange={set("fecha_3ra_call")} />
          <FieldDate label="Call adicional / proyección" value={form.fecha_4ta_call} onChange={set("fecha_4ta_call")} />

          <div className="col-span-2">
            <FieldText label="Link Llamada de Onboarding (decorativo, todavía no conecta con Fathom)" value={form.link_call_onboarding} onChange={(v) => setForm((f) => ({ ...f, link_call_onboarding: v }))} />
          </div>

          <div className="col-span-2 border-t border-border pt-3 mt-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Checklist de onboarding</p>
            <div className="grid grid-cols-2 gap-4">
              <FieldDate label="Formulario recibido" value={form.onboarding_form_at} onChange={set("onboarding_form_at")} />
              <FieldDate label="Contrato firmado por cliente" value={form.contract_client_signed_at} onChange={set("contract_client_signed_at")} />
              <FieldDate label="Contrato firmado por CEO" value={form.contract_ceo_signed_at} onChange={set("contract_ceo_signed_at")} />
              <FieldDate label="Acceso a grupos de WhatsApp" value={form.discord_access_at} onChange={set("discord_access_at")} />
              <FieldDate label="Acceso a Skool" value={form.skool_access_at} onChange={set("skool_access_at")} />
              <FieldDate label="Onboarding completado" value={form.onboarding_completed_at} onChange={set("onboarding_completed_at")} />
            </div>
          </div>

          <div className="col-span-2 rounded-xl border border-blue-500/15 bg-blue-500/5 p-3 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Entregables según programa:</span>{" "}
            {programa(form) === "Acción" && "1 call corta de plan de acción con CSM; sin coaching privado ni acceso a grupos."}
            {programa(form) === "Consulting" && "3 calls 1:1 con CSM, seguimiento inicial y acceso a comunidad/Skool."}
            {programa(form) === "Mastermind" && "3 calls 1:1 con CSM, calls con Cuenta A y Cuenta B, seguimiento inicial y acceso a comunidad/Skool."}
            {programa(form) === "Sin definir" && "Definí la operación original para mostrar los entregables correctos."}
          </div>

          <div className="col-span-2 border-t border-border pt-3 mt-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">CSM y próxima acción</p>
            <div className="grid grid-cols-2 gap-4">
              <FieldText label="Responsable CSM" value={form.csm_owner} onChange={set("csm_owner")} />
              <FieldSel label="Salud" value={form.health_status} opts={HEALTH_OPTS} onChange={set("health_status")} />
              <FieldDate label="Último contacto" value={form.last_contact_at} onChange={set("last_contact_at")} />
              <FieldDate label="Fecha próxima acción" value={form.next_action_at} onChange={set("next_action_at")} />
              <div className="col-span-2"><FieldText label="Próxima acción" value={form.next_action} onChange={set("next_action")} /></div>
              <div className="col-span-2"><FieldText label="Notas de ciclo de vida" value={form.lifecycle_notes} onChange={set("lifecycle_notes")} /></div>
            </div>
          </div>

          <div className="col-span-2 border-t border-border pt-3 mt-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Oportunidad backend</p>
            <div className="grid grid-cols-2 gap-4">
              <FieldSel label="Prioridad" value={form.backend_priority} opts={BACKEND_PRIORITY_OPTS} onChange={set("backend_priority")} />
              <FieldSel label="Estado" value={form.backend_status} opts={BACKEND_STATUS_OPTS} onChange={set("backend_status")} />
              <FieldText label="Responsable backend" value={form.backend_owner} onChange={set("backend_owner")} />
              <FieldText label="Potencial USD" value={form.backend_potential_usd == null ? null : String(form.backend_potential_usd)} onChange={(v) => setForm((f) => ({ ...f, backend_potential_usd: v ? Number(v) : null }))} />
              <div className="col-span-2"><FieldText label="Oferta backend" value={form.backend_offer} onChange={set("backend_offer")} /></div>
            </div>
          </div>

          <div className="col-span-2 border-t border-border pt-3 mt-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Renovación y retención</p>
            {form.engagement_signal && <div className="mb-3 rounded-lg border bg-muted/35 px-3 py-2 text-xs"><span className="font-semibold">Señal automática:</span> {form.engagement_signal.replaceAll("_", " ")} · {form.engagement_signal_reason || "basada en actividad verificable"}. No modifica la salud manual.</div>}
            <div className="grid grid-cols-2 gap-4">
              <FieldSel label="Estado renovación" value={form.renewal_status} opts={RENEWAL_STATUS_OPTS} onChange={set("renewal_status")} />
              <FieldText label="Potencial USD" value={form.renewal_potential_usd == null ? null : String(form.renewal_potential_usd)} onChange={(v) => setForm((f) => ({ ...f, renewal_potential_usd: v ? Number(v) : null }))} />
              <FieldText label="Probabilidad %" value={form.renewal_probability == null ? null : String(form.renewal_probability)} onChange={(v) => setForm((f) => ({ ...f, renewal_probability: v ? Number(v) : null }))} />
              <FieldText label="Razón de pérdida" value={form.renewal_loss_reason} onChange={set("renewal_loss_reason")} />
            </div>
          </div>

          <div className="col-span-2 border-t border-border pt-3 mt-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Resell / Upsell</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <FieldSel label="Operación Resell / Upsell" value={form.operacion_resell} opts={OPERACION_RESELL_OPTS} onChange={(v) => setForm((f) => ({ ...f, operacion_resell: v }))} />
              </div>
              <FieldSel label="Medio de Pago (Resell)" value={form.medio_pago_resell} opts={MEDIO_PAGO_OPTS} onChange={(v) => setForm((f) => ({ ...f, medio_pago_resell: v }))} />
              <FieldText label="Monto con Descuento" value={form.monto_con_descuento} onChange={(v) => setForm((f) => ({ ...f, monto_con_descuento: v }))} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 mt-6 pt-4 border-t border-border">
          <Button variant="destructive" onClick={archive} disabled={saving || archiving} className="gap-2">
            {archiving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
            {archiving ? "Archivando..." : "Archivar ficha"}
          </Button>
          <div className="ml-auto flex items-center gap-2">
            {error && <p className="max-w-64 text-xs font-medium text-destructive">{error}</p>}
            <Button variant="outline" onClick={onClose} disabled={saving || archiving}>Cancelar</Button>
            <Button onClick={save} disabled={saving || archiving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Tarjeta (arrastrable + click abre el modal) ───────────────────────────────
function ClienteCardContent({ c }: { c: Cliente }) {
  const closer = (c as Cliente & { closer?: string | null }).closer
  const activo = !c.fecha_baja
  const backendPrioritario = activo && ["LEAD S", "LEAD A"].includes(c.calificacion || "") && c.pitch !== "Ofrecido y Pagó"
  const onboardingSteps = [
    c.onboarding_form_at,
    c.contract_client_signed_at,
    c.contract_ceo_signed_at,
    c.discord_access_at,
    c.skool_access_at,
    c.onboarding_completed_at,
  ]
  const onboardingDone = onboardingSteps.filter(Boolean).length
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar className="h-7 w-7 flex-shrink-0">
            <AvatarFallback className={cn("text-[10px] font-semibold", activo ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
              {getInitials(c.nombre)}
            </AvatarFallback>
          </Avatar>
          <p className="font-semibold text-sm text-foreground leading-tight truncate">{c.nombre}</p>
        </div>
        {c.calificacion && (
          <Badge variant="outline" className={cn("text-xs flex-shrink-0 font-semibold", calColors[c.calificacion] || "bg-muted text-muted-foreground border-border")}>
            {c.calificacion.replace("LEAD ", "")}
          </Badge>
        )}
      </div>
      <div className={cn("flex items-center gap-1 text-xs", c.telefono ? "text-muted-foreground" : "font-medium text-red-500")}>
        <Phone className="h-3 w-3 flex-shrink-0" />
        <span className="truncate">{c.telefono || "Sin teléfono registrado"}</span>
      </div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
        <Badge variant="outline" className="text-[10px] font-bold">{programa(c)}</Badge>
        <span>{c.operacion_original || "Sin operación"}</span>
        {c.duracion && <span>· {c.duracion}</span>}
      </div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Closer:</span>
        <span>{closer || "Sin closer asignado"}</span>
      </div>
      {nextOperationalDate(c) && (
        <div className="rounded-md border border-blue-500/15 bg-blue-500/5 px-2 py-1.5 text-xs text-muted-foreground">
          <p><span className="font-semibold text-foreground">Próx. acción:</span> {formatDate(nextOperationalDate(c))}</p>
          {c.next_action && <p className="mt-0.5 line-clamp-2">{c.next_action}</p>}
          {!c.next_action && c.fecha_proxima_call && <p className="mt-0.5">Call de seguimiento</p>}
        </div>
      )}
      {!nextOperationalDate(c) && activo && (
        <Badge variant="outline" className="border-orange-500/20 bg-orange-500/10 text-xs text-orange-600">Sin próxima acción</Badge>
      )}
      {backendPrioritario && (
        <Badge variant="outline" className="border-purple-500/20 bg-purple-500/10 text-xs font-bold text-purple-600">Backend prioritario</Badge>
      )}
      {c.engagement_signal === "inactividad_14d" && (
        <Badge variant="outline" className="border-red-500/20 bg-red-500/10 text-xs font-bold text-red-600">Inactividad 14+ días</Badge>
      )}
      {c.engagement_signal === "inactividad_7d" && (
        <Badge variant="outline" className="border-amber-500/20 bg-amber-500/10 text-xs font-bold text-amber-700">Inactividad 7+ días</Badge>
      )}
      {getEtapa(c) === "onboarding_pendiente" && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            <span>Onboarding</span><span>{onboardingDone}/6</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-amber-500 transition-all"
              style={{ width: `${(onboardingDone / 6) * 100}%` }}
            />
          </div>
        </div>
      )}
      {c.pitch && (
        <Badge variant="outline" className={cn("text-xs whitespace-nowrap", pitchColors[c.pitch] || "bg-muted text-muted-foreground border-border")}>
          {c.pitch}
        </Badge>
      )}
      {["primera_call_pendiente", "segunda_call_pendiente", "call_45d_pendiente", "entrega_activa"].includes(getEtapa(c)) && (
        c.link_call_onboarding ? (
          <a
            href={c.link_call_onboarding}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Link2 className="h-3 w-3" />Ver llamada de onboarding
          </a>
        ) : (
          <p className="inline-flex items-center gap-1 text-xs text-muted-foreground/70 italic">
            <Link2 className="h-3 w-3" />Sin llamada conectada (Fathom aún no lee onboarding)
          </p>
        )
      )}
      {!activo && (
        <Badge variant="outline" className="text-xs bg-muted text-muted-foreground border-border">Dado de baja</Badge>
      )}
    </>
  )
}

function ClienteCard({ c, onOpenDetail }: { c: Cliente; onOpenDetail: (c: Cliente) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: c.id as number,
  })
  const etapa = getEtapa(c)
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => { if (!isDragging) onOpenDetail(c) }}
      className={cn(
        "bg-card border border-border rounded-lg p-3 border-t-4 hover:shadow-md transition-shadow space-y-2 cursor-grab active:cursor-grabbing touch-none select-none",
        isDragging && "opacity-30",
        ETAPAS.find(e => e.id === etapa)?.color
      )}
    >
      <ClienteCardContent c={c} />
    </div>
  )
}

function ClienteCardOverlay({ c }: { c: Cliente }) {
  const etapa = getEtapa(c)
  return (
    <div className={cn("bg-card border border-border rounded-lg p-3 border-t-4 shadow-2xl space-y-2 w-64 cursor-grabbing", ETAPAS.find(e => e.id === etapa)?.color)}>
      <ClienteCardContent c={c} />
    </div>
  )
}

function KanbanColumn({ etapaDef, clientes, onOpenDetail }: { etapaDef: EtapaDef; clientes: Cliente[]; onOpenDetail: (c: Cliente) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: etapaDef.id })
  return (
    <div className="w-[82vw] flex-shrink-0 snap-start sm:w-72">
      <div className={cn("mb-3 flex items-center justify-between rounded-2xl border border-white/60 px-3 py-2.5 shadow-sm backdrop-blur dark:border-white/[.07]", etapaDef.headerBg)}>
        <div className="flex items-center gap-2">
          <span className={cn("w-2 h-2 rounded-full flex-shrink-0", etapaDef.dot)} />
          <span className="font-semibold text-sm text-foreground">{etapaDef.label}</span>
        </div>
        <span className="text-xs font-bold text-muted-foreground bg-background/60 px-2 py-0.5 rounded-full">{clientes.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn("max-h-[68vh] min-h-48 space-y-2 overflow-y-auto rounded-2xl pr-1 transition-colors", isOver && "ring-2 ring-primary/40 bg-primary/5")}
      >
        {clientes.map((c) => (
          <ClienteCard key={c.id} c={c} onOpenDetail={onOpenDetail} />
        ))}
        {clientes.length === 0 && (
          <div className="h-20 border border-dashed border-border rounded-lg flex items-center justify-center">
            <p className="text-xs text-muted-foreground">Sin clientes</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ClientesPage() {
  const [search, setSearch] = useState("")
  const [view, setView] = useState<"todos" | "backend" | "sin_accion">("todos")
  const [sortBy, setSortBy] = useState<"next_action" | "entry_desc" | "entry_asc" | "name">("next_action")
  const [editando, setEditando] = useState<Cliente | null>(null)
  const [activeId, setActiveId] = useState<number | null>(null)

  const { data: clientes, isLoading, error, mutate: mutateClientes } = useSWR<Cliente[]>("/api/clientes", fetcher)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const today = new Date(); today.setHours(0, 0, 0, 0)

  const isActivo = (c: Cliente) => {
    const baja = parseLocalDate(c.fecha_baja)
    return !baja || baja >= today
  }

  const filtered = useMemo(() => {
    if (!clientes) return []
    const q = norm(search)
    return clientes.filter((c) => {
      if (q && ![c.nombre, c.telefono].some((value) => norm(value || "").includes(q))) return false
      if (view === "backend") return isActivo(c) && ["LEAD S", "LEAD A"].includes(c.calificacion || "") && c.pitch !== "Ofrecido y Pagó"
      if (view === "sin_accion") return isActivo(c) && !nextOperationalDate(c)
      return true
    })
  }, [clientes, search, view])

  const grouped = useMemo(() => {
    const result: Record<Etapa, Cliente[]> = {
      onboarding_pendiente: [], primera_call_pendiente: [], segunda_call_pendiente: [],
      call_45d_pendiente: [], entrega_activa: [], vencido: [],
    }
    for (const c of filtered) result[getEtapa(c)].push(c)
    const dateValue = (value: string | null | undefined, fallback: number) => parseLocalDate(value)?.getTime() ?? fallback
    for (const rows of Object.values(result)) {
      rows.sort((a, b) => {
        if (sortBy === "name") return (a.nombre || "").localeCompare(b.nombre || "", "es")
        if (sortBy === "entry_asc") return dateValue(a.fecha_ingreso, Number.MAX_SAFE_INTEGER) - dateValue(b.fecha_ingreso, Number.MAX_SAFE_INTEGER)
        if (sortBy === "entry_desc") return dateValue(b.fecha_ingreso, 0) - dateValue(a.fecha_ingreso, 0)
        return dateValue(nextOperationalDate(a), Number.MAX_SAFE_INTEGER) - dateValue(nextOperationalDate(b), Number.MAX_SAFE_INTEGER)
      })
    }
    return result
  }, [filtered, sortBy])

  const totalClientes = clientes?.length || 0
  const activos = clientes?.filter(isActivo).length || 0
  const dados_de_baja = totalClientes - activos
  const con_prox_call = clientes?.filter((c) => {
    const d = parseLocalDate(nextOperationalDate(c))
    return d && d >= today
  }).length || 0
  const backendPrioritarios = clientes?.filter((c) => isActivo(c) && ["LEAD S", "LEAD A"].includes(c.calificacion || "") && c.pitch !== "Ofrecido y Pagó").length || 0
  const sinProximaAccion = clientes?.filter((c) => isActivo(c) && !nextOperationalDate(c)).length || 0

  const activeCliente = useMemo(
    () => (activeId != null ? clientes?.find(c => c.id === activeId) : undefined),
    [activeId, clientes]
  )

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as number)
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    if (!over || !clientes) return
    const targetEtapa = over.id as Etapa
    const clienteId = active.id as number
    const cliente = clientes.find(c => c.id === clienteId)
    if (!cliente) return
    if (getEtapa(cliente) === targetEtapa) return

    const previous = clientes
    const optimistic = clientes.map(c => (c.id === clienteId ? { ...c, etapa: targetEtapa } : c))
    mutateClientes(optimistic, { revalidate: false })
    try {
      const res = await fetch("/api/clientes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: clienteId, etapa: targetEtapa }),
      })
      if (!res.ok) throw new Error(`PATCH fallo con status ${res.status}`)
      mutateClientes()
    } catch (err) {
      console.error("Error al mover el cliente:", err)
      mutateClientes(previous, { revalidate: false })
    }
  }

  return (
    <div className="crm-module-page">
      {editando && <EditModal cliente={editando} onClose={() => setEditando(null)} />}

      <CrmPageIntro
        eyebrow="Customer success"
        title="Clientes activos"
        description="Seguimiento visual de entrega y continuidad. Arrastrá para avanzar o abrí la ficha para trabajar el detalle."
        icon={<UserRoundCheck className="h-6 w-6" />}
        tone="violet"
        actions={
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
          <input
            type="text"
            placeholder="Buscar por nombre o teléfono..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-full rounded-xl border border-white/10 bg-white/10 py-2 pl-9 pr-8 text-sm text-white outline-none placeholder:text-white/35 focus:border-white/20 focus:bg-white/15"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/45 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        }
      />

      <div className="crm-kpis">
        <CrmStat label="Total" value={totalClientes} detail="clientes en la vista" icon={<Users className="h-5 w-5" />} tone="violet" />
        <CrmStat label="Activos" value={activos} detail="con acceso vigente" icon={<Activity className="h-5 w-5" />} tone="emerald" />
        <CrmStat label="Backend prioritario" value={backendPrioritarios} detail="S/A activos sin upsell cerrado" icon={<Activity className="h-5 w-5" />} tone="violet" />
        <CrmStat label="Sin próxima acción" value={sinProximaAccion} detail="activos que requieren orden" icon={<UserRoundX className="h-5 w-5" />} tone="neutral" />
      </div>

      <div className="flex flex-wrap gap-2">
        {([['todos','Todos'],['backend','Backend prioritario'],['sin_accion','Sin próxima acción']] as const).map(([id,label]) => (
          <Button key={id} size="sm" variant={view === id ? "default" : "outline"} onClick={() => setView(id)}>{label}</Button>
        ))}
        <select aria-label="Ordenar clientes" value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="next_action">Próxima acción</option>
          <option value="entry_desc">Ingreso: más recientes</option>
          <option value="entry_asc">Ingreso: más antiguos</option>
          <option value="name">Nombre A–Z</option>
        </select>
        <span className="ml-auto self-center text-xs text-muted-foreground">{filtered.length} visibles · {con_prox_call} con próxima call · {dados_de_baja} históricos</span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <div className="text-center py-12 text-muted-foreground">Error al cargar clientes</div>
      ) : !clientes || clientes.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No hay clientes cargados</div>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4">
            {ETAPAS.map((etapaDef) => (
              <KanbanColumn key={etapaDef.id} etapaDef={etapaDef} clientes={grouped[etapaDef.id] || []} onOpenDetail={setEditando} />
            ))}
          </div>
          <DragOverlay>
            {activeCliente ? <ClienteCardOverlay c={activeCliente} /> : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  )
}
