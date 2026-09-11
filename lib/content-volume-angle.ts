import { SALES_ANGLES } from "@/lib/sales-angles"

export const VOLUME_ANGLE_MIX = {
  PROBLEMA: 75,
  MENTALIDAD: 0,
  "SOLUCIÓN": 25,
  PRODUCTO: 0,
} as const

type AngleGroup = keyof typeof VOLUME_ANGLE_MIX

const GROUP_ANGLES: Record<AngleGroup, readonly string[]> = {
  PROBLEMA: SALES_ANGLES.filter((angle) => angle.startsWith("P")),
  MENTALIDAD: SALES_ANGLES.filter((angle) => angle.startsWith("M")),
  "SOLUCIÓN": SALES_ANGLES.filter((angle) => angle.startsWith("S")),
  PRODUCTO: SALES_ANGLES.filter((angle) => angle.startsWith("PR")),
}

export function angleGroup(angle: string | null | undefined): AngleGroup | null {
  if (!angle) return null
  if (angle.startsWith("PR")) return "PRODUCTO"
  if (angle.startsWith("P")) return "PROBLEMA"
  if (angle.startsWith("M")) return "MENTALIDAD"
  if (angle.startsWith("S")) return "SOLUCIÓN"
  return null
}

export function nextVolumeAngle(existingAngles: Array<string | null | undefined>) {
  const totalAfterInsert = existingAngles.length + 1
  const groupCounts = Object.fromEntries(
    Object.keys(VOLUME_ANGLE_MIX).map((group) => [group, 0]),
  ) as Record<AngleGroup, number>

  for (const angle of existingAngles) {
    const group = angleGroup(angle)
    if (group) groupCounts[group]++
  }

  const group = (Object.keys(VOLUME_ANGLE_MIX) as AngleGroup[]).sort((a, b) => {
    const deficitA = totalAfterInsert * VOLUME_ANGLE_MIX[a] / 100 - groupCounts[a]
    const deficitB = totalAfterInsert * VOLUME_ANGLE_MIX[b] / 100 - groupCounts[b]
    return deficitB - deficitA || a.localeCompare(b)
  })[0]

  const candidates = GROUP_ANGLES[group]
  const candidateCounts = new Map(candidates.map((angle) => [angle, 0]))
  for (const angle of existingAngles) {
    if (candidateCounts.has(String(angle))) {
      candidateCounts.set(String(angle), (candidateCounts.get(String(angle)) || 0) + 1)
    }
  }
  const angle = [...candidates].sort((a, b) =>
    (candidateCounts.get(a) || 0) - (candidateCounts.get(b) || 0) || a.localeCompare(b, "es"),
  )[0]

  return { angle, awarenessLevel: group, mix: VOLUME_ANGLE_MIX }
}
