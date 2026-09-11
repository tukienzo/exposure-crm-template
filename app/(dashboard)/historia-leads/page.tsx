"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import { Activity, ArrowRight, CalendarCheck, CheckCircle2, Clock3, ExternalLink, Instagram, Loader2, MessageCircle, Phone, Receipt, Search, Tags, UserRound, Video, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

const fetcher = async (url: string) => { const r = await fetch(url); const j = await r.json(); if (!r.ok) throw new Error(j.error); return j }
type Lead = { id: string; display_name: string | null; primary_phone: string | null; primary_instagram: string | null; agenda_count:number; first_agenda_at:string|null; last_agenda_at:string|null; calificacion:string|null; cuenta:string|null; has_chat:boolean; has_sales_fathom:boolean; has_onboarding_fathom:boolean; paid:boolean; has_content_trace:boolean; angles:string[]; cash:number; complete_trace:boolean }
const FILTERS = [{id:"all",label:"Todos"},{id:"chat",label:"Con resumen de chat"},{id:"sales_fathom",label:"Con Fathom de venta"},{id:"paid",label:"Pagaron"},{id:"onboarding_fathom",label:"Con Fathom de onboarding"},{id:"content",label:"Con trazabilidad de contenido"},{id:"complete",label:"Chat + Fathom + pago"}]

