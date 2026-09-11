export type ConceptoDef = {
  label: string          // lo que ve el closer en el selector
  pppTexto: string       // texto fijo que va en el mensaje (mayusculas), o "" si es dinamico (ver Cuota Venta Interna)
  daAcceso: boolean
  requiereNumeroCuota?: boolean   // true para "Cuota Venta Interna" (pide un input extra de numero)
  actualizaAgendas?: boolean      // true para los 4 conceptos que tambien tocan la tabla agendas
}

// Conceptos disponibles SOLO como primer pago del cliente (fila 1 / primera vez).
export const CONCEPTOS_FILA1: ConceptoDef[] = [
  { label: "Fee", pppTexto: "GUARDAMOS LUGAR", daAcceso: false, actualizaAgendas: true },
  { label: "Fee + Acceso Acción", pppTexto: "ACCESO A CRM BASE ACCIÓN", daAcceso: true, actualizaAgendas: true },
  { label: "Venta Nueva (En Call)", pppTexto: "ACCESO DIRECTO", daAcceso: true, actualizaAgendas: true },
  { label: "Fee Venta Interna", pppTexto: "GUARDAMOS LUGAR", daAcceso: false, actualizaAgendas: true },
  { label: "Venta Nueva Interna", pppTexto: "ACCESO", daAcceso: true, actualizaAgendas: true },
]

// Conceptos disponibles SOLO desde el segundo pago en adelante (fila 2+).
// "Cuota 1".."Cuota 10" son entradas individuales (no una sola generica).
export const CONCEPTOS_FILA2: ConceptoDef[] = [
  { label: "Refuerzo de Fee", pppTexto: "REFUERZA FEE", daAcceso: false },
  { label: "Venta Nueva (Post Fee)", pppTexto: "ACCESO", daAcceso: true },
  { label: "Completó PIF (Post Fee)", pppTexto: "COMPLETA PIF Y ACCESO", daAcceso: true },
  { label: "Completó PIF + Acceso Total Consulting", pppTexto: "COMPLETA PIF Y ACCESO TOTAL A CONSULTING", daAcceso: true },
  { label: "Completa Total (Post Venta)", pppTexto: "COMPLETA TOTAL Y ACCESO", daAcceso: true },
  { label: "Completa Total + Acceso Acción", pppTexto: "COMPLETA TOTAL Y ACCESO A CRM BASE ACCIÓN", daAcceso: true },
  { label: "Completa Total y Finaliza Pago", pppTexto: "COMPLETA TOTAL Y FINALIZA PAGO", daAcceso: false },
  { label: "Venta Nueva Interna (Post Fee)", pppTexto: "ACCESO", daAcceso: true },
  { label: "Cuota 1", pppTexto: "CUOTA 1", daAcceso: false },
  { label: "Cuota 2", pppTexto: "CUOTA 2", daAcceso: false },
  { label: "Cuota 3", pppTexto: "CUOTA 3", daAcceso: false },
  { label: "Cuota 4", pppTexto: "CUOTA 4", daAcceso: false },
  { label: "Cuota 5", pppTexto: "CUOTA 5", daAcceso: false },
  { label: "Cuota 6", pppTexto: "CUOTA 6", daAcceso: false },
  { label: "Cuota 7", pppTexto: "CUOTA 7", daAcceso: false },
  { label: "Cuota 8", pppTexto: "CUOTA 8", daAcceso: false },
  { label: "Cuota 9", pppTexto: "CUOTA 9", daAcceso: false },
  { label: "Cuota 10", pppTexto: "CUOTA 10", daAcceso: false },
  { label: "Cuota Venta Interna", pppTexto: "", daAcceso: false, requiereNumeroCuota: true },
]

export const TODOS_CONCEPTOS = [...CONCEPTOS_FILA1, ...CONCEPTOS_FILA2]

export function buscarConcepto(label: string): ConceptoDef | undefined {
  return TODOS_CONCEPTOS.find(c => c.label === label)
}

// Representa una fila del plan tal como la arma el frontend (todavia no persistida).
export type FilaPlan = {
  concepto: string          // debe matchear ConceptoDef.label
  numeroCuota?: number | null   // usado para "Cuota Venta Interna"
  masAcceso?: boolean           // toggle "+Acceso" de "Cuota Venta Interna"
  monto: number
  fechaPlaneada: string      // ISO yyyy-mm-dd
  estado: "pendiente" | "pagado"
}

