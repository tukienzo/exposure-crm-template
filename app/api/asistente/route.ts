import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { createSupabaseServer } from "@/lib/supabase-server"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const CLAUDE_URL = "https://api.anthropic.com/v1/messages"
const CLAUDE_MODEL = "claude-sonnet-4-6"

type Actor = { rol: string; email: string; nombre: string }
type Dataset =
  | "pagos" | "agendas" | "clientes" | "planes_pago" | "llamadas"
  | "personas" | "contenido" | "metricas_manual" | "strikes"

const DATASETS: Record<Dataset, {
  table: string
  select: string
  dateFields: string[]
  searchFields: string[]
  max: number
}> = {
  pagos: {
    table: "pagos",
    select: "id,fecha,cliente,tipo,operacion,ppp,monto,closer,setter,calificacion,medio_de_pago,es_reactivacion",
    dateFields: ["fecha"],
    searchFields: ["cliente", "closer", "setter", "tipo", "operacion"],
    max: 3000,
  },
  agendas: {
    table: "agendas",
    select: "id,nombre,telefono,instagram,fecha_agenda,fecha_closer,closer,setter,show,cerro,calificacion,fuente,cuenta,ocupacion,manychat,motivo_no_cierre,calificaba_realmente,ia_analisis",
    dateFields: ["fecha_closer", "fecha_agenda"],
    searchFields: ["nombre", "telefono", "instagram", "closer", "setter", "calificacion", "fuente"],
    max: 3000,
  },
  clientes: {
    table: "clientes",
    select: "id,nombre,telefono,calificacion,fecha_ingreso,duracion,fecha_baja,fecha_proxima_call,fecha_3ra_call,fecha_4ta_call,medio_de_pago,operacion_original,pitch,fecha_primer_call,estado,operacion_resell,medio_pago_resell,monto_con_descuento,etapa,created_at",
    dateFields: ["fecha_ingreso"],
    searchFields: ["nombre", "telefono", "calificacion", "estado", "operacion_original"],
    max: 1000,
  },
  planes_pago: {
    table: "planes_pago",
    select: "id,cliente,telefono,operacion,closer,setter,fecha_alta,created_at,plan_pago_items(id,concepto,monto,fecha_planeada,estado,pago_id)",
    dateFields: ["created_at", "fecha_alta"],
    searchFields: ["cliente", "telefono", "closer", "setter", "operacion"],
    max: 1000,
  },
  llamadas: {
    table: "crm_call_records",
    select: "id,person_id,agenda_id,recording_id,title,occurred_at,fathom_url,call_type,participants,fathom_summary,trace_analysis,match_method,match_confidence,needs_review,created_at",
    dateFields: ["occurred_at", "created_at"],
    searchFields: ["title", "call_type", "match_method"],
    max: 1000,
  },
  personas: {
    table: "crm_people",
    select: "id,display_name,primary_phone,primary_email,primary_instagram,internal_code,updated_at",
    dateFields: ["updated_at"],
    searchFields: ["display_name", "primary_phone", "primary_email", "primary_instagram", "internal_code"],
    max: 1000,
  },
  contenido: {
    table: "crm_content_assets",
    select: "id,title,platform,angle,format,topic,cta,planned_at,published_at,source_url,status,metadata,created_at",
    dateFields: ["published_at", "created_at"],
    searchFields: ["title", "platform", "angle", "format", "topic", "status"],
    max: 1000,
  },
  metricas_manual: {
    table: "metricas_manual",
    select: "id,mes,semana,persona,tipo,valor",
    dateFields: [],
    searchFields: ["mes", "persona", "tipo"],
    max: 1000,
  },
  strikes: {
    table: "strikes",
    select: "id,nombre,rol,count,updated_at",
    dateFields: ["updated_at"],
    searchFields: ["nombre", "rol"],
    max: 1000,
  },
}

class AssistantError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error("Supabase no configurado")
  return createClient(url, key)
}

async function resolveActor(): Promise<Actor> {
  const auth = await createSupabaseServer()
  const { data: { user } } = await auth.auth.getUser()
  if (!user?.email) throw new AssistantError("No autenticado", 401)
  const { data } = await getSupabase()
    .from("team_members")
    .select("rol,estado,nombre")
    .eq("email", user.email.toLowerCase())
    .maybeSingle()
  if (data?.estado !== "aprobado") throw new AssistantError("Acceso no autorizado", 403)
  return { rol: data.rol || "", email: user.email.toLowerCase(), nombre: data.nombre || "" }
}

function safeText(value: unknown, max = 120) {
  return String(value || "").replace(/[,%()]/g, " ").trim().slice(0, max)
}

async function queryDataset(input: Record<string, unknown>) {
  const dataset = String(input.dataset || "") as Dataset
  const config = DATASETS[dataset]
  if (!config) return { error: "Dataset no permitido" }

  const sb = getSupabase()
  const requestedLimit = Number(input.limit || 300)
  const limit = Math.max(1, Math.min(requestedLimit, config.max))
  const dateField = config.dateFields.includes(String(input.date_field || ""))
    ? String(input.date_field)
    : config.dateFields[0]

  let query = sb.from(config.table).select(config.select).limit(limit)
  const start = safeText(input.start, 30)
  const end = safeText(input.end, 30)
  if (dateField && /^\d{4}-\d{2}-\d{2}/.test(start)) query = query.gte(dateField, start)
  if (dateField && /^\d{4}-\d{2}-\d{2}/.test(end)) query = query.lte(dateField, end.length === 10 ? `${end}T23:59:59.999` : end)

  const search = safeText(input.search)
  if (search && config.searchFields.length) {
    query = query.or(config.searchFields.map(field => `${field}.ilike.%${search}%`).join(","))
  }

  const { data, error, count } = await query
  if (error) return { error: error.message, dataset }
  return {
    dataset,
    fuente: config.table,
    filas_retornadas: data?.length || 0,
    limite: limit,
    count,
    rows: data || [],
  }
}

