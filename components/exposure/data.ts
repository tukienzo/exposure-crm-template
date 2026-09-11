import type { Status } from '@/components/exposure/ui'

/* ═══════════════════════════════════════════════════════════════
   AGENTES
   ═══════════════════════════════════════════════════════════════ */
export type AgentId = 'ceo' | 'investigador' | 'cmo' | 'comercial' | 'datos'

export interface Agent {
  id: AgentId
  name: string
  role: string
  status: Status
  icon: string
  /** una línea, para tarjetas */
  short: string
  /** descripción completa, para la página de agentes */
  desc: string
  metric: { value: string; label: string }
  stats: { value: string; label: string; gold?: boolean }[]
  activity: { t: string; m: string }[]
}

export const AGENTS: Agent[] = [
  {
    id: 'ceo',
    name: 'CEO',
    role: 'Dirección',
    status: 'working',
    icon: 'Crown',
    short: 'Define prioridades y coordina al equipo.',
    desc: 'Define prioridades, distribuye trabajo y conecta toda la información del sistema.',
    metric: { value: '4', label: 'tareas hoy' },
    stats: [
      { value: '4', label: 'Tareas de hoy', gold: true },
      { value: '4', label: 'Agentes coordinados' },
      { value: '94%', label: 'Contexto' },
    ],
    activity: [
      { t: '16:06', m: 'Activó el research de competencia' },
      { t: '15:48', m: 'Chequeó el status de los guiones' },
      { t: '15:20', m: 'Envió la orden de FUPs al área comercial' },
      { t: '14:52', m: 'Actualizó el CRM' },
      { t: '14:10', m: 'Definió las prioridades del día' },
    ],
  },
  {
    id: 'investigador',
    name: 'Investigador',
    role: 'Investigación',
    status: 'waiting',
    icon: 'Radar',
    short: 'Analiza mercado y competencia.',
    desc: 'Analiza mercado, competencia y contexto para alimentar las decisiones del equipo.',
    metric: { value: '28', label: 'fuentes' },
    stats: [
      { value: '28', label: 'Fuentes', gold: true },
      { value: '6', label: 'Informes' },
      { value: '71%', label: 'Contexto' },
    ],
    activity: [
      { t: '16:02', m: 'Analizó 28 piezas de la competencia' },
      { t: '15:31', m: 'Detectó un cambio en el discurso del mercado' },
      { t: '14:58', m: 'Actualizó el perfil del cliente ideal' },
      { t: '14:12', m: 'Guardó tres variantes de oferta' },
      { t: '13:35', m: 'Cerró el informe semanal de mercado' },
    ],
  },
  {
    id: 'cmo',
    name: 'CMO',
    role: 'Marketing',
    status: 'working',
    icon: 'Megaphone',
    short: 'Convierte insights en contenido.',
    desc: 'Convierte información en estrategia, ángulos y contenido listo para publicar.',
    metric: { value: '3', label: 'guiones' },
    stats: [
      { value: '3', label: 'Guiones de hoy', gold: true },
      { value: '12', label: 'Ángulos activos' },
      { value: '88%', label: 'Contexto' },
    ],
    activity: [
      { t: '16:03', m: 'Generó 3 nuevos guiones' },
      { t: '15:44', m: 'Actualizó la biblioteca de hooks' },
      { t: '15:02', m: 'Priorizó el ángulo de problema consciente' },
      { t: '14:20', m: 'Cerró el brief de la campaña de agosto' },
      { t: '13:48', m: 'Descartó dos ángulos con bajo rendimiento' },
    ],
  },
  {
    id: 'comercial',
    name: 'Agente Comercial',
    role: 'Ventas',
    status: 'working',
    icon: 'Target',
    short: 'Prioriza leads y seguimientos.',
    desc: 'Gestiona oportunidades, seguimientos y próximos pasos del pipeline.',
    metric: { value: '7', label: 'oportunidades' },
    stats: [
      { value: '7', label: 'Oportunidades', gold: true },
      { value: '92', label: 'Leads calificados' },
      { value: '64%', label: 'Contexto' },
    ],
    activity: [
      { t: '16:04', m: 'Priorizó 7 oportunidades' },
      { t: '15:38', m: 'Agendó una llamada para el jueves' },
      { t: '15:11', m: 'Calificó 12 leads nuevos' },
      { t: '14:36', m: 'Actualizó el mapa de objeciones' },
      { t: '13:52', m: 'Movió una oportunidad a cierre' },
    ],
  },
  {
    id: 'datos',
    name: 'Analista de Datos',
    role: 'Datos',
    status: 'idle',
    icon: 'ChartSpline',
    short: 'Detecta qué métricas importan.',
    desc: 'Encuentra señales dentro de los números y ordena lo que realmente mueve el negocio.',
    metric: { value: '12', label: 'señales' },
    stats: [
      { value: '12', label: 'Señales', gold: true },
      { value: '41', label: 'Llamadas atribuidas' },
      { value: '52%', label: 'Contexto' },
    ],
    activity: [
      { t: '16:05', m: 'Detectó una nueva señal de adquisición' },
      { t: '15:26', m: 'Recalculó la atribución de las llamadas' },
      { t: '14:49', m: 'Comparó el rendimiento con el mes anterior' },
      { t: '14:05', m: 'Publicó los leads por mil visualizaciones' },
      { t: '13:20', m: 'Ordenó las métricas por impacto real' },
    ],
  },
]