export default function LeadHistoryPage() {
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
  const [filter, setFilter] = useState("all")
  const [page, setPage] = useState(1)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const person = params.get("person")
    const q = params.get("q")
    if (person) setSelected(person)
    if (q) setQuery(q)
  }, [])
  const listParams = new URLSearchParams({ filter, page:String(page), ...(query ? { q:query } : {}) })
  const { data, isLoading, error } = useSWR<{ rows: Lead[]; totals: { agendas:number; people:number; chat:number; sales_fathom:number; paid:number; onboarding_fathom:number; content:number; complete:number }; pagination:{page:number;pages:number;total:number} }>("/api/leads?" + listParams, fetcher)
  const leads = data?.rows || []
  const pagination = data?.pagination
  const { data: detail, isLoading: loadingDetail } = useSWR(selected ? "/api/leads?id=" + selected : null, fetcher)
  const totals = data?.totals

  return <div className="page-enter mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8 xl:p-10">
    <section className="relative overflow-hidden rounded-[28px] bg-[#171316] p-6 text-white shadow-2xl shadow-black/10 sm:p-8">
      <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-violet-600/25 blur-3xl" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[.18em] text-violet-300">Trazabilidad completa</p><h1 className="mt-1 text-3xl font-bold tracking-[-.04em] sm:text-4xl">Historia clínica del lead</h1><p className="mt-2 max-w-2xl text-sm text-white/60">Desde la primera etiqueta o interacción fechada hasta agenda, venta, onboarding, consultorías y testimonios.</p></div>
        <div className="relative w-full max-w-md"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" /><Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nombre, teléfono o Instagram…" className="h-12 rounded-2xl border-white/10 bg-white/10 pl-11 text-white placeholder:text-white/35" />{query && <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/45"><X className="h-4 w-4" /></button>}</div>
      </div>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Agendas históricas" value={totals ? String(totals.agendas) : "—"} icon={CalendarCheck} /><Stat label="Leads únicos con agenda" value={totals ? String(totals.people) : "—"} icon={UserRound} /><Stat label="Con resumen de chat" value={totals ? String(totals.chat) : "—"} icon={MessageCircle} /><Stat label="Con Fathom de venta" value={totals ? String(totals.sales_fathom) : "—"} icon={Video} /></section>

    <section className="surface p-4"><p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filtrar por evidencia disponible</p><div className="flex flex-wrap gap-2">{FILTERS.map(item => <Button key={item.id} size="sm" variant={filter===item.id?"default":"outline"} onClick={()=>{setFilter(item.id);setPage(1)}}>{item.label}{item.id!=="all"&&totals ? ` · ${totals[item.id as keyof typeof totals]}` : ""}</Button>)}</div></section>

    <section className="surface overflow-hidden">
      <div className="flex items-center justify-between border-b p-5"><div><h2 className="text-lg font-bold">Leads con agenda</h2><p className="text-xs text-muted-foreground">{data?.pagination.total ?? "—"} resultados para este filtro</p></div><span className="text-xs text-muted-foreground">Página {data?.pagination.page || 1} de {data?.pagination.pages || 1}</span></div>
      {isLoading ? <div className="grid min-h-64 place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div> : error ? <div className="p-8 text-sm text-red-600">No se pudo cargar el historial.</div> : <div className="max-h-[70vh] divide-y overflow-y-auto">{leads.map(lead => <button key={lead.id} onClick={() => setSelected(lead.id)} className="group grid w-full gap-4 p-4 text-left transition hover:bg-muted/40 sm:grid-cols-[1.4fr_.7fr_.7fr_auto] sm:items-center sm:px-5">
        <div className="flex min-w-0 items-center gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-700 font-bold text-white">{(lead.display_name || "L").charAt(0)}</div><div className="min-w-0"><p className="truncate font-semibold">{lead.display_name || "Sin nombre"}</p><p className="truncate text-xs text-muted-foreground">{lead.primary_instagram ? "@" + lead.primary_instagram : lead.primary_phone || "Sin contacto registrado"}</p></div></div>
        <div><p className="text-xs text-muted-foreground">Historial de agenda</p><p className="text-sm font-semibold">{lead.agenda_count} {lead.agenda_count===1?"agenda":"agendas"} · {lead.last_agenda_at?date(lead.last_agenda_at):"Sin fecha"}</p></div><div className="flex flex-wrap gap-1">{lead.has_chat&&<Badge variant="secondary">Chat</Badge>}{lead.has_sales_fathom&&<Badge variant="secondary">Fathom</Badge>}{lead.paid&&<Badge variant="secondary">Pagó</Badge>}{lead.has_onboarding_fathom&&<Badge variant="secondary">Onboarding</Badge>}{lead.has_content_trace&&<Badge variant="secondary">Contenido</Badge>}</div><ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1" />
      </button>)}</div>}
      {pagination&&pagination.pages>1&&<div className="flex items-center justify-between border-t p-4"><Button variant="outline" size="sm" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Anterior</Button><span className="text-xs text-muted-foreground">{(page-1)*100+1}–{Math.min(page*100,pagination.total)} de {pagination.total}</span><Button variant="outline" size="sm" disabled={page>=pagination.pages} onClick={()=>setPage(p=>p+1)}>Siguiente</Button></div>}
    </section>

    <Dialog open={Boolean(selected)} onOpenChange={open => !open && setSelected(null)}><DialogContent className="flex h-[94dvh] w-[calc(100vw-1rem)] max-w-[1200px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1200px]"><DialogHeader className="shrink-0 border-b bg-background/95 px-6 py-5 pr-14 backdrop-blur"><DialogTitle>Historia clínica completa</DialogTitle></DialogHeader><div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">{loadingDetail || !detail ? <div className="grid min-h-56 place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div> : <LeadDetail detail={detail} />}</div></DialogContent></Dialog>
  </div>
}

