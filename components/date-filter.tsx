"use client"

import { useState, useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

interface DateFilterProps {
  onFilterChange?: (filter: string) => void
  // Por defecto el filtro fuerza el mes en curso al montar (bueno para vistas
  // de actividad reciente). Para vistas que deben mostrar TODO el historico
  // por defecto (ej. "Todas las cuotas"), pasar defaultFilter="all" para que
  // no se filtre nada hasta que el usuario elija un periodo puntual.
  defaultFilter?: "month" | "all"
}

const MONTH_NAMES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"
]
const MONTH_SHORT = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]
const DAY_NAMES = ["dom","lun","mar","mié","jue","vie","sáb"]

// La consolidación histórica comienza en 2024. Los períodos sin evidencia
// deben mostrarse como "sin datos", no como cero.
const FIRST_YEAR = 2024
const FIRST_MONTH = 7 // Agosto: primera venta histórica disponible
const MIN_FUTURE_YEAR = 2026
const MIN_FUTURE_MONTH = 11 // Diciembre 2026

function calendarHorizon() {
  const now = new Date()
  const requested = new Date(MIN_FUTURE_YEAR, MIN_FUTURE_MONTH, 1)
  const current = new Date(now.getFullYear(), now.getMonth(), 1)
  return current > requested ? current : requested
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate()
}

// El CRM permite consultar meses futuros aunque todavía no tengan datos.
// Como mínimo, toda la operación 2026 debe ser navegable.
function monthsList(): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = []
  const horizon = calendarHorizon()
  let y = FIRST_YEAR, m = FIRST_MONTH
  while (y < horizon.getFullYear() || (y === horizon.getFullYear() && m <= horizon.getMonth())) {
    out.push({ year: y, month: m })
    m++; if (m > 11) { m = 0; y++ }
  }
  return out
}

function formatLabel(start: Date, end: Date): string {
  const quarter = Math.floor(start.getMonth() / 3) + 1
  const quarterStart = (quarter - 1) * 3
  const isFullQuarter =
    start.getMonth() === quarterStart &&
    start.getDate() === 1 &&
    end.getMonth() === quarterStart + 2 &&
    end.getDate() === new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate() &&
    start.getFullYear() === end.getFullYear()
  if (isFullQuarter) return `Q${quarter} ${start.getFullYear()}`

  // Si es un mes completo, mostrar el nombre del mes
  const isFullMonth =
    start.getDate() === 1 &&
    end.getDate() === new Date(end.getFullYear(), end.getMonth()+1, 0).getDate() &&
    start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
  if (isFullMonth) return `${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}`
  const s = MONTH_SHORT[start.getMonth()].toLowerCase()
  const e = MONTH_SHORT[end.getMonth()].toLowerCase()
  if (sameDay(start,end)) return `${start.getDate()} ${s} ${start.getFullYear()}`
  if (start.getMonth()===end.getMonth()&&start.getFullYear()===end.getFullYear())
    return `${start.getDate()} – ${end.getDate()} ${e} ${end.getFullYear()}`
  return `${start.getDate()} ${s} – ${end.getDate()} ${e} ${end.getFullYear()}`
}

