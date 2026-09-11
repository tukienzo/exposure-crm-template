"use client"

// Icono "?" con globito de ayuda corto. Usa Popover (no Tooltip) a propósito:
// Tooltip de Radix depende de hover, que no existe en móvil/touch. Popover
// funciona igual con click/tap en desktop y mobile.

import { HelpCircle } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export function HelpHint({ text, className }: { text: string; className?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Ayuda"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-grid h-5 w-5 shrink-0 place-items-center rounded-full border border-current/20 bg-muted text-muted-foreground transition hover:bg-muted/70 hover:text-foreground",
            className,
          )}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        onClick={(e) => e.stopPropagation()}
        className="w-64 text-sm leading-snug"
        side="top"
      >
        {text}
      </PopoverContent>
    </Popover>
  )
}
