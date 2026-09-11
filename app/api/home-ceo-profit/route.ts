import { NextResponse } from "next/server"
import { effectiveCRMRole } from "@/lib/role-access"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { createSupabaseServer } from "@/lib/supabase-server"
import { buildAccountAttributor, type BusinessAccount } from "@/lib/business-account"

export async function GET(request: Request) {
  const session = await createSupabaseServer()
  const { data: { user } } = await session.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  const admin = createSupabaseAdmin()
  const { data: member } = await admin.from("team_members").select("rol,estado,nombre").eq("email", user.email.toLowerCase()).maybeSingle()
  if (member?.estado !== "aprobado" || effectiveCRMRole(member?.rol, member?.nombre) !== "CEO") return NextResponse.json({ error: "No autorizado" }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const month = searchParams.get("month") || new Date().toISOString().slice(0, 7)
  const accountParam = searchParams.get("account")
  const businessAccount: BusinessAccount | null = accountParam === "paul" || accountParam === "cris" ? accountParam : null
  const monthOrder = Number(month.replace("-", ""))
  const start = `${month}-01`
  const [year, mon] = month.split("-").map(Number)
  const end = new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10)
  const [{ data: expenses, error: expenseError }, { data: payroll, error: payrollError }, { data: plansRaw, error: plansError }] = await Promise.all([
    admin.from("gastos").select("monto_usd,tipo_gasto,mes,mes_orden").gte("fecha", start).lte("fecha", end),
    admin.from("payroll").select("total_usd").eq("mes_orden", monthOrder),
    admin.from("planes_pago").select("id,person_id,telefono,fecha_alta,created_at,plan_pago_items(monto,concepto,estado,pago_id)").not("fecha_alta", "is", null),
  ])
  if (expenseError) return NextResponse.json({ error: expenseError.message }, { status: 500 })
  if (payrollError) return NextResponse.json({ error: payrollError.message }, { status: 500 })
  if (plansError) return NextResponse.json({ error: plansError.message }, { status: 500 })
  const accountAgendas: any[] = []
  if (businessAccount) {
    for (let from = 0; ; from += 1000) {
      const { data: page, error: accountAgendaError } = await admin.from("agendas")
        .select("person_id,telefono,cuenta,fecha_agenda,fecha_closer,created_at")
        .not("cuenta", "is", null)
        .order("fecha_agenda", { ascending: true })
        .range(from, from + 999)
      if (accountAgendaError) return NextResponse.json({ error: accountAgendaError.message }, { status: 500 })
      accountAgendas.push(...(page || []))
      if (!page || page.length < 1000) break
    }
  }
  const accountFor = buildAccountAttributor(accountAgendas)
  const plans = businessAccount
    ? (plansRaw || []).filter((plan: any) => accountFor(plan, plan.fecha_alta || plan.created_at) === businessAccount)
    : (plansRaw || [])
  const expensesTotal = (expenses || []).reduce((sum, row) => sum + Number(row.monto_usd || 0), 0)
  const commissionsTotal = (payroll || []).reduce((sum, row) => sum + Number(row.total_usd || 0), 0)
  let softwareRows = (expenses || []).filter(row => String(row.tipo_gasto || "").toLowerCase().includes("software"))
  let softwareSourceMonth = month
  let softwareEstimated = false
  if (softwareRows.length === 0) {
    const { data: previousSoftware, error: previousSoftwareError } = await admin.from("gastos")
      .select("monto_usd,tipo_gasto,mes,mes_orden")
      .ilike("tipo_gasto", "%software%")
      .lt("mes_orden", monthOrder)
      .order("mes_orden", { ascending: false })
    if (previousSoftwareError) return NextResponse.json({ error: previousSoftwareError.message }, { status: 500 })
    const latestOrder = previousSoftware?.[0]?.mes_orden
    if (latestOrder) {
      softwareRows = (previousSoftware || []).filter(row => row.mes_orden === latestOrder)
      softwareSourceMonth = String(softwareRows[0]?.mes || `${String(latestOrder).slice(0, 4)}-${String(latestOrder).slice(4)}`)
      softwareEstimated = true
    }
  }
  const softwareCost = softwareRows.reduce((sum, row) => sum + Number(row.monto_usd || 0), 0)
  const installmentConcept = (concept: string) => concept.startsWith("Cuota") || concept === "Completó PIF + Acceso Total Consulting" || concept === "Completa Total (Post Venta)" || concept === "Completa Total + Acceso Acción" || concept === "Completa Total y Finaliza Pago"
  const pendingItems = (plans || []).flatMap((plan: any) => plan.plan_pago_items || [])
    .filter((item: any) => item.estado === "pendiente" && !item.pago_id && installmentConcept(String(item.concepto || "")))
  const pendingInstallments = pendingItems.reduce((sum: number, item: any) => sum + Number(item.monto || 0), 0)
  return NextResponse.json({
    month,
    expenses: Math.round(expensesTotal * 100) / 100,
    commissions: Math.round(commissionsTotal * 100) / 100,
    complete: (expenses || []).length > 0 && (payroll || []).length > 0,
    expenseRows: (expenses || []).length,
    commissionRows: (payroll || []).length,
    softwareCost: Math.round(softwareCost * 100) / 100,
    softwareSourceMonth,
    softwareEstimated,
    pendingInstallments: Math.round(pendingInstallments * 100) / 100,
    pendingInstallmentCount: pendingItems.length,
  })
}
