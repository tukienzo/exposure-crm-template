import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"

export const dynamic = "force-dynamic"

type MercuryTransaction = { amount?: number; status?: string; kind?: string; counterpartyName?: string; merchant?: { name?: string }; cardId?: string }
type MercuryCard = { id: string; nameOnCard?: string }

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET
  const supplied = request.headers.get("authorization")
  return !!expected && supplied === `Bearer ${expected}`
}

function monthWindow() {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const start = `${year}-${String(month + 1).padStart(2, "0")}-01`
  const end = now.toISOString().slice(0, 10)
  return { start, end, period: start }
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const mercuryToken = process.env.MERCURY_API_TOKEN
  if (!mercuryToken) return NextResponse.json({ error: "Mercury no configurado" }, { status: 503 })
  const { start, end, period } = monthWindow()
  const admin = createSupabaseAdmin()
  const { data: payments, error: paymentError } = await admin.from("pagos").select("monto,record_status").gte("fecha", start).lte("fecha", end)
  if (paymentError) return NextResponse.json({ error: paymentError.message }, { status: 500 })
  const cash = (payments || []).filter((row) => !["voided", "deleted", "archived", "inactive"].includes(String(row.record_status || "").toLowerCase())).reduce((sum, row) => sum + Number(row.monto || 0), 0)

  const headers = { Authorization: `Bearer ${mercuryToken}` }
  const [accountsResponse, cardsResponse] = await Promise.all([
    fetch("https://api.mercury.com/api/v1/accounts", { headers, cache: "no-store" }),
    fetch("https://api.mercury.com/api/v1/cards", { headers, cache: "no-store" }),
  ])
  if (!accountsResponse.ok) return NextResponse.json({ error: "No se pudo leer Mercury" }, { status: 502 })
  const accounts = (await accountsResponse.json() as { accounts?: Array<{ id: string }> }).accounts || []
  const cards = cardsResponse.ok ? ((await cardsResponse.json() as { cards?: MercuryCard[] }).cards || []) : []
  const cardOwners = new Map(cards.map((card) => [card.id, card.nameOnCard || "Sin titular"]))
  const transactions: MercuryTransaction[] = []
  for (const account of accounts) {
    const params = new URLSearchParams({ start, end, limit: "500" })
    const response = await fetch(`https://api.mercury.com/api/v1/account/${account.id}/transactions?${params}`, { headers, cache: "no-store" })
    if (!response.ok) continue
    transactions.push(...((await response.json() as { transactions?: MercuryTransaction[] }).transactions || []))
  }
  const posted = transactions.filter((row) => ["sent", "completed", "pending"].includes(String(row.status || "")))
  const personal = posted.filter((row) => row.amount && row.amount < 0 && /airbnb/i.test(`${row.counterpartyName || ""} ${row.merchant?.name || ""}`))
  const cardSpend = posted.filter((row) => row.amount && row.amount < 0 && ["debitCardTransaction", "cardInternationalTransactionFee"].includes(String(row.kind || "")) && !personal.includes(row)).reduce((sum, row) => sum + Math.abs(Number(row.amount || 0)), 0)
  const withdrawals = posted.filter((row) => row.amount && row.amount < 0 && /blacklion/i.test(row.counterpartyName || ""))
  const obligations = posted.filter((row) => row.amount && row.amount < 0 && row.kind === "outgoingPayment" && !withdrawals.includes(row)).reduce((sum, row) => sum + Math.abs(Number(row.amount || 0)), 0)
  const partialProfit = cash - cardSpend - obligations
  const payload = {
    period_start: period, revision: 1, status: "provisional", base_currency: "USD", external_income: cash,
    platform_fees: 0, payroll: 0, software_marketing: cardSpend, operating_expenses: 0, obligations, reserves: 0,
    adjustments: 0, distributable_profit: partialProfit, partner_share: 0,
    formula: "ingresos - plataforma - payroll - software/marketing - gastos operativos - obligaciones - reservas + ajustes",
    source_count: 2, total_movements: posted.length + (payments?.length || 0), reconciled_movements: posted.length,
    unexplained_difference: 0, explained_differences: [
      { kind: "missing_month_end", note: "Preview: faltan payroll, fees, otros canales y el cierre definitivo del período" },
      ...withdrawals.map((row) => ({ kind: "partner_distribution_withdrawal", destination: row.counterpartyName || "Financiera", amount: Math.abs(Number(row.amount || 0)) })),
      ...personal.map((row) => ({ kind: "partner_personal_expense", partner: /cristian/i.test(cardOwners.get(row.cardId || "") || "") ? "Cuenta B" : "Cuenta A", cardholder: cardOwners.get(row.cardId || "") || "Sin titular", merchant: row.counterpartyName || row.merchant?.name || "Sin dato", amount: Math.abs(Number(row.amount || 0)) })),
    ],
    payroll_reconciled: false, bonuses_reconciled: false, distribution_reproducible: false,
    evidence_level: "parcial", evidence_source: "estimado", evidence_summary: `Preview automático CRM + Mercury al ${end}`,
    closing_verified: false, verification_source: "crm_mercury_live", verification_summary: "Preview automático, no distribuible.",
    notes: "El remanente parcial no es utilidad final: no distribuir hasta conciliación de RECA, Trust, PayPal, efectivo, payroll, fees y aprobación de socios.",
  }
  const { data, error } = await admin.from("finance_closings").upsert(payload, { onConflict: "period_start,revision" }).select("id,period_start,external_income,distributable_profit,updated_at").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, closing: data, mercuryTransactions: posted.length, payments: payments?.length || 0 })
}
