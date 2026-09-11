"use client"

import { useState } from "react"
import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Loader2, Check, X, ShieldCheck, Trash2, MonitorSmartphone, TriangleAlert } from "lucide-react"

const ROLES = ["Closer", "Setter", "CEO", "Sales Manager", "Manager MKT", "Contaduria", "Cobranzas", "CSM", "Editor"]
const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Member = { id: number; email: string; nombre: string | null; rol: string | null; estado: string | null; created_at: string }
type Activity = { id: string; ip_address: string | null; user_agent: string | null; first_seen_at: string; last_seen_at: string; last_login_at: string; login_count: number }

export default function AccesosPage() {
  const { data, isLoading, mutate } = useSWR<Member[]>("/api/team", fetcher)
  const [busy, setBusy] = useState<string | null>(null)
  const [activityEmail, setActivityEmail] = useState<string | null>(null)
  const [activity, setActivity] = useState<{ rows: Activity[]; simultaneous: boolean } | null>(null)
  const [activityLoading, setActivityLoading] = useState(false)

  const noAuth = data && !Array.isArray(data)
  const members = Array.isArray(data) ? data : []
  const pendientes = members.filter((m) => m.estado === "pendiente")
  const aprobados = members.filter((m) => m.estado === "aprobado")
  const rechazados = members.filter((m) => m.estado === "rechazado")

  async function patch(email: string, body: Record<string, string>) {
    setBusy(email)
    await fetch("/api/team", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, ...body }) })
    await mutate()
    setBusy(null)
  }

  async function remove(email: string, nombre: string | null) {
    if (!window.confirm(`¿Eliminar por completo el acceso de "${nombre || email}" (${email})? No queda ni como rechazado, desaparece de la lista.`)) return
    setBusy(email)
    await fetch("/api/team", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) })
    await mutate()
    setBusy(null)
  }

  async function inspectActivity(email: string) {
    if (activityEmail === email) { setActivityEmail(null); return }
    setActivityEmail(email); setActivity(null); setActivityLoading(true)
    const response = await fetch(`/api/security/activity?email=${encodeURIComponent(email)}`)
    setActivity(response.ok ? await response.json() : { rows: [], simultaneous: false })
    setActivityLoading(false)
  }

  function browserLabel(agent: string | null) {
    if (!agent) return "Dispositivo desconocido"
    const browser = agent.includes("Edg/") ? "Edge" : agent.includes("Chrome/") ? "Chrome" : agent.includes("Safari/") ? "Safari" : agent.includes("Firefox/") ? "Firefox" : "Navegador"
    const device = /iPhone/i.test(agent) ? "iPhone" : /Android/i.test(agent) ? "Android" : /Macintosh/i.test(agent) ? "Mac" : /Windows/i.test(agent) ? "Windows" : "dispositivo"
    return `${browser} · ${device}`
  }

  const fmt = (s: string) => { try { return new Date(s).toLocaleDateString("es-AR", { day: "2-digit", month: "short" }) } catch { return "-" } }

  if (noAuth) {
    return <div className="p-6 lg:p-8"><p className="text-muted-foreground">No tenés permiso para ver esta sección.</p></div>
  }

  const Row = ({ m, showActions }: { m: Member; showActions?: boolean }) => (
    <div className="rounded-lg border border-border p-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-[180px]">
        <p className="font-medium text-sm">{m.nombre || "—"}</p>
        <p className="text-xs text-muted-foreground">{m.email}</p>
      </div>
      <div className="flex items-center gap-3">
        <select value={m.rol || ""} onChange={(e) => patch(m.email, { rol: e.target.value })}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs">
          <option value="">Sin rol</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <span className="text-xs text-muted-foreground whitespace-nowrap">{fmt(m.created_at)}</span>
        {showActions && (
          <div className="flex gap-2">
            <button disabled={busy === m.email} onClick={() => patch(m.email, { estado: "aprobado" })}
              className="inline-flex items-center gap-1 h-8 px-3 rounded-md bg-emerald-600 text-white text-xs font-medium hover:opacity-90 disabled:opacity-50">
              {busy === m.email ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Aprobar
            </button>
            <button disabled={busy === m.email} onClick={() => patch(m.email, { estado: "rechazado" })}
              className="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-border text-xs font-medium hover:bg-muted disabled:opacity-50">
              <X className="h-3 w-3" /> Rechazar
            </button>
          </div>
        )}
        {!showActions && m.estado === "aprobado" && (
          <>
            <button onClick={() => inspectActivity(m.email)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><MonitorSmartphone className="h-3.5 w-3.5" /> Logins</button>
            <button disabled={busy === m.email} onClick={() => patch(m.email, { estado: "rechazado" })}
              className="text-xs font-medium text-red-600 hover:text-red-500">Suspender ahora</button>
          </>
        )}
        {!showActions && m.estado === "rechazado" && (
          <button disabled={busy === m.email} onClick={() => patch(m.email, { estado: "aprobado" })}
            className="text-xs text-muted-foreground hover:text-emerald-600">Re-aprobar</button>
        )}
        <button disabled={busy === m.email} onClick={() => remove(m.email, m.nombre)} title="Eliminar por completo"
          className="text-muted-foreground/50 hover:text-red-500">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
    {activityEmail === m.email && (
      <div className="mt-3 border-t border-border pt-3">
        {activityLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : (
          <div className="space-y-2">
            {activity?.simultaneous && <p className="flex items-center gap-1.5 rounded-md bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-600"><TriangleAlert className="h-4 w-4" /> Alerta: más de un dispositivo activo en los últimos 15 minutos.</p>}
            {!activity?.rows.length ? <p className="text-xs text-muted-foreground">Todavía no hay actividad registrada desde el despliegue del detector.</p> : activity.rows.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
                <span className="font-medium">{browserLabel(row.user_agent)}</span>
                <span>IP {row.ip_address || "—"}</span>
                <span className="text-muted-foreground">Última actividad: {new Date(row.last_seen_at).toLocaleString("es-AR")}</span>
                <span className="text-muted-foreground">Ingresos: {row.login_count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )}
    </div>
  )

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center gap-2 mb-6">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Accesos del equipo</h1>
          <p className="text-sm text-muted-foreground">Aprobá quién entra al CRM y con qué rol</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-6">
          <Card className="border border-border">
            <CardHeader><CardTitle className="text-base">Pendientes {pendientes.length > 0 && <span className="ml-2 text-xs bg-amber-500/15 text-amber-600 rounded-full px-2 py-0.5">{pendientes.length}</span>}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {pendientes.length === 0 ? <p className="text-sm text-muted-foreground">No hay pedidos pendientes.</p>
                : pendientes.map((m) => <Row key={m.id} m={m} showActions />)}
            </CardContent>
          </Card>

          <Card className="border border-border">
            <CardHeader><CardTitle className="text-base">Con acceso ({aprobados.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {aprobados.map((m) => <Row key={m.id} m={m} />)}
            </CardContent>
          </Card>

          {rechazados.length > 0 && (
            <Card className="border border-border">
              <CardHeader><CardTitle className="text-base text-muted-foreground">Rechazados ({rechazados.length})</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {rechazados.map((m) => <Row key={m.id} m={m} />)}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
