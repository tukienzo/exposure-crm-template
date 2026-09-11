"use client"

import { useState, useMemo } from "react"
import useSWR, { mutate } from "swr"
import { DateFilter } from "@/components/date-filter"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { Loader2, CheckCircle2, Pencil, Filter, BarChart2, X, Search, ExternalLink, Trash2, Download, CircleDollarSign, Receipt, Banknote, ShieldCheck } from "lucide-react"
import { exportRowsToCSV } from "@/lib/csv-export"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { Pago } from "@/lib/supabase"
import { OPERACION_LABELS as OPERACION } from "@/lib/operaciones"
import { FuenteSelect, FuenteFilter } from "@/components/fuente-picker"
import { MultiSelectFilter } from "@/components/ui/multi-select-filter"
import { CrmPageIntro, CrmStat } from "@/components/crm-ui"
import { useSession } from "@/components/session-provider"
import { canExportPayments } from "@/lib/export-access"
import { CLOSERS_ACTIVOS, SETTERS_ACTIVOS } from "@/lib/equipo"

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const PESO_MEDIOS = new Set(["Pesos", "Efectivo ARS"])

// El equipo sale de .env (NEXT_PUBLIC_CRM_CLOSERS y NEXT_PUBLIC_CRM_SETTERS)
const CLOSERS   = [...CLOSERS_ACTIVOS, "Sin closer"]
const SETTERS   = [...SETTERS_ACTIVOS, "Sin Setter"]
const settersFor = (_d?: string | null) => SETTERS
const TIPO_PAGO = ["Fee","Venta Nueva (En Call)","Fee Venta Interna","Venta Nueva Interna","Refuerzo de Fee","Venta Nueva (Post Fee)","Completó PIF (Post Fee)","Completó PIF + Acceso Total Consulting","Venta Nueva Interna (Post Fee)","Completa Total (Post Venta)","Completa Total + Acceso Acción","Completa Total y Finaliza Pago","Venta Nueva","Cuota","Cuota 1","Cuota 2","Cuota 3","Cuota 4","Cuota 5","Cuota 6","Cuota 7","Cuota 8","Cuota 9","Cuota 10","Cuota Venta Interna","Rollover","Upsell","Otro"]
const MEDIO_PAGO = ["Pesos","Stripe","USDT","Efectivo USD","Efectivo ARS","Transferencia Bancaria USD","Western Unión","PayPal"]
const CALIFICACION = ["LEAD S","LEAD A","LEAD B","LEAD C","LEAD D"]
// Colores definitivos de lead (mismos que Centro de Agendas)
const CAL_PILL: Record<string, string> = {
  S: "bg-violet-600 text-white", A: "bg-green-600 text-white", B: "bg-yellow-400 text-black",
  C: "bg-blue-600 text-white", D: "bg-red-600 text-white",
}
function filterToParams(filter: string): string {
  if (!filter || filter === "all") return ""
  if (filter.startsWith("range:")) {
    const [s, e] = filter.slice(6).split(":")
    return `?start=${s}&end=${e}`
  }
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const iso = (d: Date) => d.toISOString().split("T")[0]
  if (filter.startsWith("month:")) {
    const [y, m] = filter.slice(6).split("-").map(Number)
    return `?start=${iso(new Date(y,m-1,1))}&end=${iso(new Date(y,m,0))}`
  }
  const som = new Date(today.getFullYear(), today.getMonth(), 1)
  const eom = new Date(today.getFullYear(), today.getMonth()+1, 0)
  const solm = new Date(today.getFullYear(), today.getMonth()-1, 1)
  const eolm = new Date(today.getFullYear(), today.getMonth(), 0)
  switch (filter) {
    case "today":      return `?start=${iso(today)}&end=${iso(today)}`
    case "this-week":  { const w=new Date(today); w.setDate(today.getDate()-today.getDay()); return `?start=${iso(w)}&end=${iso(today)}` }
    case "this-month": return `?start=${iso(som)}&end=${iso(eom)}`
    case "last-month": return `?start=${iso(solm)}&end=${iso(eolm)}`
    case "this-year":  return `?start=${iso(new Date(today.getFullYear(),0,1))}&end=${iso(today)}`
    default: return ""
  }
}

