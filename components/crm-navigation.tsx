"use client"
import { isContentOnlyAccount } from "@/lib/role-access"
import { BRAND } from "@/lib/brand"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { useTheme } from "next-themes"
import { createSupabaseBrowser } from "@/lib/supabase-browser"
import { cn } from "@/lib/utils"
import { navTourId } from "@/lib/tour-steps"
import { CRMTourButton } from "@/components/crm-tour"
import { NavIcon, type Ramp } from "@/components/nav/nav-icon"
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import {
  BarChart3, Bell, BellRing, Calendar, ChartSpline, ChevronDown, CircleDollarSign, Clapperboard, FileText, Gauge, GraduationCap, LayoutGrid, ListChecks, Network, PhoneCall, Users, Wrench,
  Eye, LogOut, Menu, Monitor, Moon, Palette, Radar, RotateCcw, Search, Settings2, Sparkles, Sun, Trophy, Type, UserRound,
  UsersRound, Volume2, WalletCards, ShieldCheck, MessageSquareQuote,
  Wallet, Target, Kanban, CalendarRange, Compass, Coins, Mic, Layers,
} from "lucide-react"

export type GroupName = "General" | "Panel del negocio" | "Ventas" | "Producto" | "Marketing" | "Operaciones" | "Sistema IA"
export const GROUP_ORDER: GroupName[] = ["General", "Panel del negocio", "Ventas", "Producto", "Marketing", "Operaciones", "Sistema IA"]
export type NavItem = {
  label: string
  href: string
  icon: typeof Gauge
  match: string[]
  ramp: Ramp
  group: GroupName
  roles?: string[]
}

const ramps = {
  logo: { from: "#eadcae", via: "#c8a95d", to: "#7d5f22", glow: "#c8a95d8c" },
  home: { from: "#b9bcc7", via: "#8a8d99", to: "#54565f", glow: "#8a8d9980" },
  agendas: { from: "#c9e88a", via: "#8fd048", to: "#4c7a12", glow: "#8fd04880" },
  pagos: { from: "#8fe3c4", via: "#3cc194", to: "#0f6e56", glow: "#3cc19480" },
  cuotas: { from: "#ffd98a", via: "#efa127", to: "#8f5507", glow: "#efa12780" },
  leaderboard: { from: "#ffe9a8", via: "#e8b13c", to: "#8a5c05", glow: "#e8b13cb3" },
  clientes: { from: "#f5b0c8", via: "#dd6b92", to: "#8a2f4f", glow: "#dd6b9280" },
  contenido: { from: "#a9cdf5", via: "#4a8fdd", to: "#14508f", glow: "#4a8fdd8c" },
  testimonios: { from: "#c6b8ff", via: "#8b6ee8", to: "#4d3198", glow: "#8b6ee88c" },
  metricas: { from: "#c2bcf7", via: "#8078de", to: "#403893", glow: "#8078de8c" },
  asistente: { from: "#b9d9f7", via: "#5fa8d8", to: "#1c5d85", glow: "#5fa8d880" },
  finanzas: { from: "#f7c0ae", via: "#e0764f", to: "#8c3617", glow: "#e0764f80" },
  tutorial: { from: "#d9dae2", via: "#9b9daa", to: "#5b5d68", glow: "#9b9daa73" },
  ajustes: { from: "#cfd3dd", via: "#7e8492", to: "#454a55", glow: "#7e849273" },
  sistema: { from: "#eadcae", via: "#c8a95d", to: "#7d5f22", glow: "#c8a95d8c" },
  panel: { from: "#d6d4ff", via: "#8f8cff", to: "#4642b3", glow: "#8f8cff8c" },
} satisfies Record<string, Ramp>

const PANEL_ROLES = ["CEO", "Sales Manager", "Manager MKT", "Contaduria"]