function LeadDetail({ detail }: { detail: any }) {
  const p = detail.person
  const chronological = [...detail.events].reverse()
  const first = chronological.find((e:any) => ["followed","manychat_tag","content_viewed","content_replied","cta_replied","lead_created"].includes(e.event_type))
  const booked = chronological.find((e:any) => e.event_type === "call_booked")
  const showed = chronological.find((e:any) => e.event_type === "call_showed")
  const paid = chronological.find((e:any) => e.event_type === "payment_received")
  const onboarding = chronological.find((e:any) => ["client_entered","onboarding","onboarding_call"].includes(e.event_type))
  const lastConsultation = [...chronological].reverse().find((e:any) => e.event_type === "consultation")
  const lastTestimonial = [...chronological].reverse().find((e:any) => e.event_type === "testimonial")
  const grouped = STAGES.map(stage => ({ ...stage, events: chronological.filter((event:any) => (stage.types as string[]).includes(event.event_type) || stage.match?.(event.event_type)) })).filter(stage => stage.events.length)
  const coverage = [
    ["ManyChat", chronological.some((e:any) => e.source?.toLowerCase().includes("manychat") || e.event_type === "manychat_tag")],
    ["Agenda", Boolean(detail.agendas?.length)], ["Fathom", Boolean(detail.calls?.length || detail.agendas?.some((a:any) => a.link_fathom))],
    ["Post-pago", Boolean(detail.pagos?.length)], ["Onboarding", Boolean(onboarding)], ["Consultoría", Boolean(lastConsultation)], ["Testimonio", Boolean(detail.testimonials?.length)],
  ]
  return <div className="space-y-6">
    <div className="flex flex-col gap-4 rounded-2xl bg-muted/35 p-5 sm:flex-row sm:items-center"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-foreground text-xl font-bold text-background">{(p.display_name || "L").charAt(0)}</div><div className="min-w-0 flex-1"><h2 className="text-xl font-bold">{p.display_name || "Sin nombre"}</h2><p className="text-xs text-muted-foreground">Ficha creada {date(p.created_at)}</p></div><div className="flex flex-wrap gap-2">{detail.identities.map((i:any) => <Badge key={i.kind + ":" + i.value} variant="outline">{i.kind === "instagram" ? <Instagram className="mr-1 h-3 w-3" /> : i.kind === "phone" ? <Phone className="mr-1 h-3 w-3" /> : null}{i.value}</Badge>)}</div></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Mini label="Primer contacto" value={first ? dateTime(first.occurred_at) : "Sin fecha registrada"} /><Mini label="Agenda" value={booked ? dateTime(booked.occurred_at) : "Sin agenda registrada"} /><Mini label="Primer show" value={showed ? dateTime(showed.occurred_at) : "Sin show registrado"} /><Mini label="Primer pago" value={paid ? dateTime(paid.occurred_at) : "Sin pago registrado"} /><Mini label="Onboarding" value={onboarding ? dateTime(onboarding.occurred_at) : "Sin datos registrados"} /><Mini label="Última consultoría" value={lastConsultation ? dateTime(lastConsultation.occurred_at) : "Sin datos registrados"} /><Mini label="Último testimonio" value={lastTestimonial ? dateTime(lastTestimonial.occurred_at) : "Sin datos registrados"} /><Mini label="Tiempo contacto → agenda" value={first && booked ? duration((new Date(booked.occurred_at).getTime()-new Date(first.occurred_at).getTime())/3600000) : `Falta ${!first ? "primer contacto" : "fecha de agenda"}`} /></div>
    <div className="rounded-2xl border p-4"><h3 className="font-bold">Cobertura de trazabilidad</h3><p className="mt-1 text-xs text-muted-foreground">Disponible significa que existe evidencia vinculada a este ID. Faltante no equivale a cero.</p><div className="mt-3 flex flex-wrap gap-2">{coverage.map(([label,available]) => <Badge key={String(label)} variant={available ? "secondary" : "outline"}>{available ? "Disponible" : "Faltante"} · {label}</Badge>)}</div></div>
    {(detail.chat_summary || detail.agendas?.some((a:any) => a.resumen_chat)) && <details className="group rounded-2xl border"><summary className="cursor-pointer list-none px-5 py-4 font-bold"><span className="inline-flex items-center gap-2"><MessageCircle className="h-4 w-4 text-violet-600" />Abrir historial y resumen del chat</span></summary><div className="border-t px-5 py-4">{detail.chat_summary?.summary ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{detail.chat_summary.summary}</p> : detail.agendas.filter((a:any) => a.resumen_chat).map((a:any) => <p key={a.id} className="mb-4 whitespace-pre-wrap text-sm leading-relaxed">{a.resumen_chat}</p>)}</div></details>}
    <div><h3 className="mb-3 font-bold">Línea de tiempo por etapa</h3><div className="space-y-5">{grouped.map(stage => <section key={stage.id} className="overflow-hidden rounded-2xl border"><div className="border-b bg-muted/35 px-4 py-3"><p className="font-bold">{stage.label}</p><p className="text-xs text-muted-foreground">{stage.description}</p></div><div className="divide-y">{stage.events.map((event:any) => <TimelineEvent key={event.id} event={event} />)}</div></section>)}</div></div>
  </div>
}

