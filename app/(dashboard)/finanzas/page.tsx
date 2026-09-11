"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import {
  AlertTriangle, Banknote, CheckCircle2, CircleDashed,
  FileCheck2, History, LockKeyhole, Scale, ShieldCheck, Split,
  WalletCards,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

type Closing = {
  id: string
  period_start: string
  revision: number
  status: "provisional" | "confirmado"
  base_currency: string
  external_income: number
  platform_fees: number
  payroll: number
  software_marketing: number
  operating_expenses: number
  obligations: number
  reserves: number
  adjustments: number
  distributable_profit: number
  partner_share: number
  formula: string
  evidence_level: "completo" | "parcial"
  evidence_source: "pdf_cierre" | "historico_chat" | "estimado"
  evidence_summary: string | null
  closing_verified: boolean
  verification_source: string | null
  verification_summary: string | null
  payroll_reconciled: boolean
  bonuses_reconciled: boolean
  total_movements: number
  reconciled_movements: number
}
type Rule = {
  id: string
  rule_key: string
  version: number
  role_key: string
  calculation_base: string
  percentage: number | null
  fixed_amount: number | null
  fixed_currency: string | null
  effective_from: string
  effective_to: string | null
  approval_status: string
}
type Approval = {
  id: string
  closing_id: string
  partner_key: string
  status: "pendiente" | "aprobado" | "rechazado"
}
type Audit = {
  id: number
  table_name: string
  record_id: string
  action: string
  changed_at: string
}
type Movement = {
  id: string
  closing_id: string
  occurred_at: string
  channel: string
  amount_original: number
  currency_original: string
  amount_base: number | null
  reconciliation_status: string
  evidence_ref_hash: string | null
  notes: string | null
  source_record_key: string | null
}
type FinanceData = {
  closings: Closing[]
  rules: Rule[]
  approvals: Approval[]
  movements: Movement[]
  audit: Audit[]
  policy: {
    ownership: string
    previewReadOnly: boolean
  }
}

const fetcher = (url: string) => fetch(url).then(async response => {
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || "No se pudo cargar Finanzas")
  return body
})

function money(value: number | string, currency = "USD") {
  const amount = Number(value || 0)
  const code = currency?.trim().toUpperCase() || "USD"
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    // Crypto y etiquetas internas como USDT no son monedas ISO 4217 y
    // Intl.NumberFormat lanza RangeError. Mostrarlas sin tumbar la pantalla.
    return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(amount)} ${code}`
  }
}

function monthLabel(date: string) {
  return new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${date}T00:00:00Z`))
}

function monthLabelShort(date: string) {
  return new Intl.DateTimeFormat("es-AR", { month: "short", year: "2-digit", timeZone: "UTC" })
    .format(new Date(`${date}T00:00:00Z`))
}

