"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { CalendarRange, Loader2, Target, TrendingUp, Gauge, Users, Radar, BadgeCheck } from "lucide-react"
import { CrmPageIntro, CrmStat, CrmEmpty } from "@/components/crm-ui"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const fetcher = (url: string) => fetch(url).then(r => r.json())

type TableroData = {
  periodo: { start: string; end: string; tz_note: string }
  agendas_por_origen: Array<{ nombre: string; cantidad: number }>
  scoring: {
    total_agendas: number
    calificadas: number
    pct_calificadas: number | null
    desglose: Array<{ calificacion: string; cantidad: number }>
  }
  presentadas: { cantidad: number; denominador_agendas: number }
  ventas: { cantidad: number }
  revenue: { total: number; formula: string }
  cash_collected: { total: number; formula: string }
  por_closer: Array<{
    closer: string; revenue: number; cash_collected: number; ventas: number
    llamadas_presentadas: number; cerradas: number; tasa_cierre: number | null
  }>
  meta_mensual: {
    valor: number; semanas_del_mes: number; objetivo_semanal: number
    formula_objetivo_semanal: string; avance_semana_actual_pct: number | null
    cash_collected_mes_a_la_fecha: number; faltante_mensual: number
    semanas_restantes_incluyendo_actual: number; ritmo_necesario_semanal: number
    formula_ritmo: string
  }
}

const fUSD = (n: number) => "USD " + Math.round(n).toLocaleString("es-AR")
const fPct = (n: number | null) => n === null ? "—" : `${n.toFixed(1)}%`