const TOOL = {
  name: "consultar_crm",
  description: "Consulta datos reales y actuales del CRM. Podés llamar esta herramienta varias veces y cruzar datasets antes de responder.",
  input_schema: {
    type: "object",
    properties: {
      dataset: {
        type: "string",
        enum: Object.keys(DATASETS),
        description: "pagos=cash; planes_pago=revenue/contratos/cuotas; agendas=setting/calls; llamadas=grabaciones/análisis; personas/clientes=identidad; contenido=ángulos; metricas_manual; strikes",
      },
      start: { type: "string", description: "Fecha inicial ISO opcional" },
      end: { type: "string", description: "Fecha final ISO opcional" },
      date_field: { type: "string", description: "Campo de fecha opcional cuando el dataset tiene más de uno" },
      search: { type: "string", description: "Texto opcional: persona, closer, setter, teléfono, tipo, etc." },
      limit: { type: "number", description: "Cantidad de filas. Pedí hasta 3000 cuando necesites calcular totales." },
    },
    required: ["dataset"],
  },
}

async function callClaude(messages: unknown[], apiKey: string) {
  const response = await fetch(CLAUDE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 700,
      temperature: 0,
      system: `Sos el asistente interno del CRM CRM Base. Respondé en español argentino, directo y sin relleno.
Tenés acceso de solo lectura a los datasets canónicos mediante consultar_crm. Para TODA afirmación fáctica primero consultá la herramienta; podés cruzar cualquier cantidad de datasets.
Revenue = suma contractual de plan_pago_items.monto de planes cargados en el período.
Cash Collected = pagos.monto efectivamente ingresados.
ROAS = FECCU efectivamente cobrado / gasto Meta del mismo período. No entran cuotas/FECCP, ventas internas/backend ni revenue contractual pendiente (el gasto Meta se muestra en Métricas; no lo inventes si no está en los datasets).
No confundas fecha_agenda con fecha_closer. Si el usuario no indica período, usá el contexto natural.

REGLAS DE RESPUESTA (prioridad máxima):
- Si preguntan por un único número, nombre, fecha, teléfono o dato puntual, respondé ÚNICAMENTE ese dato. Ejemplo: "75".
- Una consulta simple nunca puede superar 2 oraciones.
- No cuentes qué consultaste, cómo procesaste, qué filtro aplicaste ni tu razonamiento, salvo que el usuario lo pida explícitamente.
- No uses Markdown: nada de títulos, tablas, listas, separadores, negritas, emojis ni bloques de código.
- No agregues fuente, fórmula, criterio, desglose, advertencias ni aclaraciones no solicitadas. La interfaz ya muestra la evidencia por separado.
- Para análisis o comparaciones que realmente requieran desarrollo, empezá por la conclusión y sé breve.
- Si hay una ambigüedad que cambia materialmente la respuesta, hacé una sola aclaración breve después del dato; máximo 2 oraciones.
- Si faltan datos para responder con certeza, decilo en una oración. Nunca inventes.`,
      tools: [TOOL],
      messages,
    }),
  })
  if (!response.ok) throw new AssistantError(`Error del motor del asistente (${response.status})`, 502)
  return response.json()
}

export async function POST(request: Request) {
  try {
    const actor = await resolveActor()
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new AssistantError("Falta configurar ANTHROPIC_API_KEY", 500)
    const body = await request.json()
    const question = safeText(body.question, 1200)
    if (!question) throw new AssistantError("Escribí qué querés saber del CRM", 400)

    const messages: any[] = [{
      role: "user",
      content: `Fecha actual: ${new Date().toISOString().slice(0, 10)}. Usuario: ${actor.nombre} (${actor.rol}). Pregunta: ${question}`,
    }]
    const evidence: Array<{ dataset: string; fuente?: string; filas_retornadas?: number }> = []

    for (let round = 0; round < 6; round++) {
      const result = await callClaude(messages, apiKey)
      const content = Array.isArray(result.content) ? result.content : []
      messages.push({ role: "assistant", content })
      const toolUses = content.filter((block: any) => block.type === "tool_use")
      if (!toolUses.length) {
        const answer = content.filter((block: any) => block.type === "text").map((block: any) => block.text).join("\n").trim()
        return NextResponse.json({
          respuesta: answer || "No pude armar una respuesta con evidencia suficiente.",
          evidencia: { consultas: evidence },
          actor: { rol: actor.rol, nombre: actor.nombre },
        })
      }

      const toolResults = []
      for (const use of toolUses) {
        const output = await queryDataset(use.input || {})
        evidence.push({
          dataset: String((use.input || {}).dataset || ""),
          fuente: (output as any).fuente,
          filas_retornadas: (output as any).filas_retornadas,
        })
        toolResults.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: JSON.stringify(output),
        })
      }
      messages.push({ role: "user", content: toolResults })
    }
    throw new AssistantError("La consulta necesita demasiados cruces. Probá pedirla con un período o persona más concreto.", 422)
  } catch (error) {
    if (error instanceof AssistantError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error de servidor" }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    modo: "consulta libre",
    datasets: Object.keys(DATASETS),
    nota: "Todos los usuarios aprobados pueden preguntar y cruzar información del CRM. Solo lectura; cada respuesta consulta datos reales.",
  })
}
