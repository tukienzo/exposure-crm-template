// Contenido de los pasos del tour guiado (onboarding interactivo del header).
// Centralizado acá para que sea fácil de mantener sin tocar el componente
// de UI ni la navegación. Cada entrada usa el mismo `href` que los módulos
// de `crm-navigation.tsx` para poder resolver a qué <Link data-tour="..">
// hay que apuntar.

export type TourStep = {
  /** Debe coincidir con `data-tour="nav-<id>"` en el DOM, o "body" para pasos sin anclar. */
  id: string
  title: string
  description: string
  /** Si está seteado, sólo se muestra a estos roles (CEO/Contaduria). Si se omite, es para todos. */
  managerOnly?: boolean
}

// Convierte un href de módulo ("/cobros", "/") en un id de DOM estable
// para el atributo data-tour de cada Link del header.
export function navTourId(href: string): string {
  if (href === "/") return "nav-home"
  return `nav-${href.replace(/^\//, "").replace(/[^a-z0-9-]/gi, "-")}`
}

export const NAV_TOUR_COPY: Record<string, { title: string; description: string }> = {
  "/": {
    title: "Home",
    description: "Tu resumen del día: cartera de cobranza asignada, próximas agendas y accesos rápidos a lo urgente.",
  },
  "/cobros": {
    title: "Cobros",
    description: "Acá vivís la cobranza diaria: cuotas vencidas y por vencer. Registrá contacto, promesa de pago o cargá el pago en 1-2 clics. La pestaña \"Todas las cuotas\" es el historial completo.",
  },
  "/ventas": {
    title: "Agendas",
    description: "Pipeline y Centro de Agendas: cada lead se mueve entre etapas (Confirmada → Se Presentó → Cerrado/No Cerrado). Arrastrá la tarjeta a la etapa correcta.",
  },
  "/pagos": {
    title: "Pagos",
    description: "Cargá comprobantes de pagos recibidos y revisá el historial completo. Es la fuente de verdad de lo cobrado.",
  },
  "/equipo": {
    title: "Leaderboard",
    description: "Ranking del equipo por ventas/cobranza y esquema de comisiones vigente.",
  },
  "/clientes-hub": {
    title: "Clientes",
    description: "Ficha completa de cada cliente: checklist de onboarding, historial de llamadas y pagos, estado actual.",
  },
  "/contenido-angulos": {
    title: "Contenido",
    description: "Qué ángulos de contenido están generando más agendas y ventas. Útil para decidir qué grabar/publicar.",
  },
  "/rendimiento": {
    title: "Métricas",
    description: "Métricas generales del negocio, evolución diaria y reportes de llamadas analizadas.",
  },
  "/finanzas": {
    title: "Finanzas",
    description: "Ingresos, gastos y conciliación de caja. Visible solo para CEO y Contaduría.",
  },
  // "/conflictos-identidad" sacado del tutorial: la pantalla ya no está en
  // el nav (feedback 23/07 lote 2).
}
