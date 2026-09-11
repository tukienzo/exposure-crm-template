export const CONTENT_FORMAT_WEIGHTS = {
  PROBLEMA: [
    ["REACCIÓN", 40], ["TALKING HEAD", 17], ["B-ROLL + VOZ EN OFF", 17], ["TOP TIER", 13], ["ANÁLISIS", 13],
  ],
  "SOLUCIÓN": [
    ["MIRO", 18], ["TOP TIER", 17], ["PIZARRÓN", 15], ["ANÁLISIS", 13], ["REACCIÓN", 13], ["TALKING HEAD", 12], ["B-ROLL + VOZ EN OFF", 12],
  ],
  MENTALIDAD: [["HORIZONTAL", 34], ["TALKING IMAGEN", 33], ["TALKING HEAD", 33]],
  PRODUCTO: [["TALKING HEAD", 50], ["MIRO", 50]],
} as const

export type ContentAwarenessLevel = keyof typeof CONTENT_FORMAT_WEIGHTS

// Smooth weighted round-robin: reparte cada lista a lo largo de un ciclo de
// 100 sugerencias, sin consultar ni modificar piezas ya existentes.
export function weightedFormatCycle(level: ContentAwarenessLevel) {
  const definitions = CONTENT_FORMAT_WEIGHTS[level]
  const current = definitions.map(() => 0)
  const result: string[] = []
  for (let turn = 0; turn < 100; turn++) {
    let selected = 0
    for (let index = 0; index < definitions.length; index++) {
      current[index] += definitions[index][1]
      if (current[index] > current[selected]) selected = index
    }
    result.push(definitions[selected][0])
    current[selected] -= 100
  }
  return result
}

export function formatSuggestionAt(level: string, cursor: number) {
  if (!(level in CONTENT_FORMAT_WEIGHTS)) return ""
  const cycle = weightedFormatCycle(level as ContentAwarenessLevel)
  return cycle[((cursor % cycle.length) + cycle.length) % cycle.length]
}