export const modules: NavItem[] = [
  { label: "Home", href: "/", icon: Gauge, match: ["/"], ramp: ramps.home, group: "General", roles: ["CEO", "Sales Manager", "Manager MKT", "Setter", "Closer", "Contaduria", "CSM"] },
  // ── Panel del negocio: el dashboard de Agustín Ruppel adentro del CRM ──
  // (public/panel/index.html). Doce páginas: el flujo de leads desde que
  // entran al embudo hasta la cobranza, más JARVIS y el generador de carruseles.
  { label: "Resumen del mes", href: "/panel/resumen", icon: Wallet, match: ["/panel/resumen"], ramp: ramps.panel, group: "Panel del negocio", roles: PANEL_ROLES },
  { label: "El embudo", href: "/panel/embudo", icon: Target, match: ["/panel/embudo"], ramp: ramps.panel, group: "Panel del negocio", roles: PANEL_ROLES },
  { label: "Pipeline", href: "/panel/pipeline", icon: Kanban, match: ["/panel/pipeline"], ramp: ramps.panel, group: "Panel del negocio", roles: PANEL_ROLES },
  { label: "Cómo viene el año", href: "/panel/anio", icon: CalendarRange, match: ["/panel/anio"], ramp: ramps.panel, group: "Panel del negocio", roles: PANEL_ROLES },
  { label: "El equipo", href: "/panel/equipo", icon: Users, match: ["/panel/equipo"], ramp: ramps.panel, group: "Panel del negocio", roles: PANEL_ROLES },
  { label: "Últimas llamadas", href: "/panel/llamadas", icon: PhoneCall, match: ["/panel/llamadas"], ramp: ramps.panel, group: "Panel del negocio", roles: PANEL_ROLES },
  { label: "De dónde salen", href: "/panel/fuentes", icon: Compass, match: ["/panel/fuentes"], ramp: ramps.panel, group: "Panel del negocio", roles: PANEL_ROLES },
  { label: "El contenido", href: "/panel/contenido", icon: Clapperboard, match: ["/panel/contenido"], ramp: ramps.panel, group: "Panel del negocio", roles: PANEL_ROLES },
  { label: "Cobranzas", href: "/panel/cobranzas", icon: Coins, match: ["/panel/cobranzas"], ramp: ramps.panel, group: "Panel del negocio", roles: PANEL_ROLES },
  { label: "Hacia dónde va", href: "/panel/proyeccion", icon: Trophy, match: ["/panel/proyeccion"], ramp: ramps.panel, group: "Panel del negocio", roles: PANEL_ROLES },
  { label: "Service JARVIS", href: "/panel/agentes", icon: Mic, match: ["/panel/agentes"], ramp: ramps.panel, group: "Panel del negocio", roles: PANEL_ROLES },
  { label: "Generador de carruseles", href: "/panel/carrusel", icon: Layers, match: ["/panel/carrusel"], ramp: ramps.panel, group: "Panel del negocio", roles: PANEL_ROLES },
  { label: "Agendas", href: "/ventas", icon: UsersRound, match: ["/ventas", "/pipeline", "/centro-agendas"], ramp: ramps.agendas, group: "Ventas", roles: ["CEO", "Sales Manager", "Manager MKT", "Setter", "Closer", "Contaduria"] },
  { label: "Seguimientos", href: "/seguimientos", icon: BellRing, match: ["/seguimientos"], ramp: ramps.agendas, group: "Ventas", roles: ["CEO", "Sales Manager", "Manager MKT", "Setter", "Closer"] },
  { label: "Pagos", href: "/pagos", icon: CircleDollarSign, match: ["/pagos", "/carga-pagos", "/todos-pagos"], ramp: ramps.pagos, group: "Ventas", roles: ["CEO", "Sales Manager", "Manager MKT", "Setter", "Closer", "Contaduria", "CSM"] },
  { label: "Cobros y cuotas", href: "/recordatorios", icon: BellRing, match: ["/cobros", "/recordatorios", "/cuotas", "/planes-pago"], ramp: ramps.cuotas, group: "Ventas", roles: ["CEO", "Sales Manager", "Manager MKT", "Setter", "Closer", "Cobranzas", "Contaduria"] },
  { label: "Leaderboard", href: "/equipo", icon: Trophy, match: ["/equipo", "/esquema-comisiones"], ramp: ramps.leaderboard, group: "Producto", roles: ["CEO", "Sales Manager", "Manager MKT", "Setter", "Closer", "Contaduria"] },
  { label: "Clientes", href: "/clientes-hub", icon: UserRound, match: ["/clientes-hub", "/clientes", "/historia-leads"], ramp: ramps.clientes, group: "Producto", roles: ["CEO", "Sales Manager", "Manager MKT", "Setter", "Closer", "Contaduria", "CSM"] },
  { label: "Contenido", href: "/contenido-angulos", icon: Radar, match: ["/contenido-angulos"], ramp: ramps.contenido, group: "Marketing", roles: ["CEO", "Sales Manager", "Manager MKT", "Editor"] },
  { label: "Formatos", href: "/contenido/formatos", icon: Clapperboard, match: ["/contenido/formatos"], ramp: ramps.contenido, group: "Marketing", roles: ["CEO", "Sales Manager", "Manager MKT"] },
  { label: "Testimonios", href: "/testimonios", icon: MessageSquareQuote, match: ["/testimonios"], ramp: ramps.testimonios, group: "Marketing", roles: ["CEO", "Sales Manager", "Manager MKT", "CSM", "Editor"] },
  { label: "Métricas", href: "/rendimiento", icon: BarChart3, match: ["/rendimiento", "/metricas", "/evolucion-diaria"], ramp: ramps.metricas, group: "Operaciones", roles: ["CEO", "Sales Manager", "Manager MKT", "Contaduria"] },
  { label: "Calidad", href: "/calidad-datos", icon: ShieldCheck, match: ["/calidad-datos"], ramp: ramps.metricas, group: "Operaciones", roles: ["CEO", "Sales Manager", "Manager MKT", "CSM"] },
  { label: "Reporte llamadas", href: "/reporte-llamadas", icon: PhoneCall, match: ["/reporte-llamadas"], ramp: ramps.metricas, group: "Operaciones", roles: ["CEO", "Sales Manager", "Manager MKT", "Setter", "Closer"] },
  { label: "Finanzas", href: "/finanzas", icon: WalletCards, match: ["/finanzas"], ramp: ramps.finanzas, group: "Operaciones", roles: ["CEO", "Contaduria"] },
  { label: "Sistema", href: "/operaciones-tecnicas", icon: Monitor, match: ["/operaciones-tecnicas"], ramp: ramps.ajustes, group: "Operaciones", roles: ["CEO"] },
  // Capa de agentes de Exposure OS (datos ficticios hasta conectarla)
  { label: "Centro de Mando", href: "/sistema/centro-de-mando", icon: LayoutGrid, match: ["/sistema/centro-de-mando"], ramp: ramps.sistema, group: "Sistema IA" },
  { label: "Agentes", href: "/sistema/agentes", icon: Users, match: ["/sistema/agentes"], ramp: ramps.sistema, group: "Sistema IA" },
  { label: "Tareas", href: "/sistema/tareas", icon: ListChecks, match: ["/sistema/tareas"], ramp: ramps.sistema, group: "Sistema IA" },
  { label: "Agenda", href: "/sistema/agenda", icon: Calendar, match: ["/sistema/agenda"], ramp: ramps.sistema, group: "Sistema IA" },
  { label: "Herramientas", href: "/sistema/herramientas", icon: Wrench, match: ["/sistema/herramientas"], ramp: ramps.sistema, group: "Sistema IA" },
  { label: "Analítica de contenido", href: "/sistema/analitica", icon: ChartSpline, match: ["/sistema/analitica"], ramp: ramps.sistema, group: "Sistema IA" },
  { label: "Contenido IA", href: "/sistema/contenido", icon: FileText, match: ["/sistema/contenido"], ramp: ramps.sistema, group: "Sistema IA" },
  { label: "Memoria compartida", href: "/sistema/memoria", icon: Network, match: ["/sistema/memoria"], ramp: ramps.sistema, group: "Sistema IA" },
]