export default function FinanzasPage() {
  const { data, error, isLoading } = useSWR<FinanceData>("/api/finanzas", fetcher)
  const [selectedId, setSelectedId] = useState<string>("")
  const [tab, setTab] = useState("resumen")
  const closings = data?.closings ?? []
  const selected = useMemo(
    () => closings.find(item => item.id === selectedId) ?? closings[0],
    [closings, selectedId],
  )
  const approvals = data?.approvals.filter(item => item.closing_id === selected?.id) ?? []
  const movements = data?.movements.filter(item => item.closing_id === selected?.id) ?? []
  const verifiedCount = closings.filter(item => item.closing_verified).length
  const detailedCount = closings.filter(item => item.evidence_level === "completo").length
  const unverifiedCount = closings.length - verifiedCount

  function selectPeriod(id: string) {
    setSelectedId(id)
    setTab("resumen")
  }

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Cargando Centro Financiero…</div>
  if (error) return <div className="p-6"><Alert variant="destructive"><AlertTriangle /><AlertTitle>No se pudo cargar</AlertTitle><AlertDescription>{error.message}</AlertDescription></Alert></div>

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[.22em] text-zinc-500">
            <ShieldCheck className="h-4 w-4 text-emerald-500" /> Operaciones
          </div>
          <h1 className="text-3xl font-black tracking-tight">Centro Financiero</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Cierre mensual auditable. Regla general 50/50; excepciones: renovación cerrada por Cuenta A y venta nueva originada en la cuenta A 80/20.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data?.policy.previewReadOnly && <Badge variant="outline" className="gap-1.5 border-amber-500/30 bg-amber-500/10 text-amber-700"><LockKeyhole className="h-3.5 w-3.5" /> Preview · solo lectura</Badge>}
          <select
            aria-label="Período"
            className="h-10 rounded-xl border bg-background px-3 text-sm font-semibold"
            value={selected?.id ?? ""}
            onChange={event => selectPeriod(event.target.value)}
          >
            {closings.map(item => <option key={item.id} value={item.id}>{monthLabel(item.period_start)}</option>)}
          </select>
        </div>
      </div>

      {!closings.length ? <EmptyFinance /> : <>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Metric icon={ShieldCheck} label="Cierres reales" value={`${verifiedCount} de ${closings.length}`} helper={`${detailedCount} con desglose completo · ${unverifiedCount} sin cierre final`} tone="emerald" />
          {selected && <>
            <Metric icon={Banknote} label={`Ingresos · ${monthLabelShort(selected.period_start)}`} value={selected.evidence_level === "completo" ? money(selected.external_income, selected.base_currency) : "—"} helper={selected.evidence_level === "completo" ? "Del período seleccionado" : "Sin desglose completo; ver evidencia"} tone="blue" />
            <Metric icon={Scale} label="Utilidad distribuible" value={selected.evidence_level === "completo" ? money(selected.distributable_profit, selected.base_currency) : "—"} helper={selected.evidence_level === "completo" ? "Después de gastos y reservas" : "No se infiere"} tone="violet" />
            <Metric icon={Split} label="Participación por socio" value={selected.evidence_level === "completo" ? money(selected.partner_share, selected.base_currency) : "—"} helper={selected.evidence_level === "completo" ? "50% para cada uno" : "Ver cifra multimoneda en evidencia"} tone="amber" />
          </>}
        </div>

        {selected && (
          <Alert className={cn("border", selected.closing_verified ? "border-emerald-500/25 bg-emerald-500/5" : "border-amber-500/25 bg-amber-500/5")}>
            {selected.closing_verified ? <CheckCircle2 className="text-emerald-600" /> : <AlertTriangle className="text-amber-600" />}
            <AlertTitle>
              {selected.closing_verified
                ? `${monthLabel(selected.period_start)} — cierre verificado${selected.evidence_level === "completo" ? " con desglose completo" : ""}`
                : `${monthLabel(selected.period_start)} — sin evidencia del cierre final`}
            </AlertTitle>
            <AlertDescription>
              {selected.verification_summary || selected.evidence_summary || "No hay evidencia suficiente para declarar el cierre final."}
            </AlertDescription>
          </Alert>
        )}

        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="resumen">Resumen</TabsTrigger>
            <TabsTrigger value="meses">Todos los meses</TabsTrigger>
            <TabsTrigger value="reglas">Reglas</TabsTrigger>
            <TabsTrigger value="auditoria">Auditoría</TabsTrigger>
          </TabsList>

          <TabsContent value="resumen" className="space-y-4">
            {selected && <>
              {selected.evidence_level === "completo" ? <Card>
                <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileCheck2 className="h-4 w-4" /> Detalle del mes</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid gap-2 lg:grid-cols-4">
                    <FormulaLine label="Ingresos" value={selected.external_income} positive />
                    <FormulaLine label="Comisiones de plataforma" value={-selected.platform_fees} />
                    <FormulaLine label="Payroll" value={-selected.payroll} />
                    <FormulaLine label="Software / marketing" value={-selected.software_marketing} />
                    <FormulaLine label="Gastos operativos" value={-selected.operating_expenses} />
                    <FormulaLine label="Obligaciones" value={-selected.obligations} />
                    <FormulaLine label="Reservas" value={-selected.reserves} />
                    <FormulaLine label="Ajustes" value={selected.adjustments} />
                  </div>
                  <div className="mt-4 rounded-2xl border bg-muted/30 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Utilidad distribuible</p>
                    <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                      <p className="text-sm text-muted-foreground">Regla general 50/50. Excepciones: renovación cerrada personalmente por Cuenta A 65/35; venta nueva originada en la cuenta A 80/20. Si coinciden, prevalece renovación Cuenta A. La base especial es cash neto de plataforma y reembolsos.</p>
                      <p className="text-2xl font-black">{money(selected.distributable_profit, selected.base_currency)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card> : <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">El cierre final está respaldado, pero no existe un desglose completo y unificado que permita reconstruir ingresos, gastos y margen sin inferencias. Las cifras parciales o multimoneda quedan en la evidencia y no se convierten automáticamente a USD.</p></CardContent></Card>}
              <Card>
                <CardHeader><CardTitle className="text-base">Aprobación</CardTitle></CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  {approvals.length ? approvals.map(approval => (
                    <div key={approval.id} className="flex items-center justify-between rounded-xl border p-3">
                      <p className="text-sm font-bold">{approval.partner_key === "partner_a" ? "Cuenta B" : "Cuenta A"}</p>
                      {approval.status === "aprobado"
                        ? <Badge className="gap-1 bg-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Aprobado</Badge>
                        : <Badge variant="outline" className="gap-1"><CircleDashed className="h-3.5 w-3.5" /> Falta aprobar</Badge>}
                    </div>
                  )) : <p className="text-sm text-muted-foreground">Sin aprobaciones registradas todavía.</p>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Conciliación payroll y bonos</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <StatusBlock label="Movimientos con evidencia" value={`${selected.reconciled_movements} / ${selected.total_movements}`} ok={selected.total_movements > 0 && selected.reconciled_movements === selected.total_movements} />
                    <StatusBlock label="Payroll reproducido" value={selected.payroll_reconciled ? "Conciliado" : "Pendiente"} ok={selected.payroll_reconciled} />
                    <StatusBlock label="Bonos reproducidos" value={selected.bonuses_reconciled ? "Conciliados" : "Pendiente"} ok={selected.bonuses_reconciled} />
                  </div>
                  {movements.length ? <div className="space-y-2">
                    {movements.map(movement => <div key={movement.id} className="grid gap-2 rounded-xl border p-3 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center">
                      <div><p className="font-semibold">{movement.notes || "Movimiento de payroll"}</p><p className="text-xs text-muted-foreground">{movement.channel} · evidencia {movement.evidence_ref_hash?.slice(0, 12) || "sin hash"}</p></div>
                      <p className="font-bold">{money(movement.amount_original, movement.currency_original)}</p>
                      <Badge variant="outline" className="w-fit border-emerald-500/30 text-emerald-700">Conciliado</Badge>
                    </div>)}
                  </div> : <p className="text-sm text-muted-foreground">Este mes no tiene movimientos de payroll/bonos con evidencia suficiente para cargar.</p>}
                </CardContent>
              </Card>
            </>}
          </TabsContent>

          <TabsContent value="meses">
            <Card>
              <CardHeader><CardTitle className="text-base">Todos los meses del histórico</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {[...closings]
                  .sort((a, b) => b.period_start.localeCompare(a.period_start))
                  .map(item => (
                    <button
                      key={item.id}
                      onClick={() => selectPeriod(item.id)}
                      className={cn(
                        "flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted/40",
                        selected?.id === item.id && "border-primary/40 bg-muted/30",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {item.closing_verified
                          ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                          : <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />}
                        <div>
                          <p className="text-sm font-bold capitalize">{monthLabel(item.period_start)}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {item.closing_verified
                              ? (item.evidence_level === "completo" ? "Cierre con desglose completo" : "Cierre verificado · desglose parcial")
                              : "Sin evidencia del cierre final"}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">{item.evidence_level === "completo" ? money(item.distributable_profit, item.base_currency) : "—"}</p>
                        <p className="text-[11px] text-muted-foreground">{item.evidence_level === "completo" ? `${money(item.partner_share, item.base_currency)} c/u` : "sin cifra"}</p>
                      </div>
                    </button>
                  ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reglas">
            <Card><CardContent className="pt-6"><div className="space-y-3">{(data?.rules ?? []).map(rule => <div key={rule.id} className="grid gap-3 rounded-2xl border p-4 md:grid-cols-[1.3fr_1fr_1fr_auto] md:items-center"><div><p className="font-bold">{rule.rule_key.replaceAll("_", " ")}</p><p className="text-xs text-muted-foreground">{rule.role_key} · base {rule.calculation_base}</p></div><p className="text-sm">{rule.percentage != null ? `${rule.percentage}%` : rule.fixed_amount != null ? money(rule.fixed_amount, rule.fixed_currency || "USD") : "Por tramos"}</p><p className="text-xs text-muted-foreground">{rule.effective_from} → {rule.effective_to || "vigente"}</p><Badge variant={rule.approval_status === "confirmado" ? "default" : "outline"}>{rule.approval_status}</Badge></div>)}</div></CardContent></Card>
          </TabsContent>

          <TabsContent value="auditoria">
            <Card><CardContent className="pt-6"><div className="space-y-2">{(data?.audit ?? []).map(entry => <div key={entry.id} className="flex items-center gap-3 rounded-xl border p-3"><History className="h-4 w-4 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{entry.action} · {entry.table_name}</p><p className="font-mono text-[10px] text-muted-foreground">{entry.record_id.slice(0, 12)}</p></div><time className="text-xs text-muted-foreground">{new Date(entry.changed_at).toLocaleString("es-AR")}</time></div>)}{!data?.audit.length && <p className="text-sm text-muted-foreground">Sin cambios auditados todavía.</p>}</div></CardContent></Card>
          </TabsContent>
        </Tabs>
      </>}
    </div>
  )
}

function Metric({ icon: Icon, label, value, helper, tone }: { icon: typeof Banknote; label: string; value: string; helper: string; tone: "emerald" | "blue" | "violet" | "amber" }) {
  const tones = { emerald: "from-emerald-500/20 to-emerald-500/5 text-emerald-600", blue: "from-blue-500/20 to-blue-500/5 text-blue-600", violet: "from-violet-500/20 to-violet-500/5 text-violet-600", amber: "from-amber-500/20 to-amber-500/5 text-amber-600" }
  return <Card><CardContent className="pt-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-black tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{helper}</p></div><span className={cn("grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br", tones[tone])}><Icon className="h-5 w-5" /></span></div></CardContent></Card>
}

function FormulaLine({ label, value, positive = false }: { label: string; value: number; positive?: boolean }) {
  return <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className={cn("mt-1 font-mono text-sm font-bold", positive || value > 0 ? "text-emerald-600" : value < 0 ? "text-red-500" : "")}>{value > 0 && !positive ? "+" : ""}{money(value)}</p></div>
}

function StatusBlock({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className={cn("mt-1 text-sm font-bold", ok ? "text-emerald-600" : "text-amber-600")}>{value}</p></div>
}

function EmptyFinance() {
  return <Card><CardContent className="flex min-h-72 flex-col items-center justify-center text-center"><WalletCards className="h-10 w-10 text-muted-foreground" /><h2 className="mt-4 text-lg font-bold">Modelo listo, sin cierres cargados</h2><p className="mt-1 max-w-md text-sm text-muted-foreground">La migración está preparada. Los datos históricos se cargan por un canal privado y nunca se incluyen en el repositorio.</p></CardContent></Card>
}
