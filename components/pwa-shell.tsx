"use client"

import { useEffect } from "react"

// Registra el service worker que sirve /offline.html cuando no hay red y
// permite instalar la PWA desde Safari en iPhone (Compartir → Agregar a
// pantalla de inicio). No cachea datos del CRM: solo el shell offline
// mínimo, para no arriesgar mostrar información desactualizada/sensible.
export function PwaShell() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Instalación best-effort: si falla (por ejemplo en un navegador sin
      // soporte), la app sigue funcionando normal como página web.
    })
  }, [])
  return null
}
