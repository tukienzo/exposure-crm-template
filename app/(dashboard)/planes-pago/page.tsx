import { redirect } from "next/navigation"

// "Planes de Pago" ahora vive como pestaña dentro de Carga de Pagos.
// Este archivo se mantiene solo para no romper links viejos a /planes-pago.
export default function PlanesPagoPage() {
  redirect("/carga-pagos")
}
