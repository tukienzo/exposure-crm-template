"use client"

import { useState, useMemo } from "react"
import useSWR from "swr"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { Brain, Phone, PhoneOff, BookmarkCheck, Search, X, Loader2, ExternalLink, ChevronRight } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type LlamadaAnalisis = {
  id: number
  nombre: string
  closer: string | null
  setter: string | null
  fecha_agenda: string | null
  cerro: boolean
  operacion: string | null
  link_fathom: string | null
  ia_analisis: string
  calificacion: string | null
}

// Returns "cerrado" | "reservado" | "no_cerrado" | null
// Priority: Resultado line in IA text > SE PUDO CERRAR > DB boolean
function extractResultadoType(text: string | null, dbCerro: boolean): "cerrado" | "reservado" | "no_cerrado" {
  if (text) {
    const resMatch = text.match(/Resultado:\s*([^\n]+)/i)
    if (resMatch) {
      const r = resMatch[1].toLowerCase()
      if (r.includes("fee") || r.includes("seña") || r.includes("sena")) return "reservado"
      if (r.includes("no cerr") || r.includes("no cerró")) return "no_cerrado"
      if (r.includes("cerr") || r.includes("cerró")) return "cerrado"
    }
  }
  return dbCerro ? "cerrado" : "no_cerrado"
}

function extractScore(text: string | null): number | null {
  if (!text) return null
  const m = text.match(/TOTAL:\s*(\d+)\/100/)
  return m ? parseInt(m[1]) : null
}

function extractResultadoLine(text: string | null): string | null {
  if (!text) return null
  const m = text.match(/Resultado:\s*([^\n]+)/)
  return m ? m[1].trim() : null
}

function scoreColor(score: number | null) {
  if (!score) return "text-muted-foreground"
  if (score >= 85) return "text-emerald-600"
  if (score >= 70) return "text-blue-600"
  if (score >= 55) return "text-amber-600"
  return "text-red-600"
}

function scoreBorderBg(score: number | null) {
  if (!score) return "border-border bg-muted/30"
  if (score >= 85) return "border-emerald-500/30 bg-emerald-500/10"
  if (score >= 70) return "border-blue-500/30 bg-blue-500/10"
  if (score >= 55) return "border-amber-500/30 bg-amber-500/10"
  return "border-red-500/30 bg-red-500/10"
}

function ResultadoBadge({ tipo }: { tipo: "cerrado" | "reservado" | "no_cerrado" }) {
  if (tipo === "cerrado") return (
    <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1">
      <Phone className="h-3 w-3" /> Cerrado
    </Badge>
  )
  if (tipo === "reservado") return (
    <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/20 gap-1">
      <BookmarkCheck className="h-3 w-3" /> Reservado
    </Badge>
  )
  return (
    <Badge variant="outline" className="text-xs bg-red-500/10 text-red-600 border-red-500/20 gap-1">
      <PhoneOff className="h-3 w-3" /> No Cerrado
    </Badge>
  )
}

function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
}

function formatDate(str: string | null) {
  if (!str) return null
  const d = new Date(str + "T12:00:00")
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })
}

// Períodos válidos desde agosto 2024 (arranque real de datos históricos
// conciliados en el CRM).
function getMonthOptions() {
  const opts: { value: string; label: string }[] = []
  const today = new Date()
  const minimumEnd = new Date(2026, 11, 1)
  const end = new Date(today.getFullYear(), today.getMonth(), 1) > minimumEnd
    ? new Date(today.getFullYear(), today.getMonth(), 1)
    : minimumEnd
  const start = new Date(2024, 7, 1)
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
  for (let i = months; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const label = d.toLocaleDateString("es-ES", { month: "long", year: "numeric" })
    opts.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) })
  }
  return opts
}

function AnalysisText({ text }: { text: string }) {
  return (
    <div className="space-y-0.5">
      {text.split("\n").map((line, i) => {
        if (line === "---") return <hr key={i} className="border-border my-3" />
        if (!line.trim()) return <div key={i} className="h-1.5" />
        const parts = line.split(/\*([^*]+)\*/)
        return (
          <p key={i} className="text-sm leading-relaxed">
            {parts.map((part, j) =>
              j % 2 === 1
                ? <strong key={j} className="font-semibold text-foreground">{part}</strong>
                : <span key={j} className="text-muted-foreground">{part}</span>
            )}
          </p>
        )
      })}
    </div>
  )
}

