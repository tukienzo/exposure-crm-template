import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error("Missing Supabase config")
  return createClient(url, key)
}

// Cola de revisión de conflictos de identidad. Solo lectura: la resolución
// (fusionar personas, marcar ignorado) requiere criterio humano con evidencia
// teléfono→Instagram→email, nunca automática por nombre. No expone el valor
// crudo en conflicto (la tabla solo guarda un hash), evitando filtrar PII acá.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") || "pending"
    const kind = searchParams.get("kind")
    const page = Math.max(0, Number(searchParams.get("page") || "0") || 0)
    // Antes esto era un limit(500) fijo sin paginación: con el barrido propio
    // de similitud de nombre la cola pasó a tener 10k+ filas pendientes reales
    // y los ~9.5k restantes quedaban invisibles en /conflictos-identidad (bug
    // real encontrado y corregido). page=0 sigue devolviendo los 500 con más
    // occurrences/más recientes primero (comportamiento igual al anterior).
    const pageSize = 500
    const sb = getSupabase()

    let query = sb
      .from("crm_identity_conflicts")
      .select("id,incoming_person_id,existing_person_id,kind,source,reason,status,first_seen_at,last_seen_at,occurrences", { count: "exact" })
      .eq("status", status)
    if (kind) query = query.eq("kind", kind)
    const { data, error, count } = await query
      .order("occurrences", { ascending: false })
      .order("last_seen_at", { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1)
    if (error) {
      if (error.code === "42P01") return NextResponse.json({ schemaReady: false, conflicts: [] })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const personIds = Array.from(new Set(
      (data || []).flatMap(row => [row.incoming_person_id, row.existing_person_id]).filter(Boolean),
    )) as string[]

    let names: Record<string, { display_name: string | null; internal_code: string }> = {}
    if (personIds.length > 0) {
      const { data: people } = await sb
        .from("crm_people")
        .select("id,display_name,internal_code")
        .in("id", personIds)
      names = Object.fromEntries((people || []).map(p => [p.id, { display_name: p.display_name, internal_code: p.internal_code }]))
    }

    const conflicts = (data || []).map(row => ({
      id: row.id,
      kind: row.kind,
      source: row.source,
      reason: row.reason,
      status: row.status,
      occurrences: row.occurrences,
      first_seen_at: row.first_seen_at,
      last_seen_at: row.last_seen_at,
      incoming: row.incoming_person_id ? {
        person_id: row.incoming_person_id,
        internal_code: names[row.incoming_person_id]?.internal_code || null,
        display_name: names[row.incoming_person_id]?.display_name || null,
      } : null,
      existing: row.existing_person_id ? {
        person_id: row.existing_person_id,
        internal_code: names[row.existing_person_id]?.internal_code || null,
        display_name: names[row.existing_person_id]?.display_name || null,
      } : null,
    }))

    return NextResponse.json({
      schemaReady: true,
      status,
      count: conflicts.length,
      total_pending: count ?? conflicts.length,
      page,
      page_size: pageSize,
      has_more: (page + 1) * pageSize < (count ?? 0),
      conflicts,
      methodology: "Prioridad de identidad: teléfono → Instagram → email. Nunca se fusiona automáticamente por coincidencia de nombre; los ambiguos quedan acá para revisión humana con evidencia.",
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error de servidor" }, { status: 500 })
  }
}
