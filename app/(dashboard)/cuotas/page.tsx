"use client"
import { CLOSERS_ACTIVOS } from "@/lib/equipo"

import { useState } from "react"
import useSWR, { mutate } from "swr"
import { DateFilter } from "@/components/date-filter"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Loader2, FileText, Video, Download, CalendarClock, CircleDollarSign, Coins, Gauge, SearchX, UserRound, Phone, BriefcaseBusiness, CreditCard } from "lucide-react"
import type { Cuota } from "@/lib/supabase"
import { OPERACION_LABELS as OPERACION } from "@/lib/operaciones"
import { exportRowsToXLSX } from "@/lib/csv-export"
import { CrmEmpty, CrmPageIntro, CrmStat } from "@/components/crm-ui"
import { useSession } from "@/components/session-provider"
import { canExportRole } from "@/lib/export-access"
import { MultiSelectFilter } from "@/components/ui/multi-select-filter"

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const ESTADO = ["Por Cobrar","Cobrado","No Paga","Pago Dividido","Paga Tarde","Protocolo","Completó PIF"]
const MEDIO_PAGO = ["Stripe (Tarjeta)","Pesos (SEOS)","USDT (TRC20)","Efectivo USD","Western Union","Efectivo ARS","Pesos (GOAT)","Binance (USD)","USD (CTA PA)","Paypal USD (PA)","Transferencia Bancaria USD","Transferencia USD (cuenta B)"]
const CLOSERS = [...CLOSERS_ACTIVOS, "Sin Closer"]

function normNombre(s: string): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
}

const estadoColors: Record<string, string> = {
  "Por Cobrar":"bg-amber-500/10 text-amber-600 border-amber-500/30",
  "Cobrado":"bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  "No Paga":"bg-red-500/10 text-red-600 border-red-500/30",
  "Pago Dividido":"bg-purple-500/10 text-purple-600 border-purple-500/30",
  "Paga Tarde":"bg-yellow-500/10 text-yellow-700 border-yellow-500/30",
  "Protocolo":"bg-slate-500/10 text-slate-600 border-slate-500/30",
  "Completó PIF":"bg-indigo-500/10 text-indigo-600 border-indigo-500/30",
  "Pendiente":"bg-amber-500/10 text-amber-600 border-amber-500/30",
  "Pagado":"bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  "Vencido":"bg-red-500/10 text-red-600 border-red-500/30",
}

function filterToParams(filter: string): string {
  if (!filter || filter === "all") return ""
  if (filter.startsWith("range:")) { const [s,e]=filter.slice(6).split(":"); return `?start=${s}&end=${e}` }
  const now=new Date(); const today=new Date(now.getFullYear(),now.getMonth(),now.getDate())
  const iso=(d:Date)=>d.toISOString().split("T")[0]
  if (filter.startsWith("month:")) { const [y,m]=filter.slice(6).split("-").map(Number); return `?start=${iso(new Date(y,m-1,1))}&end=${iso(new Date(y,m,0))}` }
  const som=new Date(today.getFullYear(),today.getMonth(),1); const eom=new Date(today.getFullYear(),today.getMonth()+1,0)
  const solm=new Date(today.getFullYear(),today.getMonth()-1,1); const eolm=new Date(today.getFullYear(),today.getMonth(),0)
  switch(filter){
    case "today": return `?start=${iso(today)}&end=${iso(today)}`
    case "this-week": { const w=new Date(today); w.setDate(today.getDate()-today.getDay()); return `?start=${iso(w)}&end=${iso(today)}` }
    case "this-month": return `?start=${iso(som)}&end=${iso(eom)}`
    case "last-month": return `?start=${iso(solm)}&end=${iso(eolm)}`
    case "this-year": return `?start=${iso(new Date(today.getFullYear(),0,1))}&end=${iso(today)}`
    default: return ""
  }
}

