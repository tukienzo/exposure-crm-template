import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { newSalesRevenue, revenueFromPlans } from "@/lib/revenue"
import { isCashCollectedType, sumCashCollected } from "@/lib/cash-collected"

export const dynamic = "force-dynamic"

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error("Missing Supabase config")
  return createClient(url, key)
}

// Cortes declarados por Cuenta A explícitamente para reconciliar contra el
// sistema. Nunca se usan para reemplazar el cálculo del sistema: solo para
// mostrar la diferencia auditable. Si Cuenta A declara un corte nuevo para otro
// mes, agregar la entrada acá con su fecha de corte; nunca inferir.
const CORTES_DECLARADOS: Record<string, { revenue: number; cash_collected: number; fecha_corte: string }> = {
  "2026-07": { revenue: 50167, cash_collected: 24574, fecha_corte: "2026-07-23" },
}

function r2(n: number) { return Math.round(n * 100) / 100 }

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const now = new Date()
    const mes = searchParams.get("month") || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    const [year, monthNum] = mes.split("-").map(Number)
    const start = `${mes}-01`
    const end = `${mes}-${String(new Date(year, monthNum, 0).getDate()).padStart(2, "0")}`

    const sb = getSupabase()
    const [
      { data: pagos, error: pErr },
      { data: planesAlta, error: plaErr },
      { data: planesSinAlta, error: plsErr },
    ] = await Promise.all([
      sb.from("pagos").select("fecha,tipo,monto,operacion,cliente").eq("record_status", "active").gte("fecha", start).lte("fecha", end),
      sb.from("planes_pago").select("id,cliente,operacion,fecha_alta,created_at").gte("fecha_alta", start).lte("fecha_alta", end),
      sb.from("planes_pago").select("id,cliente,operacion,fecha_alta,created_at").is("fecha_alta", null)
        .gte("created_at", `${start}T00:00:00`).lte("created_at", `${end}T23:59:59.999`),
    ])
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
    if (plaErr) return NextResponse.json({ error: plaErr.message }, { status: 500 })
    if (plsErr) return NextResponse.json({ error: plsErr.message }, { status: 500 })

    const p = pagos || []
    const plans = [...(planesAlta || []), ...(planesSinAlta || [])]

    const cashSistema = sumCashCollected(p)
    const revenueSistema = r2(revenueFromPlans(plans))
    const revenueVentasNuevas = r2(newSalesRevenue(p as any))

    const declarado = CORTES_DECLARADOS[mes] || null
    const diferencias = declarado ? {
      revenue: r2(revenueSistema - declarado.revenue),
      cash_collected: r2(cashSistema - declarado.cash_collected),
    } : null

    return NextResponse.json({
      mes,
      sistema: {
        revenue: {
          valor: revenueSistema,
          fuente: "planes_pago.operacion (contrato) dados de alta en el mes",
          formula: "suma de contractValueFromOperation() por plan único (dedupe por id, o cliente+operacion+fecha si no tiene id), ver lib/revenue.ts:revenueFromPlans",
          conteo_planes: plans.length,
        },
        cash_collected: {
          valor: cashSistema,
          fuente: "pagos.monto de tipos que efectivamente cobran, con pagos.fecha en el mes",
          formula: "suma de pagos.monto donde tipo ∈ {Fee, Refuerzo de Fee, Venta Nueva*, Completó PIF*, Completa Total, Cuota 1..10, tipos internos}",
          conteo_pagos: p.filter(x => isCashCollectedType(x.tipo)).length,
        },
        revenue_solo_ventas_nuevas: revenueVentasNuevas,
      },
      corte_declarado: declarado,
      diferencias,
      nota: declarado
        ? "La diferencia refleja ventas/pagos que aún no tienen fuente identificada en el sistema (ver docs/CRM_HISTORICAL_INVENTORY.md). No se oculta ni se ajusta el número del sistema para igualar el corte declarado."
        : `No hay corte declarado por Cuenta A registrado para ${mes}. Se muestra solo el cálculo del sistema.`,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error de servidor" }, { status: 500 })
  }
}
