"use client"

import useSWR from "swr"
import { Activity, AlertTriangle, Database, Loader2, RefreshCw, Workflow } from "lucide-react"
import { Button } from "@/components/ui/button"

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || "Error")
  return data
}

export default function OperacionesTecnicasPage() {
  const { data, error, isLoading, mutate } = useSWR("/api/operations-health", fetcher, { refreshInterval: 60000 })
  const refresh = async () => {
    await fetch("/api/operations-health", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
    await mutate()
  }
  return <div className="mx-auto max-w-[1400px] space-y-6 p-4 sm:p-6 lg:p-8">
    <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-violet-500">Solo Cuenta A / Cuenta B</p><h1 className="mt-1 text-3xl font-bold">Operación técnica</h1><p className="mt-2 text-sm text-muted-foreground">Colas, errores, latencia, caché y avisos de las últimas 24 horas.</p></div><Button onClick={refresh} variant="outline"><RefreshCw className="mr-2 h-4 w-4" />Refrescar señales</Button></div>
    {isLoading ? <div className="grid min-h-64 place-items-center"><Loader2 className="h-7 w-7 animate-spin" /></div> : error ? <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5 text-red-600">No se pudo leer observabilidad.</div> : <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Workflow} label="Jobs 24h" value={data.jobs.total24h} />
        <Metric icon={AlertTriangle} label="Jobs con error" value={data.jobs.errors} danger={data.jobs.errors > 0} />
        <Metric icon={Activity} label="Latencia API p95" value={data.api.p95Ms == null ? "—" : `${data.api.p95Ms} ms`} />
        <Metric icon={Database} label="Cachés activos" value={data.cache.length} />
      </div>
      <section className="rounded-2xl border bg-card p-5"><h2 className="font-bold">Integraciones recientes</h2><div className="mt-4 space-y-2">{data.jobs.rows.length ? data.jobs.rows.map((row: any, index: number) => <div key={`${row.provider}-${row.created_at}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/40 px-4 py-3 text-sm"><span className="font-semibold">{row.provider}</span><span>{row.status} · intento {row.attempts}</span><span className="text-muted-foreground">{row.duration_ms == null ? "—" : `${row.duration_ms} ms`}</span></div>) : <p className="text-sm text-muted-foreground">Todavía no hay jobs instrumentados en esta ventana.</p>}</div></section>
    </>}
  </div>
}

function Metric({ icon: Icon, label, value, danger }: { icon: typeof Activity; label: string; value: string | number; danger?: boolean }) {
  return <article className={`rounded-2xl border bg-card p-5 ${danger ? "border-red-500/30" : ""}`}><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{label}</p><Icon className={`h-5 w-5 ${danger ? "text-red-500" : "text-violet-500"}`} /></div><p className="mt-4 text-3xl font-bold">{value}</p></article>
}
