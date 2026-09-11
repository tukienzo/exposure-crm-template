// Lista unica de Fuente, agrupada por canal, compartida por Centro de
// Agendas, Carga de Pagos y Todos los Pagos. Antes cada pantalla tenia su
// propia lista plana (30+ opciones sin orden) — ahora esta agrupada para que
// el selector no sea un quilombo visual, pero el VALOR guardado en la base
// sigue siendo un string completo y sin ambiguedad (el "label" de cada
// opcion es solo lo que se muestra adentro del grupo, mas corto).

export type FuenteItem = { value: string; label: string }
export type FuenteGroup = { label: string; items: FuenteItem[] }

export const FUENTE_GROUPS: FuenteGroup[] = [
  {
    label: "Instagram",
    items: [
      { value: "Instagram Link in Bio", label: "Link in Bio" },
      { value: "Instagram Reel", label: "Reel" },
      { value: "Instagram Reel Cuenta B", label: "Reel Cuenta B" },
      { value: "Instagram Reel Cuenta A", label: "Reel Cuenta A" },
      { value: "Instagram Story", label: "Story" },
      { value: "Instagram Story Cuenta B", label: "Story Cuenta B" },
      { value: "Instagram Story Cuenta A", label: "Story Cuenta A" },
      { value: "Instagram Carrusel", label: "Carrusel" },
      { value: 'Instagram DM "INFO"', label: 'DM "INFO"' },
      { value: 'Instagram DM "INFO" Cuenta B', label: 'DM "INFO" Cuenta B' },
      { value: 'Instagram DM "INFO" Cuenta A', label: 'DM "INFO" Cuenta A' },
      { value: "Instagram Cuenta B", label: "Cuenta B (general)" },
      { value: "Instagram Cuenta A", label: "Cuenta A (general)" },
    ],
  },
  {
    label: "Outbound",
    items: [
      { value: "Outbound Likes", label: "Likes" },
      { value: "Outbound Story", label: "Story" },
      { value: "Outbound Story Cuenta B", label: "Story Cuenta B" },
      { value: "Outbound Seguidor", label: "Seguidor" },
      { value: "Bienvenida Manychat", label: "Bienvenida Manychat" },
      { value: "Bienvenida Manychat Cuenta B", label: "Bienvenida Manychat Cuenta B" },
    ],
  },
  {
    label: "Anuncios",
    items: [
      { value: "DM-ADS", label: "DM-ADS" },
      { value: "ADS RMKT", label: "ADS RMKT" },
      { value: "ADS FRIO", label: "ADS FRIO" },
    ],
  },
  {
    label: "YouTube",
    items: [
      { value: "YouTube Cuenta B", label: "Cuenta B" },
      { value: "YouTube Cuenta A", label: "Cuenta A" },
      { value: "YouTube General", label: "General" },
    ],
  },
  {
    label: "TikTok",
    items: [
      { value: "TikTok Cuenta B", label: "Cuenta B" },
      { value: "TikTok Cuenta A", label: "Cuenta A" },
      { value: "TikTok General", label: "General" },
    ],
  },
]

export const FUENTE_STANDALONE = ["Enrutamientos", "Landing", "Biblioteca Recursos", "Webinar", "Base de Datos"]

// Muestra el label corto si la fuente esta en la lista vigente; si es un
// valor historico ya sacado de las opciones (ej "WhatsApp"), muestra el
// valor tal cual — nunca lo deja en blanco.
export function fuenteLabel(value: string | null | undefined): string {
  if (!value) return ""
  for (const g of FUENTE_GROUPS) {
    const found = g.items.find((it) => it.value === value)
    if (found) return found.label
  }
  return value
}
