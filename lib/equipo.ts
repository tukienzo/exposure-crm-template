/* Equipo y cuentas de la operación.
   Todo sale de variables NEXT_PUBLIC_* (se inyectan al compilar), así ninguna
   pantalla ni ruta trae nombres propios. Las listas van separadas por coma.
   La fuente de verdad de quién puede entrar sigue siendo team_members; estas
   variables solo alimentan desplegables, ruteo y etiquetas. */

const lista = (v: string | undefined) => String(v || "").split(",").map((s) => s.trim()).filter(Boolean)
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()

/** Closers que se ofrecen en los desplegables (Centro de Agendas, Pagos). */
export const CLOSERS_ACTIVOS = lista(process.env.NEXT_PUBLIC_CRM_CLOSERS)
/** Setters que se ofrecen en los desplegables. */
export const SETTERS_ACTIVOS = lista(process.env.NEXT_PUBLIC_CRM_SETTERS)

/** Handle de Instagram de cada cuenta del negocio (ej. "@mi.cuenta"). El CRM
    trabaja con dos cuentas como máximo: A y B. Una sola cuenta: dejá B vacía. */
export const CUENTA_A_HANDLE = String(process.env.NEXT_PUBLIC_CRM_CUENTA_A_HANDLE || "").trim()
export const CUENTA_B_HANDLE = String(process.env.NEXT_PUBLIC_CRM_CUENTA_B_HANDLE || "").trim()
export const CUENTAS = [CUENTA_A_HANDLE, CUENTA_B_HANDLE].filter(Boolean)
export const CUENTA_A_LABEL = CUENTA_A_HANDLE ? `Cuenta A (${CUENTA_A_HANDLE})` : "Cuenta A"
export const CUENTA_B_LABEL = CUENTA_B_HANDLE ? `Cuenta B (${CUENTA_B_HANDLE})` : "Cuenta B"

/** Alias de closers: "juan=Juan Pérez;jp=Juan Pérez". Cualquier alias se guarda
    con el nombre canónico, así un mismo closer no aparece dos veces. */
export const CLOSER_ALIASES: Record<string, string> = Object.fromEntries(
  String(process.env.NEXT_PUBLIC_CRM_CLOSER_ALIASES || "")
    .split(";")
    .map((p) => p.split("="))
    .filter((p) => p.length === 2 && p[0].trim() && p[1].trim())
    .map(([alias, nombre]) => [norm(alias), nombre.trim()]),
)

export function canonicalCloserName(value: unknown) {
  const raw = String(value || "").trim()
  return CLOSER_ALIASES[norm(raw)] || raw
}

/** Ruteo por calificación: a qué closer van los leads S/A/B y a cuál los C/D.
    Vacío = sin ruteo automático. */
export const CLOSER_TIER_ALTO = String(process.env.NEXT_PUBLIC_CRM_CLOSER_SAB || "").trim()
export const CLOSER_TIER_BAJO = String(process.env.NEXT_PUBLIC_CRM_CLOSER_CD || "").trim()

export function closerForScore(score: string | null | undefined) {
  const tier = String(score || "").toUpperCase().replace("LEAD ", "").trim()
  if (["S", "A", "B"].includes(tier)) return CLOSER_TIER_ALTO || null
  if (["C", "D"].includes(tier)) return CLOSER_TIER_BAJO || null
  return null
}
