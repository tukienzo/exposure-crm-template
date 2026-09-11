"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { CalendarClock, CheckCircle2, MessageSquareText, Phone, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const fetcher = (url: string) => fetch(url).then(async r => { const body = await r.json(); if (!r.ok) throw new Error(body.error || "Error"); return body })
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })
const STATES = ["Pendiente", "Contactado", "Reagendado", "Cerrado", "Descartado"]

type FollowUp = {
  id: number; nombre: string; telefono: string | null; instagram: string | null; fecha_closer: string | null
  closer: string | null; calificacion: string | null; motivo_no_cierre: string | null
  seguimiento_estado: string | null; seguimiento_fecha: string; seguimiento_nota: string | null; seguimiento_responsable: string | null
}

export default function SeguimientosPage() {
  const { data = [], error, isLoading, mutate } = useSWR<FollowUp[]>("/api/seguimientos", fetcher)
  const [filter, setFilter] = useState("activos")
  const [saving, setSaving] = useState<number | null>(null)
  const [drafts, setDrafts] = useState<Record<number, Partial<FollowUp>>>({})
  const value = (row: FollowUp, key: keyof FollowUp) => (drafts[row.id]?.[key] ?? row[key] ?? "") as string
  const rows = useMemo(() => data.filter(row => filter === "todos" || (filter === "activos" ? !["Cerrado", "Descartado"].includes(row.seguimiento_estado || "Pendiente") : row.seguimiento_estado === filter)), [data, filter])
  const groups = useMemo(() => {
    const map = new Map<string, FollowUp[]>()
    for (const row of rows) map.set(row.seguimiento_fecha, [...(map.get(row.seguimiento_fecha) || []), row])
    return [...map.entries()]
  }, [rows])

  async function save(row: FollowUp) {
    setSaving(row.id)
    const patch = drafts[row.id] || {}
    const response = await fetch("/api/agendas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      id: row.id,
      seguimiento_estado: patch.seguimiento_estado ?? row.seguimiento_estado ?? "Pendiente",
      seguimiento_fecha: patch.seguimiento_fecha ?? row.seguimiento_fecha,
      seguimiento_nota: patch.seguimiento_nota ?? row.seguimiento_nota,
      seguimiento_responsable: patch.seguimiento_responsable ?? row.seguimiento_responsable,
    }) })
    if (response.ok) { setDrafts(current => { const next = { ...current }; delete next[row.id]; return next }); await mutate() }
    setSaving(null)
  }

  const t = today()
  const active = data.filter(r => !["Cerrado", "Descartado"].includes(r.seguimiento_estado || "Pendiente"))
  return <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-7">
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[.2em] text-blue-500">Ventas · Seguimiento futuro</p><h1 className="mt-1 text-3xl font-black">Seguimientos</h1><p className="mt-1 text-sm text-muted-foreground">Cada oportunidad con fecha, contexto y responsable. Sin blocs paralelos.</p></div>
      <div className="flex flex-wrap gap-2">{["activos", "Pendiente", "Contactado", "Reagendado", "Cerrado", "todos"].map(x => <Button key={x} size="sm" variant={filter === x ? "default" : "outline"} onClick={() => setFilter(x)}>{x}</Button>)}</div>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <Metric label="Vencidos" value={active.filter(r => r.seguimiento_fecha < t).length} tone="text-red-500" />
      <Metric label="Para hoy" value={active.filter(r => r.seguimiento_fecha === t).length} tone="text-amber-500" />
      <Metric label="Próximos" value={active.filter(r => r.seguimiento_fecha > t).length} tone="text-emerald-500" />
    </div>
    {isLoading && <p className="py-16 text-center text-muted-foreground">Cargando seguimientos…</p>}
    {error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-500">{error.message}</p>}
    {!isLoading && !groups.length && <div className="rounded-3xl border border-dashed p-16 text-center text-muted-foreground"><CheckCircle2 className="mx-auto mb-3 h-9 w-9"/>No hay seguimientos en esta vista.</div>}
    <div className="space-y-7">{groups.map(([date, items]) => <section key={date}>
      <div className="mb-3 flex items-center gap-2"><CalendarClock className="h-5 w-5 text-blue-500"/><h2 className="font-black">{date === t ? "HOY" : new Date(`${date}T12:00:00`).toLocaleDateString("es-AR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</h2><span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold">{items.length}</span></div>
      <div className="grid gap-3">{items.map(row => <article key={row.id} className={`rounded-2xl border bg-card p-4 shadow-sm ${row.seguimiento_fecha < t && !["Cerrado","Descartado"].includes(row.seguimiento_estado || "") ? "border-red-500/30" : ""}`}>
        <div className="grid gap-4 lg:grid-cols-[220px_170px_150px_1fr_auto] lg:items-start">
          <div><h3 className="font-black">{row.nombre}</h3><p className="mt-1 text-xs text-muted-foreground">{row.calificacion || "Sin score"} · {row.closer || "Sin closer"}</p><div className="mt-2 flex gap-3 text-xs">{row.telefono && <a className="flex items-center gap-1 text-blue-500" href={`https://wa.me/${row.telefono.replace(/\D/g, "")}`} target="_blank"><Phone className="h-3 w-3"/>WhatsApp</a>}{row.instagram && <span>@{row.instagram.replace(/^@/, "")}</span>}</div></div>
          <Input type="date" value={value(row, "seguimiento_fecha")} onChange={e => setDrafts(d => ({ ...d, [row.id]: { ...d[row.id], seguimiento_fecha: e.target.value } }))}/>
          <Select value={value(row, "seguimiento_estado") || "Pendiente"} onValueChange={v => setDrafts(d => ({ ...d, [row.id]: { ...d[row.id], seguimiento_estado: v } }))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{STATES.map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select>
          <div className="space-y-2"><Textarea className="min-h-20" value={value(row, "seguimiento_nota")} onChange={e => setDrafts(d => ({ ...d, [row.id]: { ...d[row.id], seguimiento_nota: e.target.value } }))} placeholder="Qué pasó y qué decirle cuando lo retomemos"/><Input value={value(row, "seguimiento_responsable")} onChange={e => setDrafts(d => ({ ...d, [row.id]: { ...d[row.id], seguimiento_responsable: e.target.value } }))} placeholder="Responsable"/></div>
          <Button disabled={!drafts[row.id] || saving === row.id} onClick={() => save(row)}>{saving === row.id ? <RefreshCw className="h-4 w-4 animate-spin"/> : "Guardar"}</Button>
        </div>{row.motivo_no_cierre && <p className="mt-3 flex items-center gap-2 border-t pt-3 text-xs text-muted-foreground"><MessageSquareText className="h-3.5 w-3.5"/><strong>Motivo anterior:</strong> {row.motivo_no_cierre}</p>}
      </article>)}</div>
    </section>)}</div>
  </div>
}

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) { return <div className="rounded-2xl border bg-card p-4"><p className="text-xs font-bold uppercase text-muted-foreground">{label}</p><p className={`mt-1 text-3xl font-black ${tone}`}>{value}</p></div> }
