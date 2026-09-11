"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { AlertTriangle, CalendarClock, CheckCircle2, Link2, Loader2, MessageCircle, PhoneCall, Receipt, Upload, UserRound, Zap } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useSession } from "@/components/session-provider"
import { HelpHint } from "@/components/help-hint"
import { diasHastaFecha, umbralActual, UMBRAL_LABEL, type UmbralRecordatorio } from "@/lib/recordatorios"

type Item = {
  id: string
  concepto: string
  monto: number | null
  fecha_planeada: string | null
  estado: string
  responsable_cobranza?: string | null
  estado_cobranza?: string | null
  ultimo_contacto_at?: string | null
  ultimo_resultado?: string | null
  promesa_pago_fecha?: string | null
  proxima_accion?: string | null
  proxima_accion_fecha?: string | null
}

type Plan = {
  id: string
  cliente: string
  closer: string | null
  telefono: string | null
  operacion?: number | null
  estado_plan?: "activo" | "inactivo_no_responde" | null
  plan_pago_items: Item[]
}

type Row = Item & {
  cliente: string
  closer: string | null
  telefono: string | null
  planId: string
  operacion: number | null
  pendingItems: Item[]
  dias: number
  umbral: UmbralRecordatorio
}

type Payment = { id: string; cliente: string; monto: number | null; fecha: string | null; tipo: string | null; comprobante?: string | null }

type Vista = "vencidas" | "hoy" | "proximas" | "gestionadas"

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data?.error || `Error ${response.status}`)
  return data
}

function firstName(value: string) {
  return (value || "").trim().split(/\s+/)[0]
}