export const groupColors: Record<GroupName | "Ayuda", string> = {
  General: "#8a857e", "Panel del negocio": "#8f8cff", Ventas: "#8fd96f", Producto: "#e0b45c",
  Marketing: "#6ba6e8", Operaciones: "#9b8fe0", "Sistema IA": "#c8a95d", Ayuda: "#7c7c86",
}

export function CRMNavigation({ rol = "", nombre = "", email = "" }: { rol?: string; nombre?: string; email?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [menu, setMenu] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [compact, setCompact] = useState(false)
  const headerRef = useRef<HTMLElement>(null)
  const isManager = rol === "CEO" || rol === "Contaduria"
  const contentOnly = isContentOnlyAccount(email.trim().toLowerCase())
  const visibleModules = modules.filter(item => (!item.roles || item.roles.includes(rol)) && (!contentOnly || item.href === "/" || item.href === "/contenido-angulos"))
  const groups = GROUP_ORDER
    .map(label => ({ label, items: visibleModules.filter(item => item.group === label) }))
    .filter(group => group.items.length)

  useEffect(() => {
    const el = headerRef.current
    if (!el) return
    const update = () => document.documentElement.style.setProperty("--crm-header-h", `${el.offsetHeight}px`)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    window.addEventListener("resize", update)
    return () => { observer.disconnect(); window.removeEventListener("resize", update) }
  }, [])
  useEffect(() => {
    const abrir = () => setSettingsOpen(true)
    window.addEventListener("crm:open-settings", abrir)
    return () => window.removeEventListener("crm:open-settings", abrir)
  }, [])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setSearchOpen(value => !value)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
  useEffect(() => {
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setCompact(window.scrollY > 72))
    }
    update()
    window.addEventListener("scroll", update, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("scroll", update)
    }
  }, [])

  async function logout() {
    await createSupabaseBrowser().auth.signOut()
    window.location.href = "/login"
  }
  function navigate(href: string) {
    setSearchOpen(false)
    setMobileOpen(false)
    router.push(href)
  }

  return <>
    <header ref={headerRef} className="crm-safe-top fixed inset-x-0 top-0 z-50 min-[900px]:hidden border-b border-[#1e1e22] bg-[#0b0b0d] text-white shadow-[0_18px_40px_rgba(0,0,0,.38)]">
      <div className="mx-auto max-w-[1900px] px-3 pb-2 pt-2 min-[900px]:px-5 min-[900px]:pb-3">
        <div className="flex items-center gap-3 border-b border-[#1a1a1f] px-1.5 pb-3">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button className="grid h-10 w-10 place-items-center rounded-xl border border-[#202027] bg-[#121216] min-[900px]:hidden" aria-label="Abrir navegación">
                <Menu size={20} />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[min(320px,calc(100vw-12px))] max-w-full overflow-x-hidden overflow-y-auto border-[#202027] bg-[#0b0b0d] p-4 text-white">
              <SheetTitle className="mb-5 flex items-center gap-3 text-left text-white">
                <NavIcon ramp={ramps.logo} size={38} radius={12}><Sparkles size={19} strokeWidth={2} /></NavIcon>
                {BRAND.name}
              </SheetTitle>
              <div className="space-y-4">
                {groups.map(group => <MobileGroup key={group.label} label={group.label} color={groupColors[group.label]} items={group.items} pathname={pathname} onNavigate={navigate} />)}
                <div>
                  <GroupTitle label="Ayuda" color={groupColors.Ayuda} />
                  <div className="space-y-1 rounded-[20px] border border-[#202027] bg-[#121216] p-2">
                    <CRMTourButton rol={rol} visibleModules={visibleModules} className="flex w-full items-center gap-3 rounded-2xl p-2 text-left font-semibold hover:bg-[#1c1c22]">
                      <NavIcon ramp={ramps.tutorial} size={40} radius={13}><GraduationCap size={21} /></NavIcon><span>Tutorial</span>
                    </CRMTourButton>
                    <button onClick={() => { setMobileOpen(false); setSettingsOpen(true) }} className="flex w-full items-center gap-3 rounded-2xl p-2 text-left font-semibold hover:bg-[#1c1c22]">
                      <NavIcon ramp={ramps.ajustes} size={40} radius={13}><Settings2 size={21} /></NavIcon><span>Ajustes</span>
                    </button>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <Link href={contentOnly ? "/contenido-angulos" : "/asistente"} aria-label={contentOnly ? "Abrir Contenido" : "Abrir Asistente CRM"} title={contentOnly ? "Contenido" : "Asistente CRM"} className="flex shrink-0 items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40">
            <NavIcon ramp={ramps.logo} size={34} radius={11}><Sparkles size={18} strokeWidth={2} /></NavIcon>
            <span className="hidden text-[13px] font-extrabold tracking-[.08em] sm:inline">{BRAND.name}</span>
          </Link>

          <button onClick={() => setSearchOpen(true)} className="hidden max-w-[300px] flex-1 items-center gap-2 rounded-full border border-[#202027] bg-[#121216] px-3 py-1.5 text-left text-[12px] font-semibold text-[#6f6f79] transition-colors hover:border-[#303039] min-[600px]:flex min-[900px]:max-[1399px]:max-w-[200px]">
            <Search size={17} /><span className="truncate">{contentOnly ? "Buscar en Contenido…" : "Buscar cliente, agenda, pago…"}</span>
            <span className="ml-auto rounded-md border border-[#26262e] bg-[#1c1c22] px-1.5 text-[11px] text-[#8c8c96]">⌘K</span>
          </button>

          <div className="ml-auto flex items-center gap-2.5">
            <button onClick={() => setSearchOpen(true)} className="grid h-9 w-9 place-items-center rounded-xl border border-[#202027] bg-[#121216] min-[600px]:hidden" aria-label="Buscar"><Search size={17} /></button>
            <button className="relative grid h-9 w-9 place-items-center rounded-xl border border-[#202027] bg-[#121216] text-[#c9c9d1]" aria-label="Notificaciones">
              <Bell size={18} />
            </button>
            <UserMenu rol={rol} nombre={nombre} email={email} open={menu} setOpen={setMenu} isManager={isManager} openSettings={() => { setMenu(false); setSettingsOpen(true) }} logout={logout} />
          </div>
        </div>

        <nav aria-label="Módulos principales" className={cn("hidden items-start overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden min-[900px]:flex min-[1100px]:justify-center", compact ? "gap-2 pt-2" : "gap-3 pt-3")}>
          {groups.map(group => <DesktopGroup key={group.label} label={group.label} color={groupColors[group.label]} items={group.items} pathname={pathname} compact={compact} />)}
          <div className={cn("flex shrink-0 flex-col", compact ? "gap-0" : "gap-1.5")}>
            {!compact && <GroupTitle label="Ayuda" color={groupColors.Ayuda} />}
            <div className={cn("flex items-start gap-0.5 border border-[#202027] bg-[#121216]", compact ? "rounded-2xl p-1" : "rounded-[20px] p-2")}>
              <CRMTourButton rol={rol} visibleModules={visibleModules} className={cn("flex shrink-0 flex-col items-center rounded-2xl font-semibold transition-all motion-reduce:transition-none hover:bg-[#1c1c22] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40", compact ? "w-[54px] gap-0 px-1 py-1" : "w-[72px] gap-2 pb-1 pt-1.5")}>
                <NavIcon ramp={ramps.tutorial} size={compact ? 42 : 46} radius={compact ? 14 : 15}><GraduationCap size={23} strokeWidth={2} /></NavIcon>{!compact && <span className="h-8 text-center text-[13px] font-semibold leading-4 text-[#c9c9d1]">Tutorial</span>}
              </CRMTourButton>
              <button onClick={() => setSettingsOpen(true)} className={cn("flex shrink-0 flex-col items-center rounded-2xl font-semibold transition-all motion-reduce:transition-none hover:bg-[#1c1c22] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40", compact ? "w-[54px] gap-0 px-1 py-1" : "w-[72px] gap-2 pb-1 pt-1.5")}>
                <NavIcon ramp={ramps.ajustes} size={compact ? 42 : 46} radius={compact ? 14 : 15}><Settings2 size={23} strokeWidth={2} /></NavIcon>{!compact && <span className="h-8 text-center text-[13px] font-semibold leading-4 text-[#c9c9d1]">Ajustes</span>}
              </button>
            </div>
          </div>
        </nav>
      </div>
    </header>

    <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
      <CommandInput placeholder={contentOnly ? "Buscar en Contenido…" : "Buscar una sección, cliente, agenda o pago…"} />
      <CommandList>
        <CommandEmpty>No encontramos resultados.</CommandEmpty>
        <CommandGroup heading="Secciones">
          {visibleModules.map(item => <CommandItem key={item.href} value={`${item.label} ${item.group}`} onSelect={() => navigate(item.href)}><item.icon className="mr-2 h-4 w-4" />{item.label}</CommandItem>)}
        </CommandGroup>
        {!contentOnly && <CommandGroup heading="Buscar datos">
          <CommandItem onSelect={() => navigate("/clientes-hub")}><UserRound className="mr-2 h-4 w-4" />Buscar clientes</CommandItem>
          <CommandItem onSelect={() => navigate("/ventas")}><UsersRound className="mr-2 h-4 w-4" />Buscar agendas</CommandItem>
          <CommandItem onSelect={() => navigate("/pagos")}><CircleDollarSign className="mr-2 h-4 w-4" />Buscar pagos</CommandItem>
        </CommandGroup>}
      </CommandList>
    </CommandDialog>
    <PreferencesDialog open={settingsOpen} onOpenChange={setSettingsOpen} theme={theme || "light"} setTheme={setTheme} />
  </>
}

