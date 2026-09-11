"use client"

import { useEffect } from "react"
import {
  playInterfaceHoverSound,
  playInterfacePressSound,
} from "@/lib/crm-sounds"

const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "[role='button']",
  "[role='tab']",
  "[role='option']",
  "[data-crm-sound]",
  "tr.cursor-pointer",
].join(",")

function interactiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return null
  const element = target.closest<HTMLElement>(INTERACTIVE_SELECTOR)
  if (!element) return null
  if (
    element.matches(":disabled, [aria-disabled='true']") ||
    element.dataset.crmSound === "off"
  ) return null
  return element
}

export function CrmSoundscape() {
  useEffect(() => {
    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") return
      const element = interactiveTarget(event.target)
      if (!element) return
      if (
        event.relatedTarget instanceof Node &&
        element.contains(event.relatedTarget)
      ) return
      playInterfaceHoverSound()
    }

    const onClick = (event: MouseEvent) => {
      if (!interactiveTarget(event.target)) return
      playInterfacePressSound()
    }

    document.addEventListener("pointerover", onPointerOver, { passive: true })
    document.addEventListener("click", onClick, { passive: true })
    return () => {
      document.removeEventListener("pointerover", onPointerOver)
      document.removeEventListener("click", onClick)
    }
  }, [])

  return null
}