export const agentById = (id: AgentId) => AGENTS.find((a) => a.id === id)!
export const ESPECIALISTAS = AGENTS.filter((a) => a.id !== 'ceo')

/* ═══════════════════════════════════════════════════════════════
   CENTRO DE MANDO
   ═══════════════════════════════════════════════════════════════ */
export const ACTIVIDAD = [
  { t: '16:02', who: 'Investigador', m: 'Analizó 28 piezas de la competencia.' },
  { t: '16:03', who: 'CMO', m: 'Generó 3 nuevos guiones.' },
  { t: '16:04', who: 'Agente Comercial', m: 'Priorizó 7 oportunidades.' },
  { t: '16:05', who: 'Analista de Datos', m: 'Detectó una nueva señal de adquisición.' },
  { t: '16:06', who: 'CEO', m: 'Actualizó las prioridades del día.' },
]

/* ═══════════════════════════════════════════════════════════════
   ANALÍTICA DE CONTENIDO
   ═══════════════════════════════════════════════════════════════ */
export const KPIS = [
  { value: '4,8M', label: 'Visualizaciones' },
  { value: '418', label: 'Leads' },
  { value: '92', label: 'Leads calificados', gold: true },
  { value: '$84,2K', label: 'Pipeline generado' },
]

export const MEJOR_CONTENIDO = [
  { title: 'Cómo las agencias de IA van a cambiar en 2026', views: '1,2M', leads: '642' },
  { title: 'El modelo de agencia que nadie entiende', views: '847K', leads: '294' },
  { title: 'Cómo construimos la empresa', views: '618K', leads: '219' },
  { title: 'La IA está reemplazando agencias tradicionales', views: '412K', leads: '176' },
]

export const MEJORES_HOOKS = [
  { label: 'Nadie está hablando de este cambio', lift: '+41%' },
  { label: 'El modelo que todos copiaron está muriendo', lift: '+34%' },
  { label: 'Reconstruimos todo nuestro sistema en 90 días', lift: '+29%' },
  { label: 'Esto es lo que las agencias no entienden de la IA', lift: '+24%' },
  { label: 'Tres números cambiaron toda nuestra estrategia', lift: '+18%' },
]

export const MEJORES_ANGULOS = [
  { label: 'Problema consciente', pct: 34 },
  { label: 'Posicionamiento contrarian', pct: 26 },
  { label: 'Demostración del mecanismo', pct: 18 },
  { label: 'Historia y autoridad', pct: 13 },
  { label: 'Otros', pct: 9 },
]

/** visualizaciones diarias · 30 días */
export const SERIE_VIEWS = [
  38, 42, 40, 51, 47, 58, 62, 55, 68, 74, 71, 82, 79, 88, 94, 87, 96, 104, 99, 112, 108, 121, 118,
  132, 128, 141, 137, 152, 148, 164,
]
/** leads diarios · 30 días */
export const SERIE_LEADS = [
  8, 11, 9, 14, 12, 16, 19, 15, 21, 24, 22, 27, 25, 31, 34, 29, 36, 41, 38, 44, 42, 49, 46, 53, 51,
  58, 55, 62, 59, 68,
]

/* ═══════════════════════════════════════════════════════════════
   PIPELINE DE LEADS
   ═══════════════════════════════════════════════════════════════ */
export const COLUMNAS = ['Nuevos', 'Contactados', 'Calificados', 'Llamada agendada', 'Cerrados']

export interface Lead {
  name: string
  co: string
  val: string
  fit: number
  col: number
}

