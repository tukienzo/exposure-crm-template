"use client"

import { useState } from "react"
import useSWR from "swr"
import { DateFilter } from "@/components/date-filter"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, ChartNoAxesCombined, CircleDollarSign, Gauge, Trophy, TrendingUp } from "lucide-react"
import { CrmPageIntro, CrmStat } from "@/components/crm-ui"
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function filterToParams(filter: string): string {
  if (!filter || filter === "all") return ""
  if (filter.startsWith("range:")) {
    const parts = filter.slice(6).split(":")
    return "?start=" + parts[0] + "&end=" + parts[1]
  }
  return ""
}

function parseLocalDate(str: string | null): Date | null {
  if (!str) return null
  const s = str.split("T")[0]
  const parts = s.split("-").map(Number)
  if (parts.length !== 3) return null
  return new Date(parts[0], parts[1] - 1, parts[2])
}

const MONTHS_SHORT = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]

// Cantidad de dias del periodo para el promedio diario (mismo criterio que Vista General:
// dias calendario transcurridos, no solo los dias que tuvieron algun pago cargado).
function diasDelPeriodo(filter: string): number {
  const now = new Date()
  const hoy = now.getDate()
  const diasEnMes = (y: number, m: number) => new Date(y, m, 0).getDate()
  if (filter.startsWith("month:")) {
    const [y, m] = filter.slice(6).split("-").map(Number)
    if (y === now.getFullYear() && m === now.getMonth() + 1) return hoy
    return diasEnMes(y, m)
  }
  if (filter.startsWith("range:")) {
    const [s, e] = filter.slice(6).split(":")
    const start = parseLocalDate(s)
    let end = parseLocalDate(e)
    if (start && end) {
      if (end > now) end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
    }
  }
  if (filter === "today") return 1
  if (filter === "last-month") { const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1); return diasEnMes(lm.getFullYear(), lm.getMonth() + 1) }
  if (filter === "this-year") { const start = new Date(now.getFullYear(), 0, 1); return Math.max(1, Math.round((now.getTime() - start.getTime()) / 86400000) + 1) }
  // this-month / all / this-week -> dias transcurridos del mes actual
  return hoy
}

function buildDailyData(pagos: any[]) {
  const filtered = pagos
  const byDate: Record<string, number> = {}
  for (const pago of filtered) {
    const key = pago.fecha ? pago.fecha.split("T")[0] : null
    if (!key) continue
    byDate[key] = (byDate[key] || 0) + Number(pago.monto || 0)
  }
  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateStr, amount]) => {
      const [, m, d] = dateStr.split("-").map(Number)
      return { date: `${d} ${MONTHS_SHORT[m - 1]}`, amount: Math.round(amount) }
    })
}

export default function EvolucionDiariaPage() {
  const [dateFilter, setDateFilter] = useState("this-month")
  const params = filterToParams(dateFilter)
  const { data: pagosData, isLoading } = useSWR(`/api/pagos${params}`, fetcher)

  const pagos = pagosData || []
  const dailyData = buildDailyData(pagos)

  const totalCash = dailyData.reduce((s, d) => s + d.amount, 0)
  const diasProm = diasDelPeriodo(dateFilter)
  const avgDaily = diasProm > 0 ? Math.round(totalCash / diasProm) : 0
  const maxDay = dailyData.length > 0 ? Math.max(...dailyData.map((d) => d.amount)) : 0
  const growth =
    dailyData.length >= 2
      ? (((dailyData[dailyData.length - 1].amount - dailyData[0].amount) / (dailyData[0].amount || 1)) * 100).toFixed(1)
      : "0"

  return (
    <div className="crm-module-page">
      <CrmPageIntro
        eyebrow="Tendencia de cash"
        title="Evolución diaria"
        description="Detectá picos, promedios y cambios de velocidad sin perder la referencia del período."
        icon={<ChartNoAxesCombined className="h-6 w-6" />}
        tone="fuchsia"
        actions={<div className="[&_button]:border-white/10 [&_button]:bg-white/10 [&_button]:text-white"><DateFilter onFilterChange={setDateFilter} /></div>}
      />

      <div className="crm-kpis">
        <CrmStat label="Total del período" value={`$${totalCash.toLocaleString()}`} detail={`${dailyData.length} días con cobros`} icon={<CircleDollarSign className="h-5 w-5" />} tone="fuchsia" />
        <CrmStat label="Promedio diario" value={`$${avgDaily.toLocaleString()}`} detail={`${diasProm} día${diasProm === 1 ? "" : "s"} calendario`} icon={<Gauge className="h-5 w-5" />} tone="blue" />
        <CrmStat label="Mejor día" value={`$${maxDay.toLocaleString()}`} detail="máximo cash diario" icon={<Trophy className="h-5 w-5" />} tone="emerald" />
        <CrmStat label="Crecimiento" value={`${Number(growth) >= 0 ? "+" : ""}${growth}%`} detail="primer vs. último día con cash" icon={<TrendingUp className="h-5 w-5" />} tone={Number(growth) >= 0 ? "emerald" : "red"} />
      </div>

      <Card className="border-0">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Evolución del Efectivo Cobrado</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-80">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : dailyData.length === 0 ? (
            <div className="flex items-center justify-center h-80 text-muted-foreground">
              No hay datos en este período
            </div>
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyData}>
                  <defs>
                    <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }}
                    labelStyle={{ color: "var(--foreground)" }}
                    formatter={(value: number) => [`$${value.toLocaleString()}`, "Efectivo"]}
                  />
                  <Area type="monotone" dataKey="amount" stroke="var(--primary)" strokeWidth={2} fillOpacity={1} fill="url(#colorAmount)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-0">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Efectivo por Día</CardTitle>
        </CardHeader>
        <CardContent>
          {dailyData.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              No hay datos en este período
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }}
                    labelStyle={{ color: "var(--foreground)" }}
                    formatter={(value: number) => [`$${value.toLocaleString()}`, "Efectivo"]}
                  />
                  <Bar dataKey="amount" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
