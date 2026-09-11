"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { Loader2, BarChart2, Wallet, Receipt, Calculator, Plus, Trash2, ClipboardPaste } from "lucide-react"
import { sumarMeses, ddmmyyyyAIso } from "@/lib/meses"
import { MultiSelectFilter } from "@/components/ui/multi-select-filter"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Gasto = {
  id: number; fecha: string | null; concepto: string | null; monto_usd: number | null
  tipo_gasto: string | null; departamento: string | null; mes: string | null; mes_orden: number | null
}

const usd = (n: number | null) => "$" + (n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })

// Colores del Google Sheets
const tipoColors: Record<string, string> = {
  Software: "bg-sky-500/15 text-sky-700 border-sky-500/30",
  Inversiones: "bg-rose-500/15 text-rose-700 border-rose-500/30",
  "Anuncios Z": "bg-amber-500/15 text-amber-700 border-amber-500/30",
  Otros: "bg-muted text-muted-foreground border-border",
}
const deptoColors: Record<string, string> = {
  Operaciones: "bg-slate-500/15 text-slate-700 border-slate-500/30",
  Marketing: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  Otro: "bg-neutral-800 text-white border-neutral-900",
  Ventas: "bg-green-600/15 text-green-700 border-green-600/30",
  Producto: "bg-blue-600/15 text-blue-700 border-blue-600/30",
}
const TIPOS_GASTO = ["Software", "Inversiones", "Anuncios Z", "Otros"]
const DEPARTAMENTOS = ["Operaciones", "Marketing", "Otro", "Ventas", "Producto"]