function parseLocalDate(str: string | null): Date | null {
  if (!str) return null
  const s = str.split("T")[0]; const p = s.split("-").map(Number)
  if (p.length !== 3) return null
  return new Date(p[0], p[1]-1, p[2])
}

// ── Control toggle button ─────────────────────────────────────────────────────
function ControlBtn({ pago, apiUrl }: { pago: Pago; apiUrl: string }) {
  const [loading, setLoading] = useState(false)
  const isOk = pago.control === "OK"
  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setLoading(true)
    await fetch("/api/pagos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: pago.id, control: isOk ? null : "OK" }) })
    await mutate(apiUrl)
    setLoading(false)
  }
  if (loading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
  return (
    <button onClick={handleClick} className={cn("flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold border transition-colors", isOk ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/20" : "bg-muted text-muted-foreground border-border hover:bg-muted/80")}>
      {isOk && <CheckCircle2 className="h-3 w-3" />}{isOk ? "OK" : "—"}
    </button>
  )
}

// ── Edit modal helper components ──────────────────────────────────────────────
function FSel({ label, value, options, onChange }: { label: string; value: string | null | undefined; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value || ""} onValueChange={onChange}>
        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
        <SelectContent>{options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  )
}

function FTxt({ label, value, onChange, placeholder, type }: { label: string; value: string | null | undefined; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input type={type || "text"} className="h-9 text-sm" value={value ?? ""} onChange={e => onChange(e.target.value)} placeholder={placeholder || ""} />
    </div>
  )
}

function FArea({ label, value, onChange }: { label: string; value: string | null | undefined; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Textarea className="resize-none text-sm" rows={3} value={value || ""} onChange={e => onChange(e.target.value)} />
    </div>
  )
}

function comprobanteHref(value: string): string | null {
  if (/^https?:\/\//i.test(value)) return value
  if (value.startsWith("/api/upload-comprobante?")) return value
  return null
}

function comprobantesExportables(value: string | null | undefined): string {
  return (value || "").split("\n").map((item) => item.trim()).filter(Boolean).map((item) => {
    if (/^https?:\/\//i.test(item)) return item
    if (item.startsWith("/api/upload-comprobante?") && typeof window !== "undefined") return `${window.location.origin}${item}`
    return item
  }).join("\n")
}

function ComprobanteUpload({ value, onChange, concepto, cliente }: {
  value: string | null | undefined
  onChange: (value: string) => void
  concepto: string | null | undefined
  cliente: string | null | undefined
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")

  const upload = async (file?: File) => {
    if (!file) return
    setUploading(true)
    setError("")
    try {
      const body = new FormData()
      body.append("file", file)
      body.append("concepto", concepto || "pago")
      body.append("cliente", cliente || "cliente")
      const response = await fetch("/api/upload-comprobante", { method: "POST", body })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || "No se pudo cargar el comprobante")
      onChange([...(value || "").split("\n").map((item) => item.trim()).filter(Boolean), result.url].join("\n"))
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "No se pudo cargar el comprobante")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      <label className="inline-flex cursor-pointer items-center rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/10">
        {uploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Subiendo...</> : "Adjuntar comprobante (foto o PDF)"}
        <input className="sr-only" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={uploading} onChange={(event) => { void upload(event.target.files?.[0]); event.currentTarget.value = "" }} />
      </label>
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  )
}

// El link Fathom no tiene columna propia en "pagos" — se guarda mezclado
// adentro de contenido_contestado como "{base} | Fathom: {url}" (mismo
// formato que arma buildContenidoContestado() en Carga de Pagos). Estas dos
// funciones separan/rearman esa mezcla para poder mostrarlo en su propio campo.
function splitContenidoFathom(s: string | null | undefined): { base: string; fathom: string } {
  const str = (s || "").trim()
  if (!str) return { base: "", fathom: "" }
  const conBase = str.match(/^(.*?)\s*\|\s*Fathom:\s*(.+)$/)
  if (conBase) return { base: conBase[1].trim(), fathom: conBase[2].trim() }
  const soloFathom = str.match(/^Fathom:\s*(.+)$/)
  if (soloFathom) return { base: "", fathom: soloFathom[1].trim() }
  return { base: str, fathom: "" }
}
function joinContenidoFathom(base: string, fathom: string): string | null {
  const b = base.trim(), f = fathom.trim()
  if (b && f) return `${b} | Fathom: ${f}`
  if (f) return `Fathom: ${f}`
  if (b) return b
  return null
}

function Sec({ title }: { title: string }) {
  return <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-4 mb-2 pb-1 border-b border-border">{title}</p>
}

// ── Column stats popover ──────────────────────────────────────────────────────
function ColStats({ data, label, getVal }: {
  data: Pago[]; label: string; getVal: (p: Pago) => string | null | undefined
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

// ── Filter bar ────────────────────────────────────────────────────────────────
type PagoFilters = { tipo: string[]; closer: string[]; setter: string[]; calificacion: string[]; medio_de_pago: string[]; operacion: string[]; fuente: string[] }
const EMPTY_PAGO_FILTERS: PagoFilters = { tipo: [], closer: [], setter: [], calificacion: [], medio_de_pago: [], operacion: [], fuente: [] }

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TodosPagosPage() {
  const { email } = useSession()
  const canExport = canExportPayments(email)
  const [dateFilter, setDateFilter] = useState("this-month")
  const params = filterToParams(dateFilter)
  const apiUrl = `/api/pagos${params}`
  const { data: pagos = [], isLoading, error } = useSWR<Pago[]>(apiUrl, fetcher)

  const [editing, setEditing] = useState<Pago | null>(null)
  const [form, setForm] = useState<Partial<Pago>>({})
  const [fathomLink, setFathomLink] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [deleting, setDeleting] = useState(false)
  const [colFilters, setColFilters] = useState<PagoFilters>(EMPTY_PAGO_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState<"date_desc" | "date_asc" | "closer" | "client">("date_desc")

  const activeFilterCount = useMemo(() => Object.values(colFilters).filter(v => v.length > 0).length, [colFilters])
  const setFilt = (k: keyof PagoFilters, v: string[]) => setColFilters(p => ({ ...p, [k]: v }))
  const toggleFilt = (k: keyof PagoFilters, v: string) => setColFilters(p => ({ ...p, [k]: p[k].includes(v) ? p[k].filter(x => x !== v) : [...p[k], v] }))

  const filtered = useMemo(() => {
    const f = colFilters
    const q = search.trim().toLowerCase()
    const rows = pagos.filter(p => {
      if (q && !(p.cliente || "").toLowerCase().includes(q)) return false
      if (f.tipo.length && !f.tipo.includes(p.tipo || "")) return false
      if (f.closer.length && !f.closer.includes(p.closer || "")) return false
      if (f.setter.length && !f.setter.includes(p.setter || "")) return false
      if (f.calificacion.length && !f.calificacion.includes(p.calificacion || "")) return false
      if (f.medio_de_pago.length && !f.medio_de_pago.includes(p.medio_de_pago || "")) return false
      if (f.operacion.length && !f.operacion.includes(p.operacion || "")) return false
      if (f.fuente.length && !f.fuente.includes(p.fuente || "")) return false
      return true
    })
    return rows.sort((a, b) => {
      if (sortBy === "closer") return (a.closer || "").localeCompare(b.closer || "", "es")
      if (sortBy === "client") return (a.cliente || "").localeCompare(b.cliente || "", "es")
      const delta = String(a.fecha || "").localeCompare(String(b.fecha || ""))
      return sortBy === "date_asc" ? delta : -delta
    })
  }, [pagos, colFilters, search, sortBy])

  const openEdit = (p: Pago) => {
    setSaveError("")
    setEditing(p)
    const { base, fathom } = splitContenidoFathom(p.contenido_contestado)
    setForm({ ...p, contenido_contestado: base })
    setFathomLink(fathom)
  }
  const setF = (k: keyof Pago, v: unknown) => setForm(prev => ({ ...prev, [k]: v }))

  const handleSave = async () => {
    if (!editing?.id) return
    const id = editing.id
    setSaving(true)
    const { id: _d, ...fields } = form
    const updates: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(fields)) {
      updates[k] = (v === "" || v === undefined) ? null : v
    }
    updates.contenido_contestado = joinContenidoFathom(String(form.contenido_contestado || ""), fathomLink)
    if (updates.monto !== null)          updates.monto = parseFloat(String(updates.monto)) || null
    if (updates.cc_ars !== null)         updates.cc_ars = parseFloat(String(updates.cc_ars)) || null
    if (updates.tipo_cambio_usd !== null) updates.tipo_cambio_usd = parseFloat(String(updates.tipo_cambio_usd)) || null
    try {
      const response = await fetch("/api/pagos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...updates }) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || "No se pudo editar el pago")
      await mutate(apiUrl)
      setEditing(null)
    } catch (saveFailure) {
      setSaveError(saveFailure instanceof Error ? saveFailure.message : "No se pudo editar el pago")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!editing?.id) return
    const reason = window.prompt(`¿Por qué archivás el pago de "${editing.cliente}"?\n\nEl pago saldrá de los totales, pero quedará guardado para auditoría.`)
    if (reason === null) return
    if (!reason.trim()) {
      setSaveError("Indicá el motivo para archivar el pago.")
      return
    }
    setDeleting(true)
    setSaveError("")
    try {
      const response = await fetch("/api/pagos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id, reason: reason.trim() }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || "No se pudo archivar el pago")
      await mutate(apiUrl)
      setEditing(null)
    } catch (archiveFailure) {
      setSaveError(archiveFailure instanceof Error ? archiveFailure.message : "No se pudo archivar el pago")
    } finally {
      setDeleting(false)
    }
  }

  const formatDate = (str: string | null) => {
    const d = parseLocalDate(str); if (!d) return "-"
    return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })
  }

  const totalUSD = filtered.reduce((s, p) => s + (Number(p.monto) || 0), 0)
  const totalARS = filtered.reduce((s, p) => s + (Number(p.cc_ars) || 0), 0)
  const pendControl = filtered.filter(p => p.control !== "OK").length

  const csvColumns = [
    { label: "Cliente", get: (p: Pago) => p.cliente },
    { label: "F. Carga", get: (p: Pago) => formatDate(p.fecha) },
    { label: "F. Alta", get: (p: Pago) => p.fecha_alta === "PENDIENTE" ? "PENDIENTE" : formatDate(p.fecha_alta) },
    { label: "F. Baja", get: (p: Pago) => p.fecha_baja === "PENDIENTE" ? "PENDIENTE" : formatDate(p.fecha_baja) },
    { label: "Concepto", get: (p: Pago) => p.tipo },
    { label: "Operación", get: (p: Pago) => p.operacion },
    { label: "Closer", get: (p: Pago) => p.closer },
    { label: "Setter", get: (p: Pago) => p.setter },
    { label: "Calificación", get: (p: Pago) => p.calificacion },
    { label: "Medio de Pago", get: (p: Pago) => p.medio_de_pago },
    { label: "Comprobante", get: (p: Pago) => comprobantesExportables(p.comprobante) },
    { label: "CC USD", get: (p: Pago) => p.monto },
    { label: "CC ARS", get: (p: Pago) => p.cc_ars },
    { label: "Com. 3%", get: (p: Pago) => (p.cc_ars && p.medio_de_pago && PESO_MEDIOS.has(p.medio_de_pago)) ? (Number(p.cc_ars) * 0.03).toFixed(2) : "" },
    { label: "Fuente", get: (p: Pago) => p.fuente },
    { label: "Contenido Contestado", get: (p: Pago) => splitContenidoFathom(p.contenido_contestado).base },
    { label: "Otras Comisiones", get: (p: Pago) => p.otras_comisiones },
    { label: "Control", get: (p: Pago) => p.control === "OK" ? "OK" : "" },
    { label: "Link Fathom", get: (p: Pago) => splitContenidoFathom(p.contenido_contestado).fathom },
  ]

  return (
    <div className="crm-module-page">
      <CrmPageIntro
        eyebrow="Pagos"
        title="Registro de pagos"
        description=""
        icon={<CircleDollarSign className="h-6 w-6" />}
        tone="emerald"
        actions={<div className="[&_button]:border-white/10 [&_button]:bg-white/10 [&_button]:text-white"><DateFilter onFilterChange={setDateFilter} /></div>}
      />

      <div className="crm-kpis">
        <CrmStat label="Transacciones" value={filtered.length} detail={`${pagos.length} totales en el período`} icon={<Receipt className="h-5 w-5" />} tone="blue" />
        <CrmStat label="Total USD" value={`$${totalUSD.toLocaleString()}`} detail="cash collected filtrado" icon={<CircleDollarSign className="h-5 w-5" />} tone="emerald" />
        <CrmStat label="Total ARS" value={totalARS > 0 ? `$${totalARS.toLocaleString()}` : "—"} detail="cobros locales en vista" icon={<Banknote className="h-5 w-5" />} tone="violet" />
        <CrmStat label="Sin control" value={pendControl} detail={pendControl ? "requieren revisión" : "todo conciliado"} icon={<ShieldCheck className="h-5 w-5" />} tone={pendControl > 0 ? "amber" : "emerald"} />
      </div>

      <Card className="crm-data-panel border-0">
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg font-semibold whitespace-nowrap">Registro de Pagos</CardTitle>
            {!isLoading && !error && pagos.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente..."
                    className="h-8 w-44 sm:w-52 pl-8 pr-7 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  {search && (<button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>)}
                </div>
                <button onClick={() => setFiltersOpen(o => !o)}
                  className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors",
                    activeFilterCount > 0 ? "bg-primary/10 text-primary border-primary/30" : "border-border text-muted-foreground hover:bg-muted")}>
                  <Filter className="h-3.5 w-3.5" />Filtros
                  {activeFilterCount > 0 && (<span className="bg-primary text-primary-foreground text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold leading-none">{activeFilterCount}</span>)}
                </button>
                <select aria-label="Orden local" value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} className="h-8 rounded-lg border border-border bg-background px-2 text-xs font-bold">
                  <option value="date_desc">Más recientes</option>
                  <option value="date_asc">Más antiguos</option>
                  <option value="closer">Por closer</option>
                  <option value="client">Por cliente</option>
                </select>
                {activeFilterCount > 0 && (<button onClick={() => setColFilters(EMPTY_PAGO_FILTERS)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><X className="h-3 w-3" />Limpiar</button>)}
                {canExport && <button
                  onClick={() => exportRowsToCSV(filtered, csvColumns, `pagos_${new Date().toISOString().slice(0, 10)}`)}
                  title="Exporta exactamente lo que estás viendo, con los filtros aplicados"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
                  <Download className="h-3.5 w-3.5" />Exportar CSV
                </button>}
                <span className="text-xs text-muted-foreground">{filtered.length} de {pagos.length}</span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          {!isLoading && !error && pagos.length > 0 && filtersOpen && (
            <div className="mb-4">
              <div className="p-4 bg-muted/30 border border-border rounded-lg grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  <MultiSelectFilter label="Concepto" values={colFilters.tipo} options={TIPO_PAGO} onChange={v => setFilt("tipo", v)} />
                  <MultiSelectFilter label="Closer" values={colFilters.closer} options={CLOSERS} onChange={v => setFilt("closer", v)} />
                  <MultiSelectFilter label="Setter" values={colFilters.setter} options={SETTERS} onChange={v => setFilt("setter", v)} />
                  <MultiSelectFilter label="Calificación" values={colFilters.calificacion} options={CALIFICACION} onChange={v => setFilt("calificacion", v)} />
                  <MultiSelectFilter label="Medio de Pago" values={colFilters.medio_de_pago} options={MEDIO_PAGO} onChange={v => setFilt("medio_de_pago", v)} />
                  <MultiSelectFilter label="Operación" values={colFilters.operacion} options={OPERACION} onChange={v => setFilt("operacion", v)} />
                  <FuenteFilter value={colFilters.fuente} onToggle={v => toggleFilt("fuente", v)} onClear={() => setFilt("fuente", [])} />
                </div>
            </div>
          )}

          {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          : error ? <p className="text-center text-sm text-destructive py-12">Error al cargar pagos.</p>
          : pagos.length === 0 ? <p className="text-center text-sm text-muted-foreground py-12">No hay pagos en este período.</p>
          : (
            <div className="[&>div]:max-h-[calc(100vh-390px)]">
              <Table className="[&_th:not(:last-child)]:border-r [&_td:not(:last-child)]:border-r [&_th]:border-neutral-400 [&_td]:border-neutral-400 dark:[&_th]:border-neutral-600 dark:[&_td]:border-neutral-600">
                <TableHeader className="sticky top-0 z-20 bg-neutral-900 [&_tr]:border-neutral-700">
                  <TableRow className="hover:bg-transparent bg-neutral-900">
                    <TableHead className="sticky left-0 z-30 bg-neutral-900 text-xs font-semibold uppercase text-white shadow-[2px_0_4px_rgba(0,0,0,0.08)] whitespace-nowrap">Cliente</TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-white whitespace-nowrap">F. Carga</TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-white whitespace-nowrap">F. Alta</TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-white whitespace-nowrap">F. Baja</TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-white whitespace-nowrap">
                      Concepto<ColStats data={filtered} label="Concepto" getVal={p => p.tipo} />
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-white whitespace-nowrap">
                      Operación<ColStats data={filtered} label="Operación" getVal={p => p.operacion} />
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-white whitespace-nowrap">
                      Closer<ColStats data={filtered} label="Closer" getVal={p => p.closer} />
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-white whitespace-nowrap">
                      Setter<ColStats data={filtered} label="Setter" getVal={p => p.setter} />
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-white whitespace-nowrap">
                      Calif.<ColStats data={filtered} label="Calificación" getVal={p => p.calificacion} />
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-white whitespace-nowrap">
                      Medio<ColStats data={filtered} label="Medio de Pago" getVal={p => p.medio_de_pago} />
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-white">CC USD</TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-white">CC ARS</TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-white whitespace-nowrap">Com. 3%</TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-white whitespace-nowrap">
                      Fuente<ColStats data={filtered} label="Fuente" getVal={p => p.fuente} />
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-white whitespace-nowrap">Contenido</TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-white whitespace-nowrap">Otras Com.</TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-white">Control</TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-white whitespace-nowrap">Fathom</TableHead>
                    <TableHead className="w-24 text-xs font-semibold uppercase text-white">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => {
                    const comision3 = p.cc_ars && p.medio_de_pago && PESO_MEDIOS.has(p.medio_de_pago) ? (Number(p.cc_ars)*0.03) : null
                    const fAltaDisplay = p.fecha_alta === "PENDIENTE" ? <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/20">PENDIENTE</Badge> : formatDate(p.fecha_alta)
                    const fBajaDisplay = p.fecha_baja === "PENDIENTE" ? <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/20">PENDIENTE</Badge> : formatDate(p.fecha_baja)
                    return (
                      <TableRow key={p.id} className="hover:bg-muted/50 cursor-pointer group" onClick={() => openEdit(p)}>
                        <TableCell className="sticky left-0 z-10 bg-card font-medium whitespace-nowrap shadow-[2px_0_4px_rgba(0,0,0,0.08)] min-w-[180px]">{p.cliente}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{formatDate(p.fecha)}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{fAltaDisplay}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{fBajaDisplay}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{p.tipo||"—"}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{p.operacion||"—"}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{p.closer||"—"}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{p.setter||"—"}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{p.calificacion ? <span className={cn("px-2 py-0.5 rounded text-xs font-semibold", CAL_PILL[(p.calificacion||"").replace(/^LEAD\s*/i,"").trim()] || "bg-muted text-muted-foreground")}>{p.calificacion}</span> : "—"}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{p.medio_de_pago||"—"}</TableCell>
                        <TableCell className="font-semibold text-primary whitespace-nowrap">{p.monto!=null?`$${Number(p.monto).toLocaleString()}`:"—"}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{p.cc_ars!=null?`$${Number(p.cc_ars).toLocaleString()}`:"—"}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{comision3!=null?<span className="text-emerald-600 font-medium">${comision3.toLocaleString("es-AR",{minimumFractionDigits:0})}</span>:<span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{p.fuente||"—"}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{splitContenidoFathom(p.contenido_contestado).base || "—"}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{p.otras_comisiones||"—"}</TableCell>
                        <TableCell onClick={e => e.stopPropagation()}><ControlBtn pago={p} apiUrl={apiUrl} /></TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {(() => {
                            const { fathom } = splitContenidoFathom(p.contenido_contestado)
                            if (!fathom) return "—"
                            return (
                              <a href={fathom} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                title="Abrir Fathom" className="inline-flex items-center text-primary hover:underline">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )
                          })()}
                        </TableCell>
                        <TableCell className="w-24">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5"
                            onClick={(event) => { event.stopPropagation(); openEdit(p) }}
                          >
                            <Pencil className="h-3.5 w-3.5" /> Editar
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit modal */}
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null) }}>
        <DialogContent className="grid max-h-[92dvh] max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader className="z-20 border-b border-white/10 bg-gradient-to-r from-zinc-950 to-zinc-900 px-6 py-5 text-white">
            <div className="flex items-center justify-between gap-2 pr-6">
              <DialogTitle className="text-base font-black">Editar pago — {editing?.cliente}</DialogTitle>
              <button onClick={() => setEditing(null)} className="absolute right-4 top-4 rounded-xl bg-white/5 p-2 text-white/60 hover:bg-white/10 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
          </DialogHeader>

          <div className="min-h-0 space-y-1 overflow-y-auto overscroll-contain px-6 py-4 [-webkit-overflow-scrolling:touch]">
            <Sec title="Identificación" />
            <div className="grid grid-cols-2 gap-3">
              <FTxt label="Cliente" value={form.cliente} onChange={v => setF("cliente", v)} />
              <FTxt label="Teléfono" value={form.telefono} onChange={v => setF("telefono", v)} />
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <FTxt label="Fecha Carga" value={form.fecha?.split("T")[0]} type="date" onChange={v => setF("fecha", v || null)} />
              <FSel label="Concepto (Tipo)" value={form.tipo} options={TIPO_PAGO} onChange={v => setF("tipo", v)} />
            </div>

            <Sec title="Operación" />
            <FSel label="Operación / Programa" value={form.operacion} options={OPERACION} onChange={v => setF("operacion", v)} />
            <div className="grid grid-cols-2 gap-3 pt-2">
              <FSel label="Closer" value={form.closer} options={form.closer && !CLOSERS.includes(String(form.closer)) ? [String(form.closer), ...CLOSERS] : CLOSERS} onChange={v => setF("closer", v)} />
              <FSel label="Setter" value={form.setter} options={settersFor(form.fecha)} onChange={v => setF("setter", v)} />
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <FSel label="Calificación" value={form.calificacion} options={CALIFICACION} onChange={v => setF("calificacion", v)} />
              <FSel label="Medio de Pago" value={form.medio_de_pago} options={MEDIO_PAGO} onChange={v => setF("medio_de_pago", v)} />
            </div>

            <Sec title="Montos" />
            <div className="grid grid-cols-3 gap-3">
              <FTxt label="CC USD" value={form.monto != null ? String(form.monto) : ""} type="number" onChange={v => setF("monto", v)} placeholder="0" />
              <FTxt label="CC ARS" value={form.cc_ars != null ? String(form.cc_ars) : ""} type="number" onChange={v => setF("cc_ars", v)} placeholder="0" />
              <FTxt label="Tipo Cambio USD" value={form.tipo_cambio_usd != null ? String(form.tipo_cambio_usd) : ""} type="number" onChange={v => setF("tipo_cambio_usd", v)} placeholder="0" />
            </div>

            <Sec title="Suscripción" />
            <div className="grid grid-cols-2 gap-3">
              <FTxt label="Fecha Alta" value={form.fecha_alta?.split("T")[0]} type="date" onChange={v => setF("fecha_alta", v || null)} />
              <FTxt label="Fecha Baja" value={form.fecha_baja?.split("T")[0]} type="date" onChange={v => setF("fecha_baja", v || null)} />
            </div>
            <div className="pt-2">
              <FArea label="PPP (Plan de Pago Personalizado)" value={form.ppp} onChange={v => setF("ppp", v)} />
            </div>

            <Sec title="Marketing" />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Fuente</Label>
                <FuenteSelect value={form.fuente} onChange={v => setF("fuente", v)} />
              </div>
              <FTxt label="Contenido Contestado" value={form.contenido_contestado} onChange={v => setF("contenido_contestado", v)} />
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2 items-end">
              <FTxt label="Link Fathom" value={fathomLink} onChange={setFathomLink} placeholder="https://fathom.video/calls/..." />
              {/^https?:\/\//.test(fathomLink.trim()) && (
                <a href={fathomLink.trim()} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-primary/40 text-primary bg-primary/5 hover:bg-primary/10 text-sm font-medium w-fit">
                  <ExternalLink className="h-4 w-4" /> Abrir Fathom
                </a>
              )}
            </div>
            <div className="pt-2">
              <FTxt label="Otras Comisiones" value={form.otras_comisiones} onChange={v => setF("otras_comisiones", v)} />
            </div>

            <Sec title="Comprobante" />
            <ComprobanteUpload
              value={form.comprobante}
              onChange={(value) => setF("comprobante", value)}
              concepto={form.tipo}
              cliente={form.cliente}
            />
            <FArea label="Links de comprobante (uno por línea — puede haber más de uno)" value={form.comprobante} onChange={v => setF("comprobante", v)} />
            {(form.comprobante || "").split("\n").map(s => s.trim()).filter(Boolean).length > 0 && (
              <div className="mt-2 space-y-2">
                {(form.comprobante || "").split("\n").map(s => s.trim()).filter(Boolean).map((url, i) => (
                  comprobanteHref(url) ? (
                    <div key={i} className="flex items-center gap-3">
                      {(() => {
                        const m = url.match(/\/d\/([\w-]+)/) || url.match(/[?&]id=([\w-]+)/)
                        return m?.[1] ? (
                          <img src={`https://drive.google.com/thumbnail?id=${m[1]}&sz=w200`} alt="comprobante"
                            className="h-16 w-16 object-cover rounded border border-border"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }} />
                        ) : null
                      })()}
                      <a href={comprobanteHref(url)!} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-primary/40 text-primary bg-primary/5 hover:bg-primary/10 text-sm font-medium">
                        <ExternalLink className="h-4 w-4" /> Ver comprobante {i + 1}
                      </a>
                    </div>
                  ) : (
                    <p key={i} className="text-xs text-muted-foreground">Solo nombre de archivo (sin link todavía): {url}</p>
                  )
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 border-t border-border bg-background/95 px-6 py-4 backdrop-blur sm:justify-between">
            <Button variant="destructive" onClick={handleDelete} disabled={deleting || saving}>
              {deleting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Archivando...</> : <><Trash2 className="h-4 w-4 mr-2" />Archivar pago</>}
            </Button>
            <div className="flex gap-2">
              {saveError && <p className="max-w-64 self-center text-xs font-medium text-destructive">{saveError}</p>}
              <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Guardando...</> : "Guardar cambios"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
