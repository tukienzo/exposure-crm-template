"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import useSWR from "swr"
import { toast } from "sonner"
import {
  CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, ChevronsUpDown, CircleDashed, Clapperboard,
  ArrowUpRight, FileText, Loader2, Pencil, Play, Plus, Radio, Search, Sparkles, Trash2, User,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useSession } from "@/components/session-provider"
import { SALES_ANGLES } from "@/lib/sales-angles"
import { StoriesCalendar } from "@/components/stories-calendar"
import { MultiSelectFilter } from "@/components/ui/multi-select-filter"
import { RECORDING_WINDOW } from "@/lib/recording-window"
import { formatSuggestionAt } from "@/lib/content-format-rotation"
import { isContentOnlyAccount } from "@/lib/role-access"

const fetcher = (url: string) => fetch(url).then(async (r) => {
  const body = await r.json()
  if (!r.ok) throw new Error(body.error || "No se pudo cargar")
  return body
})

type ContentRow = {
  id: string
  source_key: string
  title: string
  platform: string | null
  angle: string | null
  format: string | null
  planned_at: string | null
  published_at: string | null
  source_url: string | null
  cta: string | null
  status: string
  assigned_to: string | null
  script_text: string | null
  insight_notes: string | null
  awareness_level: string | null
  week_label: string | null
  day_of_week: string | null
  metadata: Record<string, unknown> | null
}

type ApiResponse = { schemaReady: boolean; rows: ContentRow[]; total: number }
type FormatOptionsResponse = { formats: string[] }