export const LEADS: Lead[] = [
  { name: 'Alexander Morgan', co: 'Agencia de IA', val: '$15K / mes', fit: 92, col: 0 },
  { name: 'Marcus Chen', co: 'Consultoría', val: '$8K / mes', fit: 87, col: 0 },
  { name: 'Priya Raman', co: 'Estudio de automatización', val: '$9K / mes', fit: 74, col: 0 },
  { name: 'Daniel Álvarez', co: 'Agencia de marketing', val: '$21K / mes', fit: 95, col: 1 },
  { name: 'Sofía Miller', co: 'Consultoría', val: '$12K / mes', fit: 82, col: 1 },
  { name: 'Tomas Lindqvist', co: 'Estudio de growth', val: '$7K / mes', fit: 69, col: 1 },
  { name: 'Ethan Carter', co: 'Automatización con IA', val: '$18K / mes', fit: 89, col: 2 },
  { name: 'Nadia Haddad', co: 'Agencia de medios', val: '$14K / mes', fit: 85, col: 2 },
  { name: 'Julián Reyes', co: 'Consultoría B2B', val: '$11K / mes', fit: 78, col: 2 },
  { name: 'Clara Whitfield', co: 'Agencia de performance', val: '$24K / mes', fit: 93, col: 3 },
  { name: 'Hugo Bernard', co: 'Agencia de IA', val: '$16K / mes', fit: 88, col: 3 },
  { name: 'Léa Fontaine', co: 'Estudio creativo', val: '$17K / mes', fit: 90, col: 3 },
  { name: 'Amara Okafor', co: 'Consultoría', val: '$19K / mes', fit: 91, col: 4 },
  { name: 'Victor Salas', co: 'Agencia de automatización', val: '$13K / mes', fit: 86, col: 4 },
]

export const PIPELINE_STATS = [
  { value: '$84,2K', label: 'Valor abierto', gold: true },
  { value: '92', label: 'Leads calificados' },
  { value: '31%', label: 'Tasa de cierre' },
  { value: '9 días', label: 'Ciclo promedio' },
]

export const MOVIMIENTO = [
  { t: '16:04', m: 'Alexander Morgan pasó a prioridad alta' },
  { t: '15:38', m: 'Clara Whitfield agendó llamada para el jueves' },
  { t: '15:11', m: 'Daniel Álvarez avanzó a Contactados' },
  { t: '14:36', m: 'Siete seguimientos quedaron en cola para hoy' },
  { t: '11:38', m: 'Amara Okafor cerró por $19K / mes' },
]

/* ═══════════════════════════════════════════════════════════════
   TAREAS
   ═══════════════════════════════════════════════════════════════ */
export interface Tarea {
  t: string
  agent: string
  group: 0 | 1 | 2
}

export const GRUPOS = ['Hoy', 'En progreso', 'Completadas']

export const TAREAS: Tarea[] = [
  // ── CEO · lo que hace hoy ──────────────────────────────────
  { t: 'Actualizar el CRM', agent: 'CEO', group: 0 },
  { t: 'Enviar orden de FUPs al área comercial', agent: 'CEO', group: 0 },
  { t: 'Chequear status de los guiones', agent: 'CEO', group: 1 },
  { t: 'Research de Competencia activado', agent: 'CEO', group: 1 },
  // ── resto del equipo ───────────────────────────────────────
  { t: 'Priorizar los seguimientos del día', agent: 'Agente Comercial', group: 0 },
  { t: 'Generar los tres guiones de hoy', agent: 'CMO', group: 0 },
  { t: 'Revisar el pipeline entrante', agent: 'Agente Comercial', group: 0 },
  { t: 'Elegir el ángulo de mañana', agent: 'CMO', group: 0 },
  { t: 'Analizar el contenido de la competencia', agent: 'Investigador', group: 1 },
  { t: 'Escribir el guion de la campaña de agosto', agent: 'CMO', group: 1 },
  { t: 'Recalcular la atribución de llamadas', agent: 'Analista de Datos', group: 1 },
  { t: 'Revisar las objeciones de la semana', agent: 'Agente Comercial', group: 1 },
  { t: 'Revisar el rendimiento de ayer', agent: 'Analista de Datos', group: 2 },
  { t: 'Ordenar las señales de adquisición', agent: 'Analista de Datos', group: 2 },
  { t: 'Calificar los leads nuevos', agent: 'Agente Comercial', group: 2 },
  { t: 'Sincronizar la biblioteca de hooks', agent: 'CMO', group: 2 },
  { t: 'Cerrar el informe de mercado', agent: 'Investigador', group: 2 },
]

/** el total de tareas se deriva de TAREAS: nunca queda desfasado */
export const SISTEMA = [
  { value: '5', label: 'Agentes activos', gold: true },
  { value: String(TAREAS.length), label: 'Tareas de hoy' },
  { value: '94%', label: 'Contexto sincronizado' },
]

