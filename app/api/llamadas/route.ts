import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error("Missing Supabase config")
  return createClient(url, key)
}

export async function GET(request: Request) {
  try {
    const sb = getSupabase()
    const { searchParams } = new URL(request.url)
    const start = searchParams.get("start")
    const end = searchParams.get("end")
    const soloAnalisis = searchParams.get("solo_analisis") === "1"

    let query = sb
      .from("agendas")
      .select("id, nombre, closer, setter, fecha_agenda, fecha_closer, cerro, estado, motivo_no_cierre, operacion, link_fathom, ia_analisis, calificacion, calificaba_realmente")
      .or("estado.is.null,estado.neq.Archivada manualmente")
      .eq("show", true)
      .order("fecha_closer", { ascending: false })
      .limit(500)

    // Filtra por fecha_closer (cuando cayo la llamada), no por fecha_agenda (cuando
    // se agendo) — esta pantalla es historial de LLAMADAS, y una agenda booked a
    // fin de mes puede tener la llamada real recien al mes siguiente.
    if (start) query = query.gte("fecha_closer", `${start}T00:00:00`)
    if (end) query = query.lte("fecha_closer", `${end}T23:59:59`)
    if (soloAnalisis) query = query.not("ia_analisis", "is", null)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data || [])
  } catch {
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 })
  }
}
