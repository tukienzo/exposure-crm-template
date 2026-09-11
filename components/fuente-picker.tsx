"use client"

import { useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ChevronDown, ChevronRight, Check, X, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { FUENTE_GROUPS, FUENTE_STANDALONE, fuenteLabel } from "@/lib/fuentes"

function GroupList({
  expanded,
  setExpanded,
  isSelected,
  onPick,
  size = "sm",
}: {
  expanded: string | null
  setExpanded: (v: string | null) => void
  isSelected: (v: string) => boolean
  onPick: (v: string) => void
  size?: "sm" | "xs"
}) {
  const text = size === "xs" ? "text-xs" : "text-sm"
  return (
    <>
      {FUENTE_GROUPS.map((g) => (
        <div key={g.label}>
          <button
            type="button"
            onClick={() => setExpanded(expanded === g.label ? null : g.label)}
            className={cn(
              "flex items-center justify-between w-full text-left font-medium px-2 py-1.5 rounded hover:bg-muted",
              text,
            )}
          >
            {g.label}
            {expanded === g.label ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          {expanded === g.label && (
            <div className="ml-2 border-l border-border pl-2 mb-1">
              {g.items.map((it) => (
                <button
                  key={it.value}
                  type="button"
                  onClick={() => onPick(it.value)}
                  className={cn(
                    "flex items-center gap-2 w-full text-left px-2 py-1.5 rounded hover:bg-muted",
                    text,
                    isSelected(it.value) && "text-primary font-medium",
                  )}
                >
                  {isSelected(it.value) && <Check className="h-3.5 w-3.5 flex-shrink-0" />}
                  {it.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      <div className="border-t border-border mt-1 pt-1">
        {FUENTE_STANDALONE.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onPick(v)}
            className={cn(
              "flex items-center gap-2 w-full text-left px-2 py-1.5 rounded hover:bg-muted",
              text,
              isSelected(v) && "text-primary font-medium",
            )}
          >
            {isSelected(v) && <Check className="h-3.5 w-3.5 flex-shrink-0" />}
            {v}
          </button>
        ))}
      </div>
    </>
  )
}

// Selector de UNA fuente: reemplaza los usos de <Sel>/<InlineSel> puntualmente
// para el campo "fuente". Si onChange devuelve una Promise (ej. un PATCH),
// muestra un spinner mientras guarda.
export function FuenteSelect({
  value,
  onChange,
  placeholder = "Seleccionar...",
  className,
  disabled,
  clearOption,
}: {
  value?: string | null
  onChange: (v: string) => void | Promise<void>
  placeholder?: string
  className?: string
  disabled?: boolean
  // Item extra al tope de la lista para representar "sin fuente" (ej. el
  // sentinel NONE que usa Carga de Pagos), reseleccionable en cualquier momento.
  clearOption?: { value: string; label: string }
}) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const pick = async (v: string) => {
    setOpen(false)
    setExpanded(null)
    const result = onChange(v)
    if (result && typeof (result as Promise<void>).then === "function") {
      setSaving(true)
      try {
        await result
      } finally {
        setSaving(false)
      }
    }
  }

  const isCleared = clearOption && value === clearOption.value
  const displayValue = value && !isCleared ? fuenteLabel(value) : ""

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setExpanded(null)
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled || saving}
          className={
            className ||
            "h-9 w-full text-sm px-3 rounded-md border border-input bg-background flex items-center justify-between gap-2 disabled:opacity-60"
          }
        >
          <span className={cn("truncate", !displayValue && "text-muted-foreground")}>
            {displayValue || (isCleared ? clearOption!.label : placeholder)}
          </span>
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1 max-h-80 overflow-y-auto">
        {clearOption && (
          <button
            type="button"
            onClick={() => pick(clearOption.value)}
            className={cn(
              "flex items-center gap-2 w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted mb-1 border-b border-border",
              isCleared && "text-primary font-medium",
            )}
          >
            {isCleared && <Check className="h-3.5 w-3.5 flex-shrink-0" />}
            {clearOption.label}
          </button>
        )}
        <GroupList expanded={expanded} setExpanded={setExpanded} isSelected={(v) => v === value} onPick={pick} />
      </PopoverContent>
    </Popover>
  )
}

// Celda de tabla editable inline (mismo look que el InlineSel generico de
// Centro de Agendas / Todos los Pagos): pill con el valor, click abre el
// desplegable agrupado, al elegir guarda con onSave y muestra un spinner.
export function FuenteInlineCell({
  value,
  onSave,
}: {
  value?: string | null
  onSave: (v: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const pick = async (v: string) => {
    setOpen(false)
    setExpanded(null)
    setSaving(true)
    try {
      await onSave(v)
    } finally {
      setSaving(false)
    }
  }

  if (saving) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setExpanded(null)
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-7 text-xs px-2 border rounded min-w-[110px] w-auto inline-flex items-center whitespace-nowrap hover:opacity-80 border-border text-foreground"
        >
          {value ? fuenteLabel(value) : "—"}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1 max-h-80 overflow-y-auto">
        <GroupList expanded={expanded} setExpanded={setExpanded} isSelected={(v) => v === value} onPick={pick} />
      </PopoverContent>
    </Popover>
  )
}

// Filtro de UNA sola fuente a la vez ("Todos" = sin filtro), para paginas
// donde el filtro de Fuente es single-select (ej. Todos los Pagos).
export function FuenteFilterSingle({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground font-medium">Fuente</p>
      <Popover onOpenChange={(o) => { if (!o) setExpanded(null) }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "h-8 w-full text-xs px-2 rounded-md border flex items-center justify-between gap-1 bg-background",
              value ? "border-primary/50 text-primary" : "border-input text-muted-foreground",
            )}
          >
            <span className="truncate">{value ? fuenteLabel(value) : "Todos"}</span>
            <ChevronDown className="h-3 w-3 opacity-50 flex-shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-1 max-h-96 overflow-y-auto">
          <button
            type="button"
            onClick={() => onChange("")}
            className={cn(
              "flex items-center gap-2 w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted mb-1 border-b border-border",
              !value && "text-primary font-medium",
            )}
          >
            {!value && <Check className="h-3.5 w-3.5 flex-shrink-0" />}
            Todos
          </button>
          <GroupList
            size="xs"
            expanded={expanded}
            setExpanded={setExpanded}
            isSelected={(v) => v === value}
            onPick={onChange}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

// Filtro MULTI-select de fuentes, para las columnas con checklist de filtro
// (reemplaza los usos de <FilterSel> puntualmente para "fuente").
export function FuenteFilter({
  value,
  onToggle,
  onClear,
}: {
  value: string[]
  onToggle: (v: string) => void
  onClear: () => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const count = value.length
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground font-medium">Fuente</p>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "h-8 w-full text-xs px-2 rounded-md border flex items-center justify-between gap-1 bg-background",
              count ? "border-primary/50 text-primary" : "border-input text-muted-foreground",
            )}
          >
            <span className="truncate">
              {count === 0 ? "Todos" : count === 1 ? fuenteLabel(value[0]) : `${count} seleccionados`}
            </span>
            <ChevronDown className="h-3 w-3 opacity-50 flex-shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-1 max-h-96 overflow-y-auto">
          {count > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="flex items-center gap-2 w-full text-left text-xs px-2 py-1.5 rounded text-muted-foreground hover:bg-muted"
            >
              <X className="h-3 w-3" /> Limpiar
            </button>
          )}
          <GroupList
            size="xs"
            expanded={expanded}
            setExpanded={setExpanded}
            isSelected={(v) => value.includes(v)}
            onPick={onToggle}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