function ColStats({ data, label, getVal }: { data: Gasto[]; label: string; getVal: (g: Gasto) => string | null | undefined }) {
  const stats = useMemo(() => {
    const map: Record<string, number> = {}
    for (const row of data) { const k = getVal(row) || "(sin dato)"; map[k] = (map[k] || 0) + (row.monto_usd || 0) }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [data, getVal])
  const total = stats.reduce((s, [, v]) => s + v, 0) || 1
  const max = stats[0]?.[1] || 1
  return (
    <Popover>
      <PopoverTrigger asChild><button className="ml-1 text-muted-foreground/50 hover:text-foreground" onClick={(e) => e.stopPropagation()}><BarChart2 className="h-3 w-3 inline" /></button></PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <p className="text-xs font-semibold uppercase tracking-wide mb-3 text-muted-foreground">{label} — por monto</p>
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

export default function GastosPage() {
  const { data, isLoading, mutate } = useSWR<Gasto[]>("/api/gastos", fetcher)
  const gastos = Array.isArray(data) ? data : []
  const noAuth = data && !Array.isArray(data)

  const [mes, setMes] = useState<string>("")
  const [tipo, setTipo] = useState<string[]>([])
  const [depto, setDepto] = useState<string[]>([])
  const [saving, setSaving] = useState<number | null>(null)
  const [editing, setEditing] = useState<{ id: number; field: "fecha" | "concepto" | "monto_usd" | "tipo_gasto" | "departamento" } | null>(null)
  const [editValue, setEditValue] = useState("")

  // Meses reales (con datos) + los proximos 3 meses despues del ultimo real,
  // para que ya aparezcan como pestaña disponible aunque todavia no tengan
  // ningun gasto cargado (la contadora los va llenando a medida que pasan).
  const { meses, mesOrdenMap } = useMemo(() => {
    const seen = new Map<string, number>()
    gastos.forEach((g) => { if (g.mes) seen.set(g.mes, g.mes_orden ?? 0) })
    const reales = [...seen.entries()].sort((a, b) => b[1] - a[1])
    const maxOrden = reales.length ? Math.max(...reales.map(([, o]) => o)) : 0
    const ultimoMes = reales[0]?.[0]
    const futuros: [string, number][] = []
    if (ultimoMes) {
      for (let i = 1; i <= 3; i++) {
        const label = sumarMeses(ultimoMes, i)
        if (!seen.has(label)) futuros.push([label, maxOrden + i])
      }
    }
    const orden = new Map<string, number>([...reales, ...futuros])
    const lista = [...futuros].reverse().map(([m]) => m).concat(reales.map(([m]) => m))
    return { meses: lista, mesOrdenMap: orden }
  }, [gastos])
  const tipos = useMemo(() => Array.from(new Set(gastos.map((g) => g.tipo_gasto || "").filter(Boolean))).sort(), [gastos])
  const deptos = useMemo(() => Array.from(new Set(gastos.map((g) => g.departamento || "").filter(Boolean))).sort(), [gastos])

  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current || meses.length === 0) return
    didInit.current = true
    const primerReal = meses.find((m) => gastos.some((g) => g.mes === m))
    setMes(primerReal || meses[0]) // mes mas reciente con datos, o el primero disponible
  }, [meses, gastos])

  const filtered = useMemo(() => gastos.filter((g) => {
    if (mes && g.mes !== mes) return false
    if (tipo.length && !tipo.includes(g.tipo_gasto || "")) return false
    if (depto.length && !depto.includes(g.departamento || "")) return false
    return true
  }), [gastos, mes, tipo, depto])

  const total = filtered.reduce((s, g) => s + (g.monto_usd || 0), 0)
  const fmtFecha = (s: string | null) => { if (!s) return "-"; const d = new Date(s + "T12:00:00"); return isNaN(d.getTime()) ? "-" : d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" }) }

  // Agregar un gasto suelto al mes seleccionado
  const [nuevaFecha, setNuevaFecha] = useState("")
  const [nuevoConcepto, setNuevoConcepto] = useState("")
  const [nuevoMonto, setNuevoMonto] = useState("")
  const [nuevoTipo, setNuevoTipo] = useState("")
  const [nuevoDepto, setNuevoDepto] = useState("")

  async function addGasto() {
    if (!nuevoConcepto.trim() || !mes || !nuevaFecha) return
    setSaving(-1)
    await fetch("/api/gastos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mes, mes_orden: mesOrdenMap.get(mes) ?? null,
        fecha: nuevaFecha, concepto: nuevoConcepto.trim(),
        monto_usd: parseFloat(nuevoMonto.replace(",", ".")) || 0,
        tipo_gasto: nuevoTipo || null, departamento: nuevoDepto || null,
      }),
    })
    setNuevaFecha(""); setNuevoConcepto(""); setNuevoMonto(""); setNuevoTipo(""); setNuevoDepto("")
    setSaving(null)
    mutate()
  }

  type CampoGasto = "fecha" | "concepto" | "monto_usd" | "tipo_gasto" | "departamento"

  async function saveField(g: Gasto, field: CampoGasto, value: string | number | null) {
    setSaving(g.id)
    await mutate(
      async () => {
        await fetch("/api/gastos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: g.id, [field]: value }) })
        return undefined
      },
      { optimisticData: gastos.map((r) => (r.id === g.id ? { ...r, [field]: value } : r)), populateCache: false, revalidate: true },
    )
    setSaving(null)
  }

  function startEdit(g: Gasto, field: CampoGasto) {
    setEditing({ id: g.id, field })
    if (field === "monto_usd") setEditValue(g.monto_usd != null ? String(g.monto_usd) : "")
    else if (field === "fecha") setEditValue(g.fecha || "")
    else if (field === "concepto") setEditValue(g.concepto || "")
    else if (field === "tipo_gasto") setEditValue(g.tipo_gasto || "")
    else setEditValue(g.departamento || "")
  }

  function commitEdit(g: Gasto) {
    if (!editing) return
    const field = editing.field
    const raw = editValue.trim()
    setEditing(null)
    if (!raw) return
    if (field === "monto_usd") {
      const num = parseFloat(raw.replace(",", "."))
      if (Number.isNaN(num)) return
      saveField(g, field, num)
      return
    }
    saveField(g, field, raw)
  }

  async function deleteGasto(g: Gasto) {
    if (!confirm(`¿Eliminar "${g.concepto}" (${usd(g.monto_usd)})?`)) return
    setSaving(g.id)
    await mutate(
      async () => {
        await fetch("/api/gastos", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: g.id }) })
        return undefined
      },
      { optimisticData: gastos.filter((r) => r.id !== g.id), populateCache: false, revalidate: true },
    )
    setSaving(null)
  }

  // Importar varios de una: pegar filas "fecha  concepto  monto  tipo  departamento"
  // (separadas por tab, como se copian directo de una planilla).
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState("")
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)

  async function importarPegado() {
    if (!mes) return
    const lineas = pasteText.split("\n").map((l) => l.trim()).filter(Boolean)
    const filas = lineas.map((l) => l.split("\t").map((c) => c.trim()))
    const validas = filas.filter((c) => c.length >= 3 && c[1])
    if (validas.length === 0) { setImportMsg("No encontré filas válidas para importar."); return }
    setImporting(true)
    setImportMsg(null)
    let ok = 0
    for (const c of validas) {
      const [fechaRaw, concepto, montoRaw, tipoRaw, deptoRaw] = c
      const fechaIso = ddmmyyyyAIso(fechaRaw) || null
      const monto = parseFloat((montoRaw || "0").replace(",", ".")) || 0
      const res = await fetch("/api/gastos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mes, mes_orden: mesOrdenMap.get(mes) ?? null,
          fecha: fechaIso, concepto, monto_usd: monto,
          tipo_gasto: tipoRaw || null, departamento: deptoRaw || null,
        }),
      })
      if (res.ok) ok++
    }
    setImporting(false)
    setImportMsg(`Importados ${ok} de ${validas.length} gastos a ${mes}.`)
    setPasteText("")
    mutate()
  }

  if (noAuth) return <div className="p-6 lg:p-8"><p className="text-muted-foreground">No tenés permiso para ver esta sección.</p></div>

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6"><h1 className="text-2xl font-bold text-foreground">Gastos</h1><p className="text-sm text-muted-foreground">Gastos de la operación en USD</p></div>

      {/* Selector de mes (uno solo) */}
      <div className="flex flex-wrap gap-2 mb-5">
        {meses.map((m) => {
          const tieneDatos = gastos.some((g) => g.mes === m)
          return (
            <button key={m} onClick={() => setMes(m)}
              className={cn("px-3 py-1.5 rounded-md text-sm font-medium border transition-colors",
                mes === m ? "bg-primary text-primary-foreground border-primary"
                  : tieneDatos ? "border-border text-muted-foreground hover:bg-muted"
                    : "border-dashed border-border text-muted-foreground/60 hover:bg-muted")}>
              {m}{!tieneDatos && <span className="ml-1 text-[10px] uppercase">(vacío)</span>}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <Card className="border border-border"><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><Wallet className="h-4 w-4 text-primary" /><p className="text-xs text-muted-foreground uppercase tracking-wide">Total del mes</p></div><p className="text-2xl font-bold mt-1">{usd(total)}</p></CardContent></Card>
        <Card className="border border-border"><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><Receipt className="h-4 w-4 text-sky-500" /><p className="text-xs text-muted-foreground uppercase tracking-wide">Cantidad</p></div><p className="text-2xl font-bold mt-1">{filtered.length}</p></CardContent></Card>
        <Card className="border border-border"><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><Calculator className="h-4 w-4 text-amber-500" /><p className="text-xs text-muted-foreground uppercase tracking-wide">Gasto promedio</p></div><p className="text-2xl font-bold mt-1">{usd(total / (filtered.length || 1))}</p></CardContent></Card>
      </div>

      {/* Filtros simples */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <MultiSelectFilter label="Tipo de gasto" values={tipo} options={tipos} onChange={setTipo} />
        <MultiSelectFilter label="Departamento" values={depto} options={deptos} onChange={setDepto} />
        <button
          onClick={() => setPasteOpen((v) => !v)}
          className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-colors ml-auto">
          <ClipboardPaste className="h-3.5 w-3.5" />Importar varios (pegar)
        </button>
        <span className="text-xs text-muted-foreground">{filtered.length} gastos</span>
      </div>

      {pasteOpen && (
        <Card className="border border-border mb-4">
          <CardContent className="p-4 space-y-2">
            <p className="text-xs text-muted-foreground">
              Pegá filas copiadas de una planilla — una por línea, con columnas separadas por TAB, en este orden:
              <strong> Fecha (dd/mm/aaaa)</strong>, <strong>Concepto</strong>, <strong>Monto (con punto decimal, sin separador de miles — ej: 2497.00)</strong>, <strong>Tipo de Gasto</strong>, <strong>Departamento</strong>. Se van a cargar todas en <strong>{mes}</strong>.
            </p>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={6}
              placeholder={"8/6/2026\tManyChat\t516.11\tSoftware\tOperaciones"}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs font-mono"
            />
            <div className="flex items-center gap-2">
              <button onClick={importarPegado} disabled={importing || !pasteText.trim() || !mes}
                className="h-8 inline-flex items-center gap-1 rounded-md border border-primary bg-primary text-primary-foreground px-3 text-xs font-medium disabled:opacity-50">
                {importing ? <Loader2 className="h-3 w-3 animate-spin" /> : <ClipboardPaste className="h-3 w-3" />}
                Importar a {mes || "..."}
              </button>
              {importMsg && <span className="text-xs text-muted-foreground">{importMsg}</span>}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border border-border">
        <CardHeader className="pb-0"><CardTitle className="text-lg font-semibold">Detalle de gastos</CardTitle></CardHeader>
        <CardContent className="pt-4">
          {/* Agregar un gasto suelto al mes seleccionado */}
          <div className="flex flex-wrap items-end gap-2 mb-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Fecha</p>
              <input type="date" value={nuevaFecha} onChange={(e) => setNuevaFecha(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Concepto</p>
              <input value={nuevoConcepto} onChange={(e) => setNuevoConcepto(e.target.value)}
                placeholder="Ej: ManyChat"
                onKeyDown={(e) => { if (e.key === "Enter") addGasto() }}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs min-w-[160px]" />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Monto USD</p>
              <input type="number" step="0.01" value={nuevoMonto} onChange={(e) => setNuevoMonto(e.target.value)}
                placeholder="0.00"
                className="h-8 rounded-md border border-input bg-background px-2 text-xs w-24" />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Tipo</p>
              <select value={nuevoTipo} onChange={(e) => setNuevoTipo(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs min-w-[130px]">
                <option value="">Sin tipo</option>
                {TIPOS_GASTO.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Departamento</p>
              <select value={nuevoDepto} onChange={(e) => setNuevoDepto(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs min-w-[140px]">
                <option value="">Sin departamento</option>
                {DEPARTAMENTOS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <button onClick={addGasto} disabled={!nuevoConcepto.trim() || !mes || !nuevaFecha || saving === -1}
              className="h-8 inline-flex items-center gap-1 rounded-md border border-primary bg-primary text-primary-foreground px-3 text-xs font-medium disabled:opacity-50">
              {saving === -1 ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Agregar a {mes || "..."}
            </button>
          </div>

          {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            : filtered.length === 0 ? <div className="text-center py-12 text-muted-foreground">No hay gastos con esos filtros</div>
            : (
              <div className="[&>div]:max-h-[calc(100vh-440px)]">
                <Table>
                  <TableHeader className="sticky top-0 z-20 bg-card">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Fecha</TableHead>
                      <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Concepto</TableHead>
                      <TableHead className="text-xs font-semibold uppercase text-muted-foreground text-right">Monto USD</TableHead>
                      <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Tipo<ColStats data={filtered} label="Tipo" getVal={(g) => g.tipo_gasto} /></TableHead>
                      <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Departamento<ColStats data={filtered} label="Departamento" getVal={(g) => g.departamento} /></TableHead>
                      <TableHead className="w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((g) => (
                      <TableRow key={g.id} className="hover:bg-muted/50">
                        <TableCell className="text-sm whitespace-nowrap">
                          {editing?.id === g.id && editing.field === "fecha" ? (
                            <input autoFocus type="date" value={editValue} onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => commitEdit(g)}
                              onKeyDown={(e) => { if (e.key === "Enter") commitEdit(g); if (e.key === "Escape") setEditing(null) }}
                              className="bg-muted border border-input rounded px-1 py-0.5 text-xs" />
                          ) : (
                            <button onClick={() => startEdit(g, "fecha")} title="Clic para editar" className="hover:underline decoration-dotted underline-offset-4">
                              {fmtFecha(g.fecha)}
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="font-medium whitespace-nowrap">
                          {editing?.id === g.id && editing.field === "concepto" ? (
                            <input autoFocus type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => commitEdit(g)}
                              onKeyDown={(e) => { if (e.key === "Enter") commitEdit(g); if (e.key === "Escape") setEditing(null) }}
                              className="w-40 bg-muted border border-input rounded px-1 py-0.5 text-sm" />
                          ) : (
                            <button onClick={() => startEdit(g, "concepto")} title="Clic para editar" className="hover:underline decoration-dotted underline-offset-4 text-left">
                              {g.concepto || "-"}
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">
                          {editing?.id === g.id && editing.field === "monto_usd" ? (
                            <input autoFocus type="number" step="0.01" value={editValue} onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => commitEdit(g)}
                              onKeyDown={(e) => { if (e.key === "Enter") commitEdit(g); if (e.key === "Escape") setEditing(null) }}
                              className="w-24 text-right bg-muted border border-input rounded px-1 py-0.5 text-sm tabular-nums" />
                          ) : (
                            <button onClick={() => startEdit(g, "monto_usd")} title="Clic para editar" className="hover:underline decoration-dotted underline-offset-4">
                              {usd(g.monto_usd || 0)}
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {editing?.id === g.id && editing.field === "tipo_gasto" ? (
                            <select autoFocus value={editValue}
                              onChange={(e) => { const v = e.target.value; setEditing(null); saveField(g, "tipo_gasto", v || null) }}
                              onBlur={() => setEditing(null)}
                              className="h-7 rounded-md border border-input bg-background px-1 text-xs">
                              <option value="">Sin tipo</option>
                              {TIPOS_GASTO.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                          ) : (
                            <button onClick={() => startEdit(g, "tipo_gasto")} title="Clic para editar">
                              {g.tipo_gasto ? <Badge variant="outline" className={cn("text-xs font-medium", tipoColors[g.tipo_gasto] || "")}>{g.tipo_gasto}</Badge> : <span className="text-muted-foreground/40 hover:text-foreground">— editar —</span>}
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {editing?.id === g.id && editing.field === "departamento" ? (
                            <select autoFocus value={editValue}
                              onChange={(e) => { const v = e.target.value; setEditing(null); saveField(g, "departamento", v || null) }}
                              onBlur={() => setEditing(null)}
                              className="h-7 rounded-md border border-input bg-background px-1 text-xs">
                              <option value="">Sin departamento</option>
                              {DEPARTAMENTOS.map((d) => <option key={d} value={d}>{d}</option>)}
                            </select>
                          ) : (
                            <button onClick={() => startEdit(g, "departamento")} title="Clic para editar">
                              {g.departamento ? <Badge variant="outline" className={cn("text-xs font-medium", deptoColors[g.departamento] || "")}>{g.departamento}</Badge> : <span className="text-muted-foreground/40 hover:text-foreground">— editar —</span>}
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <button onClick={() => deleteGasto(g)} disabled={saving === g.id} title="Eliminar"
                            className="text-muted-foreground/50 hover:text-red-500">
                            {saving === g.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
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
