import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { z } from "zod"
import { createSupabaseServer } from "@/lib/supabase-server"

const ESTADOS = ["pendiente", "contactado", "promesa", "escalado", "incobrable", "pagado"] as const

function ownerKey(value: unknown) {
  return String(value || "")
    .trim()
    .split(/\s+/)[0]
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

const gestionSchema = z.object({
  itemId: z.string().uuid(),
  responsable: z.string().trim().min(1).max(100),
  resultado: z.string().trim().min(1).max(1000),
  promesaPagoFecha: z.string().date().nullable().optional(),
  proximaAccion: z.string().trim().max(1000).nullable().optional(),
  proximaAccionFecha: z.string().date().nullable().optional(),
  estadoCobranza: z.enum(ESTADOS),
})

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Supabase credentials not configured")
  return createClient(url, key)
}

export async function POST(request: Request) {
  try {
    const parsed = gestionSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: "Datos de gestión inválidos" }, { status: 400 })
    const input = parsed.data
    const sb = getSupabase()
    const sessionClient = await createSupabaseServer()
    const { data: { user } } = await sessionClient.auth.getUser()
    if (!user?.email) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    const { data: member } = await sb.from("team_members").select("nombre,rol,estado").eq("email", user.email.toLowerCase()).maybeSingle()
    if (member?.estado !== "aprobado") return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    let responsable = input.responsable
    if (["Closer", "Cobranzas"].includes(member.rol || "")) {
      const owner = ownerKey(member.nombre)
      const { data: item } = await sb.from("plan_pago_items").select("plan_id,planes_pago!inner(closer)").eq("id", input.itemId).maybeSingle()
      const closer = ownerKey((item as any)?.planes_pago?.closer)
      if (!owner || closer !== owner) return NextResponse.json({ error: "Este cobro no está asignado a vos" }, { status: 403 })
      responsable = String(member.nombre || "").trim().split(/\s+/)[0] || owner
    }
    const { data, error } = await sb.rpc("registrar_gestion_cobranza", {
      p_item_id: input.itemId,
      p_responsable: responsable,
      p_resultado: input.resultado,
      p_promesa_pago_fecha: input.promesaPagoFecha || null,
      p_proxima_accion: input.proximaAccion || null,
      p_proxima_accion_fecha: input.proximaAccionFecha || null,
      p_estado_cobranza: input.estadoCobranza,
      p_creado_por: user?.email || null,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 })
  }
}