/* ═══════════════════════════════════════════════════════════════
   AGENDA
   ═══════════════════════════════════════════════════════════════ */
export const AGENDA = [
  { t: '06:00', label: 'Ciclo diario de coordinación', agent: 'CEO', state: 'Completado' },
  { t: '06:15', label: 'Barrido de competencia', agent: 'Investigador', state: 'Completado' },
  { t: '07:00', label: 'Carga del rendimiento de contenido', agent: 'Analista de Datos', state: 'Completado' },
  { t: '09:00', label: 'Generación de guiones', agent: 'CMO', state: 'En curso' },
  { t: '11:30', label: 'Calificación de leads entrantes', agent: 'Agente Comercial', state: 'En curso' },
  { t: '14:00', label: 'Ventana de seguimientos', agent: 'Agente Comercial', state: 'Pendiente' },
  { t: '16:00', label: 'Ranking de señales', agent: 'Analista de Datos', state: 'Pendiente' },
  { t: '18:00', label: 'Consolidación de memoria', agent: 'CEO', state: 'Pendiente' },
  { t: '20:00', label: 'Resumen del día', agent: 'CEO', state: 'Pendiente' },
]

/* ═══════════════════════════════════════════════════════════════
   HERRAMIENTAS
   ═══════════════════════════════════════════════════════════════ */
export const HERRAMIENTAS = [
  { name: 'Memoria compartida', desc: 'Guardar y consultar lo que aprende el sistema', agent: 'Todos', state: 'Activa' },
  { name: 'Análisis de competencia', desc: 'Revisar el contenido y la oferta de otros', agent: 'Investigador', state: 'Activa' },
  { name: 'Señales de mercado', desc: 'Detectar cambios de discurso y tendencias', agent: 'Investigador', state: 'Activa' },
  { name: 'Análisis de contenido', desc: 'Medir qué piezas funcionan y por qué', agent: 'CMO · Datos', state: 'Activa' },
  { name: 'Generación de guiones', desc: 'Escribir guiones listos para grabar', agent: 'CMO', state: 'Activa' },
  { name: 'Calificación de leads', desc: 'Puntuar oportunidades según el cliente ideal', agent: 'Comercial', state: 'Activa' },
  { name: 'Movimiento de pipeline', desc: 'Avanzar oportunidades de etapa', agent: 'Comercial', state: 'Requiere aprobación' },
  { name: 'Envío de seguimientos', desc: 'Enviar mensajes a leads en cola', agent: 'Comercial', state: 'Requiere aprobación' },
  { name: 'Ranking de señales', desc: 'Ordenar métricas por impacto real', agent: 'Analista de Datos', state: 'Activa' },
]

/* ═══════════════════════════════════════════════════════════════
   CONTENIDO
   ═══════════════════════════════════════════════════════════════ */
export const CONTENIDO = [
  { title: 'El modelo de agencia que nadie reconstruyó', angle: 'Posicionamiento contrarian', state: 'Agendado', score: 94 },
  { title: 'Por qué el único cuello de botella es el lead calificado', angle: 'Problema consciente', state: 'Borrador', score: 91 },
  { title: 'Dentro del sistema operativo de la empresa', angle: 'Demostración del mecanismo', state: 'En revisión', score: 88 },
  { title: 'Lo que nos enseñaron 4,8M de visualizaciones', angle: 'Historia y autoridad', state: 'Publicado', score: 86 },
  { title: 'Los tres números que dirigen esta empresa', angle: 'Demostración del mecanismo', state: 'Publicado', score: 82 },
  { title: 'Las objeciones son un problema de posicionamiento', angle: 'Problema consciente', state: 'Borrador', score: 79 },
]

export const MEMORIA_ACTIVIDAD = [
  { t: '16:06', m: 'CEO guardó las prioridades del día' },
  { t: '16:05', m: 'Analista de Datos escribió una señal nueva' },
  { t: '16:03', m: 'CMO actualizó los hooks ganadores' },
  { t: '16:02', m: 'Investigador indexó la competencia' },
]

/* ═══════════════════════════════════════════════════════════════
   MEMORIA COMPARTIDA — grafo
   ═══════════════════════════════════════════════════════════════ */
export type Tier = 'hub' | 'mid' | 'small'
export type Cluster = 'central' | 'ceo' | 'investigacion' | 'marketing' | 'ventas' | 'datos'