function GroupTitle({ label, color }: { label: string; color: string }) {
  return <span className="h-[14px] text-center text-[11px] font-semibold uppercase leading-[14px] tracking-[.14em]" style={{ color }}>{label}</span>
}

function DesktopGroup({ label, color, items, pathname, compact }: { label: string; color: string; items: NavItem[]; pathname: string; compact: boolean }) {
  return <div className={cn("flex shrink-0 flex-col", compact ? "gap-0" : "gap-1.5")}>
    {!compact && <GroupTitle label={label} color={color} />}
    <div className={cn("flex items-start gap-0.5 border border-[#202027] bg-[#121216]", compact ? "rounded-2xl p-1" : "rounded-[20px] p-2")}>
      {items.map(item => <DesktopItem key={item.href} item={item} active={isActive(item, pathname)} compact={compact} />)}
    </div>
  </div>
}

function DesktopItem({ item, active, compact }: { item: NavItem; active: boolean; compact: boolean }) {
  const Icon = item.icon
  return <Link href={item.href} data-tour={navTourId(item.href)} aria-current={active ? "page" : undefined} className={cn(
    "flex shrink-0 flex-col items-center rounded-2xl transition-all motion-reduce:transition-none",
    compact ? "w-[54px] gap-0 px-1 py-1" : "w-[72px] gap-2 pb-1 pt-1.5",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
    active ? "bg-[#191a1f] shadow-[inset_0_0_0_1px_#2a2c34]" : "hover:bg-[#1c1c22]",
  )}>
    <NavIcon ramp={item.ramp} size={compact ? 42 : 46} radius={compact ? 14 : 15}><Icon size={23} strokeWidth={2} /></NavIcon>
    {!compact && <span className={cn("h-8 text-center text-[13px] font-semibold leading-4", active ? "text-white" : "text-[#c9c9d1]")}>{item.label}</span>}
    {active && <span className={cn("h-[3px] w-[22px] rounded-full bg-[#34d17f] shadow-[0_0_8px_#34d17f]", compact ? "mt-1" : "-mt-1")} />}
  </Link>
}

