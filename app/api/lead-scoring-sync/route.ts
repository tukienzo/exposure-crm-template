import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { authorizePreviewSync } from "@/lib/integration-auth"
import { autoScoreLead } from "@/lib/lead-scoring"

export const maxDuration = 60

export async function POST(request: Request) {
  const auth = authorizePreviewSync(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const admin = createSupabaseAdmin()
    const { data, error } = await admin.from("agendas")
      .select("id,edad,problema_actual,tiempo_problema,intentos_previos,motivo_urgencia,ocupacion,ingresos,inversion,calificacion")
      .or("estado.is.null,estado.neq.Archivada manualmente")
      .is("calificacion", null)
      .order("fecha_agenda", { ascending: false })
      .limit(1000)
    if (error) throw error
    let scored = 0
    let incomplete = 0
    const byGrade: Record<string, number> = {}
    for (const agenda of data || []) {
      // Para evitar falsos D por formulario a medio completar, el score final
      // exige profesión y capital. El resto suma evidencia cuando está.
      if (!agenda.ocupacion || !agenda.inversion) { incomplete++; continue }
      const result = autoScoreLead(agenda)
      if (!result) { incomplete++; continue }
      const { error: updateError } = await admin.from("agendas")
        .update({ calificacion: result.calificacion })
        .eq("id", agenda.id)
        .is("calificacion", null)
      if (updateError) throw updateError
      scored++
      byGrade[result.calificacion] = (byGrade[result.calificacion] || 0) + 1
    }
    return NextResponse.json({ ok: true, evaluated: data?.length || 0, scored, incomplete, by_grade: byGrade })
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 })
  }
}