// Cualquier "Cuota N" o "Cuota Venta Interna" — a diferencia de Fee/Venta Nueva/etc,
// una cuota puede o no dar acceso, y eso lo decide el closer fila por fila (no es
// fijo por concepto), por eso se pregunta siempre "¿Acceso?" para estas.
export function esCuota(concepto: string): boolean {
  return concepto.startsWith("Cuota")
}

// Texto PPP de una fila especifica (resuelve el caso dinamico de Cuota Venta Interna
// y agrega "Y ACCESO" a cualquier cuota que el closer haya marcado con acceso).
export function textoPPPDeFila(
  fila: Pick<FilaPlan, "concepto" | "numeroCuota" | "masAcceso">,
  accesoPrograma?: string,
): string {
  const c = buscarConcepto(fila.concepto)
  if (!c) return ""
  if (fila.concepto === "Completó PIF (Post Fee)" && accesoPrograma) {
    return `COMPLETA PIF Y ACCESO A ${accesoPrograma.toUpperCase()}`
  }
  if (fila.concepto === "Completa Total (Post Venta)" && accesoPrograma) {
    return `COMPLETA TOTAL Y ACCESO A ${accesoPrograma.toUpperCase()}`
  }
  if (fila.concepto === "Cuota Venta Interna") {
    const n = fila.numeroCuota != null ? fila.numeroCuota : ""
    return fila.masAcceso ? `CUOTA ${n} Y ACCESO`.trim() : `CUOTA ${n}`.trim()
  }
  if (esCuota(fila.concepto) && fila.masAcceso) return `${c.pppTexto} Y ACCESO`
  return c.pppTexto
}

// da_acceso de una fila especifica: para cualquier cuota lo decide el toggle
// "¿Acceso?" que carga el closer; para el resto de los conceptos es fijo.
export function daAccesoDeFila(fila: Pick<FilaPlan, "concepto" | "masAcceso">): boolean {
  const c = buscarConcepto(fila.concepto)
  if (!c) return false
  if (esCuota(fila.concepto)) return !!fila.masAcceso
  return c.daAcceso
}

function fmtFechaDDMMYYYY(iso: string): string {
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}

// Genera el mensaje completo del plan (header + linea del programa + cliente + cronograma).
// `esNuevaVenta` = true si la fila que se esta cargando/mostrando ahora es una de
// CONCEPTOS_FILA1 (primera vez del cliente) -> header "NUEVA VENTA CARGADA";
// false para cualquier carga posterior -> header "CUOTA".
// `nombrePrograma`/`duracionLabel`/`total` vienen resueltos desde afuera (ver
// `resolverInfoPrograma` en lib/programas.ts) — este generador no adivina
// duracion ni total, solo formatea lo que le dan.
export function generarMensajePPP(params: {
  cliente: string
  nombrePrograma: string
  duracionLabel: string | null
  total: number
  filas: FilaPlan[]
  esNuevaVenta: boolean
  categoriaVenta?: "Front End" | "Back End" | null
}): string {
  const { cliente, nombrePrograma, duracionLabel, total, filas, esNuevaVenta, categoriaVenta } = params
  const duracionTxt = duracionLabel ? ` – ${duracionLabel}` : ""

  const categoriaTxt = categoriaVenta ? ` - ${categoriaVenta.toUpperCase()}` : ""
  const header = esNuevaVenta ? `💰 NUEVA VENTA CARGADA${categoriaTxt}` : "💰 CUOTA"

  const accesoPrograma = nombrePrograma.replace(/^CRM Base\s+/i, "").trim()
  const lineas = filas
    .slice()
    .sort((a, b) => (a.fechaPlaneada || "").localeCompare(b.fechaPlaneada || ""))
    .map(f => {
      const marcador = f.estado === "pagado" ? "✅" : "⏳"
      const fechaTxt = f.fechaPlaneada ? fmtFechaDDMMYYYY(f.fechaPlaneada) : "-"
      const texto = textoPPPDeFila(f, accesoPrograma)
      return `${marcador} ${fechaTxt}: $${(f.monto || 0).toLocaleString("es-AR")} USD\n[${texto}]`
    })
    .join("\n\n")

  return [
    header,
    "",
    `📦 ${nombrePrograma}${duracionTxt} – $${total.toLocaleString("es-AR")} USD`,
    "",
    `🪪 Nombres y Apellidos: ${cliente}`,
    "",
    lineas,
  ].join("\n")
}
