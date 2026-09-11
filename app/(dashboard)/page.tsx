"use client"

import Link from "next/link"
import useSWR from "swr"
import { useEffect, useMemo, useState } from "react"
import { ArrowRight, CalendarCheck, CircleDollarSign, Clock3, Kanban, Loader2, MessageCircle, Plus, Receipt, Sparkles, Target, TrendingUp, UsersRound, Zap } from "lucide-react"
import { useSession } from "@/components/session-provider"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { diasHastaFecha, umbralActual } from "@/lib/recordatorios"
import { closerMissing, firstName, setterMissing } from "@/lib/crm-compliance"
import { isContentOnlyAccount } from "@/lib/role-access"

const fetcher = async (url: string) => { const r = await fetch(url); if (!r.ok) throw new Error("Error"); return r.json() }
const money = (value: number) => `USD ${Math.round(value).toLocaleString("es-AR")}`

type Plan = { closer: string | null; plan_pago_items: { monto: number | null; fecha_planeada: string | null; estado: string; ultimo_contacto_at?: string | null }[] }
type Metrics = {
  cash: {
    cc_total: number; revenue: number; ventas_nuevas_revenue: number; roas: number | null; cac: number | null
    ad_spend: number; ad_spend_available: boolean; ad_spend_source?: "meta" | "mercury" | "unavailable"; ad_spend_estimated?: boolean
    feccu: number; feccp: number; beccu: number; beccpp: number
    aov_dia1: number | null; aov_tc: number | null
  }
  funnel: { cierres_fe: number }
  comparacion_cierre: { unidades_cerradas: number; pagos_totales: number }
}
type Agenda = {
  closer: string | null; setter: string | null; call_confirmer: string | null
  fecha_agenda: string | null; fecha_closer: string | null; show: boolean | null; cerro: boolean | null
  estado: string | null; motivo_no_cierre: string | null; link_fathom: string | null
  operacion: string | null; plan_de_pago: string | null; medio_de_pago: string | null
  comprobante: string | null; cc_dia_1: number | null; fecha_tc: string | null
  calificacion: string | null; motivo_urgencia: string | null; problema_actual: string | null
  tiempo_problema: string | null; intentos_previos: string | null; ingresos: string | null
  inversion: string | null; _has_resumen?: boolean
}
type Leaderboard = {
  closers: { nombre: string; cc_total: number; feccu: number; feccpp: number; unidades: number; llamadas: number; tasa_cierre: number; comisiones: number; rate: number }[]
  setters: { nombre: string; cc_total: number; feccu: number; feccpp: number; feccpp_excluido: number; unidades: number; agendas: number; agendas_ab: number; t_agenda: number | null; comisiones: number; rate: number }[]
}
type ReconciliacionData = {
  mes: string
  sistema: {
    revenue: { valor: number; fuente: string; formula: string; conteo_planes: number }
    cash_collected: { valor: number; fuente: string; formula: string; conteo_pagos: number }
  }
  corte_declarado: { revenue: number; cash_collected: number; fecha_corte: string } | null
  diferencias: { revenue: number; cash_collected: number } | null
  nota: string
}
type ProfitInputs = { expenses: number; commissions: number; complete: boolean; expenseRows: number; commissionRows: number; softwareCost: number; softwareSourceMonth: string; softwareEstimated: boolean; pendingInstallments: number; pendingInstallmentCount: number }
type HomeExceptions = { total: number; overdue: number; high: number; items: { issue_key: string; issue_type: string; entity_name: string; due_at: string }[] }
type AccountScope = "general" | "paul" | "cris"

