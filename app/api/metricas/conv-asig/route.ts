import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error("Missing Supabase config")
  return createClient(url, key)
}

export async function POST(request: Request) {
  try {
    const { mes, semana, tipo, persona, valor } = await request.json()
    const tipoFinal = tipo || "conversaciones_asignadas"
    if (!mes || !semana || !persona || valor === undefined) {
      return NextResponse.json({ error: "Faltan campos: mes, semana, persona, valor" }, { status: 400 })
    }
    const sb = getSupabase()
    const { data: existing } = await sb
      .from("metricas_manual")
      .select("id")
      .eq("mes", mes)
      .eq("semana", semana)
      .eq("tipo", tipoFinal)
      .eq("persona", persona)
      .maybeSingle()

    if (existing) {
      const { error } = await sb
        .from("metricas_manual")
        .update({ valor: Number(valor) })
        .eq("id", existing.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { error } = await sb
        .from("metricas_manual")
        .insert({ mes, semana, tipo: tipoFinal, persona, valor: Number(valor) })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 })
  }
}