function formatDay(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`)
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" })
}

export default function TableroSemanalPage() {
  const [errorInfo, setErrorInfo] = useState<string | null>(null)
  const { data, isLoading } = useSWR<TableroData>("/api/tablero-semanal", (url: string) =>
    fetcher(url).then(d => { if (d.error) { setErrorInfo(d.error); throw new Error(d.error) }; setErrorInfo(null); return d })
  )

  const progressPct = useMemo(() => Math.min(100, Math.max(0, data?.meta_mensual.avance_semana_actual_pct ?? 0)), [data])

  return (
    <div className="crm-module-page">
      <CrmPageIntro
        eyebrow="Semana en curso"
        title="Tablero semanal"
        description={data ? `${formatDay(data.periodo.start)} al ${formatDay(data.periodo.end)} · datos canónicos del CRM` : "Cargando período de la semana actual"}
        icon={<CalendarRange className="h-6 w-6" />}
        tone="blue"
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : errorInfo || !data ? (
        <CrmEmpty icon={<Target className="h-6 w-6" />} title="No se pudo calcular el tablero" detail={errorInfo || "Error desconocido leyendo datos canónicos."} />
      ) : (
        <>
          <div className="crm-kpis">
            <CrmStat label="Agendas de la semana" value={String(data.scoring.total_agendas)} detail={`origen: ${data.agendas_por_origen.length} fuentes`} icon={<Radar className="h-5 w-5" />} tone="blue" />
            <CrmStat label="Calificadas S/A/B" value={`${data.scoring.calificadas} / ${data.scoring.total_agendas}`} detail={fPct(data.scoring.pct_calificadas)} icon={<BadgeCheck className="h-5 w-5" />} tone="violet" />
            <CrmStat label="Presentadas" value={`${data.presentadas.cantidad} / ${data.presentadas.denominador_agendas}`} detail="show sobre agendas de la semana" icon={<Users className="h-5 w-5" />} tone="amber" />
            <CrmStat label="Ventas" value={String(data.ventas.cantidad)} detail="unidades cerradas en la semana" icon={<TrendingUp className="h-5 w-5" />} tone="emerald" />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card className="border border-border">
              <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Revenue vs Cash Collected — semana</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Revenue contractual</span><span className="text-xl font-black">{fUSD(data.revenue.total)}</span></div>
                <p className="text-xs text-muted-foreground">{data.revenue.formula}</p>
                <div className="flex items-center justify-between pt-2 border-t"><span className="text-sm text-muted-foreground">Cash Collected</span><span className="text-xl font-black text-emerald-600">{fUSD(data.cash_collected.total)}</span></div>
                <p className="text-xs text-muted-foreground">{data.cash_collected.formula}</p>
              </CardContent>
            </Card>

            <Card className="border border-border">
              <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Agendas por origen</CardTitle></CardHeader>
              <CardContent>
                {data.agendas_por_origen.length === 0 ? <p className="text-sm text-muted-foreground">Sin agendas en la semana.</p> : (
                  <div className="space-y-1.5">
                    {data.agendas_por_origen.map(row => (
                      <div key={row.nombre} className="flex items-center justify-between text-sm">
                        <span className="truncate text-muted-foreground">{row.nombre}</span>
                        <span className="font-bold">{row.cantidad}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border border-border">
            <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Revenue y Cash Collected por closer</CardTitle></CardHeader>
            <CardContent className="pt-2">
              {data.por_closer.length === 0 ? <p className="text-sm text-muted-foreground py-4">Sin ventas ni llamadas atribuidas esta semana.</p> : (
                <div className="crm-scroll-shell">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Closer</TableHead>
                        <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Revenue</TableHead>
                        <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Cash Collected</TableHead>
                        <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Ventas</TableHead>
                        <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Presentadas / Cerradas</TableHead>
                        <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Tasa de cierre</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.por_closer.map(row => (
                        <TableRow key={row.closer} className="hover:bg-muted/50">
                          <TableCell className="font-medium">{row.closer}</TableCell>
                          <TableCell>{fUSD(row.revenue)}</TableCell>
                          <TableCell className="font-semibold text-emerald-600">{fUSD(row.cash_collected)}</TableCell>
                          <TableCell className="text-center">{row.ventas}</TableCell>
                          <TableCell className="text-center">{row.llamadas_presentadas} / {row.cerradas}</TableCell>
                          <TableCell>{fPct(row.tasa_cierre)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/30 font-semibold">
                        <TableCell className="text-xs uppercase text-muted-foreground">Total semanal</TableCell>
                        <TableCell>{fUSD(data.revenue.total)}</TableCell>
                        <TableCell className="text-emerald-600">{fUSD(data.cash_collected.total)}</TableCell>
                        <TableCell className="text-center">{data.ventas.cantidad}</TableCell>
                        <TableCell />
                        <TableCell />
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <section className="overflow-hidden rounded-[30px] border border-white/10 bg-zinc-950 p-5 text-white shadow-[0_22px_70px_rgba(0,0,0,.28)] sm:p-7">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-black uppercase tracking-[.18em] text-blue-300">Objetivo semanal (meta mensual USD {data.meta_mensual.valor.toLocaleString("es-AR")} / {data.meta_mensual.semanas_del_mes} semanas)</p>
                <p className="mt-1 text-3xl font-black sm:text-4xl">{fUSD(data.cash_collected.total)} <span className="text-lg text-white/35">/ {fUSD(data.meta_mensual.objetivo_semanal)}</span></p>
              </div>
              <p className="text-2xl font-black text-amber-300">{fPct(data.meta_mensual.avance_semana_actual_pct)}</p>
            </div>
            <div className="mt-5 h-5 overflow-hidden rounded-full border border-white/10 bg-white/[.06]">
              <div className="h-full rounded-full bg-gradient-to-r from-blue-600 via-fuchsia-400 to-amber-300 shadow-[0_0_24px_rgba(251,191,36,.45)] transition-[width] duration-1000" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="mt-2 text-xs text-white/40">{data.meta_mensual.formula_objetivo_semanal}</p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/[.08] bg-white/[.04] p-4">
                <p className="text-[11px] font-black uppercase tracking-[.14em] text-white/45">Cash Collected mes a la fecha</p>
                <p className="mt-1 text-2xl font-black">{fUSD(data.meta_mensual.cash_collected_mes_a_la_fecha)}</p>
                <p className="mt-1 text-xs text-white/40">Faltante para meta mensual: {fUSD(data.meta_mensual.faltante_mensual)}</p>
              </div>
              <div className="rounded-2xl border border-white/[.08] bg-white/[.04] p-4">
                <p className="text-[11px] font-black uppercase tracking-[.14em] text-white/45 flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5" />Ritmo necesario / semana restante</p>
                <p className="mt-1 text-2xl font-black">{fUSD(data.meta_mensual.ritmo_necesario_semanal)}</p>
                <p className="mt-1 text-xs text-white/40">{data.meta_mensual.semanas_restantes_incluyendo_actual} semana(s) restante(s) · {data.meta_mensual.formula_ritmo}</p>
              </div>
            </div>
          </section>

          <p className="text-[11px] text-muted-foreground">{data.periodo.tz_note}</p>
        </>
      )}
    </div>
  )
}