function ownerKey(value: string | null | undefined) {
  const key = firstName(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
  return key === "tomi" ? "tomas" : key
}

function normalizePhone(value: string | null) {
  return (value || "").replace(/\D/g, "")
}

function isoTomorrow(days = 1) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function dueLabel(row: Row) {
  if (row.dias < 0) return `${Math.abs(row.dias)} día${Math.abs(row.dias) === 1 ? "" : "s"} vencida`
  if (row.dias === 0) return "Vence hoy"
  return `Vence en ${row.dias} día${row.dias === 1 ? "" : "s"}`
}

export default function RecordatoriosPage() {
  const session = useSession()
  const restrictedPortfolio = ["Closer", "Cobranzas"].includes(session.rol)
  const { data: planes, isLoading, error, mutate } = useSWR<Plan[]>(restrictedPortfolio ? "/api/planes-pago?mine=1" : "/api/planes-pago", fetcher)
  const [vista, setVista] = useState<Vista>("vencidas")
  const [closer, setCloser] = useState("Todos")
  const [activa, setActiva] = useState<Row | null>(null)
  const [resolviendo, setResolviendo] = useState<Row | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [loadingPayments, setLoadingPayments] = useState(false)
  const [resolveMode, setResolveMode] = useState<"existing" | "new">("existing")
  const [selectedPayment, setSelectedPayment] = useState("")
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [newPayment, setNewPayment] = useState({ monto: "", fecha: new Date().toISOString().slice(0, 10), medio: "", file: null as File | null })
  const [guardando, setGuardando] = useState<string | null>(null)
  const [form, setForm] = useState({ resultado: "", promesa: "", accion: "", fechaAccion: "" })
  const [clientePago, setClientePago] = useState("")

  const isManager = ["CEO", "Contaduria", "Sales Manager", "Manager MKT"].includes(session.rol)

  useEffect(() => {
    if (!isManager && session.nombre) setCloser(firstName(session.nombre))
  }, [isManager, session.nombre])

  const todas = useMemo(() => (planes || []).filter((plan) => plan.estado_plan !== "inactivo_no_responde").flatMap((plan) =>
    (plan.plan_pago_items || [])
      .filter((item) => item.estado === "pendiente" && item.fecha_planeada)
      .map((item) => ({
        ...item,
        cliente: plan.cliente,
        closer: plan.closer,
        telefono: plan.telefono,
        planId: plan.id,
        operacion: Number(plan.operacion || 0) || null,
        pendingItems: (plan.plan_pago_items || []).filter((candidate) => candidate.estado === "pendiente"),
        dias: diasHastaFecha(item.fecha_planeada!),
        umbral: umbralActual(diasHastaFecha(item.fecha_planeada!)),
      }))
      .filter((row): row is Row => Boolean(row.umbral)),
  ).sort((a, b) => a.dias - b.dias), [planes])

  const closers = useMemo(() => Array.from(new Set(todas.map((row) => firstName(row.closer || "")).filter(Boolean))).sort(), [todas])
  const deCartera = useMemo(() => todas.filter((row) => closer === "Todos" || ownerKey(row.closer) === ownerKey(closer)), [todas, closer])
  const clientesCartera = useMemo(() => Array.from(
    new Map(deCartera.map((row) => [row.cliente, row])).values(),
  ).sort((a, b) => a.cliente.localeCompare(b.cliente)), [deCartera])

  useEffect(() => {
    if (session.rol !== "Cobranzas" || clientePago || clientesCartera.length === 0) return
    setClientePago(clientesCartera[0].cliente)
  }, [clientePago, clientesCartera, session.rol])

  useEffect(() => {
    if (session.rol !== "Cobranzas" || clientesCartera.length === 0) return
    const itemId = new URLSearchParams(window.location.search).get("cobrar")
    if (!itemId) return
    const row = deCartera.find((item) => item.id === itemId)
    if (!row) return
    window.history.replaceState({}, "", window.location.pathname)
    void abrirResolver(row)
    // El parámetro se consume una sola vez y luego se quita de la URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientesCartera, deCartera, session.rol])

  const counts = useMemo(() => ({
    vencidas: deCartera.filter((row) => row.dias < 0 && !row.ultimo_contacto_at).length,
    hoy: deCartera.filter((row) => row.dias === 0).length,
    proximas: deCartera.filter((row) => row.dias > 0).length,
    gestionadas: deCartera.filter((row) => Boolean(row.ultimo_contacto_at)).length,
  }), [deCartera])

  const filas = useMemo(() => deCartera.filter((row) => {
    if (vista === "vencidas") return row.dias < 0 && !row.ultimo_contacto_at
    if (vista === "hoy") return row.dias === 0
    if (vista === "proximas") return row.dias > 0
    return Boolean(row.ultimo_contacto_at)
  }), [deCartera, vista])

  const montoVencido = deCartera.filter((row) => row.dias < 0).reduce((sum, row) => sum + Number(row.monto || 0), 0)
  const montoSemana = deCartera.reduce((sum, row) => sum + Number(row.monto || 0), 0)

  async function registrar(row: Row, values: {
    resultado: string
    estado: "contactado" | "promesa" | "escalado"
    promesa?: string | null
    accion?: string | null
    fechaAccion?: string | null
  }) {
    setGuardando(row.id)
    try {
      const response = await fetch("/api/cobranza", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: row.id,
          responsable: firstName(row.closer || "") || firstName(session.nombre) || "Sin asignar",
          resultado: values.resultado,
          estadoCobranza: values.estado,
          promesaPagoFecha: values.promesa || null,
          proximaAccion: values.accion || null,
          proximaAccionFecha: values.fechaAccion || null,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || "No se pudo guardar")
      await mutate()
      setActiva(null)
      toast.success("Listo. La gestión quedó guardada.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar")
    } finally {
      setGuardando(null)
    }
  }

  function abrirPromesa(row: Row) {
    setActiva(row)
    setForm({ resultado: "Prometió pagar", promesa: isoTomorrow(), accion: "Confirmar acreditación", fechaAccion: isoTomorrow() })
  }

  async function abrirResolver(row: Row) {
    setResolviendo(row)
    setResolveMode(session.rol === "Cobranzas" ? "new" : "existing")
    setSelectedPayment("")
    setSelectedItems([row.id])
    setNewPayment({ monto: String(row.monto || ""), fecha: new Date().toISOString().slice(0, 10), medio: "", file: null })
    setLoadingPayments(true)
    try {
      const response = await fetch(`/api/pagos?cliente=${encodeURIComponent(row.cliente)}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || "No se pudieron cargar los pagos")
      setPayments(Array.isArray(data) ? data : data.items || [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudieron cargar los pagos")
    } finally {
      setLoadingPayments(false)
    }
  }

  function toggleItem(id: string) {
    setSelectedItems((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  }

  async function conciliar(paymentId: string) {
    const response = await fetch("/api/cobranza/resolver", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId, itemIds: selectedItems }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data?.error || "No se pudo asociar el pago")
    return data
  }

  async function resolverPago() {
    if (!resolviendo || selectedItems.length === 0) return toast.error("Elegí al menos una cuota")
    setGuardando(resolviendo.id)
    try {
      let paymentId = selectedPayment
      if (resolveMode === "new") {
        const amount = Number(newPayment.monto)
        if (!amount || amount <= 0 || !newPayment.fecha || !newPayment.medio) throw new Error("Completá monto, fecha y medio de pago")
        let comprobante = ""
        if (newPayment.file) {
          const formData = new FormData()
          formData.append("file", newPayment.file)
          formData.append("concepto", selectedItems.length > 1 ? "Completó PIF" : "Cuota")
          formData.append("cliente", resolviendo.cliente)
          const upload = await fetch("/api/upload-comprobante", { method: "POST", body: formData })
          const uploaded = await upload.json()
          if (!upload.ok) throw new Error(uploaded?.error || "No se pudo subir el comprobante")
          comprobante = uploaded.url
        }
        const createdResponse = await fetch("/api/pagos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cliente: resolviendo.cliente,
            telefono: resolviendo.telefono,
            closer: resolviendo.closer,
            operacion: resolviendo.operacion,
            fecha: newPayment.fecha,
            monto: amount,
            medio_de_pago: newPayment.medio,
            comprobante: comprobante || null,
            tipo: selectedItems.length > 1 ? "Completó PIF" : "Cuota",
          }),
        })
        const created = await createdResponse.json()
        if (!createdResponse.ok) throw new Error(created?.error || "No se pudo crear el pago")
        paymentId = created.id
      }
      if (!paymentId) throw new Error("Elegí el pago que querés asociar")
      const result = await conciliar(paymentId)
      await mutate()
      setResolviendo(null)
      toast.success(`${result.linked} ${result.linked === 1 ? "cuota conciliada" : "cuotas conciliadas"}. El recordatorio quedó resuelto.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo resolver el pago")
    } finally {
      setGuardando(null)
    }
  }

  return (
    <div className="page-enter mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8 xl:p-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge className="mb-3 border-red-500/15 bg-red-500/10 text-red-600 hover:bg-red-500/10"><Zap className="mr-1.5 h-3 w-3" />OPERACIÓN DIARIA</Badge>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-[-.04em] sm:text-4xl">Cobros y recordatorios
            <HelpHint text="Esta lista se ordena sola por urgencia: primero lo vencido sin gestionar, después lo que vence hoy. No hace falta calcular nada a mano." />
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">Tu cartera ordenada por urgencia. Sin planillas ni cuentas manuales.</p>
        </div>
        {session.rol === "Cobranzas" ? (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[420px] sm:flex-row">
            <select
              aria-label="Cliente para cargar pago"
              className="h-11 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
              value={clientePago}
              onChange={(event) => setClientePago(event.target.value)}
            >
              {clientesCartera.map((row) => <option key={row.cliente} value={row.cliente}>{row.cliente}</option>)}
            </select>
            {clientePago ? (
              <Button asChild size="lg" className="shrink-0">
                <a href={`/recordatorios?cobrar=${encodeURIComponent(clientesCartera.find((item) => item.cliente === clientePago)?.id || "")}`}><Receipt className="mr-2 h-5 w-5" />Cargar pago</a>
              </Button>
            ) : <Button size="lg" className="shrink-0" disabled><Receipt className="mr-2 h-5 w-5" />Cargar pago</Button>}
          </div>
        ) : isManager && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={closer === "Todos" ? "default" : "outline"} onClick={() => setCloser("Todos")}>Equipo</Button>
            {closers.map((name) => <Button key={name} size="sm" variant={closer === name ? "default" : "outline"} onClick={() => setCloser(name)}>{name}</Button>)}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Vencido" value={`USD ${montoVencido.toLocaleString("es-AR")}`} helper="prioridad de hoy" icon={AlertTriangle} tone="danger" />
        <Metric label="En gestión" value={`USD ${montoSemana.toLocaleString("es-AR")}`} helper="vencido + próximos 7 días" icon={CalendarClock} />
        <Metric label="Contactados" value={String(counts.gestionadas)} helper="con resultado registrado" icon={CheckCircle2} tone="success" />
      </div>

      <div className="glass sticky top-20 z-20 grid grid-cols-2 gap-2 rounded-2xl p-2 sm:grid-cols-4 lg:top-4">
        <Tab active={vista === "vencidas"} onClick={() => setVista("vencidas")} label="Sin gestionar" count={counts.vencidas} danger />
        <Tab active={vista === "hoy"} onClick={() => setVista("hoy")} label="Vencen hoy" count={counts.hoy} />
        <Tab active={vista === "proximas"} onClick={() => setVista("proximas")} label="Próximas" count={counts.proximas} />
        <Tab active={vista === "gestionadas"} onClick={() => setVista("gestionadas")} label="Gestionadas" count={counts.gestionadas} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin" /></div>
      ) : error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">No se pudo cargar la cartera.</div>
      ) : filas.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-12 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" />
          <p className="font-semibold">No hay nada pendiente acá</p>
          <p className="text-sm text-muted-foreground">Pasá a la siguiente pestaña.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filas.map((row) => {
            const phone = normalizePhone(row.telefono)
            const message = encodeURIComponent(`Hola ${row.cliente}, ¿cómo estás? Te escribo por tu ${row.concepto} de USD ${Number(row.monto || 0).toLocaleString("es-AR")} con fecha ${row.fecha_planeada}. ¿Podemos confirmar el pago?`)
            return (
              <article key={row.id} className="surface surface-hover overflow-hidden p-4 sm:p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-bold tracking-tight">{row.cliente}</h2>
                      <Badge variant={row.dias < 0 ? "destructive" : "secondary"}>{dueLabel(row)}</Badge>
                      <Badge variant="outline">{UMBRAL_LABEL[row.umbral]}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                      <span className="font-semibold text-foreground">USD {Number(row.monto || 0).toLocaleString("es-AR")}</span>
                      <span>{row.concepto}</span>
                      <span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{firstName(row.closer || "") || "Sin closer"}</span>
                    </div>
                    {row.ultimo_resultado && (
                      <div className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                        <span className="font-medium">Último resultado:</span> {row.ultimo_resultado}
                        {row.proxima_accion && <span className="text-muted-foreground"> · {row.proxima_accion} {row.proxima_accion_fecha || ""}</span>}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap xl:justify-end">
                    {phone ? (
                      <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
                        <a href={`https://wa.me/${phone}?text=${message}`} target="_blank" rel="noreferrer"><MessageCircle className="mr-2 h-4 w-4" />WhatsApp</a>
                      </Button>
                    ) : (
                      <Button disabled><PhoneCall className="mr-2 h-4 w-4" />Sin teléfono</Button>
                    )}
                    <Button variant="outline" disabled={guardando === row.id} onClick={() => registrar(row, {
                      resultado: "No respondió",
                      estado: "contactado",
                      accion: "Reintentar contacto",
                      fechaAccion: isoTomorrow(),
                    })}>No respondió</Button>
                    <Button variant="outline" onClick={() => abrirPromesa(row)}>Prometió pagar</Button>
                    {session.rol !== "Cobranzas" && <Button asChild variant="secondary"><Link href={`/carga-pagos?cliente=${encodeURIComponent(row.cliente)}`}><Receipt className="mr-2 h-4 w-4" />Cargar pago</Link></Button>}
                    {session.rol === "Cobranzas" ? (
                      <Button asChild variant="secondary"><a href={`/recordatorios?cobrar=${encodeURIComponent(row.id)}`}><Receipt className="mr-2 h-4 w-4" />Cargar pago</a></Button>
                    ) : (
                      <Button variant="secondary" onClick={() => abrirResolver(row)}><Link2 className="mr-2 h-4 w-4" />Resolver pago</Button>
                    )}
                    <HelpHint className="self-center" text={'"No respondió" reprograma el contacto para mañana. "Prometió pagar" te pide la fecha prometida y crea el próximo recordatorio automáticamente. Ninguno de los dos carga el pago: eso es siempre en "Cargar pago".'} />
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <Dialog open={Boolean(activa)} onOpenChange={(open) => !open && setActiva(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Promesa de pago · {activa?.cliente}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Field label="¿Cuándo prometió pagar?"><Input type="date" value={form.promesa} onChange={(e) => setForm({ ...form, promesa: e.target.value, fechaAccion: e.target.value })} /></Field>
            <Field label="Nota corta (opcional)"><Textarea rows={3} value={form.resultado} onChange={(e) => setForm({ ...form, resultado: e.target.value })} placeholder="Ej: cobra el viernes y transfiere" /></Field>
            <Button className="w-full" disabled={!activa || !form.promesa || guardando === activa?.id} onClick={() => activa && registrar(activa, {
              resultado: form.resultado || "Prometió pagar",
              estado: "promesa",
              promesa: form.promesa,
              accion: form.accion,
              fechaAccion: form.fechaAccion,
            })}>{guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar promesa</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(resolviendo)} onOpenChange={(open) => !open && setResolviendo(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>{session.rol === "Cobranzas" ? "Cargar pago" : "Resolver pago"} · {resolviendo?.cliente}</DialogTitle></DialogHeader>
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant={resolveMode === "existing" ? "default" : "outline"} onClick={() => setResolveMode("existing")}><Link2 className="mr-2 h-4 w-4" />Asociar existente</Button>
              <Button type="button" variant={resolveMode === "new" ? "default" : "outline"} onClick={() => setResolveMode("new")}><Upload className="mr-2 h-4 w-4" />Cargar nuevo</Button>
            </div>

            <div className="space-y-2">
              <Label>¿Qué cuotas cancela este pago?</Label>
              {resolviendo?.pendingItems.map((item) => (
                <label key={item.id} className="flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm">
                  <input type="checkbox" checked={selectedItems.includes(item.id)} onChange={() => toggleItem(item.id)} />
                  <span className="min-w-0 flex-1"><span className="font-semibold">{item.concepto}</span><span className="ml-2 text-muted-foreground">{item.fecha_planeada || "Sin fecha"}</span></span>
                  <span className="font-semibold">USD {Number(item.monto || 0).toLocaleString("es-AR")}</span>
                </label>
              ))}
              <p className="text-xs text-muted-foreground">Total seleccionado: USD {resolviendo?.pendingItems.filter((item) => selectedItems.includes(item.id)).reduce((sum, item) => sum + Number(item.monto || 0), 0).toLocaleString("es-AR") || "0"}</p>
            </div>

            {resolveMode === "existing" ? (
              <Field label="Pago ya cargado en el CRM">
                {loadingPayments ? <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Buscando pagos…</div> : (
                  <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={selectedPayment} onChange={(event) => setSelectedPayment(event.target.value)}>
                    <option value="">Seleccionar pago</option>
                    {payments.map((payment) => <option key={payment.id} value={payment.id}>{payment.fecha || "Sin fecha"} · {payment.tipo || "Pago"} · USD {Number(payment.monto || 0).toLocaleString("es-AR")}{payment.comprobante ? " · con comprobante" : ""}</option>)}
                  </select>
                )}
              </Field>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Monto cobrado (USD)"><Input type="number" min="0" step="0.01" value={newPayment.monto} onChange={(event) => setNewPayment({ ...newPayment, monto: event.target.value })} /></Field>
                <Field label="Fecha"><Input type="date" value={newPayment.fecha} onChange={(event) => setNewPayment({ ...newPayment, fecha: event.target.value })} /></Field>
                <Field label="Medio de pago"><Input value={newPayment.medio} onChange={(event) => setNewPayment({ ...newPayment, medio: event.target.value })} placeholder="Transferencia, PayPal, efectivo…" /></Field>
                <Field label="Comprobante (opcional)"><Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setNewPayment({ ...newPayment, file: event.target.files?.[0] || null })} /></Field>
              </div>
            )}

            <Button className="w-full" disabled={guardando === resolviendo?.id || selectedItems.length === 0 || (resolveMode === "existing" && !selectedPayment)} onClick={resolverPago}>
              {guardando === resolviendo?.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar y quitar recordatorio
            </Button>
            <p className="text-xs text-muted-foreground">Esto no duplica el cash: vincula las cuotas al pago real y conserva el comprobante para Contaduría.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Metric({ label, value, helper, icon: Icon, tone = "default" }: { label: string; value: string; helper: string; icon: typeof CalendarClock; tone?: "default" | "danger" | "success" }) {
  return <div className="rounded-2xl border bg-card p-5 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-sm font-medium text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{helper}</p></div><div className={`rounded-xl p-2.5 ${tone === "danger" ? "bg-red-500/10 text-red-600" : tone === "success" ? "bg-emerald-500/10 text-emerald-600" : "bg-primary/10 text-primary"}`}><Icon className="h-5 w-5" /></div></div></div>
}

function Tab({ active, onClick, label, count, danger = false }: { active: boolean; onClick: () => void; label: string; count: number; danger?: boolean }) {
  return <button onClick={onClick} className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${active ? "bg-background shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground"}`}><span>{label}</span><span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${danger && count > 0 ? "bg-red-500/15 text-red-600" : "bg-muted text-muted-foreground"}`}>{count}</span></button>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>
}
