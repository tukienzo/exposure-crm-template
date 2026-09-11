"use client"

import { useState, useMemo } from "react"
import useSWR, { mutate } from "swr"
import { DateFilter } from "@/components/date-filter"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { Phone, PhoneOff, PhoneCall, Brain, ExternalLink, Loader2, BadgeCheck, Check, ChevronDown, X, RefreshCw, Filter, BarChart2 } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const LEAD_OPTS = ["LEAD S", "LEAD A", "LEAD B", "LEAD C", "LEAD D"]
const CALIF_OPTS = ["Si", "No"]

type Filt = { closer: string[]; setter: string[]; calificacion: string[]; cerro: string[]; estado: string[]; motivo: string[]; operacion: string[]; calificaba: string[] }
const EMPTY_FILT: Filt = { closer: [], setter: [], calificacion: [], cerro: [], estado: [], motivo: [], operacion: [], calificaba: [] }

// Colores de lead — mismos que Centro Agendas
const calColors: Record<string, string> = {
  S: "bg-violet-600 text-white border-violet-700",
  A: "bg-green-600 text-white border-green-700",
  B: "bg-yellow-400 text-black border-yellow-500",
  C: "bg-blue-600 text-white border-blue-700",
  D: "bg-red-600 text-white border-red-700",
}
const leadCls = (v: string | null) => calColors[(v || "").replace("LEAD ", "").trim().toUpperCase()] || ""

