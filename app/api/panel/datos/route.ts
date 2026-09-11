// ── /api/panel/datos ─────────────────────────────────────────────────────────
// Sirve el "datos.js" del Panel del negocio (public/panel/index.html).
//  · Si el CRM tiene datos cargados (agendas o pagos), arma DATOS con los
//    números reales y MODO_DEMO = false (ver lib/panel-negocio.ts).
//  · Si el CRM está vacío o Supabase falla, devuelve el datos.js de
//    demostración que viene con el panel, con su sello "datos de demostración".
// La respuesta es JavaScript, no JSON: el panel lo carga con <script src>.

import { NextResponse } from "next/server"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { armarDatosPanel } from "@/lib/panel-negocio"

export const dynamic = "force-dynamic"

function js(cuerpo: string, extra: Record<string, string> = {}) {
  return new NextResponse(cuerpo, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
      ...extra,
    },
  })
}

async function demo() {
  return readFile(path.join(process.cwd(), "public", "panel", "datos.js"), "utf8")
}

// Supabase corta en 1000 filas por pedido: se pagina hasta agotar.
async function todas<T>(armar: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const filas: T[] = []
  const paso = 1000
  for (let desde = 0; desde < 50000; desde += paso) {
    const { data, error } = await armar(desde, desde + paso - 1)
    if (error) throw new Error(error.message)
    filas.push(...(data || []))
    if (!data || data.length < paso) break
  }
  return filas
}

export async function GET() {
  try {
    const sb = createSupabaseAdmin()
    const hoy = new Date()
    const desde = new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1)
    const desdeIso = `${desde.getFullYear()}-${String(desde.getMonth() + 1).padStart(2, "0")}-01`

    const [agendas, pagos, cuotas, clientes, metricas] = await Promise.all([
      todas<Record<string, unknown>>((a, b) => sb.from("agendas")
        .select("id,nombre,fecha_agenda,fecha_lead,fecha_tc,closer,setter,fuente,recurso,angulo_entrada,calificacion,calificaba_realmente,show,cerro,estado,tipo_cierre,seguimiento_estado,seguimiento_nota,seguimiento_actualizado_at,motivo_urgencia,operacion,plan_de_pago,cc_dia_1,created_at")
        .or(`fecha_agenda.gte.${desdeIso},fecha_agenda.is.null`)
        .order("fecha_agenda", { ascending: false })
        .range(a, b)),
      todas<Record<string, unknown>>((a, b) => sb.from("pagos")
        .select("fecha,cliente,tipo,operacion,ppp,closer,setter,fuente,monto")
        .gte("fecha", desdeIso)
        .is("fecha_baja", null)
        .order("fecha", { ascending: false })
        .range(a, b)),
      todas<Record<string, unknown>>((a, b) => sb.from("cuotas")
        .select("cliente,monto,monto_cobrado,fecha_vencimiento,estado,closer")
        .gte("fecha_vencimiento", desdeIso)
        .range(a, b)),
      todas<Record<string, unknown>>((a, b) => sb.from("clientes")
        .select("fecha_ingreso,fecha_baja,estado,created_at")
        .range(a, b)),
      todas<Record<string, unknown>>((a, b) => sb.from("metricas_manual")
        .select("tipo,valor,semana,persona,mes,created_at")
        .range(a, b)),
    ])

    if (!agendas.length && !pagos.length) return js(await demo(), { "X-Panel-Datos": "demo" })

    const datos = armarDatosPanel({
      agendas: agendas as never, pagos: pagos as never, cuotas: cuotas as never,
      clientes: clientes as never, metricas: metricas as never, hoy,
      metaMensual: Number(process.env.PANEL_META_MENSUAL || 50000) || 50000,
      precioBase: Number(process.env.PANEL_PRECIO_BASE || 1300) || 1300,
    })
    const cuerpo = `/* Generado por el CRM el ${hoy.toISOString()} — solo números crudos; las tasas las calcula el panel. */\n`
      + `const DATOS = ${JSON.stringify(datos, null, 1)};\nconst MODO_DEMO = false;\n`
    return js(cuerpo, { "X-Panel-Datos": "crm" })
  } catch (error) {
    console.error("[panel/datos] se sirve la demo por un error del CRM:", error)
    return js(await demo(), { "X-Panel-Datos": "demo-fallback" })
  }
}
