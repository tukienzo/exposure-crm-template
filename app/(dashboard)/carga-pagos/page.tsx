"use client"

import { useState, useMemo, useId, useEffect } from "react"
import useSWR, { mutate } from "swr"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Loader2, AlertCircle, Plus, X, Paperclip, Search,
  ChevronDown, ChevronUp, Copy, Check, CheckCircle2, Clock, Pencil,
  Power, Trash2, WalletCards,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { CONCEPTOS_FILA1, CONCEPTOS_FILA2, daAccesoDeFila, esCuota, generarMensajePPP, type FilaPlan } from "@/lib/conceptos-pago"
import { PROGRAMAS, buscarPrograma, buscarProgramaPorOperacion, resolverInfoPrograma, calcularFechaBajaPrograma } from "@/lib/programas"
import { FuenteSelect } from "@/components/fuente-picker"
import { CrmPageIntro } from "@/components/crm-ui"
import { playSaleConfirmedSound } from "@/lib/crm-sounds"
import { CLOSERS_ACTIVOS, SETTERS_ACTIVOS } from "@/lib/equipo"

/* ======================= Constantes compartidas ======================= */

// El equipo sale de .env (NEXT_PUBLIC_CRM_CLOSERS y NEXT_PUBLIC_CRM_SETTERS)
const CLOSERS = [...CLOSERS_ACTIVOS, "Sin closer"]
const SETTERS = [...SETTERS_ACTIVOS, "Sin Setter"]
const CALIFICACION = ["LEAD S", "LEAD A", "LEAD B", "LEAD C", "LEAD D"]
const MEDIO_PAGO = ["Pesos", "Stripe", "USDT", "Efectivo USD", "Efectivo ARS", "Transferencia Bancaria USD", "Western Unión", "PayPal"]
const NONE = "__NONE__"

const CONCEPTO_FILA1_LABELS = CONCEPTOS_FILA1.map((c) => c.label)
const CONCEPTO_FILA2_LABELS = CONCEPTOS_FILA2.map((c) => c.label)
const CONCEPTO_TODOS_LABELS = Array.from(new Set([...CONCEPTO_FILA1_LABELS, ...CONCEPTO_FILA2_LABELS]))

/* ======================= Tipos y helpers de planes (compartidos entre pestañas) ======================= */

type PlanPagoItem = {
  id: string
  plan_id: string
  orden: number
  concepto: string
  numero_cuota: number | null
  monto: number | null
  fecha_planeada: string | null
  medio_de_pago: string | null
  da_acceso: boolean
  estado: "pendiente" | "pagado" | string
  pago_id: string | null
  ultimo_recordatorio_enviado?: string | null
  comprobante?: string | null
  cc_ars?: number | null
  tipo_cambio_usd?: number | null
}

