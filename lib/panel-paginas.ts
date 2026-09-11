// Las páginas del Panel del negocio (public/panel/index.html). Vive acá,
// sin "use client", para que la puedan importar tanto el componente del
// iframe como la ruta del servidor.
export const PAGINAS_PANEL = [
  "resumen", "embudo", "pipeline", "anio", "equipo", "llamadas",
  "fuentes", "contenido", "cobranzas", "proyeccion", "agentes", "carrusel",
] as const
export type PaginaPanel = (typeof PAGINAS_PANEL)[number]

export const TITULOS_PANEL: Record<PaginaPanel, string> = {
  resumen: "Resumen del mes", embudo: "El embudo", pipeline: "Pipeline", anio: "Cómo viene el año",
  equipo: "El equipo", llamadas: "Últimas llamadas", fuentes: "De dónde salen los leads", contenido: "El contenido",
  cobranzas: "Cobranzas", proyeccion: "Hacia dónde va", agentes: "Service JARVIS", carrusel: "Generador de carruseles",
}

export const esPaginaPanel = (x: string): x is PaginaPanel => (PAGINAS_PANEL as readonly string[]).includes(x)