function LegacyHomePage() {
  const [greeting, setGreeting] = useState("Hola")
  useEffect(() => {
    const hour = new Date().getHours()
    setGreeting(hour < 12 ? "Buen día" : hour < 19 ? "Buenas tardes" : "Buenas noches")
  }, [])
  const session = useSession()
  const manager = session.rol === "CEO" || session.rol === "Contaduria"
  const { data: planes = [], isLoading: loadingPlans } = useSWR<Plan[]>("/api/planes-pago", fetcher)
  const { data: metrics, isLoading: loadingMetrics } = useSWR<Metrics>("/api/metricas?start=" + monthStart() + "&end=" + monthEnd(), fetcher)
  const { data: agendas = [], isLoading: loadingAgendas } = useSWR<Agenda[]>("/api/agendas?light=1&start=" + monthStart() + "&end=" + monthEnd(), fetcher)
  const monthKey = monthStart().slice(0, 7)
  const { data: leaderboard, isLoading: loadingLeaderboard } = useSWR<Leaderboard>("/api/leaderboard?month=" + monthKey, fetcher)
  const owner = firstName(session.nombre)
  const ownCloser = leaderboard?.closers.find(row => firstName(row.nombre) === owner)
  const ownSetter = leaderboard?.setters.find(row => firstName(row.nombre) === owner)

  const work = useMemo(() => {
    const rows = planes.flatMap(plan => (plan.plan_pago_items || []).map(item => ({ ...item, closer: firstName(plan.closer || "") })))
      .filter(item => item.estado === "pendiente" && item.fecha_planeada && umbralActual(diasHastaFecha(item.fecha_planeada)))
      .filter(item => manager || !owner || item.closer === owner)
    return {
      overdue: rows.filter(x => diasHastaFecha(x.fecha_planeada!) < 0 && !x.ultimo_contacto_at),
      today: rows.filter(x => diasHastaFecha(x.fecha_planeada!) === 0),
      amount: rows.filter(x => diasHastaFecha(x.fecha_planeada!) < 0).reduce((s, x) => s + Number(x.monto || 0), 0),
    }
  }, [planes, manager, owner])

  const crm = useMemo(() => {
    const mine = manager ? agendas : agendas.filter(a => [a.closer, a.setter, a.call_confirmer].some(value => firstName(value) === owner))
    let calls = 0
    let setting = 0
    for (const a of mine) {
      const isCloser = manager || firstName(a.closer) === owner
      const isSetter = manager || firstName(a.setter) === owner
      if (isCloser && closerMissing(a).length > 0) calls++
      if (isSetter && setterMissing(a).length > 0) setting++
    }
    return { incomplete: calls + setting, calls, setting }
  }, [agendas, manager, owner])

  const loading = loadingPlans || loadingMetrics || loadingAgendas || loadingLeaderboard
  return <div className="crm-command-home page-enter mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6 lg:p-8 xl:p-10">
    <section className="relative overflow-hidden rounded-[28px] bg-[#171316] p-6 text-white shadow-2xl shadow-black/10 sm:p-8">
      <div className="pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full bg-red-600/30 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-32 w-72 rounded-full bg-orange-500/10 blur-3xl" />
      <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <Badge className="mb-4 border-white/10 bg-white/10 text-white hover:bg-white/10"><Sparkles className="mr-1.5 h-3 w-3 text-orange-300" />CENTRO DE OPERACIÓN</Badge>
          <h1 className="text-3xl font-bold tracking-[-.04em] sm:text-4xl">{greeting}, {owner || "equipo"}.</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/55">Acá está lo que importa hoy. Resolvé pendientes, mové oportunidades y cargá cobros sin recorrer todo el CRM.</p>
        </div>
        {/* "Abrir pipeline" / "Cargar venta o pago" se sacaron de la vista CEO
            (Cuenta A: no tienen sentido para su rol). Se mantienen SOLO para
            closer, junto a las Quick actions de mas abajo (Cobrar cuota,
            Registrar un pago, Completar una llamada). */}
        {!manager && (
          <div className="flex flex-wrap gap-2">
            <Button asChild size="lg" className="rounded-xl bg-white text-black shadow-xl hover:bg-white/90"><Link href="/pipeline"><Kanban className="mr-2 h-4 w-4" />Abrir pipeline</Link></Button>
            <Button asChild size="lg" className="rounded-xl bg-red-600 text-white hover:bg-red-500"><Link href="/carga-pagos"><Plus className="mr-2 h-4 w-4" />Cargar venta o pago</Link></Button>
          </div>
        )}
      </div>
    </section>

    {loading ? <div className="grid min-h-72 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div> : <>
      {manager ? <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Metricas del panel CEO confirmadas por Cuenta A (feedback 23/07 lote 2):
            Revenue, Cash Collected, Unidades cerradas, Ventas totales, ROAS
            (fórmula: FECCU efectivamente cobrado / gasto Meta del mes),
            AOV TC (ticket promedio de trato cerrado), AOV Dia 1 (ticket
            promedio de venta inicial antes de upsells), CAC (gasto ads /
            ventas nuevas del mes, mismo denominador que ROAS pero como
            costo), y Cash Collected Frontend/Backend por separado. Todo sale
            de /api/metricas (ya existente), ningun campo inventado. */}
        <Stat label="Revenue" value={money(metrics?.cash.revenue || 0)} helper="valor total vendido este mes" icon={TrendingUp} tone="violet" />
        <Stat label="Cash Collected" value={money(metrics?.cash.cc_total || 0)} helper="dinero que realmente entró" icon={CircleDollarSign} tone="emerald" />
        <Stat label="Unidades cerradas" value={String(metrics?.comparacion_cierre.unidades_cerradas || 0)} helper="clientes nuevos este mes (FE+BE)" icon={UsersRound} tone="blue" />
        <Stat label="Ventas totales" value={String(metrics?.comparacion_cierre.pagos_totales || 0)} helper="cierres + fees del mes" icon={Receipt} tone="orange" />
        <Stat label="ROAS" value={metrics?.cash.roas == null ? "—" : `${metrics.cash.roas.toFixed(2)}x`} helper={metrics?.cash.ad_spend_available ? `FECCU / ${money(metrics.cash.ad_spend)} en ads` : "falta conectar gasto de ads"} icon={Target} tone="orange" />
        <Stat label="CAC" value={metrics?.cash.cac == null ? "—" : money(metrics.cash.cac)} helper="costo por venta nueva (gasto ads / ventas nuevas)" icon={Target} tone="violet" />
        <Stat label="AOV TC" value={metrics?.cash.aov_tc == null ? "—" : money(metrics.cash.aov_tc)} helper="ticket promedio de trato cerrado" icon={TrendingUp} tone="emerald" />
        <Stat label="AOV Día 1" value={metrics?.cash.aov_dia1 == null ? "—" : money(metrics.cash.aov_dia1)} helper="ticket promedio de venta inicial" icon={TrendingUp} tone="blue" />
        <Stat label="Cash Collected FE" value={money((metrics?.cash.feccu || 0) + (metrics?.cash.feccp || 0))} helper="Frontend: FECCU + FECCP" icon={CircleDollarSign} tone="emerald" />
        <Stat label="Cash Collected BE" value={money((metrics?.cash.beccu || 0) + (metrics?.cash.beccpp || 0))} helper="Backend: BECCU + BECCPP" icon={CircleDollarSign} tone="violet" />
      </section> : ownCloser ? <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Tu CC frontend" value={money(ownCloser.cc_total)} helper={`FECCU ${money(ownCloser.feccu)} + FECCPP ${money(ownCloser.feccpp)}`} icon={CircleDollarSign} tone="emerald" />
        <Stat label="Tus unidades" value={String(ownCloser.unidades)} helper="cierres del mes" icon={Target} tone="violet" />
        <Stat label="Llamadas atendidas" value={String(ownCloser.llamadas)} helper="actividad comercial" icon={CalendarCheck} tone="orange" />
        <Stat label="Tu tasa de cierre" value={`${ownCloser.tasa_cierre.toFixed(1)}%`} helper="sobre presentadas" icon={TrendingUp} tone="blue" />
      </section> : ownSetter ? <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="CC comisionable ≤30 días" value={money(ownSetter.cc_total)} helper={`FECCU ${money(ownSetter.feccu)} + FECCPP ${money(ownSetter.feccpp)}`} icon={CircleDollarSign} tone="emerald" />
        <Stat label="Unidades atribuidas" value={String(ownSetter.unidades)} helper="cierres de tus agendas" icon={Target} tone="violet" />
        <Stat label="Tus agendas" value={String(ownSetter.agendas)} helper="volumen del mes" icon={CalendarCheck} tone="orange" />
        <Stat label="Agendas calificadas" value={String(ownSetter.agendas_ab)} helper={ownSetter.t_agenda == null ? "S/A/B" : `${ownSetter.t_agenda.toFixed(1)}% de calidad`} icon={TrendingUp} tone="blue" />
      </section> : <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Pendientes CRM" value={String(crm.incomplete)} helper="asignados a vos" icon={Kanban} tone="violet" />
        <Stat label="Cobros atrasados" value={String(work.overdue.length)} helper={money(work.amount)} icon={Clock3} tone="orange" />
        <Stat label="Vencen hoy" value={String(work.today.length)} helper="requieren seguimiento" icon={CalendarCheck} tone="blue" />
        <Stat label="Estado del día" value={crm.incomplete + work.overdue.length === 0 ? "Al día" : "En progreso"} helper="se actualiza automáticamente" icon={Zap} tone="emerald" />
      </section>}

      {/* Bloque "Conciliacion Revenue vs Cash Collected" sacado del Home a
          pedido de Cuenta A (no lo quiere ver). El endpoint /api/home-ceo-reconciliacion
          y el fetch de mas arriba se dejan (los sigue usando /finanzas si hace
          falta), solo se retira este bloque visual del Home. */}

      <section className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
        <div className="surface overflow-hidden">
          <div className="flex items-center justify-between border-b p-5 sm:p-6"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-muted-foreground">Tu foco ahora</p><h2 className="mt-1 text-xl font-bold tracking-tight">Pendientes de hoy</h2></div><div className="rounded-xl bg-red-500/10 p-2.5 text-red-600"><Zap className="h-5 w-5" /></div></div>
          <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
            <FocusCard href="/recordatorios" icon={Clock3} label="Cobros atrasados" value={String(work.overdue.length)} detail={money(work.amount)} urgent={work.overdue.length > 0} />
            <FocusCard href="/recordatorios" icon={CalendarCheck} label="Vencen hoy" value={String(work.today.length)} detail="contactar y registrar" />
            <FocusCard href="/centro-agendas" icon={Kanban} label="CRM por completar" value={String(crm.incomplete)} detail={`${crm.calls} llamadas · ${crm.setting} setting${manager ? " del equipo" : ""}`} urgent={crm.incomplete > 0} />
          </div>
          <div className="border-t bg-muted/25 px-5 py-3 text-xs text-muted-foreground">Regla simple: si hiciste una acción, registrala en el momento. El CRM se ocupa del resto.</div>
        </div>

        {/* "Acciones rapidas" se saca de la vista CEO (Cuenta A: no le interesa a
            el). Se mantiene SOLO para closer con las 3 acciones que Cuenta A pidio
            explicitamente: Cobrar cuota, Registrar un pago, Completar una
            llamada (sin "Mover una oportunidad", que era la 4ta y no la pidio). */}
        {!manager && (
          <div className="surface p-5 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-muted-foreground">Acciones rápidas</p><h2 className="mt-1 mb-5 text-xl font-bold tracking-tight">¿Qué querés hacer?</h2>
            <div className="space-y-2">
              <Quick href="/recordatorios" icon={MessageCircle} title="Cobrar cuota" detail="WhatsApp + resultado en 2 clics" />
              <Quick href="/carga-pagos" icon={Receipt} title="Registrar un pago" detail="actualiza cash y plan automáticamente" />
              <Quick href="/centro-agendas" icon={CalendarCheck} title="Completar una llamada" detail="show, resultado y seguimiento" />
            </div>
          </div>
        )}
      </section>
    </>}
  </div>
}

