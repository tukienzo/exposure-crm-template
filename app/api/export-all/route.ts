import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { getExportActor } from "@/lib/require-export-access"

const TABLES = ["agendas", "pagos", "clientes", "cuotas", "gastos", "payroll", "strikes", "metricas_manual", "team_members"]

export async function GET() {
  try {
    const actor = await getExportActor()
    if (!actor) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const admin = createSupabaseAdmin()
    const out: Record<string, unknown> = { exported_at: new Date().toISOString(), exported_by: actor.email }

    for (const table of TABLES) {
      const { data, error } = await admin.from(table).select("*")
      out[table] = error ? { error: error.message } : (data || [])
    }

    const { data: planes, error: planesError } = await admin
      .from("planes_pago")
      .select("*, plan_pago_items(*)")
    out["planes_pago"] = planesError ? { error: planesError.message } : (planes || [])

    const body = JSON.stringify(out, null, 2)
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="crm-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error de servidor" }, { status: 500 })
  }
}