function MobileGroup({ label, color, items, pathname, onNavigate }: { label: string; color: string; items: NavItem[]; pathname: string; onNavigate: (href: string) => void }) {
  return <div>
    <GroupTitle label={label} color={color} />
    <div className="mt-1 space-y-1 rounded-[20px] border border-[#202027] bg-[#121216] p-2">
      {items.map(item => {
        const Icon = item.icon
        const active = isActive(item, pathname)
        return <button key={item.href} onClick={() => onNavigate(item.href)} className={cn("flex w-full items-center gap-3 rounded-2xl p-2 text-left text-[13px] font-semibold", active ? "bg-[#191a1f] text-white ring-1 ring-[#2a2c34]" : "text-[#c9c9d1] hover:bg-[#1c1c22]")}>
          <NavIcon ramp={item.ramp} size={40} radius={13}><Icon size={21} strokeWidth={2} /></NavIcon><span>{item.label}</span>
        </button>
      })}
    </div>
  </div>
}

export function isActive(item: NavItem, pathname: string) {
  return item.match.some(route => route === "/" ? pathname === "/" : pathname.startsWith(route))
}

function UserMenu({ rol, nombre, email, open, setOpen, isManager, openSettings, logout }: {
  rol: string; nombre: string; email: string; open: boolean; setOpen: (value: boolean) => void
  isManager: boolean; openSettings: () => void; logout: () => void
}) {
  return <div className="relative shrink-0">
    <button onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-xl border border-[#202027] bg-[#121216] p-1 pr-2.5 font-semibold transition-colors hover:bg-[#1c1c22]">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#ff9d5c] via-[#f2542d] to-[#a52c10] text-xs font-bold shadow-[0_5px_12px_-4px_#f2542da6]">{(nombre || email || "U").charAt(0).toUpperCase()}</span>
      <span className="hidden text-left lg:block"><span className="block max-w-28 truncate text-[13px] font-bold">{nombre || email}</span><span className="block text-[11px] text-[#6f6f79]">{rol}</span></span>
      <ChevronDown size={15} className={cn("text-[#6f6f79] transition-transform", open && "rotate-180")} />
    </button>
    {open && <><button aria-label="Cerrar" className="fixed inset-0 z-[90]" onClick={() => setOpen(false)} /><div className="absolute right-0 top-12 z-[100] w-60 rounded-2xl border border-[#303038] bg-[#121216]/98 p-2 shadow-2xl backdrop-blur-2xl">
      {isManager && <MenuLink href="/reglas" icon={Settings2} label="Reglas y configuración" />}
      {rol === "CEO" && <MenuLink href="/accesos" icon={UsersRound} label="Accesos" />}
      <button onClick={openSettings} className="menu-row"><Palette /><span>Personalización</span></button>
      <button onClick={logout} className="menu-row text-red-300"><LogOut /><span>Cerrar sesión</span></button>
    </div></>}
  </div>
}

type Preferences = {
  sounds: boolean
  reduceMotion: boolean
  highContrast: boolean
  largeText: boolean
  spacious: boolean
}

const defaultPreferences: Preferences = { sounds: true, reduceMotion: false, highContrast: false, largeText: false, spacious: false }

function applyPreferences(preferences: Preferences) {
  const root = document.documentElement
  root.classList.toggle("crm-reduce-motion", preferences.reduceMotion)
  root.classList.toggle("crm-high-contrast", preferences.highContrast)
  root.classList.toggle("crm-large-text", preferences.largeText)
  root.classList.toggle("crm-spacious", preferences.spacious)
  localStorage.setItem("crm-sounds-muted", String(!preferences.sounds))
  localStorage.setItem("crm-preferences", JSON.stringify(preferences))
}

function PreferencesDialog({ open, onOpenChange, theme, setTheme }: { open: boolean; onOpenChange: (open: boolean) => void; theme: string; setTheme: (theme: string) => void }) {
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences)

  useEffect(() => {
    try {
      const saved = localStorage.getItem("crm-preferences")
      const next = saved ? { ...defaultPreferences, ...JSON.parse(saved) } : { ...defaultPreferences, sounds: localStorage.getItem("crm-sounds-muted") !== "true" }
      setPreferences(next)
      applyPreferences(next)
    } catch { applyPreferences(defaultPreferences) }
  }, [])

  function update(key: keyof Preferences, value: boolean) {
    const next = { ...preferences, [key]: value }
    setPreferences(next)
    applyPreferences(next)
  }

  function reset() {
    setTheme("light")
    setPreferences(defaultPreferences)
    applyPreferences(defaultPreferences)
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="z-[200] max-h-[88vh] max-w-[620px] overflow-y-auto p-0">
      <div className="border-b border-black/10 bg-gradient-to-br from-[#c8a95d]/12 via-transparent to-transparent p-6 dark:border-white/10">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl"><Settings2 className="h-5 w-5 text-[#9c7a37]" />Personalización</DialogTitle>
          <DialogDescription>Ajustá el CRM a tu forma de trabajar. Se guarda en este dispositivo.</DialogDescription>
        </DialogHeader>
      </div>
      <div className="space-y-6 p-6">
        <section>
          <PreferenceHeading icon={Palette} title="Apariencia" />
          <div className="grid grid-cols-3 gap-2">
            <ThemeButton active={theme === "light"} onClick={() => setTheme("light")} icon={Sun} label="Claro" />
            <ThemeButton active={theme === "dark"} onClick={() => setTheme("dark")} icon={Moon} label="Noche" />
            <ThemeButton active={theme === "system"} onClick={() => setTheme("system")} icon={Monitor} label="Sistema" />
          </div>
        </section>
        <section className="space-y-2">
          <PreferenceHeading icon={Settings2} title="Experiencia" />
          <PreferenceSwitch icon={Volume2} label="Sonidos de interfaz" detail="Confirmaciones y alertas del CRM" checked={preferences.sounds} onCheckedChange={value => update("sounds", value)} />
          <PreferenceSwitch icon={Sparkles} label="Reducir animaciones" detail="Menos movimientos y transiciones" checked={preferences.reduceMotion} onCheckedChange={value => update("reduceMotion", value)} />
          <PreferenceSwitch icon={Eye} label="Mayor contraste" detail="Bordes y textos más definidos" checked={preferences.highContrast} onCheckedChange={value => update("highContrast", value)} />
          <PreferenceSwitch icon={Type} label="Texto más grande" detail="Aumenta la lectura general" checked={preferences.largeText} onCheckedChange={value => update("largeText", value)} />
          <PreferenceSwitch icon={Monitor} label="Vista espaciosa" detail="Más aire entre filas y controles" checked={preferences.spacious} onCheckedChange={value => update("spacious", value)} />
        </section>
        <button onClick={reset} className="flex w-full items-center justify-center gap-2 rounded-xl border border-black/10 px-4 py-2.5 text-sm font-semibold text-muted-foreground transition hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"><RotateCcw className="h-4 w-4" />Restaurar valores originales</button>
      </div>
    </DialogContent>
  </Dialog>
}

function PreferenceHeading({ icon: Icon, title }: { icon: typeof Settings2; title: string }) {
  return <div className="mb-3 flex items-center gap-2 text-sm font-bold"><Icon className="h-4 w-4 text-[#9c7a37]" />{title}</div>
}

function ThemeButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Sun; label: string }) {
  return <button onClick={onClick} className={cn("flex flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-sm font-semibold transition", active ? "border-[#c8a95d] bg-[#c8a95d]/10 text-[#8f6f2e] dark:text-[#dec27c]" : "border-black/10 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5")}><Icon className="h-5 w-5" />{label}</button>
}

function PreferenceSwitch({ icon: Icon, label, detail, checked, onCheckedChange }: { icon: typeof Settings2; label: string; detail: string; checked: boolean; onCheckedChange: (value: boolean) => void }) {
  return <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-black/10 p-3.5 transition hover:bg-black/[.025] dark:border-white/10 dark:hover:bg-white/[.035]">
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-[#9c7a37]"><Icon className="h-4 w-4" /></span>
    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{label}</span><span className="block text-xs text-muted-foreground">{detail}</span></span>
    <Switch checked={checked} onCheckedChange={onCheckedChange} />
  </label>
}

function MenuLink({ href, icon: Icon, label }: { href: string; icon: typeof Gauge; label: string }) {
  return <Link href={href} className="menu-row"><Icon /><span>{label}</span></Link>
}