export default function HomePage() {
  const [greeting, setGreeting] = useState("Hola")
  useEffect(() => {
    const hour = new Date().getHours()
    setGreeting(hour < 12 ? "Buen día" : hour < 19 ? "Buenas tardes" : "Buenas noches")
  }, [])
  const session = useSession()
  const isContentOnly = isContentOnlyAccount(session.email.trim().toLowerCase())
  const isCEO = session.rol === "CEO"
  const isSalesManager = session.rol === "Sales Manager"
  const isMarketingManager = session.rol === "Manager MKT"
  const isCSM = session.rol === "CSM"
  const isAccounting = session.rol === "Contaduria"
  const isSetter = session.rol === "Setter"
  const isCloser = session.rol === "Closer"
  const hasCommercialMetrics = isCEO || isSalesManager
  const owner = firstName(session.nombre)
  const [monthKey, setMonthKey] = useState(currentMonthKey)
  const [accountScope, setAccountScope] = useState<AccountScope>(isContentOnly ? "cris" : "general")
  const selectedMonth = monthWindow(monthKey)
  const effectiveAccountScope: AccountScope = isContentOnly ? "cris" : accountScope
  const accountQuery = effectiveAccountScope === "general" ? "" : `&account=${effectiveAccountScope}`

  const { data: metrics, isLoading: loadingMetrics } = useSWR<Metrics>(hasCommercialMetrics ? `/api/metricas?start=${selectedMonth.start}&end=${selectedMonth.end}${accountQuery}` : null, fetcher, { refreshInterval: 60000 })
  const { data: profitInputs, isLoading: loadingProfit } = useSWR<ProfitInputs>(isCEO ? `/api/home-ceo-profit?month=${monthKey}${accountQuery}` : null, fetcher)
  const { data: agendas = [], isLoading: loadingAgendas } = useSWR<Agenda[]>(isSetter || isCloser ? `/api/agendas?light=1&mine=1&start=${selectedMonth.start}&end=${selectedMonth.end}` : null, fetcher)
  const { data: planes = [], isLoading: loadingPlans } = useSWR<Plan[]>(isCloser ? "/api/planes-pago?mine=1" : isAccounting ? "/api/planes-pago" : null, fetcher)
  const { data: leaderboard, isLoading: loadingLeaderboard } = useSWR<Leaderboard>((isSetter || isCloser || hasCommercialMetrics) && !isContentOnly ? `/api/leaderboard?month=${monthKey}` : null, fetcher, { refreshInterval: hasCommercialMetrics ? 60000 : 0 })
  const { data: exceptions, isLoading: loadingExceptions } = useSWR<HomeExceptions>(!isSetter && !isCloser && !isContentOnly ? "/api/home-exceptions" : null, fetcher, { refreshInterval: 60000 })

  const ownCloser = leaderboard?.closers.find(row => firstName(row.nombre) === owner)
  const ownSetter = leaderboard?.setters.find(row => firstName(row.nombre) === owner)
  const ownTasks = useMemo(() => {
    const calls = isCloser ? agendas.filter(agenda => closerMissing(agenda).length > 0).length : 0
    const setting = isSetter ? agendas.filter(agenda => setterMissing(agenda).length > 0).length : 0
    const rows = isCloser || isAccounting ? planes.flatMap(plan => (plan.plan_pago_items || []).map(item => ({ ...item, closer: firstName(plan.closer || "") })))
      .filter(item => item.estado === "pendiente" && item.fecha_planeada && umbralActual(diasHastaFecha(item.fecha_planeada))) : []
    return {
      calls,
      setting,
      overdue: rows.filter(item => diasHastaFecha(item.fecha_planeada!) < 0 && !item.ultimo_contacto_at),
      today: rows.filter(item => diasHastaFecha(item.fecha_planeada!) === 0),
    }
  }, [agendas, planes, isAccounting, isCloser, isSetter])

  const loading = isContentOnly
    ? loadingMetrics || loadingProfit
    : isCEO
    ? loadingMetrics || loadingProfit || loadingLeaderboard || loadingExceptions
    : isSalesManager
      ? loadingMetrics || loadingLeaderboard || loadingExceptions
      : isSetter || isCloser
        ? loadingAgendas || loadingPlans || loadingLeaderboard
        : isAccounting
          ? loadingPlans || loadingExceptions
          : loadingExceptions
  const cash = metrics?.cash
  const goal = 100000
  const progress = Math.min(100, ((cash?.cc_total || 0) / goal) * 100)
  const profit = profitInputs?.complete ? (cash?.cc_total || 0) - profitInputs.expenses - profitInputs.commissions : null
  const commercialCommissions = [...(leaderboard?.closers || []), ...(leaderboard?.setters || [])].reduce((sum, row) => sum + Number(row.comisiones || 0), 0)
  const acquisitionCost = (cash?.ad_spend || 0) + (profitInputs?.softwareCost || 0) + commercialCommissions
  const fullyLoadedCac = cash?.ad_spend_available && (metrics?.funnel.cierres_fe || 0) > 0 ? acquisitionCost / metrics!.funnel.cierres_fe : null
  const elapsedDays = monthKey === currentMonthKey() ? new Date().getDate() : selectedMonth.days
  const dailyAverage = (cash?.cc_total || 0) / Math.max(1, elapsedDays)

  return <div className="page-enter mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8 xl:p-10">
    {!isCEO && <section className="surface overflow-hidden border-red-500/15">
      <div className="flex items-center justify-between border-b bg-gradient-to-r from-red-500/10 to-orange-500/5 p-5 sm:p-6">
        <div><p className="text-xs font-bold uppercase tracking-[.18em] text-red-500">Tu foco ahora</p><h1 className="mt-1 text-2xl font-bold tracking-tight">{isSalesManager || isMarketingManager ? "Excepciones de tu equipo" : `Pendientes exactos de ${owner || "tu usuario"}`}</h1><p className="mt-1 text-sm text-muted-foreground">Responsable, SLA y próxima acción visibles; sin recordatorios genéricos.</p></div>
        <div className="rounded-2xl bg-red-500/10 p-3 text-red-500"><Zap className="h-6 w-6" /></div>
      </div>
      {loading ? <div className="grid min-h-40 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-red-500" /></div> : <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
        {isSetter ? <>
          <FocusCard href="/centro-agendas" icon={Kanban} label="Agendas por completar" value={String(ownTasks.setting)} detail="setting asignado a vos" urgent={ownTasks.setting > 0} />
          <FocusCard href="/ventas" icon={CalendarCheck} label="Tus agendas del mes" value={String(ownSetter?.agendas || 0)} detail="solo tu producción" />
          <FocusCard href="/ventas" icon={Target} label="Calificadas S/A/B" value={String(ownSetter?.agendas_ab || 0)} detail="calidad de tus agendas" />
        </> : isCloser ? <>
          <FocusCard href="/centro-agendas" icon={Kanban} label="Llamadas por completar" value={String(ownTasks.calls)} detail="closing asignado a vos" urgent={ownTasks.calls > 0} />
          <FocusCard href="/recordatorios" icon={Clock3} label="Cobros atrasados" value={String(ownTasks.overdue.length)} detail="solo clientes tuyos" urgent={ownTasks.overdue.length > 0} />
          <FocusCard href="/recordatorios" icon={CalendarCheck} label="Vencen hoy" value={String(ownTasks.today.length)} detail="solo clientes tuyos" urgent={ownTasks.today.length > 0} />
        </> : isAccounting ? <>
          <FocusCard href="/recordatorios" icon={Clock3} label="Cobros atrasados" value={String(ownTasks.overdue.length)} detail="cartera completa" urgent={ownTasks.overdue.length > 0} />
          <FocusCard href="/recordatorios" icon={CalendarCheck} label="Vencen hoy" value={String(ownTasks.today.length)} detail="requieren gestión" urgent={ownTasks.today.length > 0} />
          <FocusCard href="/finanzas" icon={Receipt} label="Control financiero" value="Abrir" detail="conciliación y cierre" />
        </> : <>
          <FocusCard href="/calidad-datos" icon={Zap} label="Excepciones abiertas" value={String(exceptions?.total || 0)} detail="solo tu alcance operativo" urgent={(exceptions?.total || 0) > 0} />
          <FocusCard href="/calidad-datos" icon={Clock3} label="SLA vencido" value={String(exceptions?.overdue || 0)} detail="prioridad inmediata" urgent={(exceptions?.overdue || 0) > 0} />
          <FocusCard href={isMarketingManager ? "/contenido" : isCSM ? "/clientes" : "/equipo"} icon={Target} label="Prioridad alta" value={String(exceptions?.high || 0)} detail="con evidencia y responsable" urgent={(exceptions?.high || 0) > 0} />
        </>}
      </div>}
    </section>}

    <section className="command-hero">
      <div className="command-scanline" />
      <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div><Badge className="mb-4 border-red-400/25 bg-red-400/10 text-red-100 hover:bg-red-400/10"><Sparkles className="mr-1.5 h-3 w-3 text-orange-300" />CENTRO DE COMANDOS · ONLINE</Badge><h2 className="text-3xl font-black tracking-[-.05em] sm:text-5xl">{greeting}, {owner || "equipo"}.</h2><p className="mt-2 text-sm text-white/55">{isCEO ? "Dinero, riesgos y oportunidades del negocio." : "Tu rendimiento y tus responsabilidades, sin ruido."}</p></div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-2 text-[10px] font-bold uppercase tracking-[.14em] text-white/55 backdrop-blur-sm">
            <CalendarCheck className="h-3.5 w-3.5 text-white/40" />
            <select value={monthKey} onChange={event => setMonthKey(event.target.value)} aria-label="Mes del panel" className="cursor-pointer appearance-none bg-transparent pr-1 text-[11px] font-bold capitalize text-white outline-none">
              {monthOptions().map(option => <option key={option.value} value={option.value} className="bg-[#171316] text-white">{option.label}</option>)}
            </select>
          </label>
          <div className="command-live"><span className="command-live-dot" /> SISTEMA ACTIVO</div>
        </div>
      </div>
    </section>

    {isCEO && !isContentOnly && <section className="flex flex-wrap gap-2 rounded-2xl border border-white/8 bg-white/[.025] p-2" aria-label="Cuenta del panel">
      {([['general', 'General'], ['paul', 'Cuenta A'], ['cris', 'Cuenta B']] as const).map(([value, label]) => (
        <button key={value} type="button" onClick={() => setAccountScope(value)} className={`rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-[.12em] transition ${accountScope === value ? 'bg-white text-black shadow-lg' : 'text-white/50 hover:bg-white/5 hover:text-white'}`}>
          {label}
        </button>
      ))}
    </section>}

    {loading ? <div className="grid min-h-72 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div> : isCEO ? <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        <Stat label="Revenue" value={money(cash?.revenue || 0)} helper="valor contractual vendido" icon={TrendingUp} tone="violet" />
        <Stat label="Cash Collected" value={money(cash?.cc_total || 0)} helper="FE + BE efectivamente cobrado" icon={CircleDollarSign} tone="emerald" />
        <Stat label="FECCU" value={money(cash?.feccu || 0)} helper="frontend cash collected upfront" icon={CircleDollarSign} tone="emerald" />
        <Stat label="FECCPP" value={money(cash?.feccp || 0)} helper="frontend cash collected payment plans" icon={Receipt} tone="blue" />
        <Stat label="CUOTAS PENDIENTES" value={money(profitInputs?.pendingInstallments || 0)} helper={`${profitInputs?.pendingInstallmentCount || 0} cuotas por cobrar de tratos cerrados`} icon={Clock3} tone="orange" />
        <Stat label="Promedio diario" value={money(dailyAverage)} helper={`cash collected ÷ ${elapsedDays} días transcurridos`} icon={TrendingUp} tone="emerald" />
        <Stat label="ROAS" value={cash?.roas == null ? "—" : `${cash.roas.toFixed(2)}x`} helper={cash?.ad_spend_source === "meta" ? `FECCU ÷ ${money(cash.ad_spend)} Meta Ads · actualiza cada minuto` : cash?.ad_spend_source === "mercury" ? `Estimado con ${money(cash.ad_spend)} debitado en Mercury` : "esperando gasto de Meta Ads"} icon={Target} tone="orange" />
        <Stat label="AOV TC" value={cash?.aov_tc == null ? "—" : money(cash.aov_tc)} helper="ticket promedio de trato cerrado" icon={TrendingUp} tone="violet" />
        <Stat label="AOV" value={cash?.aov_dia1 == null ? "—" : money(cash.aov_dia1)} helper="ticket promedio cobrado día 1" icon={TrendingUp} tone="blue" />
      </section>
      <section className="command-goal">
        <div className="command-orbit-wrap">
          <div className="command-orbit command-orbit-one" />
          <div className="command-orbit command-orbit-two" />
          <div className="command-goal-core">
            <span className="text-[10px] font-black uppercase tracking-[.22em] text-red-300">Meta mensual</span>
            <strong>{progress.toFixed(1)}%</strong>
            <span>{money(cash?.cc_total || 0)}</span>
          </div>
        </div>
        <div className="relative z-10 min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[.22em] text-red-300">Avance en tiempo real</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">Objetivo Cash Collected · USD 100K</h2>
          <p className="mt-2 text-sm text-white/45">FECCU + FECCPP + BECCU + BECCPP</p>
          <div className="command-progress"><div style={{ width: `${progress}%` }} /></div>
          <div className="mt-3 flex justify-between text-xs text-white/45"><span>USD 0</span><span>Faltan {money(Math.max(0, goal - (cash?.cc_total || 0)))}</span><span>USD 100K</span></div>
        </div>
      </section>
      <section><div className="mb-3"><p className="text-xs font-bold uppercase tracking-[.18em] text-red-500">Solo CEO</p><h2 className="text-xl font-bold">Rentabilidad y backend</h2></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {effectiveAccountScope === "general"
          ? <Stat label="CAC integral" value={fullyLoadedCac == null ? "—" : money(fullyLoadedCac)} helper={`Ads ${money(cash?.ad_spend || 0)} + software ${money(profitInputs?.softwareCost || 0)} + comisiones ${money(commercialCommissions)} ÷ ${metrics?.funnel.cierres_fe || 0} cierres${profitInputs?.softwareEstimated ? ` · software base ${profitInputs.softwareSourceMonth}` : ""}`} icon={Target} tone="orange" />
          : <Stat label="CAC de pauta" value={cash?.cac == null ? "—" : money(cash.cac)} helper={`Pauta de esta cuenta ÷ ${metrics?.funnel.cierres_fe || 0} cierres FE`} icon={Target} tone="orange" />}
        <Stat label="BECCU" value={money(cash?.beccu || 0)} helper="backend upfront" icon={CircleDollarSign} tone="violet" />
        <Stat label="BECCPP" value={money(cash?.beccpp || 0)} helper="backend payment plans" icon={Receipt} tone="blue" />
        {effectiveAccountScope === "general" && <Stat label="Profit" value={profit == null ? "Pendiente" : money(profit)} helper={profit == null ? "faltan gastos/comisiones del mes" : `Cash − ${money((profitInputs?.expenses || 0) + (profitInputs?.commissions || 0))} de gastos y comisiones`} icon={TrendingUp} tone="emerald" />}
      </div></section>
    </> : isSalesManager ? <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="Cash del equipo" value={money(cash?.cc_total || 0)} helper="sin acceso a cierres o administración crítica" icon={CircleDollarSign} tone="emerald" />
      <Stat label="Unidades cerradas" value={String(metrics?.comparacion_cierre.unidades_cerradas || 0)} helper="equipo comercial este mes" icon={Target} tone="violet" />
      <Stat label="Excepciones abiertas" value={String(exceptions?.total || 0)} helper="setter, closer y CSM" icon={Kanban} tone="blue" />
      <Stat label="SLA vencido" value={String(exceptions?.overdue || 0)} helper="requiere intervención" icon={Clock3} tone="orange" />
    </section> : isMarketingManager || isCSM || isAccounting ? <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="Excepciones abiertas" value={String(exceptions?.total || 0)} helper="solo tu alcance operativo" icon={Kanban} tone="blue" />
      <Stat label="SLA vencido" value={String(exceptions?.overdue || 0)} helper="prioridad inmediata" icon={Clock3} tone="orange" />
      <Stat label="Prioridad alta" value={String(exceptions?.high || 0)} helper="con evidencia y responsable" icon={Zap} tone="violet" />
      <Stat label="Estado" value={(exceptions?.overdue || 0) === 0 ? "Al día" : "Intervenir"} helper="actualiza cada minuto" icon={Target} tone="emerald" />
    </section> : <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {isCloser ? <>
        <Stat label="Tu CC frontend" value={money(ownCloser?.cc_total || 0)} helper={`FECCU ${money(ownCloser?.feccu || 0)} + FECCPP ${money(ownCloser?.feccpp || 0)}`} icon={CircleDollarSign} tone="emerald" />
        <Stat label="Tus unidades" value={String(ownCloser?.unidades || 0)} helper="cierres del mes" icon={Target} tone="violet" />
        <Stat label="Llamadas atendidas" value={String(ownCloser?.llamadas || 0)} helper="solo actividad tuya" icon={CalendarCheck} tone="orange" />
        <Stat label="Tu tasa de cierre" value={`${(ownCloser?.tasa_cierre || 0).toFixed(1)}%`} helper="sobre tus presentadas" icon={TrendingUp} tone="blue" />
      </> : <>
        <Stat label="CC comisionable ≤30 días" value={money(ownSetter?.cc_total || 0)} helper={`FECCU ${money(ownSetter?.feccu || 0)} + FECCPP ${money(ownSetter?.feccpp || 0)}`} icon={CircleDollarSign} tone="emerald" />
        <Stat label="Unidades atribuidas" value={String(ownSetter?.unidades || 0)} helper="cierres de tus agendas" icon={Target} tone="violet" />
        <Stat label="Tus agendas" value={String(ownSetter?.agendas || 0)} helper="volumen del mes" icon={CalendarCheck} tone="orange" />
        <Stat label="Calificadas" value={String(ownSetter?.agendas_ab || 0)} helper="S/A/B" icon={TrendingUp} tone="blue" />
      </>}
    </section>}
  </div>
}

