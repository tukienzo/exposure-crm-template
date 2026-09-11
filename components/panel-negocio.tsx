"use client"

/* ── Panel del negocio, adentro del CRM ────────────────────────────────────
   El panel (public/panel/index.html) es un dashboard autosuficiente con su
   propio router por hash. Acá se lo monta en un iframe a pantalla completa,
   en modo "embed" (sin su sidebar: el menú es el raíl del CRM), y se
   sincroniza en las dos direcciones:
     · el raíl cambia la ruta  → se le avisa al iframe qué página abrir
     · el panel navega solo (los atajos "Ver cobranzas →") → se actualiza la
       URL del CRM sin recargar el iframe.
   El iframe se carga UNA sola vez: cambiar de página no lo recarga. */

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { PaginaPanel } from "@/lib/panel-paginas"

export function PanelNegocio({ pagina }: { pagina: PaginaPanel }) {
  const router = useRouter()
  const marco = useRef<HTMLIFrameElement>(null)
  const actual = useRef<string>(pagina)
  const [src] = useState(() => `/panel/index.html?embed=1#/${pagina}`)
  const [listo, setListo] = useState(false)

  // el raíl cambió la ruta → el iframe abre esa página
  useEffect(() => {
    if (actual.current === pagina) return
    actual.current = pagina
    marco.current?.contentWindow?.postMessage({ tipo: "panel:ir", pagina }, window.location.origin)
  }, [pagina])

  // el panel navegó solo → la URL del CRM lo sigue
  useEffect(() => {
    const onMensaje = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      const d = (e.data || {}) as { tipo?: string; pagina?: string }
      if (d.tipo === "panel:listo") setListo(true)
      if (d.tipo === "panel:pagina" && d.pagina && d.pagina !== actual.current) {
        actual.current = d.pagina
        router.replace(`/panel/${d.pagina}`)
      }
    }
    window.addEventListener("message", onMensaje)
    return () => window.removeEventListener("message", onMensaje)
  }, [router])

  return (
    <div className="panel-negocio" style={{ position: "relative", height: "calc(100dvh - var(--crm-header-h, 0px))" }}>
      {!listo && (
        <div className="panel-negocio-cargando" aria-live="polite">
          <span className="panel-negocio-punto" /> Cargando el panel…
        </div>
      )}
      <iframe
        ref={marco}
        src={src}
        title="Panel del negocio"
        allow="microphone"
        onLoad={() => setListo(true)}
        style={{ width: "100%", height: "100%", border: 0, display: "block", background: "transparent", opacity: listo ? 1 : 0, transition: "opacity .35s ease" }}
      />
    </div>
  )
}
