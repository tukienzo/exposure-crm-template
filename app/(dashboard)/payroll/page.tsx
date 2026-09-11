"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { Loader2, BarChart2, Users, DollarSign, CheckCircle2, Check, Trash2, Plus, Download, Copy } from "lucide-react"
import { exportRowsToXLSX } from "@/lib/csv-export"
import { sumarMeses } from "@/lib/meses"
import { useSession } from "@/components/session-provider"
import { canExportRole } from "@/lib/export-access"
import { MultiSelectFilter } from "@/components/ui/multi-select-filter"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Pay = {
  id: number; mes: string | null; mes_orden: number | null; pagado: boolean
  nombre: string | null; departamento: string | null; direccion_pago: string | null
  total_usd: number | null; total_ars: number | null
}

const usd = (n: number | null) => "$" + (n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })
const ars = (n: number | null) => (n ? "$" + n.toLocaleString("es-AR", { maximumFractionDigits: 0 }) : "—")

// Colores por departamento (mismos que el Google Sheets)
const deptoColors: Record<string, string> = {
  Ventas: "bg-green-600 text-white border-green-700",
  Operaciones: "bg-amber-500 text-white border-amber-600",
  Marketing: "bg-red-600 text-white border-red-700",
  Producto: "bg-blue-600 text-white border-blue-700",
}