function parseLocalDate(str: string | null): Date | null {
  if (!str) return null; const s=str.split("T")[0]; const p=s.split("-").map(Number)
  if (p.length!==3) return null; return new Date(p[0],p[1]-1,p[2])
}

async function patchCuota(id: number | string, updates: Record<string, unknown>, apiUrl: string) {
  await fetch("/api/cuotas", { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({id,...updates}) })
  await mutate(apiUrl)
}

function InlineSelect({ cuotaId, field, value, options, getColor, apiUrl }: { cuotaId:number|string; field:string; value:string|null|undefined; options:string[]; getColor?:(v:string)=>string; apiUrl:string }) {
  const [loading,setLoading]=useState(false)
  const handleChange=async(v:string)=>{ setLoading(true); await patchCuota(cuotaId,{[field]:v},apiUrl); setLoading(false) }
  if(loading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground"/>
  const color=getColor?getColor(value||""):""
  return (
    <Select value={value||""} onValueChange={handleChange}>
      <SelectTrigger className={cn("h-7 text-xs px-2 border rounded min-w-[120px] w-auto focus:ring-0 gap-1",color||"border-border text-foreground")}><SelectValue placeholder="—"/></SelectTrigger>
      <SelectContent>{options.map(o=><SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
    </Select>
  )
}

function InlineMonto({ cuotaId, value, apiUrl, field = "monto" }: { cuotaId:number|string; value:number|null|undefined; apiUrl:string; field?:string }) {
  const [v,setV]=useState(value!=null?String(value):""); const [loading,setLoading]=useState(false)
  const handleBlur=async()=>{ const num=v!==""?parseFloat(v):null; if(num===value) return; setLoading(true); await patchCuota(cuotaId,{[field]:num},apiUrl); setLoading(false) }
  return (
    <div className="flex items-center gap-1">
      <span className="text-sm text-muted-foreground">$</span>
      <input type="number" step="0.01" className="w-20 text-sm font-semibold bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none" value={v} onChange={e=>setV(e.target.value)} onBlur={handleBlur}/>
      {loading&&<Loader2 className="h-3 w-3 animate-spin text-muted-foreground"/>}
    </div>
  )
}

function PlanDePagoButton({ value }: { value: string | null | undefined }) {
  if (!value || !value.trim()) {
    return <span className="text-xs text-muted-foreground">—</span>
  }
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
          <FileText className="h-3.5 w-3.5" />
          Ver plan
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Plan de Pago</DialogTitle>
        </DialogHeader>
        <div className="whitespace-pre-wrap text-sm text-foreground max-h-[60vh] overflow-y-auto">
          {value}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function fmtMoney(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-AR")
}

function InlineFecha({ cuotaId, value, apiUrl }: { cuotaId:number|string; value:string|null; apiUrl:string }) {
  const [loading,setLoading]=useState(false)
  const handleChange=async(e:React.ChangeEvent<HTMLInputElement>)=>{ const nv=e.target.value||null; if(nv===(value?.split("T")[0]||null)) return; setLoading(true); await patchCuota(cuotaId,{fecha_vencimiento:nv},apiUrl); setLoading(false) }
  return (
    <div className="flex items-center gap-1">
      <input type="date" defaultValue={value?.split("T")[0]||""} onChange={handleChange} className="text-sm bg-transparent border border-transparent hover:border-border focus:border-primary focus:outline-none rounded px-1 cursor-pointer"/>
      {loading&&<Loader2 className="h-3 w-3 animate-spin text-muted-foreground"/>}
    </div>
  )
}

export default function CuotasPage() {
  const { rol } = useSession()
  const canExport = canExportRole(rol)
  const [dateFilter, setDateFilter] = useState("all")
  const [closerFiltro, setCloserFiltro] = useState<string[]>([])
  const params = filterToParams(dateFilter)
  const apiUrl = `/api/cuotas${params}`
  const { data: cuotasRaw = [], isLoading, error } = useSWR<Cuota[]>(apiUrl, fetcher)
  const { data: agendasLight } = useSWR<any[]>("/api/agendas?light=1", fetcher)

  const fathomByCliente = new Map<string, string>()
  for (const a of agendasLight || []) {
    if (a.link_fathom) fathomByCliente.set(normNombre(a.nombre), a.link_fathom)
  }

  const cuotas = closerFiltro.length === 0 ? cuotasRaw : cuotasRaw.filter((c) => closerFiltro.includes(c.closer || ""))

  const totalACobrar=cuotas.reduce((s,c)=>s+Number(c.monto||0),0)
  const totalCobrado=cuotas.reduce((s,c)=>s+Number(c.monto_cobrado||0),0)
  const aovCuotas=cuotas.length>0?totalACobrar/cuotas.length:0
  const pctCobrado=totalACobrar>0?(totalCobrado/totalACobrar)*100:0
  const getEstadoColor=(v:string)=>estadoColors[v]||"border-border text-foreground"

  const csvColumns = [
    { label: "Cliente", get: (c: Cuota) => c.cliente },
    { label: "Telefono", get: (c: Cuota) => c.telefono },
    { label: "Operacion", get: (c: Cuota) => c.operacion },
    { label: "Monto Cuota", get: (c: Cuota) => c.monto },
    { label: "Monto Cobrado", get: (c: Cuota) => c.monto_cobrado },
    { label: "Fecha Vencimiento", get: (c: Cuota) => c.fecha_vencimiento },
    { label: "Estado", get: (c: Cuota) => c.estado },
    { label: "Medio de Pago", get: (c: Cuota) => c.medio_de_pago },
    { label: "Closer", get: (c: Cuota) => c.closer },
    { label: "Fathom", get: (c: Cuota) => fathomByCliente.get(normNombre(c.cliente || "")) || "" },
  ]

  return (
    <div className="crm-module-page">
      <CrmPageIntro
        eyebrow="Cobranza"
        title="Cuotas"
        description=""
        icon={<CalendarClock className="h-6 w-6" />}
        tone="amber"
        actions={<>
          <div className="[&_button]:h-11 [&_button]:border-white/10 [&_button]:bg-white/10 [&_button]:text-white"><MultiSelectFilter values={closerFiltro} options={CLOSERS} onChange={setCloserFiltro} /></div>
          <div className="[&_button]:border-white/10 [&_button]:bg-white/10 [&_button]:text-white"><DateFilter onFilterChange={setDateFilter} defaultFilter="all"/></div>
          {canExport && <button
            onClick={() => exportRowsToXLSX(cuotas, csvColumns, `cuotas_${new Date().toISOString().slice(0, 10)}`)}
            title="Exporta exactamente lo que estás viendo, con los filtros aplicados"
            className="flex h-11 items-center gap-1.5 rounded-xl border border-white/10 bg-white/10 px-3 text-sm font-bold text-white/75 transition hover:bg-white/15 hover:text-white">
            <Download className="h-3.5 w-3.5" />Exportar
          </button>}
        </>}
      />
      <div className="crm-kpis">
        <CrmStat label="Total a cobrar" value={fmtMoney(totalACobrar)} detail={`${cuotas.length} cuotas en vista`} icon={<CircleDollarSign className="h-5 w-5" />} tone="amber" />
        <CrmStat label="Cobrado" value={fmtMoney(totalCobrado)} detail={`${fmtMoney(Math.max(totalACobrar-totalCobrado, 0))} pendientes`} icon={<Coins className="h-5 w-5" />} tone="emerald" />
        <CrmStat label="AOV cuotas" value={fmtMoney(aovCuotas)} detail="ticket promedio del período" icon={<Gauge className="h-5 w-5" />} tone="blue" />
        <CrmStat label="Avance" value={totalACobrar>0?`${pctCobrado.toFixed(1)}%`:"0%"} detail="del monto previsto" icon={<CreditCard className="h-5 w-5" />} tone={pctCobrado >= 80 ? "emerald" : "violet"} />
      </div>
      <section className="crm-data-panel">
        <div className="crm-data-panel-header">
          <div><h2 className="crm-section-title">Calendario del período</h2><p className="mt-1 text-xs text-muted-foreground">Fuente canónica: planes de pago. Editá estado, monto, fecha y responsable directamente en cada cuota.</p></div>
          <span className="rounded-full border border-black/[.06] bg-black/[.035] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground dark:border-white/10 dark:bg-white/[.05]">{cuotas.length} registros</span>
        </div>
        <div className="p-3 sm:p-4">
          {isLoading?<div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground"/></div>
          :error?<CrmEmpty icon={<SearchX className="h-5 w-5" />} title="No pudimos cargar las cuotas" detail="Reintentá en unos segundos o cambiá el período." />
          :cuotas.length===0?<CrmEmpty icon={<CalendarClock className="h-5 w-5" />} title="Período sin cuotas" detail="No hay vencimientos que coincidan con estos filtros." />
          :(
            <div className="grid gap-3 xl:grid-cols-2">
                  {cuotas.map((c)=>{
                    const fathomLink = fathomByCliente.get(normNombre(c.cliente || ""))
                    return (
                    <article key={c.id} className="group rounded-[22px] border border-black/[.055] bg-white/62 p-4 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-amber-500/20 hover:shadow-xl dark:border-white/[.07] dark:bg-white/[.025]">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-400/5 text-amber-700 dark:text-amber-300"><UserRound className="h-5 w-5" /></span>
                          <div className="min-w-0"><h3 className="truncate text-sm font-black">{c.cliente}</h3><p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground"><Phone className="h-3 w-3" />{c.telefono || "Sin teléfono"}</p></div>
                        </div>
                        <InlineSelect cuotaId={c.id!} field="estado" value={c.estado} options={ESTADO} getColor={getEstadoColor} apiUrl={apiUrl}/>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-black/[.04] bg-black/[.025] p-3 dark:border-white/[.05] dark:bg-white/[.025] sm:grid-cols-3">
                        <div><p className="crm-stat-label">Cuota</p><InlineMonto cuotaId={c.id!} value={c.monto} apiUrl={apiUrl}/></div>
                        <div><p className="crm-stat-label">Cobrado</p><InlineMonto cuotaId={c.id!} value={c.monto_cobrado} apiUrl={apiUrl} field="monto_cobrado"/></div>
                        <div className="col-span-2 sm:col-span-1"><p className="crm-stat-label">Vencimiento</p><InlineFecha cuotaId={c.id!} value={c.fecha_vencimiento} apiUrl={apiUrl}/></div>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div><p className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground"><BriefcaseBusiness className="h-3 w-3" />Operación</p><InlineSelect cuotaId={c.id!} field="operacion" value={c.operacion} options={OPERACION} apiUrl={apiUrl}/></div>
                        <div><p className="mb-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Medio de pago</p><InlineSelect cuotaId={c.id!} field="medio_de_pago" value={c.medio_de_pago} options={MEDIO_PAGO} apiUrl={apiUrl}/></div>
                        <div><p className="mb-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Closer</p><InlineSelect cuotaId={c.id!} field="closer" value={c.closer} options={c.closer && !CLOSERS.includes(c.closer) ? [c.closer, ...CLOSERS] : CLOSERS} apiUrl={apiUrl}/></div>
                        <div className="flex items-end gap-2"><PlanDePagoButton value={c.plan_de_pago}/>
                        {fathomLink ? (
                          <a href={fathomLink} target="_blank" rel="noopener noreferrer"
                            className="inline-flex h-7 items-center gap-1 rounded-lg border border-red-500/15 bg-red-500/5 px-2 text-xs font-bold text-primary transition hover:bg-red-500/10">
                            <Video className="h-3.5 w-3.5" />Ver
                          </a>
                        ) : null}</div>
                      </div>
                    </article>
                    )
                  })}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
