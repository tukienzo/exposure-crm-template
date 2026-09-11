import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"

function cleanSearch(value: string) {
  return value.trim().replace(/[,%()]/g, " ").replace(/\s+/g, " ")
}

export async function GET(request: Request) {
  try {
    const q = cleanSearch(new URL(request.url).searchParams.get("q") || "")
    if (q.length < 2) return NextResponse.json([])

    const sb = createSupabaseAdmin()
    const digits = q.replace(/\D/g, "")
    const filters = [`nombre.ilike.%${q}%`]
    if (digits.length >= 4) filters.push(`telefono.ilike.%${digits}%`)

    const { data, error } = await sb
      .from("agendas")
      .select("id,person_id,nombre,telefono,fecha_agenda,fecha_closer,fuente,setter,calificacion,cuenta")
      .or("estado.is.null,estado.neq.Archivada manualmente")
      .or(filters.join(","))
      .order("fecha_agenda", { ascending: false })
      .limit(60)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const seen = new Set<string>()
    const suggestions = (data || []).filter((row) => {
      const key = row.person_id || `${String(row.nombre || "").toLowerCase()}|${String(row.telefono || "").replace(/\D/g, "")}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).slice(0, 12)

    return NextResponse.json(suggestions)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error de servidor" }, { status: 500 })
  }
}