function AnalisisModal({ item, onClose }: { item: LlamadaAnalisis; onClose: () => void }) {
  const score = extractScore(item.ia_analisis)
  const tipo = extractResultadoType(item.ia_analisis, item.cerro)

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-start justify-between pr-8 gap-4">
            <div>
              <DialogTitle className="text-xl">{item.nombre}</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {item.closer && <span>Closer: <strong className="text-foreground">{item.closer}</strong></span>}
                {formatDate(item.fecha_agenda) && <span className="ml-3">{formatDate(item.fecha_agenda)}</span>}
              </p>
            </div>
            {score && (
              <div className={cn("flex flex-col items-center justify-center w-16 h-16 rounded-full border-2 flex-shrink-0", scoreBorderBg(score))}>
                <span className={cn("text-2xl font-bold leading-none", scoreColor(score))}>{score}</span>
                <span className="text-[10px] text-muted-foreground">/100</span>
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="flex gap-2 mt-2 flex-wrap">
          <ResultadoBadge tipo={tipo} />
          {item.operacion && (
            <Badge variant="outline" className="text-primary border-primary/20 bg-primary/5 text-xs">
              {item.operacion}
            </Badge>
          )}
          {item.link_fathom && (
            <a href={item.link_fathom} target="_blank" rel="noopener noreferrer">
              <Badge variant="outline" className="gap-1 cursor-pointer hover:bg-muted text-xs">
                <ExternalLink className="h-3 w-3" /> Ver grabación en Fathom
              </Badge>
            </a>
          )}
        </div>

        <div className="mt-4 border border-border rounded-lg p-5 bg-muted/20">
          <AnalysisText text={item.ia_analisis} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function AnalisisIAPage() {
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<LlamadaAnalisis | null>(null)
  const [showAll, setShowAll] = useState(false)

  const monthOptions = useMemo(() => getMonthOptions(), [])

  // Default: previous month (where the analyses live)
  const [month, setMonth] = useState(() => {
    const today = new Date()
    const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`
  })

  const apiUrl = useMemo(() => {
    if (showAll) return "/api/llamadas?solo_analisis=1"
    const [y, m] = month.split("-").map(Number)
    const start = `${month}-01`
    const end = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`
    return `/api/llamadas?solo_analisis=1&start=${start}&end=${end}`
  }, [month, showAll])

  const { data: rawData, isLoading } = useSWR<LlamadaAnalisis[]>(apiUrl, fetcher)
  const data = Array.isArray(rawData) ? rawData : []

  const filtered = useMemo(() => {
    const q = norm(search)
    if (!q) return data
    return data.filter((d) =>
      norm(d.nombre).includes(q) || norm(d.closer || "").includes(q)
    )
  }, [data, search])

  const avgScore = useMemo(() => {
    if (!data.length) return null
    const scores = data.map((d) => extractScore(d.ia_analisis)).filter(Boolean) as number[]
    if (!scores.length) return null
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
  }, [data])

  const cerradas = data.filter((d) => extractResultadoType(d.ia_analisis, d.cerro) === "cerrado").length
  const reservadas = data.filter((d) => extractResultadoType(d.ia_analisis, d.cerro) === "reservado").length

  return (
    <div className="p-6 lg:p-8">
      {selected && <AnalisisModal item={selected} onClose={() => setSelected(null)} />}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Brain className="h-6 w-6 text-violet-500" />
            Análisis IA
          </h1>
          <p className="text-sm text-muted-foreground">Llamadas analizadas con inteligencia artificial</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Month filter */}
          <Select
            value={showAll ? "__all__" : month}
            onValueChange={(v) => {
              if (v === "__all__") { setShowAll(true) }
              else { setShowAll(false); setMonth(v) }
            }}
          >
            <SelectTrigger className="w-44 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos los meses</SelectItem>
              {monthOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Search */}
          <div className="relative w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar lead o closer..."
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

      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card className="border border-border"><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><Brain className="h-4 w-4 text-violet-500" /><p className="text-xs text-muted-foreground uppercase tracking-wide">Analizadas</p></div>
          <p className="text-2xl font-bold mt-1 text-violet-600">{data.length}</p>
        </CardContent></Card>
        <Card className="border border-border"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Score Promedio</p>
          <p className={cn("text-2xl font-bold mt-1", scoreColor(avgScore))}>{avgScore ? `${avgScore}/100` : "—"}</p>
        </CardContent></Card>
        <Card className="border border-border"><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><Phone className="h-4 w-4 text-emerald-500" /><p className="text-xs text-muted-foreground uppercase tracking-wide">Cerradas</p></div>
          <p className="text-2xl font-bold mt-1 text-emerald-600">{cerradas}</p>
        </CardContent></Card>
        <Card className="border border-border"><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><BookmarkCheck className="h-4 w-4 text-amber-500" /><p className="text-xs text-muted-foreground uppercase tracking-wide">Reservadas</p></div>
          <p className="text-2xl font-bold mt-1 text-amber-600">{reservadas}</p>
        </CardContent></Card>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          {search ? "No hay resultados para esa búsqueda" : "No hay llamadas con análisis IA en este período"}
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((item) => {
            const score = extractScore(item.ia_analisis)
            const resultado = extractResultadoLine(item.ia_analisis)
            const tipo = extractResultadoType(item.ia_analisis, item.cerro)
            return (
              <Card
                key={item.id}
                className="border border-border hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer group"
                onClick={() => setSelected(item)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className={cn("flex flex-col items-center justify-center w-14 h-14 rounded-full border-2 flex-shrink-0", scoreBorderBg(score))}>
                      <span className={cn("text-xl font-bold leading-none", scoreColor(score))}>{score ?? "?"}</span>
                      {score && <span className="text-[10px] text-muted-foreground">/100</span>}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground">{item.nombre}</span>
                        <ResultadoBadge tipo={tipo} />
                        {item.operacion && (
                          <Badge variant="outline" className="text-xs text-primary border-primary/20 bg-primary/5">{item.operacion}</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex gap-3 flex-wrap">
                        {item.closer && <span>Closer: {item.closer}</span>}
                        {formatDate(item.fecha_agenda) && <span>{formatDate(item.fecha_agenda)}</span>}
                        {resultado && <span className="truncate max-w-[220px] italic">{resultado}</span>}
                      </div>
                    </div>

                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 group-hover:text-primary transition-colors" />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
