import type { BusinessAccount } from "@/lib/business-account"

type MetaInsight = { spend?: string }
type SpendResult = { spend: number; available: boolean; source: "meta" | "mercury" | "unavailable"; estimated: boolean }

async function getMercuryMetaSpend(start: string, end: string): Promise<SpendResult> {
  const token = process.env.MERCURY_API_TOKEN
  if (!token) return { spend: 0, available: false, source: "unavailable", estimated: false }
  const headers = { Authorization: `Bearer ${token}` }
  try {
    const accountsResponse = await fetch("https://api.mercury.com/api/v1/accounts", { headers, cache: "no-store" })
    if (!accountsResponse.ok) return { spend: 0, available: false, source: "unavailable", estimated: false }
    const accountsPayload = await accountsResponse.json() as { accounts?: { id: string }[] }
    let spend = 0
    for (const account of accountsPayload.accounts || []) {
      const params = new URLSearchParams({ start, end })
      const response = await fetch(`https://api.mercury.com/api/v1/account/${account.id}/transactions?${params}`, { headers, cache: "no-store" })
      if (!response.ok) continue
      const payload = await response.json() as { transactions?: { amount?: number; counterpartyName?: string; bankDescription?: string; status?: string }[] }
      for (const transaction of payload.transactions || []) {
        const counterparty = String(transaction.counterpartyName || "").toLowerCase()
        const description = String(transaction.bankDescription || "").toLowerCase()
        if (counterparty === "facebook" || description.startsWith("facebk")) spend += Math.abs(Number(transaction.amount || 0))
      }
    }
    return spend > 0
      ? { spend: Math.round(spend * 100) / 100, available: true, source: "mercury", estimated: true }
      : { spend: 0, available: false, source: "unavailable", estimated: false }
  } catch {
    return { spend: 0, available: false, source: "unavailable", estimated: false }
  }
}

async function getAccountMetaSpend(start: string, end: string, businessAccount: BusinessAccount): Promise<SpendResult> {
  const isPaul = businessAccount === "paul"
  const token = isPaul
    ? process.env.META_ADS_CUENTA_A_ACCESS_TOKEN
    : (process.env.META_ADS_ACCESS_TOKEN || process.env.META_CAPI_ACCESS_TOKEN)
  const account = isPaul
    ? (process.env.META_ADS_CUENTA_A_ACCOUNT_ID || "")
    : (process.env.META_ADS_ACCOUNT_ID || "")
  if (!token) return getMercuryMetaSpend(start, end)

  const params = new URLSearchParams({
    fields: "spend",
    level: "account",
    time_range: JSON.stringify({ since: start, until: end }),
    access_token: token,
  })

  try {
    const response = await fetch(`https://graph.facebook.com/v21.0/${account}/insights?${params}`, {
      // El tablero ejecutivo refresca cada minuto; Meta sigue siendo la fuente
      // primaria y Mercury queda solo como respaldo estimado.
      next: { revalidate: 60 },
    })
    if (!response.ok) return getMercuryMetaSpend(start, end)
    const payload = await response.json() as { data?: MetaInsight[] }
    const spend = (payload.data || []).reduce((sum, row) => sum + Number(row.spend || 0), 0)
    return { spend: Math.round(spend * 100) / 100, available: true, source: "meta", estimated: false }
  } catch {
    return getMercuryMetaSpend(start, end)
  }
}

export async function getMetaSpend(start: string, end: string, businessAccount?: BusinessAccount | null): Promise<SpendResult> {
  if (businessAccount) return getAccountMetaSpend(start, end, businessAccount)
  const [paul, cris] = await Promise.all([
    getAccountMetaSpend(start, end, "paul"),
    getAccountMetaSpend(start, end, "cris"),
  ])
  if (paul.source === "meta" && cris.source === "meta") {
    return { spend: Math.round((paul.spend + cris.spend) * 100) / 100, available: true, source: "meta", estimated: false }
  }
  // Nunca sumar dos respaldos de Mercury: ambos representan el mismo débito
  // bancario general. Si Meta no está completo, usar un solo respaldo.
  return getMercuryMetaSpend(start, end)
}