type PlanPago = {
  id: string
  cliente: string
  telefono: string | null
  operacion: string | null
  closer: string | null
  categoria_venta: "Front End" | "Back End" | null
  setter: string | null
  calificacion: string | null
  fuente: string | null
  contenido_contestado: string | null
  fecha_alta: string | null
  fecha_baja: string | null
  estado_plan?: "activo" | "inactivo_no_responde" | null
  plan_pago_items: PlanPagoItem[]
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`)
  if (!Array.isArray(data)) throw new Error("Respuesta inesperada del servidor")
  return data
}

function norm(s: string) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
}

function fmtFecha(iso: string | null): string {
  if (!iso) return "-"
  const [y, m, d] = iso.split("-")
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

function itemToFilaPlan(item: PlanPagoItem, overrides?: Partial<FilaPlan>): FilaPlan {
  return {
    concepto: item.concepto,
    numeroCuota: item.numero_cuota,
    masAcceso: item.da_acceso,
    monto: item.monto || 0,
    fechaPlaneada: item.fecha_planeada || "",
    estado: item.estado === "pagado" ? "pagado" : "pendiente",
    ...overrides,
  }
}

function itemsOrdenados(items: PlanPagoItem[]): PlanPagoItem[] {
  return [...(items || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
}

/* ======================= Helpers de UI ======================= */

function Sec({ title }: { title: string }) {
  return (
    <p className="crm-section-title mb-3 mt-7 text-base">
      {title}
    </p>
  )
}

function F({ label, children, col2 }: { label: string; children: React.ReactNode; col2?: boolean }) {
  return (
    <div className={cn("space-y-1.5", col2 && "sm:col-span-2")}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border px-3 py-2 text-sm font-bold transition-all duration-200 hover:-translate-y-0.5",
        active
          ? "border-primary/25 bg-gradient-to-br from-red-500 to-orange-400 text-white shadow-lg shadow-red-500/20"
          : "border-black/[.07] bg-white/60 text-muted-foreground hover:border-primary/30 hover:bg-white hover:text-foreground dark:border-white/10 dark:bg-white/[.04]",
      )}
    >
      {children}
    </button>
  )
}

// Sube el archivo directo a Supabase Storage (via /api/upload-comprobante) y
// guarda la URL pública resultante — el closer solo adjunta el archivo, no
// tiene que subir nada a mano a Drive ni pegar un link.
// Varios comprobantes se guardan en el mismo campo de texto `comprobante`,
// uno por línea — sirve para cuando un mismo pago/operación junta 2+
// transferencias (ej: el lead pagó en 2 partes con 20 min de diferencia).
const COMPROBANTE_SEP = "\n"
function comprobanteList(value: string): string[] {
  return (value || "").split(COMPROBANTE_SEP).map((s) => s.trim()).filter(Boolean)
}

function ComprobanteUpload({ value, onChange, concepto, cliente }: {
  value: string; onChange: (v: string) => void; concepto?: string; cliente?: string
}) {
  const inputId = useId()
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const urls = comprobanteList(value)

  async function handleFiles(files: FileList) {
    setErr(null)
    setUploading(true)
    try {
      const nuevas: string[] = []
      for (const file of Array.from(files)) {
        const form = new FormData()
        form.append("file", file)
        form.append("concepto", concepto || "")
        form.append("cliente", cliente || "")
        const res = await fetch("/api/upload-comprobante", { method: "POST", body: form })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "Error al subir el comprobante")
        nuevas.push(json.url)
      }
      onChange([...urls, ...nuevas].join(COMPROBANTE_SEP))
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al subir el comprobante")
    } finally {
      setUploading(false)
    }
  }

  function removeAt(i: number) {
    onChange(urls.filter((_, idx) => idx !== i).join(COMPROBANTE_SEP))
  }

  return (
    <div>
      <input
        type="file"
        id={inputId}
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => { const f = e.target.files; if (f && f.length) handleFiles(f); e.target.value = "" }}
      />
      <label
        htmlFor={inputId}
        className="relative flex items-center w-full pl-9 pr-3 py-3 text-sm rounded-md border-2 border-dashed border-border bg-muted/20 cursor-pointer hover:bg-muted/30 transition-colors"
      >
        <Paperclip className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <span className={cn("truncate", urls.length && !uploading ? "text-emerald-600 font-medium" : "text-muted-foreground")}>
          {uploading ? "Subiendo..." : urls.length ? `✓ ${urls.length} comprobante${urls.length > 1 ? "s" : ""} cargado${urls.length > 1 ? "s" : ""} — tocá para agregar otro` : "Adjuntar comprobante (foto o PDF) — podés cargar más de uno"}
        </span>
      </label>
      {urls.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {urls.map((u, i) => (
            <li key={u + i} className="flex items-center justify-between gap-2 text-xs text-muted-foreground pl-1">
              <span className="truncate">Comprobante {i + 1}</span>
              <button type="button" onClick={() => removeAt(i)} className="text-red-500 hover:text-red-600 shrink-0">Quitar</button>
            </li>
          ))}
        </ul>
      )}
      {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
    </div>
  )
}

/* ============================================================================================= */
/* PÁGINA PRINCIPAL — 3 pestañas                                                                  */
/* ============================================================================================= */

export default function CargaPagosPage() {
  return (
    <div className="crm-module-page">
      <CrmPageIntro
        eyebrow="Carga guiada"
        title="Cargar pago"
        description="Nuevo plan, cuota o pago histórico en un flujo compacto, con el resumen y las acciones siempre cerca."
        icon={<WalletCards className="h-6 w-6" />}
        tone="emerald"
      />

      <Tabs defaultValue="nuevo" className="mx-auto w-full max-w-6xl">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-[20px] border border-white/70 bg-white/55 p-1.5 shadow-lg shadow-black/[.04] backdrop-blur dark:border-white/10 dark:bg-white/[.035]">
          <TabsTrigger
            value="nuevo"
            className="rounded-2xl border border-transparent px-4 py-3 text-sm font-bold text-muted-foreground data-[state=active]:border-white/80 data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-lg dark:data-[state=active]:border-white/10 dark:data-[state=active]:bg-white/[.08]"
          >
            ✦ Nuevo plan
          </TabsTrigger>
          <TabsTrigger
            value="existentes"
            className="rounded-2xl border border-transparent px-4 py-3 text-sm font-bold text-muted-foreground data-[state=active]:border-white/80 data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-lg dark:data-[state=active]:border-white/10 dark:data-[state=active]:bg-white/[.08]"
          >
            ◫ Planes existentes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="nuevo" className="mt-4 rounded-[26px] border border-white/70 bg-white/65 px-4 shadow-xl shadow-black/[.045] backdrop-blur-xl sm:px-6 dark:border-white/[.08] dark:bg-white/[.035]"><NuevoPlanTab /></TabsContent>
        <TabsContent value="existentes" className="mt-4 rounded-[26px] border border-white/70 bg-white/65 px-4 pb-5 shadow-xl shadow-black/[.045] backdrop-blur-xl sm:px-6 dark:border-white/[.08] dark:bg-white/[.035]"><PlanesExistentesTab /></TabsContent>
      </Tabs>
    </div>
  )
}

/* ============================================================================================= */
/* PESTAÑA 1: NUEVO PLAN                                                                          */
/* ============================================================================================= */

type SharedForm = {
  cliente: string
  telefono: string
  programaId: string
  operacionSel: string
  closer: string
  categoriaVenta: "" | "Front End" | "Back End"
  setter: string
  calificacion: string
  fuente: string
  contenido_contestado: string
  medio_de_pago: string
  cc_ars: string
  ccArsModo: "no_aplica" | "en_pesos"
  comprobante: string
  linkFathom: string
  esReactivacion: boolean
}

type ClientSuggestion = {
  id: number | string
  person_id: string | null
  nombre: string | null
  telefono: string | null
  fecha_agenda: string | null
  fecha_closer: string | null
  fuente: string | null
  setter: string | null
  calificacion: string | null
  cuenta: string | null
}

const EMPTY_SHARED: SharedForm = {
  cliente: "", telefono: "", programaId: "", operacionSel: "",
  closer: "", categoriaVenta: "", setter: "", calificacion: "",
  fuente: NONE, contenido_contestado: "",
  medio_de_pago: NONE, cc_ars: "", ccArsModo: "no_aplica",
  comprobante: "", linkFathom: "", esReactivacion: false,
}

type FilaForm = {
  concepto: string
  numeroCuota: string
  masAcceso: boolean
  monto: string
  fechaPlaneada: string
  pagoVinculadoId: string
}

const EMPTY_FILA: FilaForm = { concepto: "", numeroCuota: "", masAcceso: false, monto: "", fechaPlaneada: "", pagoVinculadoId: "" }

// "__buscando__" = el closer tildó "ya se cobró" pero todavía no eligió CUÁL
// pago real es — en ese estado no cuenta como vinculado de verdad todavía.
function pagoVinculadoReal(f: FilaForm): string | null {
  return f.pagoVinculadoId && f.pagoVinculadoId !== "__buscando__" ? f.pagoVinculadoId : null
}

// Para plata que ya se cobró hace tiempo (planes viejos, de antes de que existiera
// esta sección): en vez de fabricar un "Pagado" sin respaldo, el closer busca y
// vincula el pago REAL que ya está cargado en la tabla de pagos para ese cliente.
function VincularPagoExistente({ cliente, value, onChange }: { cliente: string; value: string; onChange: (v: string) => void }) {
  const shouldFetch = cliente.trim().length >= 3
  const { data: pagos, isLoading } = useSWR<any[]>(
    shouldFetch ? `/api/pagos?cliente=${encodeURIComponent(cliente.trim())}` : null,
    fetcher,
  )
  const lista = Array.isArray(pagos) ? pagos : []
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">¿Cuál de sus pagos ya cargados es este?</Label>
      {!shouldFetch ? (
        <p className="text-xs text-muted-foreground">Completá el nombre del cliente arriba para buscar sus pagos.</p>
      ) : isLoading ? (
        <p className="text-xs text-muted-foreground">Buscando pagos de {cliente}...</p>
      ) : lista.length === 0 ? (
        <p className="text-xs text-amber-600">No encontré pagos cargados con ese nombre — revisá que esté bien escrito.</p>
      ) : (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger><SelectValue placeholder="Seleccionar el pago real..." /></SelectTrigger>
          <SelectContent>
            {lista.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.tipo || "—"} · ${Number(p.monto || 0).toLocaleString("es-AR")} USD · {p.fecha ? String(p.fecha).slice(0, 10) : "sin fecha"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}

function buildContenidoContestado(base: string, fathom: string): string | null {
  const b = base.trim()
  const f = fathom.trim()
  if (b && f) return `${b} | Fathom: ${f}`
  if (f) return `Fathom: ${f}`
  if (b) return b
  return null
}

function NuevoPlanTab() {
  const [shared, setShared] = useState<SharedForm>(EMPTY_SHARED)
  const [clientSearch, setClientSearch] = useState("")
  const [showClientSuggestions, setShowClientSuggestions] = useState(false)

  useEffect(() => {
    const cliente = new URLSearchParams(window.location.search).get("cliente")
    if (cliente) setShared((current) => ({ ...current, cliente }))
  }, [])
  const [filas, setFilas] = useState<FilaForm[]>([{ ...EMPTY_FILA }])
  // Qué fila es la que se está cobrando HOY como transacción nueva (crea un pago
  // real en /api/pagos). -1 = ninguna: todo el plan es histórico/ya cobrado, y en
  // ese caso corresponde usar "Guardar plan" en vez de "Guardar y Cargar en CRM".
  const [filaHoyIdx, setFilaHoyIdx] = useState(0)
  const [guardandoSolo, setGuardandoSolo] = useState(false)
  const [guardandoCRM, setGuardandoCRM] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [lastSavedMessage, setLastSavedMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setClientSearch(shared.cliente.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [shared.cliente])

  const { data: clientSuggestions = [], isLoading: loadingClientSuggestions } = useSWR<ClientSuggestion[]>(
    clientSearch.length >= 2 ? `/api/payment-client-suggestions?q=${encodeURIComponent(clientSearch)}` : null,
    fetcher,
  )

  const setS = (k: keyof SharedForm, v: string) => {
    setLastSavedMessage(null)
    setShared((p) => ({ ...p, [k]: v }))
  }

  function selectClientSuggestion(suggestion: ClientSuggestion) {
    setLastSavedMessage(null)
    setShared((current) => ({
      ...current,
      cliente: suggestion.nombre || current.cliente,
      telefono: suggestion.telefono || current.telefono,
      setter: suggestion.setter || current.setter,
      calificacion: suggestion.calificacion || current.calificacion,
      fuente: suggestion.fuente || current.fuente,
    }))
    setShowClientSuggestions(false)
  }

  // Programa -> Operacion en cascada. Si el programa tiene una sola operacion
  // preconfigurada, se autocompleta sola y no se muestra el selector.
  const programaDef = buscarPrograma(shared.programaId)
  const operacionFinal = programaDef
    ? (programaDef.operaciones.length === 1 ? programaDef.operaciones[0].label : shared.operacionSel)
    : ""
  const operacionCatalogo = programaDef?.operaciones.find((o) => o.label === operacionFinal)
  const totalPrograma = operacionCatalogo?.total ?? 0
  const duracionLabel = programaDef?.duracionMeses != null ? `${programaDef.duracionMeses} Meses` : null

  function handleProgramaChange(id: string) {
    setLastSavedMessage(null)
    setShared((p) => ({ ...p, programaId: id, operacionSel: "" }))
  }

  const updateFila = (idx: number, patch: Partial<FilaForm>) => {
    setLastSavedMessage(null)
    setFilas((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)))
  }
  const addFila = () => {
    setLastSavedMessage(null)
    setFilas((prev) => [...prev, { ...EMPTY_FILA }])
  }
  const removeFila = (idx: number) => {
    if (idx === 0) return
    setLastSavedMessage(null)
    setFilas((prev) => prev.filter((_, i) => i !== idx))
    setFilaHoyIdx((prev) => {
      if (prev === idx) return -1
      if (prev > idx) return prev - 1
      return prev
    })
  }
  function marcarFilaHoy(idx: number) {
    setFilaHoyIdx((prev) => (prev === idx ? -1 : idx))
    updateFila(idx, { pagoVinculadoId: "" })
  }

  const montoHoy = parseFloat((filaHoyIdx >= 0 ? filas[filaHoyIdx] : filas[0])?.monto || "") || 0
  const arsNum = parseFloat(shared.cc_ars) || 0
  const tipoCambio = shared.ccArsModo === "en_pesos" && arsNum > 0 && montoHoy > 0 ? arsNum / montoHoy : null
  const comision3 = shared.ccArsModo === "en_pesos" && arsNum > 0 ? arsNum * 0.03 : null

  // Preview en vivo del mensaje PPP: la fila marcada "Se cobra HOY" Y TODAS
  // las anteriores a ella se muestran como YA PAGADAS (si el closer esta
  // cobrando la cuota N, las 1..N-1 necesariamente ya se cobraron antes) —
  // las posteriores quedan pendientes salvo que esten vinculadas a un pago real.
  const filasPreview: FilaPlan[] = useMemo(() => filas.map((f, idx) => ({
    concepto: f.concepto,
    numeroCuota: f.numeroCuota ? parseInt(f.numeroCuota, 10) : null,
    masAcceso: f.masAcceso,
    monto: parseFloat(f.monto) || 0,
    fechaPlaneada: f.fechaPlaneada,
    estado: (filaHoyIdx >= 0 && idx <= filaHoyIdx) || pagoVinculadoReal(f) ? "pagado" : "pendiente",
  })), [filas, filaHoyIdx])

  const mensaje = useMemo(() => generarMensajePPP({
    cliente: shared.cliente,
    nombrePrograma: programaDef?.nombreCompleto || "",
    duracionLabel,
    total: totalPrograma,
    filas: filasPreview,
    esNuevaVenta: true,
    categoriaVenta: shared.categoriaVenta || null,
  }), [shared.cliente, shared.categoriaVenta, programaDef, duracionLabel, totalPrograma, filasPreview])

  function resetForm() {
    setShared({ ...EMPTY_SHARED })
    setFilas([{ ...EMPTY_FILA }])
    setFilaHoyIdx(0)
  }

  function validarComun(): string[] {
    const missing: string[] = []
    if (!shared.closer) missing.push("Closer")
    if (!shared.categoriaVenta) missing.push("Categoría de Venta")
    if (!shared.cliente.trim()) missing.push("Nombre del cliente")
    if (!shared.programaId) missing.push("Programa")
    else if (!operacionFinal) missing.push("Operación")
    filas.forEach((f, idx) => {
      if (!f.concepto) missing.push(`Pago ${idx + 1}: descripción`)
      if (!f.fechaPlaneada) missing.push(`Pago ${idx + 1}: fecha`)
      if (!f.monto) missing.push(`Pago ${idx + 1}: monto`)
      if (f.concepto === "Cuota Venta Interna" && !f.numeroCuota) missing.push(`Pago ${idx + 1}: número de cuota`)
      if (f.pagoVinculadoId === "__buscando__") missing.push(`Pago ${idx + 1}: tildaste "ya se cobró hace tiempo" pero no elegiste cuál pago real es — seleccionalo de la lista o destildá la casilla`)
    })
    return missing
  }

  async function handleCopiar() {
    const mensajeACopiar = lastSavedMessage || mensaje
    if (!mensajeACopiar.trim() || !shared.cliente.trim()) {
      setError("Completá al menos el cliente y los datos del plan para generar el mensaje.")
      return
    }
    try {
      await navigator.clipboard.writeText(mensajeACopiar)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // noop: si el navegador bloquea el clipboard, no hacemos nada mas
    }
  }

  async function handleGuardarPlanSolo() {
    setError(null)
    const missing = validarComun()
    if (missing.length > 0) {
      setError("Faltan completar: " + missing.join(", ") + ".")
      return
    }
    setGuardandoSolo(true)
    try {
      const fuenteFinal = shared.fuente && shared.fuente !== NONE ? shared.fuente : null
      const medioFinal = shared.medio_de_pago && shared.medio_de_pago !== NONE ? shared.medio_de_pago : null
      const contenidoFinal = buildContenidoContestado(shared.contenido_contestado, shared.linkFathom)

      const resPlan = await fetch("/api/planes-pago", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: {
            cliente: shared.cliente || null,
            telefono: shared.telefono || null,
            operacion: operacionFinal || null,
            closer: shared.closer || null,
            categoria_venta: shared.categoriaVenta,
            setter: shared.setter || null,
            calificacion: shared.calificacion || null,
            fuente: fuenteFinal,
            contenido_contestado: contenidoFinal,
            fecha_alta: null,
            fecha_baja: null,
          },
          items: filas.map((f, idx) => ({
            orden: idx,
            concepto: f.concepto,
            numero_cuota: f.concepto === "Cuota Venta Interna" && f.numeroCuota ? parseInt(f.numeroCuota, 10) : null,
            monto: f.monto ? parseFloat(f.monto) : null,
            fecha_planeada: f.fechaPlaneada || null,
            medio_de_pago: medioFinal,
            da_acceso: daAccesoDeFila({ concepto: f.concepto, masAcceso: f.masAcceso }),
            estado: pagoVinculadoReal(f) ? "pagado" : "pendiente",
            pago_id: pagoVinculadoReal(f),
          })),
        }),
      })
      const planResult = await resPlan.json()
      if (!resPlan.ok) {
        setError(planResult.error || "Error al guardar el plan.")
        return
      }
      setLastSavedMessage(mensaje)
      setSubmitted(true)
      resetForm()
      mutate("/api/planes-pago")
      setTimeout(() => setSubmitted(false), 3000)
    } catch {
      setError("Error de conexión.")
    } finally {
      setGuardandoSolo(false)
    }
  }

  async function handleGuardarYCargar() {
    setError(null)
    const missing = validarComun()
    if (missing.length > 0) {
      setError("Faltan completar: " + missing.join(", ") + ".")
      return
    }
    if (filaHoyIdx < 0 || !filas[filaHoyIdx]) {
      setError("Marcá cuál de los pagos se está cobrando HOY (botón \"📍 Se cobra HOY\" en la fila correspondiente). Si ningún pago es nuevo — todo el plan ya está cobrado de antes — usá \"Guardar plan\" en vez de este botón.")
      return
    }
    setGuardandoCRM(true)
    try {
      const filaHoy = filas[filaHoyIdx]
      const fila0DaAcceso = daAccesoDeFila({ concepto: filaHoy.concepto, masAcceso: filaHoy.masAcceso })
      const fechaAlta = fila0DaAcceso ? filaHoy.fechaPlaneada : null
      const fechaBaja = fila0DaAcceso ? calcularFechaBajaPrograma(fechaAlta, programaDef?.duracionMeses ?? null) : null
      const fuenteFinal = shared.fuente && shared.fuente !== NONE ? shared.fuente : null
      const medioFinal = shared.medio_de_pago && shared.medio_de_pago !== NONE ? shared.medio_de_pago : null
      const ccArsFinal = shared.ccArsModo === "en_pesos" && shared.cc_ars ? parseFloat(shared.cc_ars) : null
      const contenidoFinal = buildContenidoContestado(shared.contenido_contestado, shared.linkFathom)

      const resPago = await fetch("/api/pagos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: crypto.randomUUID(),
          fecha: filaHoy.fechaPlaneada || null,
          fecha_alta: fechaAlta,
          fecha_baja: fechaBaja,
          cliente: shared.cliente || null,
          telefono: shared.telefono || null,
          tipo: filaHoy.concepto || null,
          operacion: operacionFinal || null,
          closer: shared.closer || null,
          setter: shared.setter || null,
          calificacion: shared.calificacion || null,
          monto: filaHoy.monto ? parseFloat(filaHoy.monto) : null,
          cc_ars: ccArsFinal,
          medio_de_pago: medioFinal,
          tipo_cambio_usd: tipoCambio,
          comprobante: shared.comprobante || null,
          link_fathom: shared.linkFathom || null,
          ppp: mensaje,
          fuente: fuenteFinal,
          contenido_contestado: contenidoFinal,
          otras_comisiones: null,
          es_reactivacion: shared.esReactivacion,
          plan: {
            cliente: shared.cliente || null,
            telefono: shared.telefono || null,
            operacion: operacionFinal || null,
            closer: shared.closer || null,
            categoria_venta: shared.categoriaVenta,
            setter: shared.setter || null,
            calificacion: shared.calificacion || null,
            fuente: fuenteFinal,
            contenido_contestado: contenidoFinal,
            fecha_alta: fechaAlta,
            fecha_baja: fechaBaja,
          },
          items: filas.map((f, idx) => ({
            orden: idx,
            concepto: f.concepto,
            numero_cuota: f.concepto === "Cuota Venta Interna" && f.numeroCuota ? parseInt(f.numeroCuota, 10) : null,
            monto: f.monto ? parseFloat(f.monto) : null,
            fecha_planeada: f.fechaPlaneada || null,
            medio_de_pago: medioFinal,
            da_acceso: daAccesoDeFila({ concepto: f.concepto, masAcceso: f.masAcceso }),
            estado: idx <= filaHoyIdx || pagoVinculadoReal(f) ? "pagado" : "pendiente",
            pago_id: pagoVinculadoReal(f),
            use_new_payment: idx === filaHoyIdx,
          })),
        }),
      })
      const pagoResult = await resPago.json()
      if (!resPago.ok) {
        setError(pagoResult.error || "Error al registrar el pago.")
        return
      }
      setLastSavedMessage(mensaje)
      setSubmitted(true)
      playSaleConfirmedSound()
      resetForm()
      mutate("/api/pagos")
      mutate("/api/planes-pago")
      setTimeout(() => setSubmitted(false), 3000)
    } catch {
      setError("Error de conexión.")
    } finally {
      setGuardandoCRM(false)
    }
  }

  return (
    <div className="pt-6 space-y-1">
      {/* CLOSER */}
      <Sec title="Closer" />
      <div className="flex flex-wrap gap-2">
        {CLOSERS.map((c) => (
          <Pill key={c} active={shared.closer === c} onClick={() => setS("closer", c)}>{c}</Pill>
        ))}
      </div>

      {/* CATEGORÍA DE VENTA */}
      <Sec title="Categoría de Venta" />
      <Select value={shared.categoriaVenta} onValueChange={(v: "Front End" | "Back End") => setS("categoriaVenta", v)}>
        <SelectTrigger><SelectValue placeholder="Seleccioná una categoría" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="Front End">Front End</SelectItem>
          <SelectItem value="Back End">Back End</SelectItem>
        </SelectContent>
      </Select>

      {/* NOMBRE DEL CLIENTE */}
      <Sec title="Nombre del Cliente" />
      <div className="relative">
        <Input
          placeholder="Escribí nombre o WhatsApp para buscar su agenda"
          value={shared.cliente}
          autoComplete="off"
          onFocus={() => setShowClientSuggestions(true)}
          onBlur={() => window.setTimeout(() => setShowClientSuggestions(false), 150)}
          onChange={(e) => {
            setS("cliente", e.target.value)
            setShowClientSuggestions(true)
          }}
        />
        {showClientSuggestions && clientSearch.length >= 2 && (
          <div className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-xl">
            {loadingClientSuggestions ? (
              <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Buscando en agendas…</div>
            ) : clientSuggestions.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">No encontré una agenda con ese nombre o WhatsApp.</p>
            ) : clientSuggestions.map((suggestion) => (
              <button
                key={`${suggestion.person_id || "agenda"}-${suggestion.id}`}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectClientSuggestion(suggestion)}
                className="w-full rounded-lg px-3 py-2 text-left hover:bg-accent"
              >
                <span className="block text-sm font-semibold">{suggestion.nombre || "Sin nombre"}</span>
                <span className="block text-xs text-muted-foreground">
                  {[suggestion.telefono, suggestion.setter, suggestion.calificacion, suggestion.fuente, suggestion.fecha_agenda?.slice(0, 10)].filter(Boolean).join(" · ")}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {shared.telefono && (
        <p className="mt-2 text-xs text-emerald-600">✓ Datos vinculados: {shared.telefono}{shared.setter ? ` · ${shared.setter}` : ""}{shared.calificacion ? ` · ${shared.calificacion}` : ""}</p>
      )}

      {/* PROGRAMA */}
      <Sec title="Programa" />
      <Select value={shared.programaId} onValueChange={handleProgramaChange}>
        <SelectTrigger><SelectValue placeholder="Seleccioná un programa" /></SelectTrigger>
        <SelectContent>
          {PROGRAMAS.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombreCompleto}</SelectItem>)}
        </SelectContent>
      </Select>

      {/* OPERACIÓN — solo se muestra si el programa tiene mas de una opcion */}
      {programaDef && programaDef.operaciones.length > 1 && (
        <>
          <Sec title="Operación" />
          <Select value={shared.operacionSel} onValueChange={(v) => setS("operacionSel", v)}>
            <SelectTrigger><SelectValue placeholder="Seleccioná una operación" /></SelectTrigger>
            <SelectContent>
              {programaDef.operaciones.map((o) => (
                <SelectItem key={o.label} value={o.label}>{o.label} — ${o.total.toLocaleString("es-AR")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}

      {/* PAGOS */}
      <Sec title="Pagos" />
      <div className="space-y-4">
        {filas.map((fila, idx) => {
          const opciones = idx === 0 ? CONCEPTO_FILA1_LABELS : CONCEPTO_FILA2_LABELS
          const esCuotaVentaInterna = fila.concepto === "Cuota Venta Interna"
          return (
            <div key={idx} className={cn("relative rounded-[22px] border p-4 shadow-sm transition duration-300", idx === filaHoyIdx ? "border-blue-500/25 bg-blue-500/[.045] shadow-blue-500/5" : "border-black/[.06] bg-white/60 dark:border-white/[.08] dark:bg-white/[.025]")}>
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-border/60">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">PAGO {idx + 1}</p>
                  {idx === filaHoyIdx && (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-blue-600 bg-blue-500/10 border border-blue-500/30 rounded px-1.5 py-0.5">
                      📍 HOY
                    </span>
                  )}
                  {filaHoyIdx >= 0 && idx < filaHoyIdx && (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 bg-emerald-500/10 border border-emerald-500/30 rounded px-1.5 py-0.5">
                      ✅ PAGADO
                    </span>
                  )}
                </div>
                {idx > 0 && (
                  <button
                    type="button"
                    onClick={() => removeFila(idx)}
                    title="Borrar este pago"
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <F label="Fecha">
                  <Input type="date" value={fila.fechaPlaneada} onChange={(e) => updateFila(idx, { fechaPlaneada: e.target.value })} />
                </F>
                <F label="Monto (USD)">
                  <Input type="number" step="0.01" placeholder="0.00" value={fila.monto} onChange={(e) => updateFila(idx, { monto: e.target.value })} />
                </F>
              </div>

              <div className="mt-3">
                <F label="Descripción">
                  <Select value={fila.concepto} onValueChange={(v) => updateFila(idx, { concepto: v })}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar concepto" /></SelectTrigger>
                    <SelectContent>{opciones.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
              </div>

              <div className="mt-3 pt-3 border-t border-border/60">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => marcarFilaHoy(idx)}
                    className={cn(
                      "px-3 py-1 rounded-md border text-xs font-semibold transition-colors",
                      idx === filaHoyIdx
                        ? "border-blue-500/40 bg-blue-500/10 text-blue-600"
                        : "border-border text-muted-foreground hover:border-blue-500/40 hover:text-blue-600",
                    )}
                  >
                    📍 Se cobra HOY
                  </button>
                  <span className="text-xs text-muted-foreground">
                    Este es el pago que se está cobrando recién ahora — este y todos los anteriores de la lista quedan como pagados
                  </span>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-border/60">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`vinculado-${idx}`}
                    disabled={idx === filaHoyIdx}
                    checked={!!fila.pagoVinculadoId || fila.pagoVinculadoId === "__buscando__"}
                    onCheckedChange={(v) => updateFila(idx, { pagoVinculadoId: v ? "__buscando__" : "" })}
                  />
                  <label
                    htmlFor={`vinculado-${idx}`}
                    className={cn("text-xs cursor-pointer", idx === filaHoyIdx ? "text-muted-foreground/40" : "text-muted-foreground")}
                  >
                    Este pago ya se cobró hace tiempo — vincularlo a un pago real que ya está cargado
                  </label>
                </div>
                {idx === filaHoyIdx && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Esta fila ya está marcada como "Se cobra HOY" — se va a crear como pago nuevo, no hace falta vincularla.
                  </p>
                )}
                {filaHoyIdx >= 0 && idx < filaHoyIdx && (
                  <p className="mt-1.5 text-xs text-emerald-600">
                    Esta cuota ya cuenta como pagada por ser anterior al Pago marcado "📍 HOY". Vincularla a su pago real es opcional, solo para que quede prolijamente registrada.
                  </p>
                )}
                {fila.pagoVinculadoId && idx !== filaHoyIdx && (
                  <div className="mt-2">
                    <VincularPagoExistente
                      cliente={shared.cliente}
                      value={fila.pagoVinculadoId === "__buscando__" ? "" : fila.pagoVinculadoId}
                      onChange={(v) => updateFila(idx, { pagoVinculadoId: v })}
                    />
                  </div>
                )}
              </div>

              {esCuotaVentaInterna && (
                <div className="mt-3">
                  <F label="Número de cuota">
                    <Input type="number" step="1" placeholder="1" value={fila.numeroCuota} onChange={(e) => updateFila(idx, { numeroCuota: e.target.value })} />
                  </F>
                </div>
              )}

              {esCuota(fila.concepto) && (
                <div className="mt-3 pt-3 border-t border-border/60">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground mr-1">¿Acceso?</span>
                    <button type="button"
                      onClick={() => updateFila(idx, { masAcceso: true })}
                      className={cn("px-3 py-1 rounded-md border text-xs font-semibold transition-colors",
                        fila.masAcceso
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                          : "border-border text-muted-foreground hover:border-emerald-500/40 hover:text-emerald-600")}>
                      Sí
                    </button>
                    <button type="button"
                      onClick={() => updateFila(idx, { masAcceso: false })}
                      className={cn("px-3 py-1 rounded-md border text-xs font-semibold transition-colors",
                        !fila.masAcceso
                          ? "border-amber-500/40 bg-amber-500/10 text-amber-600"
                          : "border-border text-muted-foreground hover:border-red-400 hover:text-red-500")}>
                      No
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        <Button type="button" variant="outline" size="sm" onClick={addFila}>
          <Plus className="mr-2 h-4 w-4" />Agregar pago
        </Button>
      </div>

      <hr className="my-6 border-border" />

      {/* DATOS DEL LEAD */}
      <Sec title="Datos del Lead" />
      <div className="space-y-4">
        <F label="Teléfono">
          <Input placeholder="+54 11..." value={shared.telefono} onChange={(e) => setS("telefono", e.target.value)} />
        </F>
        <F label="Link Fathom (llamada)">
          <Input placeholder="https://fathom.video/calls/..." value={shared.linkFathom} onChange={(e) => setS("linkFathom", e.target.value)} />
        </F>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <F label="Setter">
            <Select value={shared.setter} onValueChange={(v) => setS("setter", v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar setter" /></SelectTrigger>
              <SelectContent>{[...new Set([...SETTERS, shared.setter].filter(Boolean))].map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
            </Select>
          </F>
          <F label="Calificación">
            <Select value={shared.calificacion} onValueChange={(v) => setS("calificacion", v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar calificación" /></SelectTrigger>
              <SelectContent>{CALIFICACION.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
            </Select>
          </F>
        </div>
        <F label="Fuente">
          <FuenteSelect
            value={shared.fuente}
            onChange={(v) => setS("fuente", v)}
            placeholder="Seleccionar fuente"
            clearOption={{ value: NONE, label: "— Sin fuente" }}
          />
        </F>
        <F label="Contenido Contestado">
          <Input
            placeholder="Link del Reel (https://...) o tag: HR/CTA/WN - PALABRA - DD.MM.AA"
            value={shared.contenido_contestado}
            onChange={(e) => setS("contenido_contestado", e.target.value)}
          />
        </F>
        <F label="Medio de Pago">
          <Select value={shared.medio_de_pago} onValueChange={(v) => setS("medio_de_pago", v)}>
            <SelectTrigger><SelectValue placeholder="Seleccionar medio" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>— Sin especificar</SelectItem>
              {MEDIO_PAGO.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </F>
        <F label="CC ARS">
          <div className="flex gap-2 mb-2">
            <Pill active={shared.ccArsModo === "no_aplica"} onClick={() => setShared((p) => ({ ...p, ccArsModo: "no_aplica" }))}>No aplica</Pill>
            <Pill active={shared.ccArsModo === "en_pesos"} onClick={() => setShared((p) => ({ ...p, ccArsModo: "en_pesos" }))}>En pesos</Pill>
          </div>
          {shared.ccArsModo === "en_pesos" && (
            <div className="space-y-4">
              <Input type="number" step="0.01" placeholder="Monto en ARS (ej: 609875)" value={shared.cc_ars} onChange={(e) => setS("cc_ars", e.target.value)} />
              <F label="Tipo de cambio (calculado automáticamente)">
                <div className="h-10 flex items-center px-3 rounded-md border border-border bg-muted/20 text-sm font-medium text-amber-500">
                  {tipoCambio !== null ? `$${tipoCambio.toLocaleString("es-AR", { maximumFractionDigits: 2 })}` : "—"}
                </div>
              </F>
              {comision3 !== null && (
                <p className="text-xs text-emerald-600">
                  Comisión 3% — contadora: ${comision3.toLocaleString("es-AR", { minimumFractionDigits: 2 })} ARS
                </p>
              )}
            </div>
          )}
        </F>
        <F label="Comprobante de pago">
          <ComprobanteUpload
            value={shared.comprobante}
            onChange={(v) => setS("comprobante", v)}
            concepto={filas[0]?.concepto}
            cliente={shared.cliente}
          />
        </F>
        <F label="¿Es reactivación / enrutamiento?">
          <div className="flex gap-2">
            <Pill active={!shared.esReactivacion} onClick={() => setShared((p) => ({ ...p, esReactivacion: false }))}>No</Pill>
            <Pill active={shared.esReactivacion} onClick={() => setShared((p) => ({ ...p, esReactivacion: true }))}>Sí</Pill>
          </div>
        </F>
      </div>

      {/* VISTA PREVIA */}
      <Sec title="Vista Previa" />
      <div className="min-h-[100px] whitespace-pre-wrap rounded-[20px] border border-black/[.06] bg-zinc-950 p-4 font-mono text-sm text-white/75 shadow-inner dark:border-white/10">
        {mensaje.trim() && shared.cliente ? mensaje : <span className="text-muted-foreground italic">Completá los datos para ver el mensaje...</span>}
      </div>

      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {submitted && (
        <Alert className="mt-4 border-emerald-500/30 bg-emerald-500/5">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <AlertDescription className="text-emerald-600">Guardado correctamente.</AlertDescription>
        </Alert>
      )}

      <div className="sticky bottom-3 z-10 mt-6 grid gap-2 rounded-[20px] border border-white/70 bg-white/85 p-2 shadow-2xl shadow-black/15 backdrop-blur-2xl sm:grid-cols-3 dark:border-white/10 dark:bg-zinc-950/80">
        <Button type="button" className="w-full bg-zinc-900 text-white hover:bg-zinc-800" disabled={!mensaje.trim() || !shared.cliente.trim() || guardandoSolo || guardandoCRM} onClick={handleCopiar}>
          📋 {copiado ? "Copiado" : "Copiar mensaje"}
        </Button>
        <Button type="button" variant="outline" className="w-full" disabled={guardandoSolo || guardandoCRM} onClick={handleGuardarPlanSolo}>
          {guardandoSolo ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</> : "💾 Guardar plan"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10"
          disabled={guardandoSolo || guardandoCRM}
          onClick={handleGuardarYCargar}
        >
          {guardandoCRM ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</> : "📊 Guardar y Cargar en CRM"}
        </Button>
      </div>
    </div>
  )
}

/* ============================================================================================= */
/* PESTAÑA 2: PLANES EXISTENTES                                                                   */
/* ============================================================================================= */

function PlanesExistentesTab() {
  const { data: planes, isLoading, error, mutate: mutatePlanes } = useSWR<PlanPago[]>("/api/planes-pago", fetcher)
  const [search, setSearch] = useState("")
  const [closerFiltro, setCloserFiltro] = useState(NONE)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const [dialogState, setDialogState] = useState<{ plan: PlanPago; item: PlanPagoItem } | null>(null)
  const [dialogForm, setDialogForm] = useState({ fecha_planeada: "", monto: "", medio_de_pago: "", comprobante: "", es_reactivacion: false, ccArsModo: "no_aplica" as "no_aplica" | "en_pesos", cc_ars: "" })
  const [dialogSubmitting, setDialogSubmitting] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [revertingId, setRevertingId] = useState<PlanPagoItem["id"] | null>(null)
  const [deletingId, setDeletingId] = useState<PlanPagoItem["id"] | null>(null)
  const [updatingPlanId, setUpdatingPlanId] = useState<PlanPago["id"] | null>(null)
  const [deletingPlanId, setDeletingPlanId] = useState<PlanPago["id"] | null>(null)
  const [addItemPlan, setAddItemPlan] = useState<PlanPago | null>(null)
  const [addItemForm, setAddItemForm] = useState({ concepto: "", monto: "", fecha_planeada: "", medio_de_pago: "", numero_cuota: "", da_acceso: false })
  const [addItemSubmitting, setAddItemSubmitting] = useState(false)
  const [addItemError, setAddItemError] = useState<string | null>(null)

  function openAddItem(plan: PlanPago) {
    const cuotas = plan.plan_pago_items.filter((item) => esCuota(item.concepto))
    const siguienteCuota = Math.max(0, ...cuotas.map((item) => Number(item.numero_cuota) || 0)) + 1
    setAddItemForm({ concepto: "Cuota", monto: "", fecha_planeada: "", medio_de_pago: "", numero_cuota: String(siguienteCuota), da_acceso: false })
    setAddItemError(null)
    setAddItemPlan(plan)
  }

  async function confirmAddItem() {
    if (!addItemPlan) return
    if (!addItemForm.concepto || !addItemForm.monto || !addItemForm.fecha_planeada) {
      setAddItemError("Completá concepto, monto y fecha planeada.")
      return
    }
    setAddItemSubmitting(true)
    setAddItemError(null)
    try {
      const res = await fetch("/api/planes-pago", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: addItemPlan.id,
          item: {
            concepto: addItemForm.concepto,
            numero_cuota: esCuota(addItemForm.concepto) && addItemForm.numero_cuota ? Number(addItemForm.numero_cuota) : null,
            monto: Number(addItemForm.monto),
            fecha_planeada: addItemForm.fecha_planeada,
            medio_de_pago: addItemForm.medio_de_pago || null,
            da_acceso: addItemForm.da_acceso,
          },
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setAddItemError(json.error || "No se pudo agregar el pago.")
        return
      }
      await mutatePlanes()
      setAddItemPlan(null)
    } catch {
      setAddItemError("Error de conexión.")
    } finally {
      setAddItemSubmitting(false)
    }
  }

  // El closer confirma que en realidad NO se pagó una cuota que figuraba
  // como pagada. Si tiene un pago real cargado (pago_id), no la tocamos acá
  // — hay que borrar ese pago desde "Todos los Pagos" para no perder el
  // registro de la transacción real.
  async function revertirPago(item: PlanPagoItem) {
    if (item.pago_id) {
      alert("Esta cuota tiene un pago real cargado en el CRM. Para revertirla, borrá ese pago desde \"Todos los Pagos\" — así no se pierde el registro de la transacción.")
      return
    }
    if (!confirm(`¿Confirmás que "${item.concepto}" (${item.monto} USD) en realidad NO se pagó?`)) return
    setRevertingId(item.id)
    try {
      await fetch("/api/planes-pago", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, estado: "pendiente" }),
      })
      await mutatePlanes()
    } finally {
      setRevertingId(null)
    }
  }

  async function eliminarItem(plan: PlanPago, item: PlanPagoItem) {
    if (item.pago_id) {
      alert("Esta cuota está vinculada a un pago real. Eliminá primero el pago desde \"Todos los Pagos\" para mantener el historial financiero consistente.")
      return
    }
    if (!confirm(`¿Eliminar definitivamente \"${item.concepto}\" por USD ${Number(item.monto || 0).toLocaleString("es-AR")} del plan de ${plan.cliente}?\n\nEsta acción no se puede deshacer.`)) return
    setDeletingId(item.id)
    try {
      const res = await fetch("/api/planes-pago", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, action: "delete_item" }),
      })
      const json = await res.json()
      if (!res.ok) {
        alert(json.error || "No se pudo eliminar la cuota.")
        return
      }
      await mutatePlanes()
    } catch {
      alert("Error de conexión al eliminar la cuota.")
    } finally {
      setDeletingId(null)
    }
  }

  async function cambiarEstadoPlan(plan: PlanPago) {
    const inactivo = plan.estado_plan === "inactivo_no_responde"
    const nuevoEstado = inactivo ? "activo" : "inactivo_no_responde"
    const accion = inactivo ? "reactivar" : "marcar como No responde / Inactivo"
    if (!confirm(`¿Confirmás que querés ${accion} el plan de ${plan.cliente}?`)) return
    setUpdatingPlanId(plan.id)
    try {
      const res = await fetch("/api/planes-pago", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id, estado_plan: nuevoEstado }),
      })
      const json = await res.json()
      if (!res.ok) return alert(json.error || "No se pudo actualizar el estado del plan.")
      await mutatePlanes()
    } catch {
      alert("Error de conexión al actualizar el plan.")
    } finally {
      setUpdatingPlanId(null)
    }
  }

  async function eliminarPlan(plan: PlanPago) {
    const totalItems = plan.plan_pago_items?.length || 0
    if (!confirm(`¿Eliminar definitivamente el plan de ${plan.cliente} con ${totalItems} cuota${totalItems === 1 ? "" : "s"}?\n\nUsá esta opción solo si es un duplicado o una carga errónea. Se elimina el plan y sus cuotas, pero los pagos reales del Registro de Pagos se conservan. Esta acción no se puede deshacer.`)) return
    setDeletingPlanId(plan.id)
    try {
      const res = await fetch("/api/planes-pago", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id, action: "delete_duplicate_plan" }),
      })
      const json = await res.json()
      if (!res.ok) return alert(json.error || "No se pudo eliminar el plan.")
      await mutatePlanes()
      if (expandedId === plan.id) setExpandedId(null)
    } catch {
      alert("Error de conexión al eliminar el plan.")
    } finally {
      setDeletingPlanId(null)
    }
  }

  // Editar una cuota del plan (fecha/monto/medio) sin necesidad de marcarla
  // como pagada — para cuando el cliente termina pagando otro día o otro monto.
  const [editItemState, setEditItemState] = useState<{ plan: PlanPago; item: PlanPagoItem } | null>(null)
  const [editItemForm, setEditItemForm] = useState({
    concepto: "", monto: "", fecha_planeada: "", medio_de_pago: "",
    comprobante: "", ccArsModo: "no_aplica" as "no_aplica" | "en_pesos", cc_ars: "",
  })
  const [editItemSubmitting, setEditItemSubmitting] = useState(false)
  const [editItemError, setEditItemError] = useState<string | null>(null)

  const editMontoNum = parseFloat(editItemForm.monto) || 0
  const editArsNum = parseFloat(editItemForm.cc_ars) || 0
  const editTipoCambio = editItemForm.ccArsModo === "en_pesos" && editArsNum > 0 && editMontoNum > 0 ? editArsNum / editMontoNum : null
  const editComision3 = editItemForm.ccArsModo === "en_pesos" && editArsNum > 0 ? editArsNum * 0.03 : null
  const editConceptoOptions = editItemForm.concepto && !CONCEPTO_TODOS_LABELS.includes(editItemForm.concepto)
    ? [editItemForm.concepto, ...CONCEPTO_TODOS_LABELS]
    : CONCEPTO_TODOS_LABELS

  const planesFiltrados = useMemo(() => {
    if (!planes) return []
    const q = norm(search)
    return planes
      .filter((p) => !q || norm(p.cliente).includes(q))
      .filter((p) => closerFiltro === NONE || p.closer === closerFiltro)
  }, [planes, search, closerFiltro])

  function openDialog(plan: PlanPago, item: PlanPagoItem) {
    setDialogError(null)
    setDialogForm({
      // Al registrar el cobro manda la fecha real de pago, no la fecha que se
      // había proyectado en el plan. El usuario puede corregirla si está
      // cargando un comprobante de otro día.
      fecha_planeada: new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }),
      monto: item.monto != null ? String(item.monto) : "",
      medio_de_pago: item.medio_de_pago || "",
      comprobante: "",
      es_reactivacion: false,
      ccArsModo: "no_aplica",
      cc_ars: "",
    })
    setDialogState({ plan, item })
  }

  function closeDialog() {
    setDialogState(null)
    setDialogError(null)
  }

  function openEditItem(plan: PlanPago, item: PlanPagoItem) {
    setEditItemError(null)
    setEditItemForm({
      concepto: item.concepto || "",
      monto: item.monto != null ? String(item.monto) : "",
      fecha_planeada: item.fecha_planeada || "",
      medio_de_pago: item.medio_de_pago || "",
      comprobante: item.comprobante || "",
      ccArsModo: item.cc_ars ? "en_pesos" : "no_aplica",
      cc_ars: item.cc_ars != null ? String(item.cc_ars) : "",
    })
    setEditItemState({ plan, item })
  }

  function closeEditItem() {
    setEditItemState(null)
    setEditItemError(null)
  }

  async function confirmEditItem() {
    if (!editItemState) return
    if (!editItemForm.fecha_planeada || !editItemForm.monto) {
      setEditItemError("Completá al menos fecha y monto.")
      return
    }
    setEditItemSubmitting(true)
    try {
      const ccArsFinal = editItemForm.ccArsModo === "en_pesos" && editItemForm.cc_ars ? parseFloat(editItemForm.cc_ars) : null
      const res = await fetch("/api/planes-pago", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: editItemState.item.id,
          concepto: editItemForm.concepto || null,
          monto: parseFloat(editItemForm.monto),
          fecha_planeada: editItemForm.fecha_planeada,
          medio_de_pago: editItemForm.medio_de_pago || null,
          comprobante: editItemForm.comprobante || null,
          cc_ars: ccArsFinal,
          tipo_cambio_usd: ccArsFinal ? editTipoCambio : null,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setEditItemError(json.error || "Error al guardar.")
        return
      }
      await mutatePlanes()
      closeEditItem()
    } catch {
      setEditItemError("Error de conexión.")
    } finally {
      setEditItemSubmitting(false)
    }
  }

  const dialogMontoNum = parseFloat(dialogForm.monto) || 0
  const dialogArsNum = parseFloat(dialogForm.cc_ars) || 0
  const dialogTipoCambio = dialogForm.ccArsModo === "en_pesos" && dialogArsNum > 0 && dialogMontoNum > 0 ? dialogArsNum / dialogMontoNum : null
  const dialogComision3 = dialogForm.ccArsModo === "en_pesos" && dialogArsNum > 0 ? dialogArsNum * 0.03 : null

  async function confirmDialog() {
    if (!dialogState) return
    const { plan, item } = dialogState
    setDialogError(null)

    if (!dialogForm.fecha_planeada || !dialogForm.monto || !dialogForm.medio_de_pago || !dialogForm.comprobante.trim()) {
      setDialogError("Completá fecha, monto, medio de pago y comprobante.")
      return
    }
    if (dialogForm.ccArsModo === "en_pesos" && !dialogForm.cc_ars.trim()) {
      setDialogError("Falta el monto en pesos (ARS) que se cobró.")
      return
    }

    setDialogSubmitting(true)
    try {
      const filasPlan: FilaPlan[] = itemsOrdenados(plan.plan_pago_items).map((it) =>
        it.id === item.id
          ? itemToFilaPlan(it, {
              monto: parseFloat(dialogForm.monto) || 0,
              fechaPlaneada: dialogForm.fecha_planeada,
              estado: "pagado",
            })
          : itemToFilaPlan(it),
      )
      const infoPrograma = resolverInfoPrograma(plan.operacion, filasPlan)
      const mensaje = generarMensajePPP({
        cliente: plan.cliente,
        ...infoPrograma,
        filas: filasPlan,
        esNuevaVenta: false,
      })

      const resPago = await fetch("/api/pagos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha: dialogForm.fecha_planeada,
          fecha_alta: null,
          fecha_baja: null,
          cliente: plan.cliente || null,
          telefono: plan.telefono || null,
          tipo: item.concepto || null,
          operacion: plan.operacion || null,
          closer: plan.closer || null,
          setter: plan.setter || null,
          calificacion: plan.calificacion || null,
          monto: parseFloat(dialogForm.monto),
          cc_ars: dialogForm.ccArsModo === "en_pesos" && dialogForm.cc_ars ? parseFloat(dialogForm.cc_ars) : null,
          medio_de_pago: dialogForm.medio_de_pago || null,
          tipo_cambio_usd: dialogTipoCambio,
          comprobante: dialogForm.comprobante || null,
          ppp: mensaje,
          fuente: plan.fuente || null,
          contenido_contestado: plan.contenido_contestado || null,
          otras_comisiones: null,
          es_reactivacion: dialogForm.es_reactivacion,
          plan_item_id: item.id,
        }),
      })
      const pagoResult = await resPago.json()
      if (!resPago.ok) {
        setDialogError(pagoResult.error || "Error al registrar el pago.")
        return
      }
      const pagoId = pagoResult?.id ?? null

      const resItem = await fetch("/api/planes-pago", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: item.id,
          estado: "pagado",
          pago_id: pagoId,
          monto: parseFloat(dialogForm.monto),
          fecha_planeada: dialogForm.fecha_planeada,
          medio_de_pago: dialogForm.medio_de_pago,
          comprobante: dialogForm.comprobante || null,
          cc_ars: dialogForm.ccArsModo === "en_pesos" && dialogForm.cc_ars ? parseFloat(dialogForm.cc_ars) : null,
        }),
      })
      if (!resItem.ok) {
        const r = await resItem.json()
        setDialogError("El pago se guardó, pero no se pudo actualizar el item del plan: " + (r.error || "error desconocido"))
        mutatePlanes()
        return
      }

      if (item.da_acceso && !plan.fecha_alta) {
        const fechaAlta = dialogForm.fecha_planeada
        const programaMatch = buscarProgramaPorOperacion(plan.operacion)
        const fechaBaja = calcularFechaBajaPrograma(fechaAlta, programaMatch?.programa.duracionMeses ?? null)
        await fetch("/api/planes-pago", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId: plan.id, fecha_alta: fechaAlta, fecha_baja: fechaBaja }),
        })
      }

      mutatePlanes()
      closeDialog()
    } catch {
      setDialogError("Error de conexión.")
    } finally {
      setDialogSubmitting(false)
    }
  }

  async function copiarMensaje(plan: PlanPago) {
    const filasPlan = itemsOrdenados(plan.plan_pago_items).map((it) => itemToFilaPlan(it))
    const esPlanDeVenta = filasPlan.some((fila) => CONCEPTO_FILA1_LABELS.includes(fila.concepto))
    const mensaje = generarMensajePPP({
      cliente: plan.cliente,
      ...resolverInfoPrograma(plan.operacion, filasPlan),
      filas: filasPlan,
      esNuevaVenta: esPlanDeVenta,
      categoriaVenta: esPlanDeVenta ? plan.categoria_venta : null,
    })
    try {
      await navigator.clipboard.writeText(mensaje)
      setCopiedId(plan.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // noop
    }
  }

  return (
    <div className="pt-6">
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-sm bg-muted/40 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 placeholder:text-muted-foreground"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Select value={closerFiltro} onValueChange={setCloserFiltro}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Filtrar por closer" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>— Todos los closers</SelectItem>
            {CLOSERS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <div className="text-center py-20 text-muted-foreground">Error al cargar los planes de pago</div>
      ) : planesFiltrados.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground text-sm">No se encontraron planes de pago</div>
      ) : (
        <div className="space-y-3">
          {planesFiltrados.map((plan) => {
            const items = itemsOrdenados(plan.plan_pago_items)
            const pagadas = items.filter((i) => i.estado === "pagado").length
            const total = items.length
            const completo = total > 0 && pagadas === total
            const isExpanded = expandedId === plan.id
            const filasPlan = items.map((it) => itemToFilaPlan(it))
            const mensajeActual = generarMensajePPP({
              cliente: plan.cliente,
              ...resolverInfoPrograma(plan.operacion, filasPlan),
              filas: filasPlan,
              esNuevaVenta: false,
            })

            return (
              <div key={plan.id} className="overflow-hidden rounded-[22px] border border-black/[.06] bg-white/65 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-xl dark:border-white/[.08] dark:bg-white/[.025]">
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : plan.id)}
                  className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-sm text-foreground truncate">{plan.cliente}</p>
                      {plan.estado_plan === "inactivo_no_responde" && <Badge variant="outline" className="border-zinc-500/40 text-zinc-400">No responde / Inactivo</Badge>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                      <span>{plan.operacion || "Sin operación"}</span>
                      <span>{plan.closer || "—"}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${completo ? "text-emerald-500" : "text-foreground"}`}>{pagadas} / {total}</p>
                      <p className="text-xs text-muted-foreground">cuotas pagadas</p>
                    </div>
                    <div className="w-24 h-2 rounded-full bg-muted overflow-hidden hidden sm:block">
                      <div className={`h-full ${completo ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: total > 0 ? `${(pagadas / total) * 100}%` : "0%" }} />
                    </div>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-border pt-4 pb-4 px-5 space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" disabled={updatingPlanId === plan.id} onClick={() => cambiarEstadoPlan(plan)}>
                        {updatingPlanId === plan.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Power className="mr-2 h-4 w-4" />}
                        {plan.estado_plan === "inactivo_no_responde" ? "Reactivar plan" : "Marcar No responde / Inactivo"}
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="border-red-500/30 text-red-500 hover:bg-red-500/10 hover:text-red-500" disabled={deletingPlanId === plan.id} onClick={() => eliminarPlan(plan)}>
                        {deletingPlanId === plan.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                        Eliminar plan duplicado
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <span className="text-sm font-medium text-foreground">{item.concepto}</span>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              ${(item.monto || 0).toLocaleString("es-AR")} USD · {fmtFecha(item.fecha_planeada)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Editar fecha/monto de esta cuota" onClick={() => openEditItem(plan, item)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                              title="Eliminar cuota"
                              disabled={deletingId === item.id}
                              onClick={() => eliminarItem(plan, item)}
                            >
                              {deletingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </Button>
                            <span className="text-xs text-muted-foreground mr-1 hidden md:inline">¿Se pagó?</span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={revertingId === item.id}
                                onClick={() => { if (item.estado !== "pagado") openDialog(plan, item) }}
                                className={cn(
                                  "px-3 py-1 rounded-md border text-xs font-semibold transition-colors disabled:opacity-50",
                                  item.estado === "pagado"
                                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                                    : "border-border text-muted-foreground hover:border-emerald-500/40 hover:text-emerald-600",
                                )}>
                                Sí
                              </button>
                              <button
                                type="button"
                                disabled={revertingId === item.id}
                                onClick={() => { if (item.estado === "pagado") revertirPago(item) }}
                                className={cn(
                                  "px-3 py-1 rounded-md border text-xs font-semibold transition-colors disabled:opacity-50",
                                  item.estado !== "pagado"
                                    ? "border-amber-500/40 bg-amber-500/10 text-amber-600"
                                    : "border-border text-muted-foreground hover:border-red-400 hover:text-red-500",
                                )}>
                                {revertingId === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "No"}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <Button type="button" variant="outline" size="sm" onClick={() => openAddItem(plan)}>
                      <Plus className="mr-2 h-4 w-4" />Agregar pago
                    </Button>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mensaje PPP</p>
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => copiarMensaje(plan)}>
                          {copiedId === plan.id ? <><Check className="h-3.5 w-3.5 mr-1" />Copiado</> : <><Copy className="h-3.5 w-3.5 mr-1" />Copiar mensaje</>}
                        </Button>
                      </div>
                      <div className="whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-xs font-mono">
                        {mensajeActual}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Dialog open={!!dialogState} onOpenChange={(open) => { if (!open) closeDialog() }}>
        <DialogContent className="flex max-h-[calc(100dvh-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-h-[90dvh]">
          <DialogHeader className="shrink-0 border-b px-6 py-5 pr-12">
            <DialogTitle>Cargar pago{dialogState ? ` — ${dialogState.item.concepto}` : ""}</DialogTitle>
          </DialogHeader>
          {dialogState && (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-4 [scrollbar-gutter:stable]">
              {dialogError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" /><AlertDescription>{dialogError}</AlertDescription>
                </Alert>
              )}
              <p className="text-xs text-muted-foreground">
                Cliente: <span className="font-medium text-foreground">{dialogState.plan.cliente}</span>
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Fecha real del pago</Label>
                <Input type="date" value={dialogForm.fecha_planeada} onChange={(e) => setDialogForm((p) => ({ ...p, fecha_planeada: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Monto (USD)</Label>
                <Input type="number" step="0.01" value={dialogForm.monto} onChange={(e) => setDialogForm((p) => ({ ...p, monto: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Medio de Pago</Label>
                <Select value={dialogForm.medio_de_pago} onValueChange={(v) => setDialogForm((p) => ({ ...p, medio_de_pago: v }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar medio" /></SelectTrigger>
                  <SelectContent>{MEDIO_PAGO.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">CC ARS</Label>
                <div className="flex gap-2 mb-2">
                  <Pill active={dialogForm.ccArsModo === "no_aplica"} onClick={() => setDialogForm((p) => ({ ...p, ccArsModo: "no_aplica", cc_ars: "" }))}>No aplica</Pill>
                  <Pill active={dialogForm.ccArsModo === "en_pesos"} onClick={() => setDialogForm((p) => ({ ...p, ccArsModo: "en_pesos" }))}>En pesos</Pill>
                </div>
                {dialogForm.ccArsModo === "en_pesos" && (
                  <div className="space-y-2">
                    <Input type="number" step="0.01" placeholder="Monto en ARS (ej: 609875)" value={dialogForm.cc_ars} onChange={(e) => setDialogForm((p) => ({ ...p, cc_ars: e.target.value }))} />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Tipo de cambio (calculado)</span>
                      <span className="text-sm font-medium text-amber-500">
                        {dialogTipoCambio !== null ? `$${dialogTipoCambio.toLocaleString("es-AR", { maximumFractionDigits: 2 })}` : "—"}
                      </span>
                    </div>
                    {dialogComision3 !== null && (
                      <p className="text-xs text-emerald-600">
                        Comisión 3% — contadora: ${dialogComision3.toLocaleString("es-AR", { minimumFractionDigits: 2 })} ARS
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Comprobante <span className="text-red-500">*</span></Label>
                <ComprobanteUpload
                  value={dialogForm.comprobante}
                  onChange={(v) => setDialogForm((p) => ({ ...p, comprobante: v }))}
                  concepto={dialogState?.item.concepto}
                  cliente={dialogState?.plan.cliente}
                />
                <p className="text-xs text-muted-foreground">Obligatorio — sin comprobante no se puede confirmar el pago.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">¿Es reactivación / enrutamiento?</Label>
                <div className="flex gap-2">
                  <Pill active={!dialogForm.es_reactivacion} onClick={() => setDialogForm((p) => ({ ...p, es_reactivacion: false }))}>No</Pill>
                  <Pill active={dialogForm.es_reactivacion} onClick={() => setDialogForm((p) => ({ ...p, es_reactivacion: true }))}>Sí</Pill>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="shrink-0 border-t bg-background/95 px-6 py-4 backdrop-blur">
            <Button variant="outline" onClick={closeDialog} disabled={dialogSubmitting}>Cancelar</Button>
            <Button onClick={confirmDialog} disabled={dialogSubmitting}>
              {dialogSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</> : "Confirmar pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!addItemPlan} onOpenChange={(open) => { if (!open && !addItemSubmitting) setAddItemPlan(null) }}>
        <DialogContent className="flex max-h-[calc(100dvh-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-h-[90dvh]">
          <DialogHeader className="shrink-0 border-b px-6 py-5 pr-12">
            <DialogTitle>Agregar pago{addItemPlan ? ` — ${addItemPlan.cliente}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-4 [scrollbar-gutter:stable]">
            {addItemError && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{addItemError}</AlertDescription></Alert>}
            <p className="text-xs text-muted-foreground">Agrega una nueva cuota pendiente al plan existente. Cuando se cobre, se confirma desde este mismo plan.</p>
            <F label="Concepto">
              <Select value={addItemForm.concepto} onValueChange={(v) => setAddItemForm((p) => ({ ...p, concepto: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar concepto" /></SelectTrigger>
                <SelectContent>{CONCEPTO_TODOS_LABELS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
            </F>
            {esCuota(addItemForm.concepto) && <F label="Número de cuota"><Input type="number" min="1" step="1" value={addItemForm.numero_cuota} onChange={(e) => setAddItemForm((p) => ({ ...p, numero_cuota: e.target.value }))} /></F>}
            <F label="Monto (USD)"><Input type="number" min="0" step="0.01" value={addItemForm.monto} onChange={(e) => setAddItemForm((p) => ({ ...p, monto: e.target.value }))} /></F>
            <F label="Fecha planeada"><Input type="date" value={addItemForm.fecha_planeada} onChange={(e) => setAddItemForm((p) => ({ ...p, fecha_planeada: e.target.value }))} /></F>
            <F label="Medio de pago">
              <Select value={addItemForm.medio_de_pago} onValueChange={(v) => setAddItemForm((p) => ({ ...p, medio_de_pago: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar medio (opcional)" /></SelectTrigger>
                <SelectContent>{MEDIO_PAGO.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
            </F>
            {esCuota(addItemForm.concepto) && <div className="flex items-center gap-2"><Checkbox id="add-item-access" checked={addItemForm.da_acceso} onCheckedChange={(v) => setAddItemForm((p) => ({ ...p, da_acceso: v === true }))} /><Label htmlFor="add-item-access">Esta cuota da acceso</Label></div>}
          </div>
          <DialogFooter className="shrink-0 border-t bg-background/95 px-6 py-4 backdrop-blur">
            <Button variant="outline" onClick={() => setAddItemPlan(null)} disabled={addItemSubmitting}>Cancelar</Button>
            <Button onClick={confirmAddItem} disabled={addItemSubmitting}>{addItemSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</> : "Agregar pago"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editItemState} onOpenChange={(open) => { if (!open) closeEditItem() }}>
        <DialogContent className="flex max-h-[calc(100dvh-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-h-[90dvh]">
          <DialogHeader className="shrink-0 border-b px-6 py-5 pr-12">
            <DialogTitle>Editar cuota{editItemState ? ` — ${editItemState.plan.cliente}` : ""}</DialogTitle>
          </DialogHeader>
          {editItemState && (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-4 [scrollbar-gutter:stable]">
              {editItemError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" /><AlertDescription>{editItemError}</AlertDescription>
                </Alert>
              )}
              <p className="text-xs text-muted-foreground">
                Esto solo cambia lo planeado en el plan de pago — no crea ni modifica ningún pago ya cargado.
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Concepto</Label>
                <Select value={editItemForm.concepto} onValueChange={(v) => setEditItemForm((p) => ({ ...p, concepto: v }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar concepto" /></SelectTrigger>
                  <SelectContent>{editConceptoOptions.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Fecha planeada</Label>
                <Input type="date" value={editItemForm.fecha_planeada} onChange={(e) => setEditItemForm((p) => ({ ...p, fecha_planeada: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Monto (USD)</Label>
                <Input type="number" step="0.01" value={editItemForm.monto} onChange={(e) => setEditItemForm((p) => ({ ...p, monto: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Medio de Pago</Label>
                <Select value={editItemForm.medio_de_pago} onValueChange={(v) => setEditItemForm((p) => ({ ...p, medio_de_pago: v }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar medio" /></SelectTrigger>
                  <SelectContent>{MEDIO_PAGO.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">CC ARS</Label>
                <div className="flex gap-2 mb-2">
                  <Pill active={editItemForm.ccArsModo === "no_aplica"} onClick={() => setEditItemForm((p) => ({ ...p, ccArsModo: "no_aplica" }))}>No aplica</Pill>
                  <Pill active={editItemForm.ccArsModo === "en_pesos"} onClick={() => setEditItemForm((p) => ({ ...p, ccArsModo: "en_pesos" }))}>En pesos</Pill>
                </div>
                {editItemForm.ccArsModo === "en_pesos" && (
                  <div className="space-y-4">
                    <Input type="number" step="0.01" placeholder="Monto en ARS (ej: 609875)" value={editItemForm.cc_ars} onChange={(e) => setEditItemForm((p) => ({ ...p, cc_ars: e.target.value }))} />
                    <F label="Tipo de cambio (calculado automáticamente)">
                      <div className="h-10 flex items-center px-3 rounded-md border border-border bg-muted/20 text-sm font-medium text-amber-500">
                        {editTipoCambio !== null ? `$${editTipoCambio.toLocaleString("es-AR", { maximumFractionDigits: 2 })}` : "—"}
                      </div>
                    </F>
                    {editComision3 !== null && (
                      <p className="text-xs text-emerald-600">
                        Comisión 3% — contadora: ${editComision3.toLocaleString("es-AR", { minimumFractionDigits: 2 })} ARS
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Comprobante</Label>
                <ComprobanteUpload
                  value={editItemForm.comprobante}
                  onChange={(v) => setEditItemForm((p) => ({ ...p, comprobante: v }))}
                  concepto={editItemForm.concepto}
                  cliente={editItemState.plan.cliente}
                />
              </div>
            </div>
          )}
          <DialogFooter className="shrink-0 border-t bg-background/95 px-6 py-4 backdrop-blur">
            <Button variant="outline" onClick={closeEditItem} disabled={editItemSubmitting}>Cancelar</Button>
            <Button onClick={confirmEditItem} disabled={editItemSubmitting}>
              {editItemSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</> : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
