"use client"

// Tour guiado tipo onboarding (driver.js). Se activa con el botón "Tutorial"
// del header. Recorre los módulos principales del nav con spotlight/overlay
// oscurecido + wizard numerado (Paso X de Y) + next/prev/skip. Pensado para
// poder repetirse cuantas veces se quiera, no solo la primera vez.
//
// Por qué driver.js: es la librería de product-tour más liviana y madura
// (sin dependencias, ~5kb gzip, vanilla JS con overlay+spotlight nativo),
// evita reinventar overlay/posicionamiento a mano.

import { useCallback, useEffect, useRef, useState } from "react"
import { driver, type Driver, type DriveStep } from "driver.js"
import { GraduationCap } from "lucide-react"
import type { ReactNode } from "react"
import type { NavItem } from "@/components/crm-navigation"
import { NAV_TOUR_COPY, navTourId } from "@/lib/tour-steps"

const TOUR_SEEN_KEY = "crm-tour-seen-v1"

export function CRMTourButton({
  rol,
  visibleModules,
  className,
  children,
}: {
  rol: string
  visibleModules: NavItem[]
  className?: string
  children?: ReactNode
}) {
  const driverRef = useRef<Driver | null>(null)
  const [pulsing, setPulsing] = useState(false)

  useEffect(() => {
    // Sólo para dar una pista visual sutil en el primer uso (nunca bloquea
    // ni abre el tour solo; Cuenta A pidió "disponible para repetir, no
    // intrusivo" — así que nunca se auto-abre, sólo se resalta el botón).
    try {
      if (!window.localStorage.getItem(TOUR_SEEN_KEY)) setPulsing(true)
    } catch {
      /* localStorage puede fallar en modo privado; no es crítico */
    }
  }, [])

  const startTour = useCallback(() => {
    try {
      window.localStorage.setItem(TOUR_SEEN_KEY, "1")
    } catch {
      /* noop */
    }
    setPulsing(false)

    const steps: DriveStep[] = [
      {
        popover: {
          title: "Bienvenido al recorrido guiado 👋",
          description:
            "Un repaso rápido de las secciones principales del CRM: qué es cada módulo y qué cargar en cada parte. Podés saltarlo o repetirlo cuando quieras desde este mismo botón.",
        },
      },
      ...visibleModules
        .filter((item) => NAV_TOUR_COPY[item.href])
        .map((item): DriveStep => ({
          element: `[data-tour="${navTourId(item.href)}"]`,
          popover: {
            title: NAV_TOUR_COPY[item.href].title,
            description: NAV_TOUR_COPY[item.href].description,
            side: "bottom",
            align: "center",
          },
        })),
      {
        popover: {
          title: "Eso es todo 🎉",
          description:
            "Podés volver a ver este recorrido en cualquier momento apretando el botón \"Tutorial\" en el header. Cualquier duda puntual, buscá los íconos \"?\" dentro de cada sección.",
        },
      },
    ]

    driverRef.current?.destroy()
    driverRef.current = driver({
      showProgress: true,
      progressText: "Paso {{current}} de {{total}}",
      nextBtnText: "Siguiente →",
      prevBtnText: "← Atrás",
      doneBtnText: "Listo",
      allowClose: true,
      overlayOpacity: 0.65,
      stagePadding: 6,
      stageRadius: 12,
      animate: true,
      smoothScroll: true,
      popoverClass: "crm-tour-popover",
      steps,
    })
    driverRef.current.drive()
  }, [visibleModules])

  useEffect(() => () => driverRef.current?.destroy(), [])

  return (
    <button
      type="button"
      onClick={startTour}
      aria-label="Ver tutorial guiado del CRM"
      className={className ?? (
        "relative flex items-center gap-1.5 rounded-2xl border border-white/[.08] bg-white/[.05] px-2.5 py-2 text-[11px] font-bold text-white/75 transition hover:bg-white/[.09] hover:text-white sm:gap-2 sm:px-3"
      )}
    >
      {children ?? <><GraduationCap className="h-4 w-4 shrink-0" /><span className="hidden sm:inline">Tutorial</span></>}
      {pulsing && (
        <span className="absolute -right-1 -top-1 flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
        </span>
      )}
    </button>
  )
}
