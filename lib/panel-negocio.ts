// ── Panel del negocio: del CRM al formato del panel ────────────────────────
// El "Panel del negocio" (public/panel/index.html, el dashboard de Agustín
// Ruppel) lee un objeto DATOS con números CRUDOS y calcula solo las tasas,
// deltas y proyecciones. Este archivo arma ese objeto a partir de las tablas
// del CRM (agendas, pagos, cuotas, clientes, metricas_manual).
//
// Reglas que se respetan a rajatabla:
//  · Acá solo se escriben conteos y montos. Ningún porcentaje.
//  · Lo que el CRM no registra NO se inventa: queda en 0 o vacío, y el panel
//    esconde la sección (contenido, reels) o muestra "—".
//  · Los bloques "de 90 días" (closers, setters, fuentes) se calculan sobre
//    los ÚLTIMOS 3 MESES CALENDARIO, igual que la suma de meses del panel,
//    para que su verificación de aritmética cierre.

import { isCashCollectedType } from "@/lib/cash-collected"
import { contractValueFromOperation, newSalesRevenue } from "@/lib/revenue"
import { parseMesLabel } from "@/lib/meses"
import { BRAND } from "@/lib/brand"

export type AgendaPanel = {
  id?: number | string | null
  nombre?: string | null
  fecha_agenda?: string | null
  fecha_lead?: string | null
  fecha_tc?: string | null
  closer?: string | null
  setter?: string | null
  fuente?: string | null
  recurso?: string | null
  angulo_entrada?: string | null
  calificacion?: string | null
  calificaba_realmente?: string | null
  show?: boolean | null
  cerro?: boolean | null
  estado?: string | null
  tipo_cierre?: string | null
  seguimiento_estado?: string | null
  seguimiento_nota?: string | null
  seguimiento_actualizado_at?: string | null
  motivo_urgencia?: string | null
  operacion?: string | null
  plan_de_pago?: string | null
  cc_dia_1?: number | null
  created_at?: string | null
}
export type PagoPanel = {
  fecha?: string | null
  cliente?: string | null
  tipo?: string | null
  operacion?: string | null
  ppp?: string | null
  closer?: string | null
  setter?: string | null
  fuente?: string | null
  monto?: number | null
}
export type CuotaPanel = {
  cliente?: string | null
  monto?: number | null
  monto_cobrado?: number | null
  fecha_vencimiento?: string | null
  estado?: string | null
  closer?: string | null
}
export type ClientePanel = {
  fecha_ingreso?: string | null
  fecha_baja?: string | null
  estado?: string | null
  created_at?: string | null
}
export type MetricaPanel = {
  tipo?: string | null
  valor?: number | null
  semana?: string | null
  persona?: string | null
  mes?: string | null
  created_at?: string | null
}

export type EntradaPanel = {
  agendas: AgendaPanel[]
  pagos: PagoPanel[]
  cuotas: CuotaPanel[]
  clientes: ClientePanel[]
  metricas: MetricaPanel[]
  hoy?: Date
  metaMensual?: number
  precioBase?: number
  marca?: { nombre?: string; bajada?: string; moneda?: string }
}

export type DatosPanel = {
  marca: { nombre: string; bajada: string; moneda: string; metaMensual: number }
  meses: Array<{
    mes: string; facturado: number; cobrado: number; leads: number; agendas: number
    presentadas: number; calificadas: number; cierres: number; ads: number; alumnos: number
    dias?: number; diasTotal?: number
  }>
  closers: Array<{ nombre: string; presentadas: number; calificadas: number; cierres: number; cobrado: number }>
  setters: Array<{ nombre: string; inbound: number; fups: number; agendas: number }>
  fuentes: Array<{ nombre: string; leads: number; agendas: number; cierres: number }>
  contenido: Array<{ formato: string; piezas: number; views: number; ctas: number; leads: number; agendas: number }>
  reels: Array<Record<string, unknown>>
  pipelineEtapas: Array<{ nombre: string; prob: number }>
  pipeline: Array<{ lead: string; closer: string; etapa: string; monto: number; dias: number; fuente: string; prox: string }>
  cuotas: Array<{ alumno: string; monto: number; vence: string; closer: string; estado: "cobrado" | "por-cobrar" | "vencida" | "protocolo" }>
  llamadas: Array<{ fecha: string; lead: string; closer: string; fuente: string; estrategia: string; calificado: boolean; situacion: string; monto: number }>
}

// ── fechas ──────────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, "0")
export const claveMes = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
const isoDia = (d: Date) => `${claveMes(d)}-${pad(d.getDate())}`