function ColStats({ data, label, getVal }: { data: Pay[]; label: string; getVal: (p: Pay) => string | null | undefined }) {
  const stats = useMemo(() => {
    const map: Record<string, number> = {}
    for (const row of data) { const k = getVal(row) || "(sin dato)"; map[k] = (map[k] || 0) + (row.total_usd || 0) }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [data, getVal])
  const total = stats.reduce((s, [, v]) => s + v, 0) || 1
  const max = stats[0]?.[1] || 1
  return (
    <Popover>
      <PopoverTrigger asChild><button className="ml-1 text-muted-foreground/50 hover:text-foreground" onClick={(e) => e.stopPropagation()}><BarChart2 className="h-3 w-3 inline" /></button></PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <p className="text-xs font-semibold uppercase tracking-wide mb-3 text-muted-foreground">{label} — por monto USD</p>
        <div className="space-y-2">
          {stats.slice(0, 15).map(([val, v]) => (
            <div key={val} className="space-y-0.5">
              <div className="flex justify-between text-xs"><span className="truncate max-w-[150px]">{val}</span><span className="text-muted-foreground ml-2">{usd(v)} · {Math.round((v / total) * 100)}%</span></div>
              <div className="h-1 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-primary/60" style={{ width: `${(v / max) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default function PayrollPage() {
  const { rol } = useSession()
  const canExport = canExportRole(rol)
  const { data, isLoading, mutate } = useSWR<Pay[]>("/api/payroll", fetcher)
  const rows = Array.isArray(data) ? data : []
  const noAuth = data && !Array.isArray(data)

  const [mes, setMes] = useState<string>("")        // un solo mes
  const [depto, setDepto] = useState<string[]>([])
  const [pagadoF, setPagadoF] = useState<string[]>([])
  const [saving, setSaving] = useState<number | null>(null)
  const [editing, setEditing] = useState<{ id: number; field: "total_usd" | "total_ars" | "nombre" | "departamento" } | null>(null)
  const [editValue, setEditValue] = useState("")
  const [nuevoNombre, setNuevoNombre] = useState("")
  const [nuevoDepto, setNuevoDepto] = useState("")
  const [nuevoMesCopia, setNuevoMesCopia] = useState("")
  const [copiandoMes, setCopiandoMes] = useState(false)
  const [copiaMsg, setCopiaMsg] = useState<string | null>(null)

  const meses = useMemo(() => {
    const seen = new Map<string, number>()
    rows.forEach((r) => { if (r.mes) seen.set(r.mes, r.mes_orden ?? 99) })
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m)
  }, [rows])
  const deptos = useMemo(() => Array.from(new Set(rows.map((r) => r.departamento || "").filter(Boolean))).sort(), [rows])

  // Default: el mes mas reciente con montos cargados.
  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current || rows.length === 0) return
    didInit.current = true
    const conDatos = [...rows].filter((r) => (r.total_usd || 0) > 0).sort((a, b) => (b.mes_orden ?? 0) - (a.mes_orden ?? 0))
    setMes(conDatos[0]?.mes || meses[0] || "")
  }, [rows, meses])

  // Sugerencia de nombre para "crear mes nuevo": el mes seleccionado + 1.
  useEffect(() => {
    if (mes) setNuevoMesCopia(sumarMeses(mes, 1))
  }, [mes])

  // Crea un mes nuevo copiando a TODAS las personas del mes seleccionado
  // (mismo nombre/departamento, SIN monto — se carga de cero cada mes) —
  // para no tener que tipear a mano a todo el equipo cada mes que empieza.
  async function crearMesCopiando() {
    if (!nuevoMesCopia.trim() || !mes) return
    const origen = rows.filter((r) => r.mes === mes)
    if (origen.length === 0) return
    const nextOrden = Math.max(0, ...rows.map((r) => r.mes_orden ?? 0)) + 1
    setCopiandoMes(true)
    setCopiaMsg(null)
    let ok = 0
    for (const p of origen) {
      const res = await fetch("/api/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mes: nuevoMesCopia.trim(), mes_orden: nextOrden,
          nombre: p.nombre, departamento: p.departamento,
          total_usd: 0, total_ars: null,
        }),
      })
      if (res.ok) ok++
    }
    setCopiandoMes(false)
    setCopiaMsg(`Se creó ${nuevoMesCopia.trim()} con ${ok} de ${origen.length} personas de ${mes}.`)
    await mutate()
    setMes(nuevoMesCopia.trim())
  }

  const filtered = useMemo(() => rows.filter((r) => {
    if (mes && r.mes !== mes) return false
    if (depto.length && !depto.includes(r.departamento || "")) return false
    if (pagadoF.length && !pagadoF.includes(r.pagado ? "Sí" : "No")) return false
    return true
  }), [rows, mes, depto, pagadoF])

  const total = filtered.reduce((s, r) => s + (r.total_usd || 0), 0)
  const pagados = filtered.filter((r) => r.pagado).length

  const csvColumns = [
    { label: "Nombre", get: (p: Pay) => p.nombre },
    { label: "Departamento", get: (p: Pay) => p.departamento },
    { label: "Total USD", get: (p: Pay) => p.total_usd },
    { label: "Total ARS", get: (p: Pay) => p.total_ars },
    { label: "Pagado", get: (p: Pay) => p.pagado ? "Sí" : "No" },
  ]

  async function togglePagado(p: Pay) {
    setSaving(p.id)
    // update optimista
    await mutate(
      async () => {
        await fetch("/api/payroll", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, pagado: !p.pagado }) })
        return undefined
      },
      { optimisticData: rows.map((r) => (r.id === p.id ? { ...r, pagado: !p.pagado } : r)), populateCache: false, revalidate: true },
    )
    setSaving(null)
  }

  async function saveField(p: Pay, field: "total_usd" | "total_ars" | "nombre" | "departamento", value: number | string | null) {
    setSaving(p.id)
    await mutate(
      async () => {
        await fetch("/api/payroll", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, [field]: value }) })
        return undefined
      },
      { optimisticData: rows.map((r) => (r.id === p.id ? { ...r, [field]: value } : r)), populateCache: false, revalidate: true },
    )
    setSaving(null)
  }

  function startEdit(p: Pay, field: "total_usd" | "total_ars" | "nombre" | "departamento") {
    setEditing({ id: p.id, field })
    setEditValue(p[field] != null ? String(p[field]) : "")
  }

  function commitEdit(p: Pay) {
    if (!editing) return
    const field = editing.field
    const raw = editValue.trim()
    setEditing(null)
    if (!raw) return
    if (field === "nombre") {
      saveField(p, field, raw)
      return
    }
    const num = parseFloat(raw.replace(",", "."))
    if (Number.isNaN(num)) return
    saveField(p, field, num)
  }

  async function deletePersona(p: Pay) {
    if (!confirm(`¿Eliminar a "${p.nombre}" de ${p.mes}?`)) return
    setSaving(p.id)
    await mutate(
      async () => {
        await fetch("/api/payroll", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id }) })
        return undefined
      },
      { optimisticData: rows.filter((r) => r.id !== p.id), populateCache: false, revalidate: true },
    )
    setSaving(null)
  }

  async function addPersona() {
    if (!nuevoNombre.trim() || !mes) return
    const mesOrden = rows.find((r) => r.mes === mes)?.mes_orden ?? null
    setSaving(-1)
    await fetch("/api/payroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mes, mes_orden: mesOrden, nombre: nuevoNombre.trim(), departamento: nuevoDepto || null }),
    })
    setNuevoNombre("")
    setNuevoDepto("")
    setSaving(null)
    mutate()
  }

  if (noAuth) return <div className="p-6 lg:p-8"><p className="text-muted-foreground">No tenés permiso para ver esta sección.</p></div>

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6"><h1 className="text-2xl font-bold text-foreground">Payroll</h1><p className="text-sm text-muted-foreground">Honorarios del equipo por mes (USD)</p></div>

      {/* Selector de mes (uno solo) */}
      <div className="flex flex-wrap gap-2 mb-5">
        {meses.map((m) => (
          <button key={m} onClick={() => setMes(m)}
            className={cn("px-3 py-1.5 rounded-md text-sm font-medium border transition-colors",
              mes === m ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted")}>
            {m}
          </button>
        ))}
      </div>

      {/* Crear un mes nuevo copiando a todas las personas del mes seleccionado */}
      <div className="flex flex-wrap items-end gap-2 mb-5 rounded-md border border-dashed border-border p-3">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium">Nombre del mes nuevo</p>
          <input value={nuevoMesCopia} onChange={(e) => setNuevoMesCopia(e.target.value)}
            placeholder="Ej: Julio 2026"
            className="h-8 rounded-md border border-input bg-background px-2 text-xs min-w-[160px]" />
        </div>
        <button onClick={crearMesCopiando} disabled={!nuevoMesCopia.trim() || !mes || copiandoMes}
          title={`Crea "${nuevoMesCopia}" con las mismas personas y departamentos que tiene ${mes} ahora, sin monto (para cargarlo de cero) y sin marcar como pagado`}
          className="h-8 inline-flex items-center gap-1 rounded-md border border-primary bg-primary text-primary-foreground px-3 text-xs font-medium disabled:opacity-50">
          {copiandoMes ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3" />}
          Copiar personas de {mes || "..."} a {nuevoMesCopia || "..."}
        </button>
        {copiaMsg && <span className="text-xs text-muted-foreground">{copiaMsg}</span>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <Card className="border border-border"><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><DollarSign className="h-4 w-4 text-primary" /><p className="text-xs text-muted-foreground uppercase tracking-wide">Total del mes</p></div><p className="text-2xl font-bold mt-1">{usd(total)}</p></CardContent></Card>
        <Card className="border border-border"><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><Users className="h-4 w-4 text-sky-500" /><p className="text-xs text-muted-foreground uppercase tracking-wide">Personas</p></div><p className="text-2xl font-bold mt-1">{filtered.length}</p></CardContent></Card>
        <Card className="border border-border"><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><CheckCircle2 className="h-4 w-4 text-emerald-500" /><p className="text-xs text-muted-foreground uppercase tracking-wide">Pagados</p></div><p className="text-2xl font-bold mt-1 text-emerald-600">{pagados}<span className="text-base text-muted-foreground font-normal"> / {filtered.length}</span></p></CardContent></Card>
      </div>

      {/* Filtros simples (una sola opción) */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <MultiSelectFilter label="Departamento" values={depto} options={deptos} onChange={setDepto} />
        <MultiSelectFilter label="Pagado" values={pagadoF} options={["Sí", "No"]} onChange={setPagadoF} />
        {canExport && <button
          onClick={() => exportRowsToXLSX(filtered, csvColumns, `payroll_${mes || "todos"}_${new Date().toISOString().slice(0, 10)}`)}
          title="Exporta exactamente lo que estás viendo, con los filtros aplicados"
          className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-colors ml-auto">
          <Download className="h-3.5 w-3.5" />Exportar Excel
        </button>}
        <span className="text-xs text-muted-foreground">{filtered.length} personas</span>
      </div>

      <Card className="border border-border">
        <CardHeader className="pb-0"><CardTitle className="text-lg font-semibold">Detalle de honorarios</CardTitle></CardHeader>
        <CardContent className="pt-4">
          {/* Agregar persona al mes seleccionado */}
          <div className="flex flex-wrap items-end gap-2 mb-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Nombre</p>
              <input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)}
                placeholder="Nombre y apellido"
                onKeyDown={(e) => { if (e.key === "Enter") addPersona() }}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs min-w-[200px]" />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Departamento</p>
              <select value={nuevoDepto} onChange={(e) => setNuevoDepto(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs min-w-[150px]">
                <option value="">Sin departamento</option>
                {Object.keys(deptoColors).map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <button onClick={addPersona} disabled={!nuevoNombre.trim() || !mes || saving === -1}
              className="h-8 inline-flex items-center gap-1 rounded-md border border-primary bg-primary text-primary-foreground px-3 text-xs font-medium disabled:opacity-50">
              {saving === -1 ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Agregar a {mes || "..."}
            </button>
          </div>
          {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            : filtered.length === 0 ? <div className="text-center py-12 text-muted-foreground">No hay registros con esos filtros</div>
            : (
              <div className="[&>div]:max-h-[calc(100vh-440px)]">
                <Table>
                  <TableHeader className="sticky top-0 z-20 bg-card">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Nombre</TableHead>
                      <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Departamento<ColStats data={filtered} label="Departamento" getVal={(p) => p.departamento} /></TableHead>
                      <TableHead className="text-xs font-semibold uppercase text-muted-foreground text-right">Total USD</TableHead>
                      <TableHead className="text-xs font-semibold uppercase text-muted-foreground text-right">Total ARS</TableHead>
                      <TableHead className="text-xs font-semibold uppercase text-muted-foreground text-center">Pagado</TableHead>
                      <TableHead className="w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p) => (
                      <TableRow key={p.id} className="hover:bg-muted/50">
                        <TableCell className="font-medium whitespace-nowrap">
                          {editing?.id === p.id && editing.field === "nombre" ? (
                            <input autoFocus type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => commitEdit(p)}
                              onKeyDown={(e) => { if (e.key === "Enter") commitEdit(p); if (e.key === "Escape") setEditing(null) }}
                              className="w-40 bg-muted border border-input rounded px-1 py-0.5 text-sm" />
                          ) : (
                            <button onClick={() => startEdit(p, "nombre")} title="Clic para editar" className="hover:underline decoration-dotted underline-offset-4 text-left">
                              {p.nombre || "-"}
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {editing?.id === p.id && editing.field === "departamento" ? (
                            <select autoFocus value={editValue}
                              onChange={(e) => { const v = e.target.value; setEditing(null); saveField(p, "departamento", v || null) }}
                              onBlur={() => setEditing(null)}
                              className="h-7 rounded-md border border-input bg-background px-1 text-xs">
                              <option value="">Sin departamento</option>
                              {Object.keys(deptoColors).map((d) => <option key={d} value={d}>{d}</option>)}
                            </select>
                          ) : (
                            <button onClick={() => startEdit(p, "departamento")} title="Clic para editar">
                              {p.departamento
                                ? <Badge variant="outline" className={cn("text-xs font-medium", deptoColors[p.departamento] || "")}>{p.departamento}</Badge>
                                : <span className="text-muted-foreground/40 hover:text-foreground">— editar —</span>}
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">
                          {editing?.id === p.id && editing.field === "total_usd" ? (
                            <input
                              autoFocus
                              type="number"
                              step="0.01"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => commitEdit(p)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitEdit(p)
                                if (e.key === "Escape") setEditing(null)
                              }}
                              className="w-24 text-right bg-muted border border-input rounded px-1 py-0.5 text-sm tabular-nums"
                            />
                          ) : (
                            <button onClick={() => startEdit(p, "total_usd")} title="Clic para editar"
                              className="hover:underline decoration-dotted underline-offset-4">
                              {usd(p.total_usd)}
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm whitespace-nowrap tabular-nums text-muted-foreground">
                          {editing?.id === p.id && editing.field === "total_ars" ? (
                            <input
                              autoFocus
                              type="number"
                              step="0.01"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => commitEdit(p)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitEdit(p)
                                if (e.key === "Escape") setEditing(null)
                              }}
                              className="w-28 text-right bg-muted border border-input rounded px-1 py-0.5 text-sm tabular-nums"
                            />
                          ) : (
                            <button onClick={() => startEdit(p, "total_ars")} title="Clic para editar"
                              className="hover:underline decoration-dotted underline-offset-4">
                              {ars(p.total_ars)}
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <button onClick={() => togglePagado(p)} disabled={saving === p.id} title="Clic para cambiar"
                            className={cn("inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                              p.pagado ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/20"
                                       : "bg-muted text-muted-foreground border-border hover:bg-muted/70")}>
                            {saving === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : p.pagado ? <Check className="h-3 w-3" /> : null}
                            {p.pagado ? "Sí" : "No"}
                          </button>
                        </TableCell>
                        <TableCell className="text-center">
                          <button onClick={() => deletePersona(p)} disabled={saving === p.id} title="Eliminar de este mes"
                            className="text-muted-foreground/50 hover:text-red-500">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
        </CardContent>
      </Card>
    </div>
  )
}