export interface GNode {
  id: string
  label: string
  cluster: Cluster
  tier: Tier
  x: number
  y: number
  r: number
}

export interface GEdge {
  a: number
  b: number
  strong: boolean
}

export const CLUSTERS: Record<Cluster, { label: string; owner: string; hub: string }> = {
  central: { label: 'Memoria central', owner: 'Sistema', hub: 'central' },
  ceo: { label: 'Dirección', owner: 'CEO', hub: 'ceo' },
  investigacion: { label: 'Investigación', owner: 'Investigador', hub: 'investigacion' },
  marketing: { label: 'Marketing', owner: 'CMO', hub: 'marketing' },
  ventas: { label: 'Ventas', owner: 'Agente Comercial', hub: 'ventas' },
  datos: { label: 'Datos', owner: 'Analista de Datos', hub: 'datos' },
}

/** color de identidad por clúster del grafo (mismo par que los agentes) */
export const CLUSTER_ACCENT: Record<Cluster, string> = {
  central: '#c8a95d',
  ceo: '#7C5CFA',
  investigacion: '#3BA8F0',
  marketing: '#F2794C',
  ventas: '#D9A63C',
  datos: '#2FB79A',
}

/* PRNG determinista — el grafo se ve idéntico en cada grabación */
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

interface Spec {
  id: string
  label: string
  tier: Tier
}

const SPECS: Record<Cluster, { cx: number; cy: number; spread: number; nodes: Spec[] }> = {
  central: {
    cx: 500,
    cy: 400,
    spread: 104,
    nodes: [
      { id: 'central', label: 'Memoria central', tier: 'hub' },
      { id: 'contexto', label: 'Contexto del sistema', tier: 'mid' },
      { id: 'indice', label: 'Índice de memoria', tier: 'mid' },
      { id: 'decisiones', label: 'Historial de decisiones', tier: 'small' },
      { id: 'resumen', label: 'Resumen diario', tier: 'small' },
      { id: 'aprendizajes', label: 'Aprendizajes', tier: 'small' },
    ],
  },
  ceo: {
    cx: 500,
    cy: 148,
    spread: 100,
    nodes: [
      { id: 'ceo', label: 'CEO', tier: 'hub' },
      { id: 'prioridad', label: 'Prioridad del día', tier: 'mid' },
      { id: 'objetivo', label: 'Objetivo trimestral', tier: 'mid' },
      { id: 'decision', label: 'Decisión', tier: 'small' },
      { id: 'revision', label: 'Revisión de resultados', tier: 'small' },
    ],
  },
  investigacion: {
    cx: 158,
    cy: 262,
    spread: 118,
    nodes: [
      { id: 'investigacion', label: 'Investigación', tier: 'hub' },
      { id: 'mercado', label: 'Inteligencia de mercado', tier: 'mid' },
      { id: 'competencia', label: 'Señal de competencia', tier: 'mid' },
      { id: 'cambio', label: 'Cambio de mercado', tier: 'mid' },
      { id: 'avatar', label: 'Cliente ideal', tier: 'small' },
      { id: 'oferta', label: 'Oferta', tier: 'small' },
      { id: 'tendencia', label: 'Tendencia', tier: 'small' },
      { id: 'informe', label: 'Informe de investigación', tier: 'small' },
      { id: 'posicionamiento', label: 'Posicionamiento', tier: 'small' },
    ],
  },
  marketing: {
    cx: 846,
    cy: 262,
    spread: 120,
    nodes: [
      { id: 'marketing', label: 'Marketing', tier: 'hub' },
      { id: 'estrategia', label: 'Estrategia de contenido', tier: 'mid' },
      { id: 'hook', label: 'Hook ganador', tier: 'mid' },
      { id: 'angulo', label: 'Ángulo', tier: 'mid' },
      { id: 'guion', label: 'Guion', tier: 'small' },
      { id: 'campana', label: 'Campaña', tier: 'small' },
      { id: 'audiencia', label: 'Insight de audiencia', tier: 'small' },
      { id: 'dolor', label: 'Dolor de audiencia', tier: 'small' },
      { id: 'ganador', label: 'Contenido ganador', tier: 'small' },
      { id: 'rendimiento-contenido', label: 'Rendimiento de contenido', tier: 'small' },
    ],
  },
  ventas: {
    cx: 828,
    cy: 606,
    spread: 116,
    nodes: [
      { id: 'ventas', label: 'Ventas', tier: 'hub' },
      { id: 'pipeline', label: 'Pipeline', tier: 'mid' },
      { id: 'calificado', label: 'Lead calificado', tier: 'mid' },
      { id: 'entrante', label: 'Lead entrante', tier: 'small' },
      { id: 'seguimiento', label: 'Seguimiento', tier: 'small' },
      { id: 'oportunidad', label: 'Oportunidad', tier: 'small' },
      { id: 'llamada', label: 'Llamada agendada', tier: 'small' },
      { id: 'revenue', label: 'Señal de revenue', tier: 'mid' },
      { id: 'objeciones', label: 'Objeciones', tier: 'small' },
    ],
  },
  datos: {
    cx: 176,
    cy: 606,
    spread: 116,
    nodes: [
      { id: 'datos', label: 'Datos', tier: 'hub' },
      { id: 'adquisicion', label: 'Señal de adquisición', tier: 'mid' },
      { id: 'rendimiento', label: 'Rendimiento', tier: 'mid' },
      { id: 'metricas-revenue', label: 'Métricas de revenue', tier: 'mid' },
      { id: 'metricas-contenido', label: 'Métricas de contenido', tier: 'small' },
      { id: 'metricas-leads', label: 'Métricas de leads', tier: 'small' },
      { id: 'conversion', label: 'Tasa de conversión', tier: 'small' },
      { id: 'ranking', label: 'Ranking de señales', tier: 'small' },
      { id: 'atribucion', label: 'Atribución', tier: 'small' },
    ],
  },
}

