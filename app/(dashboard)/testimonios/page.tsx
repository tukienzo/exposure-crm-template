"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { Check, CheckCircle2, ChevronsUpDown, Clapperboard, Download, ExternalLink, Loader2, Pencil, RotateCcw, Search, Sparkles, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useSession } from "@/components/session-provider"
import { isContentOnlyAccount } from "@/lib/role-access"

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || "Error")
  return data
}

const statusLabels: Record<string, string> = { detected: "Detectado", reviewed: "Revisado", published: "Publicado", discarded: "Archivado" }
const categoryLabels: Record<string, string> = {
  resultado: "Resultado", agradecimiento: "Agradecimiento", antes_despues: "Antes / después",
  cambio_emocional: "Cambio emocional", objecion_superada: "Objeción superada",
}

function time(seconds: number) {
  const total = Math.max(0, Math.floor(seconds || 0))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`
}

export default function TestimoniosPage() {
  const session = useSession()
  const isContentOnly = isContentOnlyAccount(session.email.toLowerCase())
  const [status, setStatus] = useState("all")
  const [category, setCategory] = useState("all")
  const [editStatus, setEditStatus] = useState("all")
  const [search, setSearch] = useState("")
  const [saving, setSaving] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<Record<string, "CUENTA_A" | "CUENTA_B">>({})
  const params = useMemo(() => {
    const value = new URLSearchParams()
    if (status !== "all") value.set("status", status)
    if (category !== "all") value.set("category", category)
    if (editStatus !== "all") value.set("edit_status", editStatus)
    if (search.trim()) value.set("q", search.trim())
    return value.toString()
  }, [status, category, editStatus, search])
  const { data, error, isLoading, mutate } = useSWR(`/api/testimonios?${params}`, fetcher, { refreshInterval: 30000 })
  const { data: clientData } = useSWR("/api/testimonios?mode=clients", fetcher)

  const changeStatus = async (id: string, next: string) => {
    setSaving(id)
    const response = await fetch("/api/testimonios", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: next }) })
    if (response.ok) {
      await mutate((current: any) => {
        if (!current) return current
        const staysVisible = status === next || (status === "all" && next !== "discarded")
        return { ...current, rows: staysVisible ? current.rows.map((row: any) => row.id === id ? { ...row, status: next } : row) : current.rows.filter((row: any) => row.id !== id) }
      }, { revalidate: true })
    }
    setSaving(null)
  }

  const changeEditStatus = async (id: string, next: "pending" | "edited") => {
    setSaving(id)
    const response = await fetch("/api/testimonios", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, edit_status: next }) })
    if (response.ok) await mutate()
    setSaving(null)
  }

  const importToContent = async (id: string) => {
    setSaving(id)
    const response = await fetch("/api/testimonios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, content_account: isContentOnly ? "CUENTA_B" : (accounts[id] || "CUENTA_A") }) })
    if (response.ok) await mutate()
    setSaving(null)
  }

  const assignClient = async (id: string, personId: string) => {
    setSaving(id)
    const response = await fetch("/api/testimonios", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, person_id: personId }) })
    if (response.ok) await mutate()
    setSaving(null)
  }

  return <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8">
    <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div><p className="text-xs font-bold uppercase tracking-[.18em] text-violet-500">Consultorías Loom</p><h1 className="mt-1 text-3xl font-bold">Banco de Testimonios</h1><p className="mt-2 text-sm text-muted-foreground">Resultados y agradecimientos detectados con cita exacta, timestamp y acceso directo al video.</p></div>
      <Button asChild variant="outline"><a href="/api/testimonios?export=doc"><Download className="mr-2 h-4 w-4" />Exportar documento</a></Button>
    </header>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Metric label="Consultorías" value={data?.consultations ?? "—"} />
      <Metric label="Testimonios" value={(data?.totals?.detected ?? 0) + (data?.totals?.reviewed ?? 0) + (data?.totals?.published ?? 0)} />
      <Metric label="Importados" value={data?.totals?.imported ?? "—"} />
      <Metric label="Pendientes edición" value={data?.totals?.pending_edit ?? "—"} />
      <Metric label="Editados" value={data?.totals?.edited ?? "—"} />
    </section>

    <section className="grid gap-3 rounded-2xl border bg-card p-4 md:grid-cols-[1fr_210px_190px_210px]">
      <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar persona, resultado o frase…" /></div>
      <select className="h-10 rounded-md border bg-background px-3 text-sm" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Todas las categorías</option>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select className="h-10 rounded-md border bg-background px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Activos · todos los estados</option><option value="detected">Detectados</option><option value="reviewed">Revisados</option><option value="published">Publicados</option><option value="discarded">Archivados</option></select>
      <select className="h-10 rounded-md border bg-background px-3 text-sm" value={editStatus} onChange={(event) => setEditStatus(event.target.value)}><option value="all">Toda la edición</option><option value="not_imported">Sin importar</option><option value="pending">Pendiente de edición</option><option value="edited">Editado</option></select>
    </section>

    {isLoading ? <div className="grid min-h-72 place-items-center"><Loader2 className="h-8 w-8 animate-spin" /></div> : error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-red-600">No se pudo cargar el banco.</div> : !data?.rows?.length ? <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">Todavía no hay candidatos para estos filtros.</div> : <div className="grid gap-4 xl:grid-cols-2">
      {data.rows.map((row: any) => <article key={row.id} className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex flex-wrap gap-2"><Badge>{categoryLabels[row.category] || row.category}</Badge><Badge>{statusLabels[row.status] || row.status}</Badge><Badge>Fuerza {row.strength}/5</Badge>{row.content_asset_id && <Badge>Contenido {row.content_account}</Badge>}{row.edit_status === "pending" && <Badge>Pendiente de edición</Badge>}{row.edit_status === "edited" && <Badge>Editado</Badge>}</div><span className="text-xs text-muted-foreground">{row.recorded_at ? new Date(row.recorded_at).toLocaleDateString("es-AR") : ""}</span></div>
        <div className="mt-4"><ClientSelector clients={clientData?.clients || []} value={row.person_id} label={row.speaker || "Cliente sin identificar"} disabled={saving === row.id} onSelect={(personId) => assignClient(row.id, personId)} /></div>
        <p className="mt-1 text-sm text-muted-foreground">{row.title}</p>
        <p className="mt-4 leading-relaxed">{row.summary}</p>
        <blockquote className="mt-4 rounded-xl border-l-4 border-violet-500 bg-muted/45 p-4 text-sm italic leading-relaxed">“{row.exact_quote}”</blockquote>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><a className="inline-flex items-center gap-2 text-sm font-semibold text-violet-600 hover:underline" href={`${row.loom_url}?t=${Math.floor(row.start_seconds || 0)}`} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />{time(row.start_seconds)}–{time(row.end_seconds)}</a><div className="flex flex-wrap gap-2">{row.status === "detected" && <Button size="sm" onClick={() => changeStatus(row.id, "reviewed")} disabled={saving === row.id}><CheckCircle2 className="mr-2 h-4 w-4" />Revisar</Button>}{row.status === "reviewed" && <Button size="sm" onClick={() => changeStatus(row.id, "published")} disabled={saving === row.id}><Sparkles className="mr-2 h-4 w-4" />Marcar publicado</Button>}{row.status !== "discarded" ? <Button size="sm" variant="ghost" onClick={() => changeStatus(row.id, "discarded")} disabled={saving === row.id}><Trash2 className="mr-2 h-4 w-4" />Descartar</Button> : <Button size="sm" variant="outline" onClick={() => changeStatus(row.id, "detected")} disabled={saving === row.id}><RotateCcw className="mr-2 h-4 w-4" />Restaurar</Button>}</div></div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
          {!row.content_asset_id ? <>{isContentOnly ? <span className="rounded-md border px-3 py-2 text-sm">Contenido Cuenta B</span> : <select className="h-9 rounded-md border bg-background px-3 text-sm" value={accounts[row.id] || "CUENTA_A"} onChange={(event) => setAccounts(current => ({ ...current, [row.id]: event.target.value as "CUENTA_A" | "CUENTA_B" }))}><option value="CUENTA_A">Contenido Cuenta A</option><option value="CUENTA_B">Contenido Cuenta B</option></select>}<Button size="sm" onClick={() => importToContent(row.id)} disabled={saving === row.id}><Clapperboard className="mr-2 h-4 w-4" />Importar a Contenido</Button></> : <><Button asChild size="sm" variant="outline"><a href={`/contenido-angulos?source=testimonios&content_account=${row.content_account || "CUENTA_B"}&content_asset_id=${encodeURIComponent(row.content_asset_id)}`}><ExternalLink className="mr-2 h-4 w-4" />Abrir en Contenido</a></Button>{row.edit_status === "edited" ? <Button size="sm" variant="ghost" onClick={() => changeEditStatus(row.id, "pending")} disabled={saving === row.id}><RotateCcw className="mr-2 h-4 w-4" />Marcar pendiente</Button> : <Button size="sm" onClick={() => changeEditStatus(row.id, "edited")} disabled={saving === row.id}><Pencil className="mr-2 h-4 w-4" />Marcar editado</Button>}</>}
        </div>
      </article>)}
    </div>}
  </div>
}

function Metric({ label, value }: { label: string; value: string | number }) { return <article className="rounded-2xl border bg-card p-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></article> }
function Badge({ children }: { children: React.ReactNode }) { return <span className="rounded-full border bg-muted/55 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide">{children}</span> }

function ClientSelector({ clients, value, label, disabled, onSelect }: { clients: any[]; value?: string; label: string; disabled: boolean; onSelect: (personId: string) => void }) {
  const [open, setOpen] = useState(false)
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button variant="outline" role="combobox" aria-expanded={open} disabled={disabled} className="h-auto max-w-full justify-between px-3 py-2 text-left text-base font-bold"><span className="truncate">{label}</span><ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" /></Button></PopoverTrigger>
    <PopoverContent className="w-[min(420px,calc(100vw-2rem))] p-0" align="start">
      <Command><CommandInput placeholder="Buscar cliente histórico…" /><CommandList><CommandEmpty>No se encontró ese cliente.</CommandEmpty><CommandGroup>
        {clients.map((client) => <CommandItem key={client.person_id} value={`${client.name} ${client.person_id}`} onSelect={() => { onSelect(client.person_id); setOpen(false) }}><Check className={`h-4 w-4 ${value === client.person_id ? "opacity-100" : "opacity-0"}`} /><span className="truncate">{client.name}</span>{client.historical && <span className="ml-auto text-xs text-muted-foreground">Histórico</span>}</CommandItem>)}
      </CommandGroup></CommandList></Command>
    </PopoverContent>
  </Popover>
}
