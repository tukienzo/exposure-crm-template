export type PrecallSequence = { angle: string; objective: string; message: string; asset: string; setterPrompt: string }

export const PRECALL_ANGLE_SEQUENCES: PrecallSequence[] = [
  { angle: "P1", objective: "Mostrar que el entorno no reemplaza un sistema", message: "Antes de la auditoría mirá este caso: pasó de depender de la suerte y del contexto a generar oportunidades de forma predecible.", asset: "Caso P1 · sistema predecible", setterPrompt: "¿En qué contexto dependés hoy para conocer mujeres?" },
  { angle: "P2", objective: "Bajar parálisis y aumentar compromiso", message: "Te dejo un caso de alguien que sabía qué hacer, pero se frenaba justo con la mujer que le importaba.", asset: "Caso P2 · parálisis", setterPrompt: "¿Qué pasa exactamente cuando aparece una mujer que sí te gusta?" },
  { angle: "P4", objective: "Diferenciar conversación de escalada", message: "Este caso es de alguien que generaba interés pero no lograba llevarlo a cita o vínculo. Es muy parecido a lo que vamos a auditar.", asset: "Caso P4 · interés sin escalada", setterPrompt: "¿En qué punto se enfrían normalmente tus interacciones?" },
  { angle: "P8", objective: "Capitalizar urgencia post-separación sin manipular", message: "Mirá este caso antes de la call: reconstruyó vida social y criterio después de una separación, sin entrar en rebote ni repetir patrones.", asset: "Caso P8 · post-separación", setterPrompt: "¿Qué querés reconstruir primero después de esa relación?" },
]

export function getPrecallSequence(angle: string | null | undefined) {
  const code = String(angle || "").match(/^P\d/)?.[0]
  return PRECALL_ANGLE_SEQUENCES.find((item) => item.angle === code) || null
}