const R: Record<Tier, number> = { hub: 13, mid: 6.6, small: 4.2 }

function buildNodes(): GNode[] {
  const out: GNode[] = []
  const rand = rng(20260812)
  ;(Object.keys(SPECS) as Cluster[]).forEach((cluster, ci) => {
    const { cx, cy, spread, nodes } = SPECS[cluster]
    nodes.forEach((n, i) => {
      if (n.tier === 'hub') {
        out.push({ ...n, cluster, x: cx, y: cy, r: R.hub })
        return
      }
      const ang = i * 2.399 + ci * 1.3 + rand() * 0.4
      const ring = n.tier === 'mid' ? 0.68 : 1.02
      const rad = spread * (ring + rand() * 0.14)
      out.push({
        ...n,
        cluster,
        x: cx + Math.cos(ang) * rad * 1.16,
        y: cy + Math.sin(ang) * rad * 0.9,
        r: R[n.tier],
      })
    })
  })
  return out
}

/** separa etiquetas que quedarían pegadas: un empujón vertical mínimo */
function deoverlap(nodes: GNode[]): GNode[] {
  const labeled = nodes.filter((n) => n.tier !== 'small')
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < labeled.length; i++) {
      for (let j = i + 1; j < labeled.length; j++) {
        const A = labeled[i]
        const B = labeled[j]
        const dx = Math.abs(A.x - B.x)
        const dy = Math.abs(A.y - B.y)
        if (dx < 112 && dy < 27) {
          const push = (27 - dy) / 2 + 1
          if (A.y <= B.y) {
            A.y -= push
            B.y += push
          } else {
            A.y += push
            B.y -= push
          }
        }
      }
    }
  }
  return nodes
}

/** estira el grafo en vertical para que llene el lienzo del panel */
function reframe(nodes: GNode[]): GNode[] {
  for (const n of nodes) {
    n.x = 500 + (n.x - 500) * 0.94
    n.y = 400 + (n.y - 400) * 1.2
  }
  return nodes
}

export const NODES: GNode[] = deoverlap(reframe(buildNodes()))
const IDX: Record<string, number> = Object.fromEntries(NODES.map((n, i) => [n.id, i]))

