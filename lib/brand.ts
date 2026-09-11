/* Marca de la operación. Todo sale de variables NEXT_PUBLIC_* (se inyectan
   al compilar), así ninguna pantalla trae un nombre propio. Se completan en
   .env.local; sin valores, el CRM se llama "CRM". */
export const BRAND = {
  name: String(process.env.NEXT_PUBLIC_BRAND_NAME || "CRM").trim(),
  tagline: String(process.env.NEXT_PUBLIC_BRAND_TAGLINE || "Centro de mando").trim(),
  description: String(process.env.NEXT_PUBLIC_BRAND_DESCRIPTION || "CRM y centro de mando de la operación.").trim(),
}