function Stat({label,value,icon:Icon}:{label:string;value:string;icon:typeof Activity}) { return <div className="surface p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold tracking-tight">{value}</p></div><span className="rounded-xl bg-violet-500/10 p-2.5 text-violet-600"><Icon className="h-4 w-4" /></span></div></div> }
function Mini({label,value}:{label:string;value:string}) { return <div className="rounded-2xl border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-bold">{value}</p></div> }
const STAGES = [
  { id: "contact", label: "1. Primer contacto e interés", description: "Etiquetas, seguimiento e interacciones con contenido antes de agendar.", types: ["followed","manychat_tag","content_viewed","content_replied","content_attributed","cta_replied","sales_angle"] },
  { id: "setting", label: "2. Setting y agenda", description: "Ingreso como lead, conversación comercial y reserva de llamada.", types: ["lead_created","call_booked"] },
  { id: "sale", label: "3. Llamada y venta", description: "Presentación, resultado de la call y cobros realizados.", types: ["call_showed","call_no_show","recorded_call","payment_received"] },
  { id: "delivery", label: "4. Ingreso y entrega", description: "Alta como cliente, onboarding y avance dentro del programa.", types: ["client_entered","onboarding","onboarding_call","onboarding_step"] },
  { id: "evolution", label: "5. Evolución y prueba", description: "Consultorías, continuidad, resultados, testimonios y clips.", types: ["consultation","upsell","resell","offboarding","testimonial","testimonial_clip"] },
  { id: "other", label: "6. Otros registros", description: "Información vinculada que todavía no tiene una etapa operativa específica.", types: [], match: (type:string) => !["followed","manychat_tag","content_viewed","content_replied","content_attributed","cta_replied","sales_angle","lead_created","call_booked","call_showed","call_no_show","recorded_call","payment_received","client_entered","onboarding","onboarding_call","onboarding_step","consultation","upsell","resell","offboarding","testimonial","testimonial_clip"].includes(type) },
]

const HUMAN_FIELDS: Record<string,string> = { cuenta:"Cuenta", recurso:"Contenido/recurso", puntos_contacto:"Puntos de contacto", setter:"Setter", closer:"Closer", calificacion:"Calificación", resultado:"Resultado", monto_usd:"Monto cobrado", tipo:"Tipo de pago", programa:"Programa", medio:"Medio de pago", resumen:"Resumen", cita:"Cita", timestamp:"Timestamp", estado:"Estado", edicion:"Edición" }
const TECHNICAL_KEYS = /^(utm|utm_|source_|dedupe|raw|payload|id$|external|confidence|confianza|requiere_revision|manychat)/i