/* columna vertebral semántica: lo que el sistema realmente sabe de sí mismo */
const SEMANTIC: [string, string][] = [
  ['central', 'ceo'], ['central', 'investigacion'], ['central', 'marketing'], ['central', 'ventas'],
  ['central', 'datos'], ['central', 'contexto'], ['central', 'indice'], ['central', 'aprendizajes'],
  ['central', 'resumen'], ['central', 'decisiones'],
  ['ceo', 'prioridad'], ['ceo', 'objetivo'], ['ceo', 'decision'], ['ceo', 'revision'],
  ['ceo', 'marketing'], ['ceo', 'ventas'], ['ceo', 'datos'], ['ceo', 'investigacion'],
  ['ceo', 'contexto'], ['ceo', 'indice'], ['ceo', 'resumen'], ['ceo', 'aprendizajes'],
  ['ceo', 'ranking'], ['ceo', 'pipeline'],
  ['investigacion', 'mercado'], ['investigacion', 'competencia'], ['investigacion', 'cambio'],
  ['investigacion', 'avatar'], ['investigacion', 'informe'], ['investigacion', 'tendencia'],
  ['mercado', 'cambio'], ['mercado', 'posicionamiento'], ['competencia', 'posicionamiento'],
  ['avatar', 'dolor'], ['avatar', 'oferta'], ['oferta', 'posicionamiento'],
  ['informe', 'estrategia'], ['cambio', 'estrategia'],
  ['marketing', 'estrategia'], ['marketing', 'hook'], ['marketing', 'angulo'], ['marketing', 'guion'],
  ['marketing', 'campana'], ['marketing', 'audiencia'],
  ['estrategia', 'angulo'], ['angulo', 'guion'], ['guion', 'campana'], ['hook', 'ganador'],
  ['hook', 'guion'], ['audiencia', 'dolor'], ['dolor', 'angulo'],
  ['campana', 'rendimiento-contenido'], ['ganador', 'rendimiento-contenido'],
  ['ventas', 'pipeline'], ['ventas', 'calificado'], ['ventas', 'entrante'], ['ventas', 'seguimiento'],
  ['ventas', 'oportunidad'], ['ventas', 'revenue'],
  ['entrante', 'calificado'], ['calificado', 'oportunidad'], ['oportunidad', 'llamada'],
  ['llamada', 'pipeline'], ['seguimiento', 'objeciones'], ['objeciones', 'dolor'],
  ['pipeline', 'revenue'], ['revenue', 'metricas-revenue'], ['calificado', 'avatar'],
  ['datos', 'adquisicion'], ['datos', 'rendimiento'], ['datos', 'metricas-revenue'],
  ['datos', 'metricas-contenido'], ['datos', 'metricas-leads'], ['datos', 'ranking'],
  ['adquisicion', 'ranking'], ['ranking', 'prioridad'], ['rendimiento', 'conversion'],
  ['conversion', 'metricas-leads'], ['atribucion', 'adquisicion'], ['atribucion', 'metricas-contenido'],
  ['metricas-contenido', 'rendimiento-contenido'], ['metricas-leads', 'entrante'],
  ['metricas-revenue', 'pipeline'], ['adquisicion', 'estrategia'],
  ['competencia', 'estrategia'], ['prioridad', 'guion'], ['prioridad', 'seguimiento'],
  ['prioridad', 'informe'], ['aprendizajes', 'ganador'], ['aprendizajes', 'objeciones'],
  ['indice', 'mercado'], ['indice', 'pipeline'], ['indice', 'rendimiento'], ['indice', 'estrategia'],
  ['contexto', 'prioridad'], ['resumen', 'revenue'], ['decisiones', 'decision'],
]

