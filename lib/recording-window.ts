export type RecordingWindow = {
  start: string
  end: string
}

// Ventana de "Grabar YA" del espacio de contenido: el bloque de días en que
// el equipo graba. Se fija con NEXT_PUBLIC_CRM_VENTANA_GRABACION, por ejemplo
// "2026-09-11,2026-09-13". Sin valor, es la semana en curso (lunes a domingo).
function semanaActual(): RecordingWindow {
  const hoy = new Date()
  const dia = (hoy.getUTCDay() + 6) % 7 // lunes = 0
  const lunes = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() - dia))
  const domingo = new Date(lunes.getTime() + 6 * 86_400_000)
  return { start: lunes.toISOString().slice(0, 10), end: domingo.toISOString().slice(0, 10) }
}

export const RECORDING_WINDOW: RecordingWindow = (() => {
  const [start, end] = String(process.env.NEXT_PUBLIC_CRM_VENTANA_GRABACION || "").split(",").map((s) => s.trim())
  return start && end ? { start, end } : semanaActual()
})()