function eventAction(event:any) {
  const metadata = event.metadata || {}
  const url = metadata.loom_url || metadata.fathom_url || metadata.url || metadata.loom
  if (!url || !/^https?:\/\//i.test(String(url))) return null
  const label = event.event_type === "testimonial" ? "Abrir testimonio" : event.event_type.includes("call") || event.event_type === "consultation" ? "Abrir llamada" : event.event_type === "testimonial_clip" ? "Abrir pieza" : "Abrir fuente"
  return { url: String(url), label }
}

function TimelineEvent({ event }: { event:any }) {
  const entries = Object.entries(event.metadata || {}).filter(([key,value]) => value != null && value !== "" && HUMAN_FIELDS[key])
  const technical = Object.entries(event.metadata || {}).filter(([key,value]) => value != null && value !== "" && !HUMAN_FIELDS[key] && (TECHNICAL_KEYS.test(key) || typeof value === "object"))
  const action = eventAction(event)
  return <article className="flex gap-3 p-4"><span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full border bg-background">{eventIcon(event.event_type)}</span><div className="min-w-0 flex-1"><div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-semibold">{event.title || eventLabel(event.event_type)}</p><p className="text-xs text-muted-foreground">{humanSource(event.source)}</p></div><time className="shrink-0 text-xs font-medium text-muted-foreground">{dateTime(event.occurred_at)}</time></div>{entries.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2">{entries.map(([key,value]) => <div key={key} className="rounded-xl bg-muted/35 px-3 py-2 text-xs"><span className="font-semibold">{HUMAN_FIELDS[key]}:</span> {humanValue(key,value)}</div>)}</div>}<div className="mt-3 flex flex-wrap items-center gap-2">{action && <Button asChild size="sm" variant="outline"><a href={action.url} target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-3.5 w-3.5" />{action.label}</a></Button>}{technical.length > 0 && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Ver detalles técnicos</summary><p className="mt-2 max-w-2xl break-words rounded-lg bg-muted/30 p-2">{technical.map(([key,value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`).join(" · ")}</p></details>}</div></div></article>
}

function humanSource(value:string) { const source=String(value||"Registro"); if(/manychat/i.test(source)) return "ManyChat"; if(/fathom/i.test(source)) return "Llamada grabada en Fathom"; if(/loom/i.test(source)) return "Consultoría grabada en Loom"; if(/crm pagos/i.test(source)) return "Registro de pagos"; if(/crm clientes/i.test(source)) return "Ficha del cliente"; return source }
function humanValue(key:string,value:unknown) { if(key==="monto_usd") return `USD ${Number(value).toLocaleString("es-AR")}`; if(typeof value==="boolean") return value?"Sí":"No"; if(typeof value==="object") return "Ver detalles técnicos"; return String(value) }
function duration(h:number) { if (h < 24) return Math.round(h) + " h"; const d=h/24; return d<14 ? d.toFixed(1) + " días" : Math.round(d/7) + " sem" }
function date(v:string) { const parsed=new Date(v); return Number.isNaN(parsed.getTime())?"Sin fecha registrada":parsed.toLocaleDateString("es-AR",{day:"2-digit",month:"short",year:"numeric"}) }
function dateTime(v:string) { const parsed=new Date(v); if(Number.isNaN(parsed.getTime())) return "Sin fecha registrada"; const hasTime=/T\d{2}:\d{2}/.test(String(v)); return hasTime?parsed.toLocaleString("es-AR",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}):parsed.toLocaleDateString("es-AR",{day:"2-digit",month:"short",year:"numeric"}) }
function eventIcon(t:string) { if(t==="payment_received") return <Receipt className="h-4 w-4 text-emerald-600"/>; if(t==="testimonial"||t==="testimonial_clip") return <Video className="h-4 w-4 text-violet-600"/>; if(t.includes("call")||t==="consultation") return <CalendarCheck className="h-4 w-4 text-blue-600"/>; if(t.includes("content")||t.includes("cta")) return <MessageCircle className="h-4 w-4 text-violet-600"/>; if(t.includes("tag")||t.includes("angle")) return <Tags className="h-4 w-4 text-fuchsia-500"/>; if(t.includes("onboarding")||t.includes("offboarding")||t==="client_entered") return <CheckCircle2 className="h-4 w-4 text-orange-600"/>; return <Activity className="h-4 w-4"/> }
function eventLabel(t:string) { return ({followed:"Siguió la cuenta",manychat_tag:"Etiqueta ManyChat",sales_angle:"Ángulo identificado",content_viewed:"Vio contenido",content_replied:"Respondió contenido",cta_replied:"Respondió CTA",lead_created:"Ingresó como lead",call_booked:"Agendó llamada",call_showed:"Se presentó",call_no_show:"No se presentó",payment_received:"Pagó",client_entered:"Ingresó como cliente",onboarding:"Onboarding",onboarding_call:"Call de onboarding",onboarding_step:"Paso de onboarding",consultation:"Consultoría",recorded_call:"Llamada registrada",testimonial:"Testimonio detectado",testimonial_clip:"Clip de testimonio",upsell:"Upsell",resell:"Resell",offboarding:"Offboarding"} as Record<string,string>)[t] || t }