/** columna vertebral + relleno por proximidad hasta la densidad objetivo */
function buildEdges(target = 200): GEdge[] {
  const seen = new Set<string>()
  const edges: GEdge[] = []
  const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`)
  const add = (a: number, b: number, strong: boolean) => {
    if (a === b) return
    const k = key(a, b)
    if (seen.has(k)) return
    seen.add(k)
    edges.push({ a, b, strong })
  }

  for (const [a, b] of SEMANTIC) {
    if (IDX[a] === undefined || IDX[b] === undefined) continue
    add(IDX[a], IDX[b], true)
  }

  const pairs: { a: number; b: number; d: number }[] = []
  for (let i = 0; i < NODES.length; i++) {
    for (let j = i + 1; j < NODES.length; j++) {
      if (seen.has(key(i, j))) continue
      pairs.push({ a: i, b: j, d: Math.hypot(NODES[i].x - NODES[j].x, NODES[i].y - NODES[j].y) })
    }
  }
  pairs.sort((p, q) => p.d - q.d)
  for (const p of pairs) {
    if (edges.length >= target) break
    add(p.a, p.b, false)
  }
  return edges
}

export const EDGES: GEdge[] = buildEdges()

/** encuadre real del grafo, con aire para las etiquetas */
export const BOUNDS = (() => {
  const xs = NODES.map((n) => n.x)
  const ys = NODES.map((n) => n.y)
  const padX = 74
  const padTop = 74 // deja aire para los chips de clúster
  const padBottom = 48
  const x = Math.min(...xs) - padX
  const y = Math.min(...ys) - padTop
  return { x, y, w: Math.max(...xs) + padX - x, h: Math.max(...ys) + padBottom - y }
})()

export const DEGREE: number[] = (() => {
  const d = NODES.map(() => 0)
  for (const e of EDGES) {
    d[e.a]++
    d[e.b]++
  }
  return d
})()

/* ── ficha del inspector ─────────────────────────────────────── */
export interface Ficha {
  desc: string
  lecturas: number
  actualizado: string
  aprendizaje: string
  fuente: string
}

const FICHAS: Record<string, Partial<Ficha>> = {
  central: {
    desc: 'Todo lo que el sistema aprende se guarda acá y queda disponible para cualquier agente.',
    aprendizaje: 'La memoria se consolidó esta mañana sin conflictos entre agentes.',
    fuente: 'Sistema',
    actualizado: 'Ahora',
  },
  ceo: {
    desc: 'Coordina el sistema y utiliza la memoria compartida para decidir qué hacer.',
    aprendizaje: 'El contenido centrado en problemas está generando los leads más calificados.',
    fuente: 'Analista de Datos',
    actualizado: 'Ahora',
  },
  investigacion: {
    desc: 'Reúne todo lo que el sistema sabe del mercado, la competencia y el cliente ideal.',
    aprendizaje: 'Tres competidores empezaron a hablar de sistemas en lugar de servicios.',
    fuente: 'Investigador',
    actualizado: 'Hace 6 min',
  },
  marketing: {
    desc: 'Convierte la información del sistema en ángulos, hooks y contenido publicable.',
    aprendizaje: 'Los hooks contrarian rinden un 41% más que la demostración de mecanismo.',
    fuente: 'CMO',
    actualizado: 'Hace 2 min',
  },
  ventas: {
    desc: 'Guarda el estado real de cada oportunidad y lo que hace avanzar una conversación.',
    aprendizaje: 'Las llamadas agendadas suben cuando el lead ya vio contenido de mecanismo.',
    fuente: 'Agente Comercial',
    actualizado: 'Hace 4 min',
  },
  datos: {
    desc: 'Ordena las métricas del negocio y marca cuáles merecen atención hoy.',
    aprendizaje: 'El contenido de problema consciente rinde 0,087 leads por mil visualizaciones.',
    fuente: 'Analista de Datos',
    actualizado: 'Hace 9 min',
  },
  prioridad: {
    desc: 'Lo que el sistema decidió priorizar durante el día de hoy.',
    aprendizaje: 'La restricción del día es el volumen de leads calificados.',
    fuente: 'CEO',
    actualizado: 'Hace 2 min',
  },
  hook: {
    desc: 'Los hooks que ya demostraron rendir por encima del promedio.',
    aprendizaje: '"Nadie está hablando de este cambio" rinde un 41% más en 28 usos.',
    fuente: 'CMO',
    actualizado: 'Hace 3 min',
  },
  adquisicion: {
    desc: 'Las señales que explican de dónde llegan los mejores leads.',
    aprendizaje: 'El contenido corto de problema consciente lidera el ranking de adquisición.',
    fuente: 'Analista de Datos',
    actualizado: 'Hace 11 min',
  },
  pipeline: {
    desc: 'El estado de todas las oportunidades abiertas del negocio.',
    aprendizaje: 'Hay $84,2K abiertos en 14 oportunidades activas.',
    fuente: 'Agente Comercial',
    actualizado: 'Hace 5 min',
  },
  competencia: {
    desc: 'Cambios detectados en el discurso, la oferta y el contenido de la competencia.',
    aprendizaje: 'El discurso de la competencia se movió de entregables a sistemas.',
    fuente: 'Investigador',
    actualizado: 'Hace 7 min',
  },
  estrategia: {
    desc: 'La dirección creativa vigente, construida desde lo que el sistema ya aprendió.',
    aprendizaje: 'Se movió un 34% del esfuerzo hacia formatos de problema consciente.',
    fuente: 'CMO',
    actualizado: 'Hace 12 min',
  },
}

export function ficha(i: number): Ficha {
  const n = NODES[i]
  const r = rng(i * 7919 + 13)
  const base: Ficha = {
    desc: `Memoria de ${CLUSTERS[n.cluster].label.toLowerCase()} disponible para todos los agentes del sistema.`,
    lecturas: 40 + Math.floor(r() * 420),
    actualizado: `Hace ${2 + Math.floor(r() * 40)} min`,
    aprendizaje: `${n.label} se actualizó con la última información del sistema.`,
    fuente: CLUSTERS[n.cluster].owner,
  }
  if (n.id === 'ceo') base.lecturas = 288
  return { ...base, ...FICHAS[n.id] }
}

export const conexiones = (i: number) =>
  EDGES.filter((e) => e.a === i || e.b === i)
    .map((e) => NODES[e.a === i ? e.b : e.a])
    .sort((a, b) => R[b.tier] - R[a.tier])
    .slice(0, 6)