const STATUS_META: Record<string, { label: string; tone: string; icon: typeof CircleDashed }> = {
  idea: { label: "Idea", tone: "border-zinc-400/30 bg-zinc-400/10 text-zinc-300", icon: CircleDashed },
  guion_listo: { label: "Guion listo", tone: "border-blue-400/30 bg-blue-400/10 text-blue-300", icon: FileText },
  para_grabar: { label: "Para grabar", tone: "border-amber-400/30 bg-amber-400/10 text-amber-300", icon: Clapperboard },
  grabado: { label: "Grabado", tone: "border-violet-400/30 bg-violet-400/10 text-violet-300", icon: Radio },
  edicion: { label: "Edición", tone: "border-amber-400/30 bg-amber-400/10 text-amber-300", icon: Pencil },
  completo: { label: "Completo", tone: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300", icon: CheckCircle2 },
  publicado: { label: "Publicado", tone: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300", icon: CheckCircle2 },
  historical: { label: "Histórico", tone: "border-zinc-400/30 bg-zinc-400/10 text-zinc-400", icon: CircleDashed },
}
function statusMeta(status: string) {
  return STATUS_META[status] || { label: status || "Sin estado", tone: "border-zinc-400/30 bg-zinc-400/10 text-zinc-400", icon: CircleDashed }
}

const STATUS_OPTIONS = ["idea", "guion_listo", "para_grabar", "grabado", "publicado"]
const CUENTA_A_REEL_STATUS_OPTIONS = ["idea", "grabado", "edicion", "completo"]
const RESPONSABLE_OPTIONS = ["SIN ASIGNAR", "CUENTA_A", "CUENTA_B", "EDITOR", "PRODUCCIÓN"]
const CRIS_RESPONSABLE_OPTIONS = ["Cuenta B", "Cuenta A", "Editor", "Producción"]
// Catálogo base propio de Preview. No puede depender solo de las piezas que
// existan hoy: una migración o un archivado nunca debe borrar opciones.
const OFFICIAL_FORMAT_OPTIONS = [
  "REACCIÓN", "TALKING HEAD", "TALKING IMAGEN", "B-ROLL + VOZ EN OFF", "ANÁLISIS", "MIRO", "PIZARRÓN", "HORIZONTAL", "VOLUMEN", "CÁMARA + PC", "CARRUSEL", "ESTRATEGIA", "TESTIMONIO", "CASO DE ÉXITO", "TOP TIER",
]

const AWARENESS_OPTIONS = ["PROBLEMA", "SOLUCIÓN", "MENTALIDAD", "PRODUCTO"]
const STORY_ONLY_FORMATS = /^(¿QUÉ HAGO\??|HAND RAISER|CTA|WHY NOW|AUDITORÍA)$/i

function canonicalFormatLabel(value: string) {
  const normalized = value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
  const map: Record<string, string> = {
    REACCION: "REACCIÓN", "TALKING HEAD": "TALKING HEAD", "VOZ EN OFF": "B-ROLL + VOZ EN OFF",
    "B-ROLL + VOZ EN OFF": "B-ROLL + VOZ EN OFF", ANALISIS: "ANÁLISIS", VOLUMEN: "VOLUMEN",
    "CAMARA + PC": "CÁMARA + PC", CARRUSEL: "CARRUSEL", ESTRATEGIA: "ESTRATEGIA", TESTIMONIO: "TESTIMONIO", "CASO DE EXITO": "CASO DE ÉXITO", "TOP TIER": "TOP TIER", MIRO: "MIRO", PIZARRON: "PIZARRÓN", HORIZONTAL: "HORIZONTAL", "TALKING IMAGEN": "TALKING IMAGEN",
  }
  return map[normalized] || value.trim().toUpperCase()
}

function automaticTitle(angle: string, rawTitle: string, plannedAt: string) {
  const code = (angle.match(/^[A-Z]+\d+/i)?.[0] || "PIEZA").toUpperCase()
  const date = plannedAt.slice(0, 10).split("-").reverse().join("-")
  const generic = /^(VIDEO (DE )?(CRISTIAN|PAUL)|REEL)(\s*[—-]\s*SLOT\s*\d+)?$/i
  const cleaned = rawTitle.replace(/^([A-Z]+\d+)\s*[-—·]\s*/i, "").replace(/\s*[-—·]\s*\d{2}[-/]\d{2}[-/]\d{2,4}$/i, "").trim()
  const descriptor = (generic.test(cleaned) || !cleaned ? angle.replace(/^[A-Z]+\d+\s*[·—-]\s*/i, "") : cleaned)
    .split(/\s+/).filter(Boolean).slice(0, 4).join(" ").toUpperCase() || "SIN CONCEPTO"
  return [code, descriptor, date].filter(Boolean).join(" - ")
}

function isManaged(sourceKey: string) {
  return sourceKey.startsWith("manual:") || sourceKey.startsWith("notion-planner:")
}

function isClipFormat(format: string | null | undefined) {
  return /(?:^|\b)CLIP(?:\b|\s*·)/i.test(String(format || ""))
}

function hasNoAngle(format: string | null | undefined) {
  return isClipFormat(format) || /TESTIMONIO/i.test(String(format || ""))
}

function isCuentaAReel(row: ContentRow) {
  const slot = Number(row.metadata?.slot)
  return row.metadata?.content_account === "CUENTA_A"
    && !/HISTORIA|STORY/i.test(`${row.format || ""} ${row.platform || ""} ${row.title || ""} ${String(row.metadata?.content_type || "")}`)
    && ((slot >= 7 && slot <= 9) || /REEL/i.test(row.title || ""))
}

function contentPieceKind(row: ContentRow) {
  const slot = Number(row.metadata?.slot)
  if (slot >= 1 && slot <= 4) return "VOLUMEN"
  if (slot >= 5 && slot <= 6) return "CARRUSEL"
  if (slot >= 7 && slot <= 9) return "ESTRATEGIA"
  if (slot === 10) return "TESTIMONIO"
  const value = `${row.format || ""} ${row.title || ""}`
  if (/TESTIMONIO|CASO DE [ÉE]XITO|\bCLIP\b/i.test(value)) return "TESTIMONIO"
  if (/CARRUSEL/i.test(value)) return "CARRUSEL"
  if (/VOLUMEN/i.test(value)) return "VOLUMEN"
  return "ESTRATEGIA"
}

function contentCardBorder(row: ContentRow) {
  const isPaul = row.metadata?.content_account === "CUENTA_A" || row.source_key.startsWith("manual:cuenta-a:")
  const date = String(row.planned_at || "").slice(0, 10)
  const isCrisSeptemberCompletion = row.metadata?.content_account === "CUENTA_B" && date >= "2026-09-14" && date <= "2026-09-30"
  if (!isPaul && !isCrisSeptemberCompletion) return "border-white/[.08] hover:border-white/20"
  return {
    VOLUMEN: "border-emerald-400/70 hover:border-emerald-300",
    ESTRATEGIA: "border-red-400/70 hover:border-red-300",
    CARRUSEL: "border-blue-400/70 hover:border-blue-300",
    TESTIMONIO: "border-yellow-300/70 hover:border-yellow-200",
  }[contentPieceKind(row)]
}

function isoWeekRange(base: Date) {
  const d = new Date(base)
  const day = (d.getDay() + 6) % 7 // lunes=0
  const monday = new Date(d); monday.setDate(d.getDate() - day)
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`
  return { start: iso(monday), end: iso(sunday), mondayDate: monday }
}

function formatDay(iso: string) {
  // planned_at llega de Supabase como timestamp completo
  // ("2026-07-20T00:00:00+00:00"), no como fecha simple ("2026-07-20"). Antes
  // esto le concatenaba "T12:00:00Z" asumiendo fecha simple y producía un
  // string invalido ("...+00:00T12:00:00Z") que Date parseaba como Invalid
  // Date, visible como "INVALID DATE" en /contenido-angulos (bug real
  // encontrado y corregido). Se toma solo la parte de fecha (YYYY-MM-DD)
  // antes de fijar el mediodía UTC, para no depender del formato exacto de
  // entrada.
  const datePart = iso.slice(0, 10)
  const d = new Date(`${datePart}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return datePart
  return d.toLocaleDateString("es-ES", { weekday: "short", day: "2-digit", month: "short" })
}

function formatWeekLabel(iso: string) {
  const datePart = iso.slice(0, 10)
  const base = new Date(`${datePart}T12:00:00Z`)
  if (Number.isNaN(base.getTime())) return ""
  const weekday = (base.getUTCDay() + 6) % 7
  const monday = new Date(base); monday.setUTCDate(base.getUTCDate() - weekday)
  const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6)
  const startDay = monday.getUTCDate()
  const endDay = sunday.getUTCDate()
  const startMonth = monday.toLocaleDateString("es-ES", { month: "long", timeZone: "UTC" })
  const endMonth = sunday.toLocaleDateString("es-ES", { month: "long", timeZone: "UTC" })
  return startMonth === endMonth
    ? `${startDay}–${endDay} ${endMonth}`
    : `${startDay} ${startMonth}–${endDay} ${endMonth}`
}

export function ContentWorkspace() {
  const session = useSession()
  const isContentOnly = isContentOnlyAccount(session.email.toLowerCase())
  const searchParams = useSearchParams()
  const canEdit = session.email !== "preview@yin-yang.local"
  const canCreateOrDelete = canEdit && session.rol !== "Editor"
  const initialRecordingView = searchParams.get("view") === "grabar"
  const [view, setView] = useState<"semana" | "stories" | "grabar" | "biblioteca">(initialRecordingView ? "grabar" : "semana")
  const [contentAccount, setContentAccount] = useState<"CUENTA_B" | "CUENTA_A">(initialRecordingView ? "CUENTA_A" : "CUENTA_B")
  const [weekOffset, setWeekOffset] = useState(0)
  const [editing, setEditing] = useState<ContentRow | null>(null)
  const [creating, setCreating] = useState(false)
  const openedContentTarget = useRef<string | null>(null)
  const { data: formatOptionsData } = useSWR<FormatOptionsResponse>(
    "/api/content-workspace?options=formats", fetcher,
  )

  const { start, end } = useMemo(() => {
    const base = new Date()
    base.setDate(base.getDate() + weekOffset * 7)
    return isoWeekRange(base)
  }, [weekOffset])

  // Vista "Esta semana": solo piezas gestionables del workspace (manual +
  // planificador importado), no el árbol de páginas stub de Notion.
  const weekKey = `/api/content-workspace?managed_only=1&content_account=${contentAccount}&content_kind=feed&start=${start}&end=${end}&limit=200`
  const { data: weekData, isLoading: weekLoading, mutate: mutateWeek } = useSWR<ApiResponse>(
    view === "semana" ? weekKey : null, fetcher,
  )

  // Ventana operativa manual: solo cambia cuando producción confirma que el próximo
  // bloque está listo. No depende del calendario ni modifica filas.
  const recordingWindow = RECORDING_WINDOW
  const recordingKey = `/api/content-workspace?managed_only=1&content_account=PAUL&content_kind=feed&start=${recordingWindow.start}&end=${recordingWindow.end}&limit=200`
  const { data: recordingData, isLoading: recordingLoading, mutate: mutateRecording } = useSWR<ApiResponse>(
    view === "grabar" ? recordingKey : null, fetcher,
  )

  // Vista Biblioteca/Calendario: todo el catálogo gestionable, con filtros.
  const [libAngle, setLibAngle] = useState("")
  const [libAssignee, setLibAssignee] = useState<string[]>([])
  const [libStatus, setLibStatus] = useState<string[]>([])
  const [libQuery, setLibQuery] = useState("")
  const targetContentAssetId = searchParams.get("content_asset_id")
  useEffect(() => {
    if (isContentOnly) {
      setContentAccount("CUENTA_B")
      if (view === "grabar") setView("semana")
      return
    }
    if (searchParams.get("source") !== "testimonios") return
    const requestedAccount = searchParams.get("content_account")
    setView("biblioteca")
    setContentAccount(requestedAccount === "CUENTA_A" ? "CUENTA_A" : "CUENTA_B")
    setLibQuery(targetContentAssetId ? "" : "TESTIMONIO")
  }, [isContentOnly, searchParams, targetContentAssetId, view])
  const libParams = new URLSearchParams({ managed_only: "1", content_account: contentAccount, content_kind: "feed", limit: "300" })
  if (targetContentAssetId) libParams.set("content_asset_id", targetContentAssetId)
  if (libAngle) libParams.set("angle", libAngle)
  if (libAssignee.length) libParams.set("assigned_to", libAssignee.join(","))
  if (libStatus.length) libParams.set("status", libStatus.join(","))
  if (libQuery) libParams.set("q", libQuery)
  const libKey = `/api/content-workspace?${libParams.toString()}`
  const { data: libData, isLoading: libLoading, mutate: mutateLib } = useSWR<ApiResponse>(
    view === "biblioteca" ? libKey : null, fetcher,
  )

  useEffect(() => {
    if (!targetContentAssetId || openedContentTarget.current === targetContentAssetId) return
    const target = libData?.rows?.find((row) => row.id === targetContentAssetId)
    if (!target) return
    openedContentTarget.current = targetContentAssetId
    setEditing(target)
  }, [libData?.rows, targetContentAssetId])

  const data = view === "biblioteca" ? libData : view === "grabar" ? recordingData : weekData
  const isLoading = view === "biblioteca" ? libLoading : view === "grabar" ? recordingLoading : weekLoading
  const mutateAll = () => { mutateWeek(); mutateLib(); mutateRecording() }

  const rows = data?.rows || []
  const grouped = useMemo(() => {
    const map = new Map<string, ContentRow[]>()
    for (const row of rows) {
      const key = row.planned_at || "sin-fecha"
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(row)
    }
    return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  }, [rows])

  const weekSummary = useMemo(() => {
    const byDay = new Map<string, { total: number; volumen: number; carrusel: number; videos: number }>()
    for (const row of weekData?.rows || []) {
      const key = String(row.planned_at || "sin-fecha").slice(0, 10)
      const current = byDay.get(key) || { total: 0, volumen: 0, carrusel: 0, videos: 0 }
      const format = contentPieceKind(row)
      current.total++
      if (format.includes("VOLUMEN")) current.volumen++
      if (format.includes("CARRUSEL")) current.carrusel++
      if (!format.includes("CARRUSEL")) current.videos++
      byDay.set(key, current)
    }
    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [weekData?.rows])

  const [recordingKind, setRecordingKind] = useState<"reels" | "historias">("reels")
  const [recordingIndex, setRecordingIndex] = useState(0)
  const [markingRecordedId, setMarkingRecordedId] = useState<string | null>(null)
  const recordingRows = useMemo(() => {
    return (recordingData?.rows || []).filter((row) => {
      return isCuentaAReel(row) && row.status !== "grabado" && row.assigned_to === "CUENTA_A"
    }).sort((a, b) => `${a.planned_at || ""}-${Number(a.metadata?.slot || 0)}`.localeCompare(`${b.planned_at || ""}-${Number(b.metadata?.slot || 0)}`))
  }, [recordingData?.rows])
  const editingRows = useMemo(
    () => (recordingData?.rows || []).filter((row) => isCuentaAReel(row) && row.assigned_to === "CUENTA_A" && ["grabado", "edicion"].includes(row.status)),
    [recordingData?.rows],
  )
  const recordingGroups = useMemo(() => ({
    historias: recordingRows.filter((row) => /HISTORIA|STORY/i.test(`${row.format || ""} ${row.platform || ""} ${row.title || ""} ${String(row.metadata?.content_type || "")}`)),
    reels: recordingRows.filter((row) => !/HISTORIA|STORY/i.test(`${row.format || ""} ${row.platform || ""} ${row.title || ""} ${String(row.metadata?.content_type || "")}`)),
  }), [recordingRows])
  const recordingList = recordingGroups[recordingKind]
  const recordingRow = recordingList[Math.min(recordingIndex, Math.max(0, recordingList.length - 1))]

  useEffect(() => { setRecordingIndex(0) }, [recordingKind])
  useEffect(() => {
    if (recordingIndex >= recordingList.length) setRecordingIndex(Math.max(0, recordingList.length - 1))
  }, [recordingIndex, recordingList.length])

  async function markRecorded(row: ContentRow) {
    if (!canEdit) return
    setMarkingRecordedId(row.id)
    try {
      const res = await fetch("/api/content-workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, status: "grabado" }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "No se pudo marcar como grabado")
      // El PATCH es la confirmación de verdad. Sacamos la pieza de la cola de
      // forma optimista y revalidamos en segundo plano; una caída de red al
      // refrescar no debe presentarse como si el guardado hubiera fallado.
      await mutateRecording((current) => current ? {
        ...current,
        rows: current.rows.map((item) => item.id === row.id ? { ...item, status: "grabado" } : item),
      } : current, { revalidate: false })
      await mutateWeek((current) => current ? {
        ...current,
        rows: current.rows.map((item) => item.id === row.id ? { ...item, status: "grabado" } : item),
      } : current, { revalidate: false })
      setEditing(null)
      toast.success("Grabado ✓ Siguiente pieza lista.")
      void mutateRecording().catch(() => undefined)
      void mutateWeek().catch(() => undefined)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar")
    } finally {
      setMarkingRecordedId(null)
    }
  }

  async function saveRow(id: string | null, payload: Record<string, unknown>) {
    try {
      const res = await fetch("/api/content-workspace", {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { id, ...payload } : payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "No se pudo guardar")
      toast.success(id ? "Pieza actualizada." : "Pieza creada.")
      setEditing(null)
      setCreating(false)
      mutateAll()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar")
    }
  }

  async function deleteRow(id: string) {
    if (!confirm("¿Archivar esta pieza? Va a salir del calendario, pero se conserva y puede recuperarse.")) return
    try {
      const res = await fetch("/api/content-workspace", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "No se pudo borrar")
      toast.success("Pieza archivada. No se borró ningún dato.")
      mutateAll()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al borrar")
    }
  }

  return (
    <div className="min-w-0 max-w-full space-y-5 overflow-x-hidden">
      <div className={cn("grid max-w-lg gap-2 rounded-2xl border border-white/10 bg-white/[.035] p-1.5", isContentOnly ? "grid-cols-1" : "grid-cols-2")}>
        <button onClick={() => setContentAccount("CUENTA_B")} className={cn("rounded-xl px-4 py-2.5 text-xs font-black", contentAccount === "CUENTA_B" ? "bg-white text-zinc-950" : "text-white/55 hover:bg-white/[.06]")}>CONTENIDO CRIS</button>
        {!isContentOnly && <button onClick={() => setContentAccount("CUENTA_A")} className={cn("rounded-xl px-4 py-2.5 text-xs font-black", contentAccount === "CUENTA_A" ? "bg-fuchsia-400 text-zinc-950" : "text-white/55 hover:bg-white/[.06]")}>CONTENIDO PAUL</button>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={cn("grid w-full max-w-3xl gap-1.5 rounded-2xl border border-white/10 bg-white/[.035] p-1.5 sm:w-auto", isContentOnly ? "grid-cols-3" : "grid-cols-4")}>
          <button onClick={() => setView("semana")} className={cn("rounded-xl px-4 py-2 text-xs font-black transition", view === "semana" ? "bg-white text-zinc-950 shadow dark:bg-white/[.14] dark:text-white" : "text-muted-foreground hover:bg-white/[.06]")}>Esta semana</button>
          <button onClick={() => setView("stories")} className={cn("rounded-xl px-4 py-2 text-xs font-black transition", view === "stories" ? "bg-fuchsia-500 text-white shadow" : "text-muted-foreground hover:bg-white/[.06]")}>Calendario Stories</button>
          {!isContentOnly && <button onClick={() => { setContentAccount("CUENTA_A"); setWeekOffset(0); setView("grabar") }} className={cn("rounded-xl px-4 py-2 text-xs font-black transition", view === "grabar" ? "bg-red-500 text-white shadow shadow-red-500/25" : "text-muted-foreground hover:bg-white/[.06]")}><Play className="mr-1 inline h-3.5 w-3.5" />Grabar ya</button>}
          <button onClick={() => setView("biblioteca")} className={cn("rounded-xl px-4 py-2 text-xs font-black transition", view === "biblioteca" ? "bg-white text-zinc-950 shadow dark:bg-white/[.14] dark:text-white" : "text-muted-foreground hover:bg-white/[.06]")}>Biblioteca / Calendario</button>
        </div>
        {view === "stories" ? null : canCreateOrDelete ? (
          <Button size="sm" onClick={() => setCreating(true)}><Plus className="mr-1.5 h-4 w-4" />Nueva pieza</Button>
        ) : (
          <Button size="sm" asChild><a href="/login"><User className="mr-1.5 h-4 w-4" />Iniciar sesión para editar</a></Button>
        )}
      </div>

      {!canEdit && (
        <div className="rounded-2xl border border-blue-400/25 bg-blue-400/10 px-4 py-3 text-xs text-blue-100">
          Estás viendo el Preview público. Iniciá sesión con una cuenta aprobada del equipo para crear, editar y calendarizar piezas.
        </div>
      )}

      {view === "semana" && (
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[.035] px-4 py-2.5">
          <Button size="icon" variant="ghost" onClick={() => setWeekOffset((v) => v - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm font-bold">{formatDay(start)} → {formatDay(end)}{weekOffset === 0 && <Badge variant="outline" className="ml-2 align-middle">Semana actual</Badge>}</span>
          <Button size="icon" variant="ghost" onClick={() => setWeekOffset((v) => v + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      )}

      {view === "semana" && weekSummary.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {weekSummary.map(([day, count]) => (
            <div key={day} className="rounded-2xl border border-white/10 bg-white/[.035] p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-white/40">{formatDay(day)}</p>
              <p className="mt-1 text-2xl font-black">{count.total}</p>
              <p className="text-[11px] text-white/45">{count.volumen} Volumen · {count.carrusel} Carrusel · {count.videos} videos</p>
            </div>
          ))}
        </div>
      )}

      {view === "biblioteca" && (
        <div className="grid gap-2 rounded-2xl border border-white/10 bg-white/[.035] p-3 sm:grid-cols-4">
          <div className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar en título o guion…" className="pl-9" value={libQuery} onChange={(e) => setLibQuery(e.target.value)} />
          </div>
          <MultiSelectFilter values={libAssignee} options={contentAccount === "CUENTA_A" ? RESPONSABLE_OPTIONS : CRIS_RESPONSABLE_OPTIONS} onChange={setLibAssignee} />
          <MultiSelectFilter values={libStatus} options={STATUS_OPTIONS} onChange={setLibStatus} />
        </div>
      )}

      {view === "stories" ? (
        <StoriesCalendar account={contentAccount} canEdit={canCreateOrDelete} />
      ) : view === "grabar" && !isLoading ? (
        <div className="space-y-4">
          <div className="rounded-[24px] border border-red-500/20 bg-gradient-to-br from-red-500/10 via-black/20 to-fuchsia-500/10 p-4 sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div><p className="text-xs font-black uppercase tracking-[.18em] text-red-400">Modo ejecución</p><h2 className="mt-1 text-2xl font-black">Grabá. Marcá. Siguiente.</h2><p className="mt-1 text-xs text-white/50">Ventana activa manual · {recordingWindow.start.split("-").reverse().join("/")} al {recordingWindow.end.split("-").reverse().join("/")}</p></div>
              <div className="flex flex-wrap justify-end gap-2"><Badge className="bg-red-500 text-white hover:bg-red-500">{recordingRows.length} por grabar</Badge><Badge variant="outline">{editingRows.length} en postproducción</Badge></div>
            </div>
            <div className="grid gap-2">
              <button onClick={() => setRecordingKind("reels")} className={cn("rounded-xl border px-4 py-3 text-left transition", recordingKind === "reels" ? "border-red-400/50 bg-red-500/15" : "border-white/10 bg-black/20")}><span className="block text-xs text-white/45">Pendientes</span><span className="text-lg font-black">Reels · {recordingGroups.reels.length}</span></button>
            </div>
          </div>

          {recordingGroups.reels.length > 0 && (
            <div className="min-w-0 rounded-[24px] border border-white/10 bg-white/[.035] p-4">
              <p className="mb-3 text-xs font-black uppercase tracking-[.16em] text-white/45">Todo lo pendiente de grabar</p>
              <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                {recordingGroups.reels.map((row, index) => (
                  <div key={row.id} className="flex min-w-0 items-start gap-2 rounded-xl border border-white/10 bg-black/20 p-3 hover:border-red-400/40">
                    <button onClick={() => { setRecordingKind("reels"); setRecordingIndex(index); setEditing(row) }} className="min-w-0 flex-1 text-left" aria-label={`Abrir pieza completa: ${row.title}`}>
                      <div className="flex min-w-0 flex-wrap gap-1.5"><Badge variant="outline">{formatDay(String(row.planned_at || ""))}</Badge>{row.angle && <Badge variant="outline" className="max-w-full truncate">{row.angle}</Badge>}<Badge variant="outline" className="border-zinc-400/30 bg-zinc-400/10 text-zinc-300">Estado: Idea</Badge></div>
                      <p className="mt-2 break-words text-sm font-black">{row.title}</p>
                      <p className="mt-1 line-clamp-2 break-words text-xs text-white/45">{row.format || "Formato sin definir"} · {row.script_text || row.insight_notes || "Idea de guion pendiente"}</p>
                      <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-fuchsia-300">Ver pieza completa <ArrowUpRight className="h-3 w-3" /></span>
                    </button>
                    <Button size="sm" className="shrink-0 bg-emerald-500 text-zinc-950 hover:bg-emerald-400" disabled={!canEdit || markingRecordedId === row.id} onClick={() => markRecorded(row)}>{markingRecordedId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="mr-1 h-4 w-4" />Marcar grabado</>}</Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!recordingRow ? (
            <div className="rounded-[24px] border border-emerald-400/25 bg-emerald-400/10 p-10 text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" /><p className="mt-3 text-xl font-black">No quedan {recordingKind} por grabar.</p></div>
          ) : (
            <div className="min-w-0 max-w-full overflow-hidden rounded-[26px] border border-white/10 bg-white/[.035]">
              <div className="border-b border-white/10 p-4 sm:p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{formatDay(String(recordingRow.planned_at || ""))}</Badge>
                  <Badge variant="outline" className="border-cyan-400/30 bg-cyan-400/10 text-cyan-200">{recordingFormat(recordingRow)}</Badge>
                  <span className="ml-auto text-xs font-bold text-white/45">{Math.min(recordingIndex + 1, recordingList.length)} de {recordingList.length}</span>
                </div>
                <h3 className="mt-4 text-xl font-black leading-tight sm:text-2xl">{recordingRow.title}</h3>
              </div>
              <div className="space-y-4 p-4 sm:p-6">
                <RecordingBrief row={recordingRow} />
              </div>
              <div className="grid gap-2 border-t border-white/10 bg-black/20 p-4 sm:grid-cols-[auto_1fr_auto]">
                <Button variant="outline" disabled={recordingIndex === 0} onClick={() => setRecordingIndex((v) => Math.max(0, v - 1))}><ChevronLeft className="mr-1 h-4 w-4" />Anterior</Button>
                <Button className="h-12 bg-emerald-500 text-base font-black text-zinc-950 hover:bg-emerald-400" disabled={!canEdit || markingRecordedId === recordingRow.id} onClick={() => markRecorded(recordingRow)}>{markingRecordedId === recordingRow.id ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CheckCircle2 className="mr-2 h-5 w-5" />}Marcar como grabado</Button>
                <Button variant="outline" disabled={recordingIndex >= recordingList.length - 1} onClick={() => setRecordingIndex((v) => Math.min(recordingList.length - 1, v + 1))}>Siguiente<ChevronRight className="ml-1 h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
      ) : data && !data.schemaReady ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm text-amber-100">Falta aplicar la migración canónica en Supabase preview para habilitar el workspace de contenido.</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[.03] p-10 text-center text-sm text-muted-foreground">
          {view === "semana" ? "No hay piezas calendarizadas para esta semana." : "No hay piezas que coincidan con el filtro."}
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([dateKey, items]) => {
            const paulReels = contentAccount === "CUENTA_A" ? items.filter(isCuentaAReel) : []
            const valenItems = contentAccount === "CUENTA_A" ? items.filter((row) =>
              ["VOLUMEN", "CARRUSEL", "TESTIMONIO"].includes(contentPieceKind(row)),
            ) : []
            return (
            <div key={dateKey} className="rounded-[22px] border border-white/10 bg-white/[.03] p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-white/50">
                <CalendarDays className="h-3.5 w-3.5" />
                {dateKey === "sin-fecha" ? "Sin fecha" : formatDay(dateKey)}
                {dateKey !== "sin-fecha" && <span className="normal-case tracking-normal text-white/30">· {formatWeekLabel(dateKey)}</span>}
              </div>
              {contentAccount === "CUENTA_A" ? (
                <div className="space-y-3">
                  <section className="rounded-2xl border border-white/10 bg-black/20">
                    <div className="px-4 py-3 text-xs font-black uppercase tracking-wider text-white/60">
                      PRODUCCIÓN · {valenItems.filter((r) => contentPieceKind(r) === "VOLUMEN").length} Volumen · {valenItems.filter((r) => contentPieceKind(r) === "CARRUSEL").length} Carruseles · {valenItems.filter((r) => contentPieceKind(r) === "TESTIMONIO").length} Testimonio
                    </div>
                    <div className="grid gap-2.5 border-t border-white/10 p-3 md:grid-cols-2 xl:grid-cols-3">
                      {valenItems.map((row) => <ContentCalendarCard key={row.id} row={row} onOpen={() => setEditing(row)} />)}
                    </div>
                  </section>
                  <div>
                    <p className="mb-2 px-1 text-xs font-black uppercase tracking-wider text-fuchsia-300">PAUL · {paulReels.length} Reels para grabar</p>
                    <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                      {paulReels.map((row) => <ContentCalendarCard key={row.id} row={row} onOpen={() => setEditing(row)} detailed />)}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((row) => <ContentCalendarCard key={row.id} row={row} onOpen={() => setEditing(row)} />)}
                </div>
              )}
            </div>
          )})}
        </div>
      )}

      {editing && view === "grabar" ? (
        <RecordingPieceDialog
          row={editing}
          busy={markingRecordedId === editing.id}
          canEdit={canEdit}
          onClose={() => setEditing(null)}
          onRecorded={() => markRecorded(editing)}
        />
      ) : editing && (
        <ContentEditDialog
          row={editing}
          formatOptions={formatOptionsData?.formats || []}
          forceReadOnly={!canEdit}
          allowGenerator={session.rol !== "Editor"}
          onClose={() => setEditing(null)}
          onSave={(payload) => saveRow(editing.id, payload)}
          onDelete={canCreateOrDelete && isManaged(editing.source_key) ? () => { deleteRow(editing.id); setEditing(null) } : undefined}
        />
      )}
      {creating && (
        <ContentEditDialog
          row={null}
          formatOptions={formatOptionsData?.formats || []}
          onClose={() => setCreating(false)}
          onSave={(payload) => saveRow(null, payload)}
          contentAccount={contentAccount}
        />
      )}
    </div>
  )
}

function ContentCalendarCard({ row, onOpen, detailed = false }: { row: ContentRow; onOpen: () => void; detailed?: boolean }) {
  const meta = statusMeta(row.status)
  const StatusIcon = meta.icon
  const managed = isManaged(row.source_key)
  return (
    <button onClick={onOpen} className={cn("group flex min-w-0 flex-col gap-2 rounded-2xl border bg-black/20 p-3.5 text-left transition hover:bg-black/30", contentCardBorder(row))}>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {row.angle && !hasNoAngle(row.format) && <Badge variant="outline" className="max-w-full border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-200">{row.angle}</Badge>}
        {row.format && <Badge variant="outline" className="text-white/55">{row.format}</Badge>}
        <Badge variant="outline" className={cn("ml-auto gap-1", meta.tone)}><StatusIcon className="h-3 w-3" />{meta.label}</Badge>
      </div>
      {(row.metadata?.content_account !== "CUENTA_A" || contentPieceKind(row) !== "ESTRATEGIA") && <p className="line-clamp-2 text-sm font-bold leading-5">{row.title}</p>}
      {detailed && (
        <div className="space-y-2 text-xs text-white/55">
          <div className="whitespace-pre-line break-words rounded-xl border border-white/10 bg-white/[.03] p-2.5">{row.script_text || "Bullets pendientes"}</div>
          <p className="break-words"><span className="font-black text-white/70">CTA:</span> {row.cta || "Recurso gratuito"}</p>
        </div>
      )}
      <div className="mt-auto flex items-center justify-between text-[11px] text-white/40">
        <span className="flex items-center gap-1"><User className="h-3 w-3" />{row.assigned_to || "SIN ASIGNAR"}</span>
        {!managed && <span className="italic">solo lectura</span>}
      </div>
    </button>
  )
}

function recordingFormat(row: ContentRow) {
  return String(row.metadata?.recording_format || row.format || "FORMATO PENDIENTE")
}

function recordingInsights(row: ContentRow) {
  return String(row.insight_notes || "")
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 4)
}

function RecordingBrief({ row }: { row: ContentRow }) {
  const insights = recordingInsights(row)
  const reaction = /REACCIÓN/i.test(recordingFormat(row))
  const link = /^https?:\/\//i.test(String(row.source_url || "")) ? String(row.source_url) : ""
  return <>
    <div className="rounded-2xl border border-cyan-400/25 bg-gradient-to-br from-cyan-400/15 via-blue-500/10 to-fuchsia-500/10 p-4">
      <p className="text-[10px] font-black uppercase tracking-[.18em] text-cyan-300">Cómo grabarlo</p>
      <p className="mt-1 text-lg font-black text-white">{recordingFormat(row)}</p>
      <p className="mt-1 text-sm text-white/60">{reaction ? "Abrí el video, reaccioná y desarrollá tu lectura." : "Una toma simple, directa y sin edición pesada."}</p>
      {reaction && (link ? <a href={link} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-black text-zinc-950 transition hover:bg-cyan-200">Abrir video de reacción <ArrowUpRight className="h-4 w-4" /></a> : <p className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-200">Producción todavía no cargó el video de reacción.</p>)}
    </div>
    <div className="rounded-2xl border border-orange-400/25 bg-orange-400/[.08] p-4">
      <p className="text-[10px] font-black uppercase tracking-[.18em] text-orange-300">Ángulo</p>
      <p className="mt-2 text-lg font-black leading-snug text-white">{row.angle || "Ángulo pendiente de cargar"}</p>
    </div>
    <div className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-400/[.07] p-4">
      <p className="mb-3 text-[10px] font-black uppercase tracking-[.18em] text-fuchsia-300">Insight / de qué hablar</p>
      <ul className="space-y-2.5">{(insights.length ? insights : ["Insight pendiente de cargar por el equipo"]).map((bullet, index) => <li key={`${bullet}-${index}`} className="flex gap-3 text-base font-semibold leading-6 text-white/85"><span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-gradient-to-br from-fuchsia-300 to-orange-300" />{bullet}</li>)}</ul>
    </div>
  </>
}

function RecordingPieceDialog({ row, busy, canEdit, onClose, onRecorded }: { row: ContentRow; busy: boolean; canEdit: boolean; onClose: () => void; onRecorded: () => void }) {
  return <Dialog open onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="max-h-[calc(100dvh-1rem)] max-w-[calc(100vw-1rem)] overflow-hidden border-white/10 bg-zinc-950 p-0 text-white sm:max-w-xl">
      <div className="max-h-[calc(100dvh-6rem)] overflow-y-auto p-5 sm:p-7">
        <DialogHeader className="text-left"><div className="mb-2 flex flex-wrap gap-2"><Badge className="bg-gradient-to-r from-orange-400 to-fuchsia-500 text-white">LISTO PARA GRABAR</Badge><Badge variant="outline" className="border-cyan-400/30 text-cyan-200">{recordingFormat(row)}</Badge></div><DialogTitle className="text-2xl font-black leading-tight sm:text-3xl">{row.title}</DialogTitle></DialogHeader>
        <div className="mt-5 space-y-4"><RecordingBrief row={row} /></div>
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-white/10 bg-black/30 p-4"><Button variant="outline" className="h-12 border-white/15 bg-white/5" onClick={onClose}>Cancelar</Button><Button className="h-12 bg-emerald-400 font-black text-zinc-950 hover:bg-emerald-300" disabled={!canEdit || busy} onClick={onRecorded}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Marcar grabado</Button></div>
    </DialogContent>
  </Dialog>
}

function ContentEditDialog({
  row, formatOptions, onClose, onSave, onDelete, forceReadOnly = false, allowGenerator = true, contentAccount = "CUENTA_B",
}: {
  row: ContentRow | null
  formatOptions: string[]
  onClose: () => void
  onSave: (payload: Record<string, unknown>) => void
  onDelete?: () => void
  forceReadOnly?: boolean
  allowGenerator?: boolean
  contentAccount?: "CUENTA_B" | "CUENTA_A"
}) {
  const readOnly = forceReadOnly || (!!row && !isManaged(row.source_key))
  const isPaul = contentAccount === "CUENTA_A" || row?.metadata?.content_account === "CUENTA_A"
  const initialStage = String(row?.metadata?.funnel_stage || "")
  const [formatOpen, setFormatOpen] = useState(false)
  const [formatQuery, setFormatQuery] = useState("")
  const [generatorIdea, setGeneratorIdea] = useState(row?.title || "")
  const [generating, setGenerating] = useState(false)
  const [form, setForm] = useState({
    title: row?.title || "",
    angle: row?.angle || "",
    format: row?.format || "",
    platform: row?.platform || "",
    assigned_to: row?.assigned_to || (isPaul ? "SIN ASIGNAR" : ""),
    status: row?.status || "idea",
    planned_at: row?.planned_at?.slice(0, 10) || "",
    awareness_level: row?.awareness_level || "",
    script_text: row?.script_text || "",
    insight_notes: row?.insight_notes || "",
    source_url: row?.source_url || "",
    cta: row?.cta || "",
    funnel_stage: initialStage,
  })
  const set = (field: string) => (value: string) => setForm((f) => ({ ...f, [field]: value }))
  const availableFormats = useMemo(() => {
    const formats = [...new Set([
      ...OFFICIAL_FORMAT_OPTIONS,
      ...formatOptions,
      ...(form.format ? [form.format] : []),
    ].map(canonicalFormatLabel).filter((format) => !STORY_ONLY_FORMATS.test(format)))]
    return [...formats].sort((a, b) => a.localeCompare(b, "es"))
  }, [form.format, formatOptions])
  const cleanFormatQuery = formatQuery.trim()
  const matchingFormat = availableFormats.find(
    (format) => format.toLocaleLowerCase("es") === cleanFormatQuery.toLocaleLowerCase("es"),
  )
  const chooseFormat = (format: string) => {
    set("format")(format)
    setFormatQuery("")
    setFormatOpen(false)
  }
  const chooseAwarenessLevel = (level: string) => {
    if (!row && isPaul && !form.format && typeof window !== "undefined") {
      const storageKey = `content-format-rotation:cuenta-a:${level}`
      const cursor = Number.parseInt(window.localStorage.getItem(storageKey) || "0", 10) || 0
      const suggestion = formatSuggestionAt(level, cursor)
      setForm((current) => ({ ...current, awareness_level: level, format: suggestion || current.format }))
      window.localStorage.setItem(storageKey, String(cursor + 1))
      return
    }
    set("awareness_level")(level)
  }
  const isVolume = /VOLUMEN/i.test(form.format)
  const noAngle = hasNoAngle(form.format)
  const isCarousel = /CARRUSEL/i.test(form.format)
  const isTestimony = /TESTIMONIO/i.test(form.format)
  const isNicheVideo = /MOFU|BOFU/.test(form.funnel_stage) || /MOFU|BOFU/i.test(form.format)
  const statusOptions = row && isCuentaAReel(row) ? CUENTA_A_REEL_STATUS_OPTIONS : STATUS_OPTIONS
  const reel = !!row && isCuentaAReel(row)
  const payload = (status = form.status) => ({
    title: reel ? automaticTitle(form.angle, form.title, form.planned_at) : form.title,
    angle: noAngle ? "" : form.angle,
    format: canonicalFormatLabel(form.format), platform: form.platform, assigned_to: form.assigned_to,
    status, planned_at: form.planned_at, awareness_level: form.awareness_level,
    script_text: form.script_text, insight_notes: form.insight_notes, cta: form.cta, source_url: form.source_url,
    funnel_stage: isVolume ? "TOFU" : (isTestimony ? "" : form.funnel_stage),
    content_account: contentAccount,
  })

  async function generateScript() {
    if (generatorIdea.trim().length < 8) {
      toast.error("Escribí una idea un poco más concreta.")
      return
    }
    setGenerating(true)
    try {
      const response = await fetch("/api/content-script-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea: generatorIdea,
          angle: form.angle,
          format: form.format,
          funnel_stage: form.funnel_stage,
          awareness_level: form.awareness_level,
          assigned_to: form.assigned_to || (isPaul ? "SIN ASIGNAR" : "Cuenta B"),
          source_url: form.source_url,
        }),
      })
      const output = await response.json()
      if (!response.ok) throw new Error(output.error || "No se pudo generar")
      setForm((current) => ({
        ...current,
        title: automaticTitle(current.angle, output.title || current.title, current.planned_at),
        format: current.format || output.format || "Talking Head",
        assigned_to: current.assigned_to || (isPaul ? "SIN ASIGNAR" : "Cuenta B"),
        status: "guion_listo",
        awareness_level: output.awareness_level || current.awareness_level,
        script_text: output.script_text || current.script_text,
        cta: output.cta || current.cta,
        insight_notes: [
          output.recording_direction ? `Grabación: ${output.recording_direction}` : "",
          output.rationale ? `Por qué funciona: ${output.rationale}` : "",
        ].filter(Boolean).join("\n\n"),
      }))
      toast.success("Guion generado. Revisalo antes de guardar.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo generar el guion")
    } finally {
      setGenerating(false)
    }
  }

  useEffect(() => {
    if (!isVolume || form.angle) return
    const params = new URLSearchParams({ options: "next-volume-angle" })
    if (form.planned_at) params.set("planned_at", form.planned_at.slice(0, 10))
    if (row?.id) params.set("exclude_id", row.id)
    let cancelled = false
    fetch(`/api/content-workspace?${params.toString()}`)
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || "No se pudo asignar el ángulo")
        if (!cancelled && body.angle) {
          setForm((current) => current.angle ? current : {
            ...current,
            angle: body.angle,
            awareness_level: body.awarenessLevel || current.awareness_level,
          })
        }
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [isVolume, form.angle, form.planned_at, row?.id])

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1rem)] max-w-[calc(100vw-1rem)] flex-col overflow-x-hidden overflow-y-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-[1.5cm]">
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" />{row ? "Editar pieza" : "Nueva pieza"}
            {readOnly && <Badge variant="outline" className="text-[10px]">Solo lectura · original de Notion</Badge>}
          </DialogTitle>
        </DialogHeader>

        <div className="grid min-h-0 min-w-0 max-w-full flex-1 gap-3 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pb-2 sm:px-[1.5cm] [scrollbar-gutter:stable]">
          {!readOnly && allowGenerator && (
            <div className="rounded-xl border border-fuchsia-400/25 bg-fuchsia-400/[0.06] p-4">
              <div className="mb-2 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-fuchsia-300" />
                <Label className="text-fuchsia-100">Generador de guiones</Label>
              </div>
              <Textarea
                rows={3}
                value={generatorIdea}
                onChange={(event) => setGeneratorIdea(event.target.value)}
                placeholder="Tirá la idea en bruto. Ej: explicar por qué acumular matches no significa tener opciones…"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-[11px] leading-4 text-white/45">{noAngle ? "Usa el formato elegido, sin forzar un ángulo." : "Usa el ángulo y formato elegidos."} Completa hook, guion, CTA y dirección de grabación; no guarda solo.</p>
                <Button type="button" size="sm" onClick={generateScript} disabled={generating || generatorIdea.trim().length < 8}>
                  {generating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
                  {generating ? "Armando…" : "Armar guion"}
                </Button>
              </div>
            </div>
          )}

          <div>
            <Label>Concepto / título</Label>
            <Input disabled={readOnly} value={form.title} onChange={(e) => set("title")(e.target.value)} placeholder="Ej: NO TE ANIMAS · Reacción" />
          </div>

          <div className="grid grid-cols-1 gap-3 min-[760px]:grid-cols-2">
            {!noAngle && <div className="min-w-0">
              <Label>Ángulo *</Label>
              <Select disabled={readOnly} value={form.angle} onValueChange={set("angle")}>
                <SelectTrigger className="w-full min-w-0 overflow-hidden [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate">
                  <SelectValue placeholder="Elegí un ángulo oficial" />
                </SelectTrigger>
                <SelectContent>{SALES_ANGLES.map((angle) => <SelectItem key={angle} value={angle}>{angle}</SelectItem>)}</SelectContent>
              </Select>
            </div>}
            <div className="min-w-0">
              <Label>Formato</Label>
              <Popover open={formatOpen} onOpenChange={(open) => {
                setFormatOpen(open)
                if (!open) setFormatQuery("")
              }}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={formatOpen}
                    disabled={readOnly}
                    className="w-full min-w-0 justify-between px-3 font-normal"
                  >
                    <span className={cn("truncate", !form.format && "text-muted-foreground")}>
                      {form.format ? canonicalFormatLabel(form.format) : "Elegí un formato"}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
                  <Command shouldFilter>
                    <CommandInput
                      placeholder="Escribí un formato…"
                      value={formatQuery}
                      onValueChange={setFormatQuery}
                    />
                    <CommandList>
                      <CommandEmpty>
                        {cleanFormatQuery ? "Usá la opción de abajo para añadirlo." : "No hay formatos."}
                      </CommandEmpty>
                      <CommandGroup>
                        {cleanFormatQuery && matchingFormat && <CommandItem value={`elegir ${cleanFormatQuery}`} onSelect={() => chooseFormat(matchingFormat)} className="text-primary"><Check className="h-4 w-4" />Elegir “{matchingFormat}”</CommandItem>}
                        {availableFormats.map((format) => (
                          <CommandItem key={format} value={format} onSelect={() => chooseFormat(format)}>
                            <Check className={cn("h-4 w-4", form.format === format ? "opacity-100" : "opacity-0")} />
                            {format}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {isVolume && <p className="mt-1 text-[11px] text-muted-foreground">Ángulo preseleccionado automáticamente según el reparto semanal; podés cambiarlo.</p>}
            </div>
          </div>

          {!isVolume && !isTestimony && (
            <div>
              <Label>Etapa del embudo *</Label>
              <Select disabled={readOnly} value={form.funnel_stage} onValueChange={set("funnel_stage")}>
                <SelectTrigger><SelectValue placeholder="Elegí etapa" /></SelectTrigger>
                <SelectContent><SelectItem value="TOFU">TOFU</SelectItem><SelectItem value="MOFU">MOFU</SelectItem><SelectItem value="MOFU-BOFU">MOFU–BOFU</SelectItem><SelectItem value="BOFU">BOFU</SelectItem></SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label>Responsable</Label>
              <Select disabled={readOnly} value={form.assigned_to} onValueChange={set("assigned_to")}>
                <SelectTrigger><SelectValue placeholder="SIN ASIGNAR" /></SelectTrigger>
                <SelectContent>{(isPaul ? RESPONSABLE_OPTIONS : CRIS_RESPONSABLE_OPTIONS).map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Estado</Label>
              <Select disabled={readOnly} value={form.status} onValueChange={set("status")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{statusOptions.map((s) => <SelectItem key={s} value={s}>{statusMeta(s).label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha de publicación *</Label>
              <Input disabled={readOnly} type="date" value={form.planned_at} onChange={(e) => set("planned_at")(e.target.value)} />
            </div>
          </div>

          {!isVolume && !isCarousel && !isTestimony && (
            <div>
              <Label>Guion completo</Label>
              <Textarea disabled={readOnly} rows={12} value={form.script_text} onChange={(e) => set("script_text")(e.target.value)} placeholder={isNicheVideo ? "Hook, desarrollo, cierre y CTA…" : "Hook, desarrollo, cierre y CTA…"} />
            </div>
          )}

          {!isVolume && !isTestimony && (
            <div>
              <Label>{isCarousel ? "Hook sugerido + idea del carrusel" : "Dirección de grabación / notas"}</Label>
              <Textarea disabled={readOnly} rows={4} value={form.insight_notes} onChange={(e) => set("insight_notes")(e.target.value)} placeholder={isCarousel ? "Hook de portada y concepto visual; sin guion." : "Idea central, prueba, ejemplo y dirección de la pieza; sin escribir el guion completo."} />
            </div>
          )}

          {!isVolume && !isTestimony && (
            <div>
              <Label>CTA</Label>
              <Textarea disabled={readOnly} rows={2} value={form.cta} onChange={(e) => set("cta")(e.target.value)} placeholder="Acción concreta al final de la pieza…" />
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {!isVolume && !isTestimony && <div>
              <Label>Nivel de consciencia *</Label>
              <Select disabled={readOnly} value={form.awareness_level || undefined} onValueChange={chooseAwarenessLevel}><SelectTrigger><SelectValue placeholder="Elegí nivel" /></SelectTrigger><SelectContent>{AWARENESS_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select>
            </div>}
            <div>
              <Label>{isVolume ? "Referencia opcional (hook viral o Drive)" : "Link (Drive / pieza publicada)"}</Label>
              <Input disabled={readOnly} value={form.source_url} onChange={(e) => set("source_url")(e.target.value)} placeholder="https://…" />
            </div>
          </div>

          {readOnly && (
            <p className="text-xs text-muted-foreground">
              {forceReadOnly
                ? "Iniciá sesión con una cuenta aprobada del equipo para editar esta pieza."
                : "Esta pieza viene del árbol original del export de Notion (solo título, sin guion cargado todavía). Para trabajarla acá, cargala como pieza nueva con el mismo concepto."}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between border-t bg-background px-6 py-4 sm:px-[1.5cm]">
          {onDelete ? (
            <Button variant="ghost" className="text-red-400 hover:text-red-300" onClick={onDelete}><Trash2 className="mr-1.5 h-4 w-4" />Archivar</Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            {!readOnly && (
              <>
                {reel && form.status === "idea" && <Button className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400" onClick={() => onSave(payload("grabado"))}><CheckCircle2 className="mr-1.5 h-4 w-4" />Marcar como grabado</Button>}
                <Button disabled={(!noAngle && !form.angle) || !form.planned_at || (!isVolume && !isTestimony && !form.funnel_stage) || (!isTestimony && !form.awareness_level)} onClick={() => onSave(payload())}>Guardar</Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function RecordingField({ label, value, prominent = false }: { label: string; value: string | null | undefined; prominent?: boolean }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-black uppercase tracking-[.16em] text-white/40">{label}</p>
      <div className={cn("whitespace-pre-wrap rounded-2xl border border-white/[.08] bg-black/25 p-4 leading-relaxed text-white/80", prominent ? "text-base sm:text-lg" : "text-sm")}>
        {String(value || "").trim() || "—"}
      </div>
    </div>
  )
}
