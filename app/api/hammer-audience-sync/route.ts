import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { hammerCallEndAt, shouldRemainInHammerAudience, updateHammerAudience } from "@/lib/meta-hammer-audience"

export const dynamic = "force-dynamic"
export const maxDuration = 60

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET
  return !!expected && request.headers.get("authorization") === `Bearer ${expected}`
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const admin = createSupabaseAdmin()
  const now = Date.now()
  // Ventana holgada para tolerar retrasos del cron sin volver a procesar todo
  // el histórico. DELETE sobre Customer List Audiences es idempotente.
  const localNow = new Date(now - 3 * 60 * 60 * 1000)
  const from = new Date(localNow.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 19)
  const { data: rows, error } = await admin
    .from("agendas")
    .select("id,person_id,telefono,fecha_closer,estado,call_confirmer,crm_people(primary_email)")
    .gte("fecha_closer", from)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const grouped = new Map<string, any[]>()
  for (const row of rows || []) {
    const key = row.person_id || `${row.telefono}|${(row as any).crm_people?.primary_email || ""}`
    grouped.set(key, [...(grouped.get(key) || []), row])
  }
  // Si la persona reagendó, permanece dentro hasta que termine su nueva call.
  const unique = [...grouped.values()]
    .filter((personRows) => personRows.some((row) => hammerCallEndAt(row.fecha_closer) <= now))
    .filter((personRows) => !personRows.some((row) => shouldRemainInHammerAudience(row, new Date(now))))
    .map((personRows) => personRows[0])
  let removed = 0
  const failures: Array<{ id: number; error: string }> = []
  for (const row of unique) {
    try {
      const result = await updateHammerAudience("remove", {
        telefono: row.telefono,
        email: row.crm_people?.primary_email,
      })
      if (result.ok) removed++
    } catch (cause) {
      failures.push({ id: row.id, error: String(cause) })
    }
  }
  return NextResponse.json({ ok: failures.length === 0, checked: rows?.length || 0, ended: unique.length, removed, failures })
}