function Stat({ label, value, helper, icon: Icon, tone }: { label: string; value: string; helper: string; icon: typeof Target; tone: "emerald" | "violet" | "orange" | "blue" }) {
  const colors = { emerald: "command-tone-emerald", violet: "command-tone-violet", orange: "command-tone-orange", blue: "command-tone-blue" }
  return <article className={`command-stat page-enter stagger-1 ${colors[tone]}`}><div className="command-stat-glow" /><div className="relative z-10 flex items-start justify-between gap-3"><p className="command-stat-label">{label}</p><span className="command-stat-icon"><Icon className="h-4 w-4" /></span></div><p className="command-stat-value">{value}</p><div className="command-stat-signal"><i /><i /><i /><i /><i /></div></article>
}

function FocusCard({ href, icon: Icon, label, value, detail, urgent }: { href: string; icon: typeof Clock3; label: string; value: string; detail: string; urgent?: boolean }) {
  return <Link href={href} className={`group rounded-2xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg ${urgent ? "border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-500/5" : "bg-background"}`}><div className="flex items-center justify-between"><Icon className={`h-5 w-5 ${urgent ? "text-red-600" : "text-muted-foreground"}`} /><ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" /></div><p className="mt-5 text-3xl font-bold">{value}</p><p className="mt-1 text-sm font-semibold">{label}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></Link>
}

function Quick({ href, icon: Icon, title, detail }: { href: string; icon: typeof Receipt; title: string; detail: string }) {
  return <Link href={href} className="group flex items-center gap-3 rounded-2xl border border-transparent p-3 transition-all hover:border-border hover:bg-muted/50"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-foreground text-background"><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{title}</span><span className="block truncate text-xs text-muted-foreground">{detail}</span></span><ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" /></Link>
}

function monthStart() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01` }
function monthEnd() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10) }
function currentMonthKey() { return monthStart().slice(0, 7) }
function monthWindow(key: string) {
  const [year, month] = key.split("-").map(Number)
  const days = new Date(year, month, 0).getDate()
  return { start: `${key}-01`, end: `${key}-${String(days).padStart(2, "0")}`, days }
}
function monthOptions() {
  const formatter = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" })
  const now = new Date()
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1)
    return {
      value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: formatter.format(date),
    }
  })
}
