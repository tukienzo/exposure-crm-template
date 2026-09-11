"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { CheckCircle2, CircleAlert, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CrmPageIntro, CrmStat } from "@/components/crm-ui"

type Issue = { issue_key:string; entity_type:string; entity_id:string; issue_type:string; severity:string; assigned_role:string; owner_name:string; entity_name:string; occurred_at:string|null; due_at:string; is_overdue:boolean; evidence:Record<string,unknown>; status:string }
type QueueResponse = { data: Issue[]; pagination: { page:number; pageSize:number; total:number; totalPages:number; hasNext:boolean } }
const fetcher = (url:string) => fetch(url).then(async r => { const j=await r.json(); if(!r.ok) throw new Error(j.error); return j })

export default function CalidadDatosPage(){
  const [page,setPage]=useState(1)
  const [role,setRole]=useState("Todos")
  const {data:response,error,isLoading,mutate}=useSWR<QueueResponse>(`/api/data-quality?status=open&page=${page}&pageSize=100${role==="Todos"?"":`&role=${encodeURIComponent(role)}`}`,fetcher)
  const data=response?.data||[]
  const rows=useMemo(()=>role==="Todos"?data:data.filter(x=>x.assigned_role===role),[data,role])
  const high=data.filter(x=>x.severity==="alta").length
  async function resolve(issue:Issue,status:"resolved"|"ignored"){
    const response=await fetch("/api/data-quality",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({issue_key:issue.issue_key,status})})
    if(response.ok) mutate()
  }
  return <div className="crm-module-page">
    <CrmPageIntro eyebrow="Control operativo" title="Calidad de datos" description="Una sola cola para excepciones de agendas, pagos, Fathom, clientes y contenido." icon={<ShieldCheck className="h-6 w-6"/>} tone="violet"/>
    <div className="crm-kpis"><CrmStat label="Pendientes" value={response?.pagination.total||0} detail="excepciones verificables" icon={<CircleAlert className="h-5 w-5"/>} tone="violet"/><CrmStat label="Prioridad alta" value={high} detail="en esta página" icon={<CircleAlert className="h-5 w-5"/>} tone="neutral"/><CrmStat label="Áreas" value={new Set(data.map(x=>x.entity_type)).size} detail="en esta página" icon={<CheckCircle2 className="h-5 w-5"/>} tone="emerald"/></div>
    <div className="flex gap-2 overflow-x-auto">{["Todos","Setter","Closer","Manager MKT","CSM"].map(x=><Button key={x} size="sm" variant={role===x?"default":"outline"} onClick={()=>{setRole(x);setPage(1)}}>{x}</Button>)}</div>
    {error&&<div className="rounded-xl border border-red-500/30 p-4 text-red-500">{error.message}</div>}
    {isLoading?<div className="p-8 text-muted-foreground">Cargando controles…</div>:<div className="overflow-hidden rounded-2xl border border-border bg-card">
      {rows.map(issue=><div key={issue.issue_key} className="grid gap-3 border-b border-border p-4 last:border-0 lg:grid-cols-[130px_1fr_180px_210px] lg:items-center">
        <div className="space-y-1"><Badge variant="outline" className={issue.severity==="alta"?"border-red-500/30 text-red-600":"border-amber-500/30 text-amber-600"}>{issue.severity}</Badge><p className={`text-xs ${issue.is_overdue?"font-bold text-red-600":"text-muted-foreground"}`}>{issue.is_overdue?"SLA vencido":"Vence"} · {new Date(issue.due_at).toLocaleString("es-AR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</p></div>
        <div><p className="font-bold">{issue.issue_type}</p><p className="text-sm text-muted-foreground">{issue.entity_name} · {issue.entity_type}</p></div>
        <div className="text-sm"><p className="font-medium">{issue.assigned_role}</p>{issue.owner_name&&<p className="text-muted-foreground">{issue.owner_name}</p>}</div>
        <div className="flex gap-2"><Button size="sm" onClick={()=>resolve(issue,"resolved")}>Resuelto</Button><Button size="sm" variant="outline" onClick={()=>resolve(issue,"ignored")}>No aplica</Button></div>
      </div>)}
      {!rows.length&&<div className="p-10 text-center text-emerald-600"><CheckCircle2 className="mx-auto mb-2 h-8 w-8"/>Sin pendientes en este filtro.</div>}
    </div>}
    {(response?.pagination.totalPages||1)>1&&<div className="flex items-center justify-center gap-3"><Button variant="outline" disabled={page<=1} onClick={()=>setPage(value=>value-1)}>Anterior</Button><span className="text-sm text-muted-foreground">Página {page} de {response?.pagination.totalPages}</span><Button variant="outline" disabled={!response?.pagination.hasNext} onClick={()=>setPage(value=>value+1)}>Siguiente</Button></div>}
  </div>
}
