import type { MetadataRoute } from "next"
import { BRAND } from "@/lib/brand"

// Next.js App Router metadata file convention: esto genera automáticamente
// /manifest.webmanifest servido en el edge, sin pasar por el middleware de
// autenticación (queda excluido explícitamente en middleware.ts config).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.name,
    description: "Centro de operación comercial: agendas, pagos, cobranza, leaderboard y finanzas.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#09090b",
    orientation: "portrait",
    icons: [
      { src: "/icon.svg?v=2", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
