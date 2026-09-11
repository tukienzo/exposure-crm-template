"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

export type ModuleTab = { id: string; label: string; hint: string; icon: React.ReactNode; content: React.ReactNode }

// Bug reportado por Cuenta A: si dejaba seleccionada una vista (ej. "Agendas" en
// vez de "Pipeline visual") y navegaba a otra pestana del nav y volvia, la
// seleccion se perdia y volvia siempre a la primera tab. Se persiste la
// ultima vista elegida por modulo (keyed por title) en localStorage, asi
// sobrevive a remounts del componente al cambiar de pantalla.
function storageKey(title: string) {
  return `yy-module-tab-${title.toLowerCase().replace(/\s+/g, "-")}`
}

export function ModuleTabs({ title, subtitle, tabs, initial }: { title: string; subtitle: string; tabs: ModuleTab[]; initial?: string }) {
  const [active, setActive] = useState(() => {
    if (typeof window === "undefined") return initial || tabs[0]?.id
    const saved = window.localStorage.getItem(storageKey(title))
    if (saved && tabs.some(t => t.id === saved)) return saved
    return initial || tabs[0]?.id
  })
  // Si cambia el set de tabs (otro modulo reusando el componente en la misma
  // navegacion SPA) y la seleccion guardada no aplica a este modulo, cae a la
  // inicial en vez de quedar en un id invalido.
  useEffect(() => {
    if (!tabs.some(t => t.id === active)) setActive(initial || tabs[0]?.id)
  }, [title])
  const selectTab = (id: string) => {
    setActive(id)
    if (typeof window !== "undefined") window.localStorage.setItem(storageKey(title), id)
  }
  const selected = tabs.find(tab => tab.id === active) || tabs[0]
  return <div className="min-h-[calc(100vh-88px)]">
    <div className="border-b border-white/10 bg-background/80 px-4 py-3 shadow-lg shadow-black/[.08] backdrop-blur-2xl sm:px-6 lg:px-[1.5cm] xl:py-4">
      <div className="mx-auto flex max-w-[1700px] flex-col items-center gap-3 xl:flex-row xl:justify-between">
        <div className="flex items-center gap-3 self-start"><span className="grid h-11 w-11 place-items-center rounded-2xl border border-white/80 bg-gradient-to-br from-zinc-50 via-white to-zinc-200 shadow-lg shadow-black/[.08] dark:border-white/10 dark:from-zinc-500 dark:via-zinc-700 dark:to-zinc-950"><span className="h-2.5 w-2.5 rounded-full bg-gradient-to-br from-red-500 to-orange-400 shadow-md shadow-red-500/40" /></span><div><h1 className="text-lg font-black tracking-tight sm:text-xl">{title}</h1>{subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}</div></div>
        <div role="tablist" aria-label={title} className="grid w-full max-w-xl grid-cols-2 gap-2 rounded-[24px] border border-white/10 bg-gradient-to-b from-zinc-500/15 to-zinc-950/10 p-2 shadow-inner shadow-black/10 xl:w-auto xl:min-w-[440px]">
          {tabs.map(tab => <button role="tab" aria-selected={tab.id === selected.id} key={tab.id} onClick={() => selectTab(tab.id)} className={cn("group relative flex min-w-0 items-center justify-center gap-2 overflow-hidden rounded-[18px] px-3 py-2.5 text-left transition-all duration-300 sm:gap-3 sm:px-5 sm:py-3", tab.id === selected.id ? "bg-white text-zinc-950 shadow-xl shadow-black/15 dark:bg-white/[.13] dark:text-white" : "text-muted-foreground hover:bg-white/[.07] hover:text-foreground")}>
            {tab.id === selected.id && <span className="absolute inset-x-5 bottom-0 h-px bg-gradient-to-r from-transparent via-red-500 to-transparent" />}
            <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl border transition duration-300 group-hover:-translate-y-0.5 group-hover:scale-105 sm:h-11 sm:w-11", tab.id === selected.id ? "border-red-400/20 bg-gradient-to-br from-red-500 to-orange-400 text-white shadow-lg shadow-red-500/20" : "border-white/10 bg-gradient-to-br from-zinc-500/30 to-zinc-950/30")}>{tab.icon}</span>
            <span className="min-w-0"><span className="block truncate text-xs font-black sm:text-sm">{tab.label}</span><span className="hidden truncate text-[11px] opacity-55 md:block">{tab.hint}</span></span>
          </button>)}
        </div>
      </div>
    </div>
    <div key={selected.id} className="page-enter mx-auto w-full max-w-[1800px] px-4 py-5 sm:px-6 lg:px-[1.5cm]">
      {selected.content}
    </div>
  </div>
}