const estadoColors: Record<string, string> = {
  "Fee": "bg-violet-600 text-white border-violet-700",
  "Adentro en Call": "bg-green-600 text-white border-green-700",
  "Adentro en FUP": "bg-teal-600 text-white border-teal-700",
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
          <button type="button" className={cn(
            "h-8 min-w-[140px] text-xs px-2 rounded-md border flex items-center justify-between gap-1 bg-background",
            count ? "border-primary/50 text-primary" : "border-input text-muted-foreground"
          )}>
            <span className="truncate">{count === 0 ? "Todos" : count === 1 ? value[0] : `${count} seleccionados`}</span>
            <ChevronDown className="h-3 w-3 opacity-50 flex-shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-44 p-1">
          {count > 0 && (
            <button type="button" onClick={onClear}
              className="flex items-center gap-2 w-full text-left text-xs px-2 py-1.5 rounded text-muted-foreground hover:bg-muted">
              <X className="h-3 w-3" /> Limpiar
            </button>
          )}
          {options.map(o => {
            const sel = value.includes(o)
            return (
              <button key={o} type="button" onClick={() => onToggle(o)}
                className={cn("flex items-center gap-2 w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted whitespace-nowrap", sel ? "text-primary font-medium" : "")}>
                <span className={cn("h-3.5 w-3.5 rounded border flex items-center justify-center flex-shrink-0", sel ? "bg-primary border-primary" : "border-input")}>
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

function ColStats({ data, label, getVal }: {
  data: Llamada[]; label: string; getVal: (l: Llamada) => string | null | undefined
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
        <button className="ml-1 text-muted-foreground/50 hover:text-foreground transition-colors" onClick={(e) => e.stopPropagation()}>
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
                <span className="text-muted-foreground ml-2 flex-shrink-0">{count} · {Math.round((count / total) * 100)}%</span>
              </div>
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary/60" style={{ width: `${(count / max) * 100}%` }} />
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

type Llamada = {
  id: number
  nombre: string
  closer: string | null
  setter: string | null
  fecha_agenda: string | null
  fecha_closer: string | null
  cerro: boolean
  estado: string | null
  motivo_no_cierre: string | null
  operacion: string | null
  link_fathom: string | null
  ia_analisis: string | null
  calificaba_realmente: string | null
  calificacion: string | null
}

function parseFilter(filter: string): { start: string; end: string } | null {
  if (!filter || filter === "all") return null
  if (filter.startsWith("range:")) {
    const parts = filter.split(":")
    if (parts.length >= 3) return { start: parts[1], end: parts[2] }
  }
  return null
}

export default function ReporteLlamadasPage() {
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null)

  const url = dateRange
    ? `/api/llamadas?start=${dateRange.start}&end=${dateRange.end}`
    : "/api/llamadas"

  const { data: rawData, isLoading } = useSWR<Llamada[]>(url, fetcher)
  const llamadas = Array.isArray(rawData) ? rawData : null

  const [colF, setColF] = useState<Filt>(EMPTY_FILT)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const setFilt = (k: keyof Filt, v: string) =>
    setColF(p => ({ ...p, [k]: p[k].includes(v) ? p[k].filter(x => x !== v) : [...p[k], v] }))
  const clearFilt = (k: keyof Filt) => setColF(p => ({ ...p, [k]: [] }))
  const activeFilterCount = useMemo(() => Object.values(colF).filter(a => a.length > 0).length, [colF])

  const base = llamadas || []
  const uniq = (vals: (string | null | undefined)[]) =>
    Array.from(new Set(vals.map(v => v || "").filter(Boolean))).sort()
  const closersOpts = useMemo(() => uniq(base.map(l => l.closer)), [llamadas])
  const settersOpts = useMemo(() => uniq(base.map(l => l.setter)), [llamadas])
  const operacionOpts = useMemo(() => uniq(base.map(l => l.operacion)), [llamadas])
  const estadoOpts = useMemo(() => uniq(base.map(l => l.estado)), [llamadas])
  const motivoOpts = useMemo(() => uniq(base.map(l => l.motivo_no_cierre)), [llamadas])

  const filtered = useMemo(() => base.filter(l => {
    if (colF.closer.length && !colF.closer.includes(l.closer || "")) return false
    if (colF.setter.length && !colF.setter.includes(l.setter || "")) return false
    if (colF.calificacion.length && !colF.calificacion.includes(l.calificacion || "")) return false
    if (colF.cerro.length && !colF.cerro.includes(l.cerro ? "Sí" : "No")) return false
    if (colF.estado.length && !colF.estado.includes(l.estado || "")) return false
    if (colF.motivo.length && !colF.motivo.includes(l.motivo_no_cierre || "")) return false
    if (colF.calificaba.length && !colF.calificaba.includes(l.calificaba_realmente || "")) return false
    if (colF.operacion.length && !colF.operacion.includes(l.operacion || "")) return false
    return true
  }), [llamadas, colF])

  type SyncState = { phase: "idle" | "checking" | "preview" | "running" | "done" | "error"; count?: number; msg?: string }
  const [sync, setSync] = useState<SyncState>({ phase: "idle" })

  const checkFathom = async () => {
    setSync({ phase: "checking" })
    try {
      const r = await fetch("/api/fathom-sync?dry=1&days=90", { method: "POST" }).then((x) => x.json())
      if (r.error) { setSync({ phase: "error", msg: r.error }); return }
      setSync({ phase: "preview", count: r.para_procesar })
    } catch (e) { setSync({ phase: "error", msg: String(e) }) }
  }
  const runFathom = async () => {
    setSync({ phase: "running", count: 0 })
    let totalOk = 0, totalFail = 0, totalSkip = 0
    try {
      // El endpoint procesa como maximo 10 llamadas por request (limite de tiempo
      // de la funcion serverless) — repetimos hasta vaciar la cola, no solo una vez,
      // para que "Procesar N llamadas" realmente procese las N.
      for (let i = 0; i < 20; i++) {
        const r = await fetch("/api/fathom-sync?limit=10&days=90", { method: "POST" }).then((x) => x.json())
        if (r.error) { setSync({ phase: "error", msg: r.error }); return }
        totalOk += r.procesadas; totalFail += r.fallidas; totalSkip += r.sin_match
        setSync({ phase: "running", count: totalOk, msg: `${totalOk} procesadas...` })
        if (r.procesadas === 0 && r.fallidas === 0) break
      }
      setSync({ phase: "done", count: totalOk, msg: `${totalOk} procesadas · ${totalFail} con error · ${totalSkip} sin match` })
      mutate(url)
    } catch (e) { setSync({ phase: "error", msg: String(e) }) }
  }
  const syncBusy = sync.phase === "checking" || sync.phase === "running"
  const syncLabel =
    sync.phase === "checking" ? "Buscando..." :
    sync.phase === "running" ? "Procesando..." :
    sync.phase === "preview" ? (sync.count ? `Procesar ${sync.count} llamada${sync.count === 1 ? "" : "s"}` : "Nada nuevo") :
    "Sincronizar con Fathom"

  const formatDate = (str: string | null) => {
    if (!str) return "-"
    const d = new Date(str.split("T")[0] + "T12:00:00")
    if (isNaN(d.getTime())) return "-"
    return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" })
  }

  const total = filtered.length
  const cerradas = filtered.filter((l) => l.cerro).length
  const tasaCierre = total > 0 ? Math.round((cerradas / total) * 100) : 0
  const conAnalisis = filtered.filter((l) => l.ia_analisis).length
  const calificadasPresentadas = filtered.filter((l) => ["LEAD S", "LEAD A", "LEAD B"].includes(l.calificacion || ""))
  const conCalif = calificadasPresentadas.filter((l) => l.calificaba_realmente === "Si" || l.calificaba_realmente === "No").length
  const calificaban = calificadasPresentadas.filter((l) => l.calificaba_realmente === "Si").length
  const pctCalif = conCalif > 0 ? Math.round((calificaban / conCalif) * 100) : 0

  return (
    <div className="p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reporte de Llamadas</h1>
          <p className="text-sm text-muted-foreground">Historial y métricas de llamadas de cierre</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <button
              type="button"
              onClick={sync.phase === "preview" ? runFathom : checkFathom}
              disabled={syncBusy || (sync.phase === "preview" && !sync.count)}
              className={cn(
                "h-9 px-3 rounded-md border text-sm font-medium flex items-center gap-2 transition-colors",
                sync.phase === "preview" && sync.count
                  ? "bg-primary text-primary-foreground border-primary hover:opacity-90"
                  : "bg-background border-input hover:bg-muted",
                (syncBusy || (sync.phase === "preview" && !sync.count)) && "opacity-60 cursor-not-allowed"
              )}
            >
              <RefreshCw className={cn("h-4 w-4", syncBusy && "animate-spin")} />
              {syncLabel}
            </button>
            {sync.phase === "done" && <span className="text-xs text-emerald-600 mt-1">{sync.msg}</span>}
            {sync.phase === "error" && <span className="text-xs text-red-600 mt-1 max-w-[260px] text-right">{sync.msg}</span>}
            {sync.phase === "preview" && !sync.count && <span className="text-xs text-muted-foreground mt-1">No hay llamadas nuevas</span>}
          </div>
          <DateFilter onFilterChange={(f: string) => setDateRange(parseFilter(f))} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button onClick={() => setFiltersOpen(o => !o)}
          className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors",
            activeFilterCount > 0 ? "bg-primary/10 text-primary border-primary/30" : "border-border text-muted-foreground hover:bg-muted")}>
          <Filter className="h-3.5 w-3.5" />Filtros
          {activeFilterCount > 0 && (
            <span className="bg-primary text-primary-foreground text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold leading-none">{activeFilterCount}</span>
          )}
        </button>
        {activeFilterCount > 0 && (
          <button onClick={() => setColF(EMPTY_FILT)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" />Limpiar
          </button>
        )}
        <span className="text-xs text-muted-foreground">{filtered.length} de {base.length}</span>
      </div>

      {filtersOpen && (
        <div className="mb-6 p-4 bg-muted/30 border border-border rounded-lg grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <FilterSel label="Calificación" value={colF.calificacion} options={LEAD_OPTS} onToggle={v => setFilt("calificacion", v)} onClear={() => clearFilt("calificacion")} />
          <FilterSel label="Closer" value={colF.closer} options={closersOpts} onToggle={v => setFilt("closer", v)} onClear={() => clearFilt("closer")} />
          <FilterSel label="Setter" value={colF.setter} options={settersOpts} onToggle={v => setFilt("setter", v)} onClear={() => clearFilt("setter")} />
          <FilterSel label="Cerró" value={colF.cerro} options={["Sí", "No"]} onToggle={v => setFilt("cerro", v)} onClear={() => clearFilt("cerro")} />
          <FilterSel label="Estado" value={colF.estado} options={estadoOpts} onToggle={v => setFilt("estado", v)} onClear={() => clearFilt("estado")} />
          <FilterSel label="Motivo No Cierre" value={colF.motivo} options={motivoOpts} onToggle={v => setFilt("motivo", v)} onClear={() => clearFilt("motivo")} />
          <FilterSel label="Operación" value={colF.operacion} options={operacionOpts} onToggle={v => setFilt("operacion", v)} onClear={() => clearFilt("operacion")} />
          <FilterSel label="Calificaba" value={colF.calificaba} options={CALIF_OPTS} onToggle={v => setFilt("calificaba", v)} onClear={() => clearFilt("calificaba")} />
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        <Card className="border border-border"><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><Phone className="h-4 w-4 text-primary" /><p className="text-xs text-muted-foreground uppercase tracking-wide">Total Llamadas</p></div>
          <p className="text-2xl font-bold mt-1">{total}</p>
        </CardContent></Card>
        <Card className="border border-border"><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><PhoneCall className="h-4 w-4 text-emerald-500" /><p className="text-xs text-muted-foreground uppercase tracking-wide">Cerradas</p></div>
          <p className="text-2xl font-bold mt-1 text-emerald-600">{cerradas}</p>
        </CardContent></Card>
        <Card className="border border-border"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Tasa de Cierre</p>
          <p className={cn("text-2xl font-bold mt-1", tasaCierre >= 50 ? "text-emerald-600" : tasaCierre >= 30 ? "text-amber-600" : "text-red-600")}>
            {tasaCierre}%
          </p>
        </CardContent></Card>
        <Card className="border border-border"><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><Brain className="h-4 w-4 text-violet-500" /><p className="text-xs text-muted-foreground uppercase tracking-wide">Con Análisis IA</p></div>
          <p className="text-2xl font-bold mt-1 text-violet-600">{conAnalisis}</p>
        </CardContent></Card>
        <Card className="border border-border"><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><BadgeCheck className="h-4 w-4 text-sky-500" /><p className="text-xs text-muted-foreground uppercase tracking-wide">Calificaban de verdad</p></div>
          <p className={cn("text-2xl font-bold mt-1", pctCalif >= 50 ? "text-emerald-600" : pctCalif >= 30 ? "text-amber-600" : "text-sky-600")}>{pctCalif}%</p>
          <p className="text-xs text-muted-foreground mt-0.5">{calificaban} de {conCalif} S/A/B presentadas</p>
        </CardContent></Card>
      </div>

      <Card className="border border-border">
        <CardHeader className="pb-0">
          <CardTitle className="text-lg font-semibold">Registro de Llamadas</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No hay llamadas que coincidan con los filtros</div>
          ) : (
            <div className="[&>div]:max-h-[calc(100vh-390px)]">
              <Table>
                <TableHeader className="sticky top-0 z-20 bg-card">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Fecha</TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-muted-foreground whitespace-nowrap">Lead</TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-muted-foreground whitespace-nowrap">Calificación<ColStats data={filtered} label="Calificación" getVal={l => l.calificacion} /></TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Closer<ColStats data={filtered} label="Closer" getVal={l => l.closer} /></TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-muted-foreground text-center">Cerró<ColStats data={filtered} label="Cerró" getVal={l => (l.cerro ? "Sí" : "No")} /></TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-muted-foreground whitespace-nowrap">Estado<ColStats data={filtered} label="Estado" getVal={l => l.estado} /></TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-muted-foreground whitespace-nowrap">Motivo No Cierre<ColStats data={filtered} label="Motivo No Cierre" getVal={l => l.motivo_no_cierre} /></TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-muted-foreground whitespace-nowrap">Operación<ColStats data={filtered} label="Operación" getVal={l => l.operacion} /></TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-muted-foreground text-center whitespace-nowrap">Calificaba<ColStats data={filtered} label="Calificaba" getVal={l => l.calificaba_realmente} /></TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Grabación</TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-muted-foreground text-center">IA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((l) => {
                    return (
                      <TableRow key={l.id} className="hover:bg-muted/50">
                        <TableCell className="text-sm whitespace-nowrap">{formatDate(l.fecha_closer || l.fecha_agenda)}</TableCell>
                        <TableCell className="font-medium whitespace-nowrap min-w-[160px]">{l.nombre}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {l.calificacion ? (
                            <Badge variant="outline" className={cn("font-medium text-xs", leadCls(l.calificacion))}>{l.calificacion}</Badge>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{l.closer || "-"}</TableCell>
                        <TableCell className="text-center">
                          {l.cerro ? (
                            <Badge variant="outline" className="font-medium text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1"><Phone className="h-3 w-3" />Sí</Badge>
                          ) : (
                            <Badge variant="outline" className="font-medium text-xs bg-red-500/10 text-red-600 border-red-500/20 gap-1"><PhoneOff className="h-3 w-3" />No</Badge>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {l.estado ? (
                            <Badge variant="outline" className={cn("font-medium text-xs", estadoColors[l.estado] || "")}>{l.estado}</Badge>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {l.motivo_no_cierre ? (
                            <span className="text-muted-foreground">{l.motivo_no_cierre}</span>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </TableCell>
                        <TableCell className={cn("text-sm font-medium whitespace-nowrap", l.operacion ? "text-primary" : "text-muted-foreground")}>
                          {l.operacion || "-"}
                        </TableCell>
                        <TableCell className="text-center">
                          {l.calificaba_realmente === "Si" ? (
                            <Badge variant="outline" className="font-medium text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Sí</Badge>
                          ) : l.calificaba_realmente === "No" ? (
                            <Badge variant="outline" className="font-medium text-xs bg-red-500/10 text-red-600 border-red-500/20">No</Badge>
                          ) : l.ia_analisis ? (
                            <Badge variant="outline" className="font-medium text-xs bg-slate-500/10 text-slate-500 border-slate-500/20" title="La transcripcion no tenia senales claras de capacidad de pago">Sin info suficiente</Badge>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {l.link_fathom ? (
                            <a href={l.link_fathom} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {l.ia_analisis ? (
                            <Brain className="h-4 w-4 text-violet-500 mx-auto" />
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
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
    </div>
  )
}