function fecha(valor: string | null | undefined): Date | null {
  if (!valor) return null
  const s = String(valor).trim()
  // "2026-09-08" o "2026-09-08T14:00:00…" → se toma el día tal cual está escrito
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}
const mesDe = (valor: string | null | undefined) => {
  const d = fecha(valor)
  return d ? claveMes(d) : null
}
const diasEntre = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000))

// ── normalización de textos ────────────────────────────────────────────────
const limpio = (s: string | null | undefined) => String(s || "").trim()
const minus = (s: string | null | undefined) => limpio(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
const CALIF_AB = new Set(["lead a", "lead b", "a", "b"])
const esCalificada = (a: AgendaPanel) => {
  const real = minus(a.calificaba_realmente)
  if (real) return real.startsWith("s") || real === "true"
  return CALIF_AB.has(minus(a.calificacion))
}
const archivada = (a: AgendaPanel) => minus(a.estado) === "archivada manualmente"

// Etiqueta de fuente: se agrupa por canal para que el donut tenga 4 a 6
// porciones y no 30 (las opciones del CRM son muy granulares).
export function canalDe(fuente: string | null | undefined): string {
  const f = minus(fuente)
  if (!f) return "Sin fuente"
  if (/ads|rmkt|frio|anuncio/.test(f)) return "Ads Meta"
  if (/youtube/.test(f)) return "YouTube"
  if (/tiktok/.test(f)) return "TikTok"
  if (/referid|recomend/.test(f)) return "Referidos"
  if (/outbound|prospecci/.test(f)) return "Outbound"
  if (/instagram|ig |reel|story|historia|carrusel|bio|manychat|dm/.test(f)) return "Instagram orgánico"
  if (/whatsapp|wpp/.test(f)) return "WhatsApp / otro"
  return limpio(fuente)
}

// Mes de una fila de metricas_manual: "2026-09", "Septiembre 2026", una
// semana ISO "2026-W37" o una fecha; si no hay nada, el mes de created_at.
function mesMetrica(m: MetricaPanel): string | null {
  const mes = limpio(m.mes)
  if (/^\d{4}-\d{2}$/.test(mes)) return mes
  const parsed = mes ? parseMesLabel(mes) : null
  if (parsed) return `${parsed.year}-${pad(parsed.idx + 1)}`
  const sem = limpio(m.semana)
  const w = sem.match(/^(\d{4})-?W(\d{1,2})$/i)
  if (w) {
    const d = new Date(Number(w[1]), 0, 4 + (Number(w[2]) - 1) * 7)
    return claveMes(d)
  }
  return mesDe(sem) || mesDe(m.created_at)
}

// ── el armado ───────────────────────────────────────────────────────────────
export function armarDatosPanel(e: EntradaPanel): DatosPanel {
  const hoy = e.hoy ?? new Date()
  const precioBase = e.precioBase ?? 1300
  const agendas = e.agendas.filter((a) => !archivada(a))

  // 12 meses terminando en el mes en curso
  const meses: string[] = []
  for (let i = 11; i >= 0; i--) meses.push(claveMes(new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)))
  const idx = (k: string | null) => (k ? meses.indexOf(k) : -1)
  const ultimos3 = new Set(meses.slice(-3))
  const en3 = (k: string | null) => !!k && ultimos3.has(k)

  // ── meses ──
  const filas = meses.map((mes) => ({ mes, facturado: 0, cobrado: 0, leads: 0, agendas: 0, presentadas: 0, calificadas: 0, cierres: 0, ads: 0, alumnos: 0 }))
  const pagosPorMes = new Map<string, PagoPanel[]>()
  for (const p of e.pagos) {
    const k = mesDe(p.fecha)
    const i = idx(k)
    if (i < 0 || !k) continue
    if (isCashCollectedType(p.tipo)) filas[i].cobrado += Number(p.monto || 0)
    if (!pagosPorMes.has(k)) pagosPorMes.set(k, [])
    pagosPorMes.get(k)!.push(p)
  }
  for (const [k, lista] of pagosPorMes) {
    const i = idx(k)
    if (i >= 0) filas[i].facturado += newSalesRevenue(lista)
  }
  for (const a of agendas) {
    const i = idx(mesDe(a.fecha_agenda))
    if (i >= 0) {
      filas[i].agendas++
      if (a.show) {
        filas[i].presentadas++
        if (esCalificada(a)) filas[i].calificadas++
      }
    }
    if (a.cerro) {
      const j = idx(mesDe(a.fecha_tc) || mesDe(a.fecha_agenda))
      if (j >= 0) filas[j].cierres++
    }
  }
  for (const m of e.metricas) {
    if (minus(m.tipo) !== "nuevos_leads") continue
    const i = idx(mesMetrica(m))
    if (i >= 0) filas[i].leads += Number(m.valor || 0)
  }
  // leads: si no hay carga manual de "nuevos_leads", se usan los leads que
  // entraron al CRM (fecha_lead) — es lo que el CRM sabe, ni más ni menos.
  if (!filas.some((f) => f.leads)) {
    for (const a of agendas) {
      const i = idx(mesDe(a.fecha_lead) || mesDe(a.created_at))
      if (i >= 0) filas[i].leads++
    }
  }
  // alumnos activos a fin de cada mes
  const activosA = (fin: Date) => e.clientes.filter((c) => {
    const ingreso = fecha(c.fecha_ingreso) || fecha(c.created_at)
    if (!ingreso || ingreso > fin) return false
    const baja = fecha(c.fecha_baja)
    if (baja && baja <= fin) return false
    return !/baja|inactiv|cancel/.test(minus(c.estado))
  }).length
  filas.forEach((f) => {
    const [y, mo] = f.mes.split("-").map(Number)
    f.alumnos = activosA(new Date(y, mo, 0, 23, 59))
    f.cobrado = Math.round(f.cobrado * 100) / 100
    f.facturado = Math.round(f.facturado * 100) / 100
  })
  const actual = filas[filas.length - 1] as DatosPanel["meses"][number]
  actual.dias = hoy.getDate()
  actual.diasTotal = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()

  // ── closers (últimos 3 meses) ──
  const closers = new Map<string, DatosPanel["closers"][number]>()
  const closerDe = (n: string | null | undefined) => limpio(n) || "Sin closer"
  const c = (n: string) => {
    if (!closers.has(n)) closers.set(n, { nombre: n, presentadas: 0, calificadas: 0, cierres: 0, cobrado: 0 })
    return closers.get(n)!
  }
  for (const a of agendas) {
    const enAgenda = en3(mesDe(a.fecha_agenda))
    if (enAgenda && a.show) {
      const x = c(closerDe(a.closer)); x.presentadas++
      if (esCalificada(a)) x.calificadas++
    }
    if (a.cerro && en3(mesDe(a.fecha_tc) || mesDe(a.fecha_agenda))) c(closerDe(a.closer)).cierres++
  }
  for (const p of e.pagos) {
    if (!en3(mesDe(p.fecha)) || !isCashCollectedType(p.tipo)) continue
    c(closerDe(p.closer)).cobrado += Number(p.monto || 0)
  }
  if (!closers.size) c("Sin closer")

  // ── setters (últimos 3 meses) ──
  const setters = new Map<string, DatosPanel["setters"][number]>()
  const s = (n: string) => {
    if (!setters.has(n)) setters.set(n, { nombre: n, inbound: 0, fups: 0, agendas: 0 })
    return setters.get(n)!
  }
  for (const a of agendas) if (en3(mesDe(a.fecha_agenda))) s(limpio(a.setter) || "Sin setter").agendas++
  for (const m of e.metricas) {
    if (minus(m.tipo) !== "conversaciones_asignadas" || !en3(mesMetrica(m))) continue
    s(limpio(m.persona) || "Sin setter").inbound += Number(m.valor || 0)
  }
  if (!setters.size) s("Sin setter")

  // ── fuentes (últimos 3 meses) ──
  // El CRM no registra conversaciones por fuente: "leads" es la cantidad de
  // leads que entraron (fecha_lead) por ese canal. Cuando ManyChat esté
  // conectado, este número pasa a ser el de conversaciones reales.
  const fuentes = new Map<string, DatosPanel["fuentes"][number]>()
  const f = (n: string) => {
    if (!fuentes.has(n)) fuentes.set(n, { nombre: n, leads: 0, agendas: 0, cierres: 0 })
    return fuentes.get(n)!
  }
  for (const a of agendas) {
    const canal = canalDe(a.fuente)
    if (en3(mesDe(a.fecha_lead) || mesDe(a.created_at) || mesDe(a.fecha_agenda))) f(canal).leads++
    if (en3(mesDe(a.fecha_agenda))) f(canal).agendas++
    if (a.cerro && en3(mesDe(a.fecha_tc) || mesDe(a.fecha_agenda))) f(canal).cierres++
  }
  for (const x of fuentes.values()) if (x.leads < x.agendas) x.leads = x.agendas
  if (!fuentes.size) f("Sin fuente")

  // ── pipeline: las oportunidades abiertas de hoy ──
  const pipelineEtapas = [
    { nombre: "Agendada", prob: 10 }, { nombre: "Presentada", prob: 25 }, { nombre: "Calificada", prob: 40 },
    { nombre: "Propuesta", prob: 60 }, { nombre: "Seguimiento", prob: 75 },
  ]
  const pipeline: DatosPanel["pipeline"] = []
  const limiteAtras = new Date(hoy); limiteAtras.setDate(limiteAtras.getDate() - 60)
  for (const a of agendas) {
    if (a.cerro) continue
    const seg = minus(a.seguimiento_estado)
    if (seg === "descartado" || seg === "cerrado") continue
    const cuando = fecha(a.fecha_agenda)
    if (!cuando || cuando < limiteAtras) continue
    const futura = cuando > hoy
    if (!futura && !a.show && seg !== "reagendado") continue // no se presentó y nadie la reagendó: no es oportunidad
    let etapa = "Agendada"
    if (!futura && a.show) {
      etapa = "Presentada"
      if (esCalificada(a)) etapa = "Calificada"
      if (limpio(a.operacion) || limpio(a.plan_de_pago)) etapa = "Propuesta"
      if (["pendiente", "contactado", "reagendado"].includes(seg)) etapa = "Seguimiento"
    }
    const referencia = fecha(a.seguimiento_actualizado_at) || cuando
    pipeline.push({
      lead: limpio(a.nombre) || "Sin nombre",
      closer: closerDe(a.closer),
      etapa,
      monto: contractValueFromOperation(a.operacion, precioBase),
      dias: futura ? 0 : diasEntre(referencia, hoy),
      fuente: canalDe(a.fuente),
      prox: limpio(a.seguimiento_nota) || limpio(a.motivo_urgencia) || (futura ? `Llamada el ${isoDia(cuando)}` : ""),
    })
  }

  // ── cuotas: estado de hoy ──
  const cuotas: DatosPanel["cuotas"] = []
  for (const q of e.cuotas) {
    const vence = fecha(q.fecha_vencimiento)
    if (!vence) continue
    // solo el mes en curso, igual que en el panel
    if (claveMes(vence) !== claveMes(hoy)) continue
    const est = minus(q.estado)
    const cobrada = /cobrad|pagad|paid/.test(est) || (Number(q.monto_cobrado || 0) >= Number(q.monto || 0) && Number(q.monto || 0) > 0)
    let estado: DatosPanel["cuotas"][number]["estado"] = "por-cobrar"
    if (cobrada) estado = "cobrado"
    else if (/protocolo|mora|reclamo/.test(est)) estado = "protocolo"
    else if (vence < new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())) estado = "vencida"
    cuotas.push({ alumno: limpio(q.cliente) || "Sin nombre", monto: Number(q.monto || 0), vence: isoDia(vence), closer: closerDe(q.closer), estado })
  }

  // ── últimas llamadas ──
  const pasadas = agendas
    .map((a) => ({ a, d: fecha(a.fecha_agenda) }))
    .filter((x): x is { a: AgendaPanel; d: Date } => !!x.d && x.d <= hoy)
    .sort((x, y) => y.d.getTime() - x.d.getTime())
    .slice(0, 16)
  const llamadas: DatosPanel["llamadas"] = pasadas.map(({ a, d }) => {
    const seg = minus(a.seguimiento_estado)
    let situacion = "No cerró"
    if (a.cerro) situacion = /seguimiento|post/.test(minus(a.tipo_cierre)) || seg === "cerrado" ? "Adentro en seguimiento" : "Adentro en llamada"
    else if (!a.show) situacion = seg === "reagendado" ? "Reagendado" : minus(a.estado) === "no show" || diasEntre(d, hoy) >= 1 ? "No se presentó" : "Pendiente"
    else if (seg === "reagendado") situacion = "Reagendado"
    else if (seg === "pendiente" || seg === "contactado") situacion = "Pendiente"
    const monto = a.cerro ? Number(a.cc_dia_1 || 0) || contractValueFromOperation(a.operacion, 0) : 0
    return {
      fecha: isoDia(d),
      lead: limpio(a.nombre) || "Sin nombre",
      closer: closerDe(a.closer),
      fuente: canalDe(a.fuente),
      estrategia: limpio(a.recurso) || limpio(a.angulo_entrada) || "—",
      calificado: esCalificada(a),
      situacion,
      monto,
    }
  })

  const redondear = <T extends { cobrado: number }>(x: T) => ({ ...x, cobrado: Math.round(x.cobrado * 100) / 100 })

  return {
    marca: {
      nombre: e.marca?.nombre || BRAND.name,
      bajada: e.marca?.bajada || "Panel del negocio",
      moneda: e.marca?.moneda || "$",
      metaMensual: e.metaMensual ?? 50000,
    },
    meses: filas,
    closers: [...closers.values()].map(redondear),
    setters: [...setters.values()],
    fuentes: [...fuentes.values()],
    contenido: [], // el CRM todavía no mide piezas/views por formato: la página se esconde sola
    reels: [],     // ídem: sin atribución por reel no se inventa nada
    pipelineEtapas,
    pipeline,
    cuotas,
    llamadas,
  }
}