function formatInput(d: Date): string {
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`
}

interface MonthCalProps {
  year: number; month: number
  rangeStart: Date | null; rangeEnd: Date | null
  hoverDate: Date | null; selectingSecond: boolean
  onDayClick: (d: Date) => void
  onDayHover: (d: Date | null) => void
}

function MonthCal({ year, month, rangeStart, rangeEnd, hoverDate, selectingSecond, onDayClick, onDayHover }: MonthCalProps) {
  const daysInMonth = new Date(year, month+1, 0).getDate()
  const firstDow = new Date(year, month, 1).getDay()
  const today = new Date(); today.setHours(0,0,0,0)

  const effectiveEnd = selectingSecond && hoverDate ? hoverDate : rangeEnd
  const [dispStart, dispEnd] = (rangeStart && effectiveEnd)
    ? rangeStart <= effectiveEnd ? [rangeStart, effectiveEnd] : [effectiveEnd, rangeStart]
    : [rangeStart, null]

  const cells: (number|null)[] = Array(firstDow).fill(null)
  for (let d=1; d<=daysInMonth; d++) cells.push(d)

  return (
    <div className="w-full min-w-0 rounded-[22px] border border-white/10 bg-white/[.035] p-3 shadow-inner shadow-black/10">
      <p className="mb-2 text-center text-sm font-black capitalize text-foreground">
        {MONTH_NAMES[month]} {year}
      </p>
      <div className="grid grid-cols-7 gap-0.5">
        {DAY_NAMES.map(d => (
          <div key={d} className="text-center text-xs text-muted-foreground py-1 font-medium">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`e${i}`} />
          const date = new Date(year, month, day)
          const isStart = !!dispStart && sameDay(date, dispStart)
          const isEnd = !!dispEnd && sameDay(date, dispEnd)
          const inRange = !!dispStart && !!dispEnd && date > dispStart && date < dispEnd
          const isToday = sameDay(date, today)
          return (
            <button
              key={day}
              onClick={() => onDayClick(date)}
              onMouseEnter={() => onDayHover(date)}
              onMouseLeave={() => onDayHover(null)}
              className={cn(
                "relative mx-auto grid aspect-square w-full max-w-8 place-items-center rounded-full text-center text-xs leading-none transition-all",
                isStart || isEnd ? "bg-primary text-primary-foreground font-semibold shadow-md shadow-primary/20" : "",
                inRange && !isStart && !isEnd ? "bg-primary/15 text-foreground" : "",
                !isStart && !isEnd && !inRange ? "cursor-pointer hover:-translate-y-0.5 hover:bg-muted" : ""
              )}
            >
              {day}
              {isToday && !isStart && !isEnd && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-emerald-500 rounded-full block" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function DateFilter({ onFilterChange = () => {}, defaultFilter = "month" }: DateFilterProps) {
  const today = new Date(); today.setHours(0,0,0,0)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const monthEnd = new Date(today.getFullYear(), today.getMonth()+1, 0)
  const prevMonthDate = new Date(today.getFullYear(), today.getMonth()-1, 1)

  const [open, setOpen] = useState(false)
  const [activeMonth, setActiveMonth] = useState<string | null>(`${today.getFullYear()}-${today.getMonth()}`)
  const [appliedStart, setAppliedStart] = useState<Date>(monthStart)
  const [appliedEnd, setAppliedEnd] = useState<Date>(monthEnd)
  const [tempStart, setTempStart] = useState<Date>(monthStart)
  const [tempEnd, setTempEnd] = useState<Date|null>(monthEnd)
  const [selectingSecond, setSelectingSecond] = useState(false)
  const [hoverDate, setHoverDate] = useState<Date|null>(null)
  const [viewStart, setViewStart] = useState({ year: prevMonthDate.getFullYear(), month: prevMonthDate.getMonth() })

  const didInit = useRef(false)

  // Default: mes actual, salvo que la vista pida arrancar mostrando todo el
  // historico (ej. "Todas las cuotas"): en ese caso no se emite ningun rango
  // al montar y el filtro visual queda en el mes actual solo como referencia,
  // sin ocultar datos de otros periodos hasta que el usuario elija uno.
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    if (defaultFilter === "all") return
    onFilterChange(`range:${toIso(monthStart)}:${toIso(monthEnd)}`)
  }, [])

  const applyMonth = (year: number, month: number) => {
    const s = new Date(year, month, 1)
    const e = new Date(year, month+1, 0)
    setActiveMonth(`${year}-${month}`)
    setAppliedStart(s); setAppliedEnd(e)
    setTempStart(s); setTempEnd(e); setSelectingSecond(false)
    onFilterChange(`range:${toIso(s)}:${toIso(e)}`)
    setOpen(false)
  }

  const applyQuarter = (year: number, quarter: number) => {
    const firstMonth = (quarter - 1) * 3
    const s = new Date(year, firstMonth, 1)
    const e = new Date(year, firstMonth + 3, 0)
    setActiveMonth(null)
    setAppliedStart(s); setAppliedEnd(e)
    setTempStart(s); setTempEnd(e); setSelectingSecond(false)
    onFilterChange(`range:${toIso(s)}:${toIso(e)}`)
    setOpen(false)
  }

  const handleDayClick = (day: Date) => {
    if (!selectingSecond) {
      setTempStart(day); setTempEnd(null); setSelectingSecond(true)
    } else {
      if (sameDay(day, tempStart)) {
        setTempEnd(day)
      } else if (day >= tempStart) {
        setTempEnd(day)
      } else {
        setTempEnd(tempStart); setTempStart(day)
      }
      setSelectingSecond(false)
    }
  }

  const handleApply = () => {
    const end = tempEnd || tempStart
    const s = tempStart <= end ? tempStart : end
    const e = tempStart <= end ? end : tempStart
    setActiveMonth(null)
    setAppliedStart(s); setAppliedEnd(e)
    onFilterChange(`range:${toIso(s)}:${toIso(e)}`)
    setOpen(false)
  }

  const handleClose = () => {
    setTempStart(appliedStart); setTempEnd(appliedEnd); setSelectingSecond(false)
    setOpen(false)
  }

  const months = [0,1,2].map(i => new Date(viewStart.year, viewStart.month+i, 1))
  const horizon = calendarHorizon()
  const canGoNext = new Date(appliedStart.getFullYear(), appliedStart.getMonth() + 1, 1) <= horizon

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="inline-flex h-12 max-w-full items-stretch overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-b from-zinc-300/25 to-zinc-950/15 shadow-lg shadow-black/10 backdrop-blur-xl">
        <button aria-label="Mes anterior" onClick={() => applyMonth(appliedStart.getFullYear(), appliedStart.getMonth() - 1)} className="grid w-11 place-items-center border-r border-white/10 text-muted-foreground transition hover:bg-white/10 hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <PopoverTrigger asChild>
          <button className="flex min-w-[190px] items-center justify-center gap-2 px-4 text-sm font-black whitespace-nowrap transition hover:bg-white/10">
            <CalendarDays className="h-5 w-5 flex-shrink-0 text-zinc-400" />
            <span>{formatLabel(appliedStart, appliedEnd)}</span>
          </button>
        </PopoverTrigger>
        <button aria-label="Mes siguiente" disabled={!canGoNext} onClick={() => applyMonth(appliedStart.getFullYear(), appliedStart.getMonth() + 1)} className="grid w-11 place-items-center border-l border-white/10 text-muted-foreground transition hover:bg-white/10 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <PopoverContent align="end" sideOffset={10} collisionPadding={12} className="w-[min(94vw,780px)] max-h-[80dvh] overflow-auto rounded-[24px] border-white/15 bg-background/95 p-4 shadow-2xl backdrop-blur-2xl">
          <div className="mb-4 grid gap-3 border-b border-border pb-4">
            {Array.from({ length: calendarHorizon().getFullYear() - FIRST_YEAR + 1 }, (_, index) => FIRST_YEAR + index)
              .reverse()
              .map(year => (
                <div key={year} className="rounded-[20px] border border-white/10 bg-white/[.025] p-2.5">
                  <span className="mb-2 block text-center text-sm font-black tracking-[.12em] text-foreground">{year}</span>
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                  {[1, 2, 3, 4]
                    .filter(quarter => {
                      const quarterEndMonth = quarter * 3 - 1
                      const quarterStartMonth = (quarter - 1) * 3
                      const afterHistoryStart = year > FIRST_YEAR || quarterEndMonth >= FIRST_MONTH
                      const horizon = calendarHorizon()
                      const beforeHorizon =
                        year < horizon.getFullYear() ||
                        (year === horizon.getFullYear() && quarterStartMonth <= horizon.getMonth())
                      return afterHistoryStart && beforeHorizon
                    })
                    .map(quarter => (
                    <button
                      key={quarter}
                      onClick={() => applyQuarter(year, quarter)}
                      className="min-w-14 rounded-full border border-border px-3 py-1.5 text-xs font-black transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/10"
                    >
                      Q{quarter}
                    </button>
                  ))}
                  </div>
                </div>
              ))}
          </div>

          {/* Top bar: botones de mes */}
          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border flex-wrap gap-y-2">
            <div className="flex gap-1 flex-wrap">
              {monthsList().map(({ year, month }) => {
                const key = `${year}-${month}`
                const active = activeMonth === key
                return (
                  <button
                    key={key}
                    onClick={() => applyMonth(year, month)}
                    className={cn(
                      "px-2.5 py-1 text-xs rounded border transition-colors whitespace-nowrap font-medium",
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    {MONTH_SHORT[month]} {String(year).slice(2)}
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-2 mx-auto">
              <span className="px-2.5 py-1 rounded border border-border text-xs font-mono bg-muted/40 min-w-[90px] text-center">
                {tempStart ? formatInput(tempStart) : "—"}
              </span>
              <span className="text-muted-foreground text-xs">—</span>
              <span className="px-2.5 py-1 rounded border border-border text-xs font-mono bg-muted/40 min-w-[90px] text-center">
                {tempEnd ? formatInput(tempEnd) : "—"}
              </span>
            </div>
            <div className="flex gap-2 ml-auto">
              <button onClick={handleClose} className="px-3 py-1.5 text-xs rounded border border-border hover:bg-muted transition-colors">
                Cerrar
              </button>
              <button onClick={handleApply} className="px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-semibold">
                Aplicar rango
              </button>
            </div>
          </div>

          {/* Calendario para rango a medida */}
          <div className="grid grid-cols-[36px_minmax(0,1fr)_36px] items-start gap-2">
            <button
              onClick={() => setViewStart(v => { const d=new Date(v.year,v.month-1,1); return {year:d.getFullYear(),month:d.getMonth()} })}
              className="mt-6 p-1.5 hover:bg-muted rounded transition-colors flex-shrink-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {months.map((m,i) => (
                <div key={i} className={cn(i === 1 && "hidden md:block", i === 2 && "hidden lg:block")}>
                  <MonthCal
                    year={m.getFullYear()}
                    month={m.getMonth()}
                    rangeStart={tempStart}
                    rangeEnd={tempEnd}
                    hoverDate={hoverDate}
                    selectingSecond={selectingSecond}
                    onDayClick={handleDayClick}
                    onDayHover={setHoverDate}
                  />
                </div>
              ))}
            </div>

            <button
              onClick={() => setViewStart(v => { const d=new Date(v.year,v.month+1,1); return {year:d.getFullYear(),month:d.getMonth()} })}
              className="mt-6 p-1.5 hover:bg-muted rounded transition-colors flex-shrink-0"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
      </PopoverContent>
    </Popover>
  )
}
