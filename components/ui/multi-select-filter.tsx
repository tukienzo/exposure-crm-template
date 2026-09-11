"use client"

import { Check, ChevronDown, X } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export function MultiSelectFilter({ label, values, options, onChange, className }: {
  label?: string
  values: string[]
  options: string[]
  onChange: (values: string[]) => void
  className?: string
}) {
  const toggle = (value: string) => onChange(values.includes(value) ? values.filter(v => v !== value) : [...values, value])
  return <div className={cn("space-y-1", className)}>
    {label && <p className="text-xs font-medium text-muted-foreground">{label}</p>}
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn("flex h-8 min-w-[140px] items-center justify-between gap-1 rounded-md border bg-background px-2 text-xs", values.length ? "border-primary/50 text-primary" : "border-input text-muted-foreground")}>
          <span className="truncate">{values.length === 0 ? "Todos" : values.length === 1 ? values[0] : `${values.length} seleccionados`}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-72 w-56 overflow-y-auto p-1">
        {values.length > 0 && <button type="button" onClick={() => onChange([])} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted"><X className="h-3 w-3" />Limpiar</button>}
        {options.map(option => {
          const selected = values.includes(option)
          return <button key={option} type="button" onClick={() => toggle(option)} className={cn("flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted", selected && "font-medium text-primary")}>
            <span className={cn("flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border", selected ? "border-primary bg-primary" : "border-input")}>{selected && <Check className="h-2.5 w-2.5 text-primary-foreground" />}</span>
            <span className="break-words">{option}</span>
          </button>
        })}
      </PopoverContent>
    </Popover>
  </div>
}
