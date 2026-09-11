"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { createSupabaseBrowser } from "@/lib/supabase-browser"
import { canExportRole } from "@/lib/export-access"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { buttonVariants } from "@/components/ui/button"
import {
  LayoutDashboard,
  Upload,
  CreditCard,
  Kanban,
  CalendarDays,
  UserCircle,
  History,
  ShieldCheck,
  BarChart3,
  Wallet,
  DollarSign,
  LogOut,
  Sun,
  Moon,
  BellRing,
  Download,
  BookOpenCheck,
  Menu,
  X,
  Sparkles,
  Zap,
} from "lucide-react"

type Item = { name: string; href: string; icon: any; roles?: string[] }

const navigation: { label: string; items: Item[] }[] = [
  {
    label: "TRABAJO DIARIO",
    items: [
      { name: "Inicio", href: "/", icon: LayoutDashboard, roles: ["CEO", "Sales Manager", "Manager MKT", "Setter", "Closer"] },
      { name: "Cobros", href: "/recordatorios", icon: BellRing, roles: ["CEO", "Contaduria"] },
      { name: "Pipeline", href: "/pipeline", icon: Kanban, roles: ["CEO", "Sales Manager", "Manager MKT", "Setter", "Closer"] },
      { name: "Historial 2026", href: "/historia-leads", icon: History, roles: ["CEO", "Sales Manager", "Manager MKT", "Setter", "Closer", "Contaduria", "CSM"] },
      { name: "Agendas", href: "/centro-agendas", icon: CalendarDays, roles: ["CEO", "Sales Manager", "Manager MKT", "Setter", "Closer"] },
      { name: "Seguimientos", href: "/seguimientos", icon: BellRing, roles: ["CEO", "Sales Manager", "Manager MKT", "Closer"] },
      { name: "Cómo usar el CRM", href: "/sop-crm", icon: BookOpenCheck },
    ],
  },
  {
    label: "GESTIÓN",
    items: [
      { name: "Carga de Pagos", href: "/carga-pagos", icon: Upload, roles: ["CEO", "Sales Manager", "Manager MKT", "Setter", "Closer", "Contaduria"] },
      { name: "Todos los Pagos", href: "/todos-pagos", icon: CreditCard, roles: ["CEO", "Sales Manager", "Manager MKT", "Setter", "Closer", "Contaduria"] },
      { name: "Clientes", href: "/clientes", icon: UserCircle, roles: ["CEO", "Sales Manager", "Manager MKT", "Setter", "Closer", "Contaduria", "CSM"] },
      { name: "Métricas", href: "/metricas", icon: BarChart3, roles: ["CEO", "Manager MKT"] },
    ],
  },
  {
    label: "ADMINISTRACIÓN",
    items: [
      { name: "Accesos", href: "/accesos", icon: ShieldCheck, roles: ["CEO"] },
      { name: "Gastos", href: "/gastos", icon: Wallet, roles: ["CEO", "Contaduria"] },
      { name: "Payroll", href: "/payroll", icon: DollarSign, roles: ["CEO", "Contaduria"] },
    ],
  },
]

export function CRMSidebar({ rol = "", nombre = "", email = "" }: { rol?: string; nombre?: string; email?: string }) {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  useEffect(() => setMounted(true), [])
  const isDark = mounted && theme === "dark"

  function canSee(item: Item) {
    if (!item.roles) return true
    return item.roles.includes(rol)
  }

  const canExport = canExportRole(rol)

  async function logout() {
    const supabase = createSupabaseBrowser()
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-white/10 bg-sidebar/90 px-4 text-white backdrop-blur-xl lg:hidden">
        <div className="flex items-center gap-2.5"><CRMBaseMark /><div><p className="text-sm font-bold leading-none">CRM Base</p><p className="mt-1 text-[10px] uppercase tracking-[.22em] text-white/45">Sales OS</p></div></div>
        <button onClick={() => setOpen(true)} className="rounded-xl border border-white/10 bg-white/5 p-2.5"><Menu className="h-5 w-5" /></button>
      </header>
      {open && <button aria-label="Cerrar menú" onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm lg:hidden" />}
    <aside className={cn("fixed left-0 top-0 z-50 h-[100dvh] w-[280px] border-r border-white/10 bg-sidebar/95 shadow-2xl backdrop-blur-2xl transition-transform duration-300 lg:z-40 lg:w-[272px] lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
      <div className="flex h-full flex-col">
        <div className="flex h-20 items-center justify-between border-b border-white/10 px-5">
          <div className="flex items-center gap-3"><CRMBaseMark /><div><p className="font-bold leading-none text-white">CRM Base</p><p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[.24em] text-white/40">Sales OS</p></div></div>
          <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white lg:hidden"><X className="h-5 w-5" /></button>
        </div>

        <div className="mx-3 mt-4 rounded-2xl border border-white/10 bg-gradient-to-br from-red-500/20 to-orange-400/5 p-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-white"><Zap className="h-3.5 w-3.5 text-red-400" /> Modo operación</div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-white/45">Tus pendientes, ventas y cobros en un solo lugar.</p>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {navigation.map((group) => {
            const items = group.items.filter(canSee)
            if (items.length === 0) return null
            return (
              <div key={group.label} className="mb-6">
                <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-muted">
                  {group.label}
                </p>
                <ul className="space-y-1">
                  {items.map((item) => {
                    const isActive = pathname === item.href
                    return (
                      <li key={item.name}>
                        <Link onClick={() => setOpen(false)}
                          href={item.href}
                          className={cn(
                            "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                            isActive
                              ? "bg-gradient-to-r from-red-600 to-red-500 text-white shadow-lg shadow-red-950/30"
                              : "text-sidebar-foreground hover:translate-x-0.5 hover:bg-white/[.07] hover:text-white",
                          )}
                        >
                          <item.icon className={cn("h-4 w-4 transition-transform group-hover:scale-110", isActive && "drop-shadow")} />
                          {item.name}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="mb-2 flex items-center gap-3 rounded-xl bg-white/[.04] p-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-red-500 to-orange-400 text-sm font-bold text-white">{(nombre || email || "U").charAt(0).toUpperCase()}</div>
            <div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{nombre || email}</p><p className="truncate text-[11px] text-white/40">{rol}</p></div>
          </div>
          {canExport && (
            <a
              href="/api/export-all"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <Download className="h-4 w-4" />
              Exportar Todo
            </a>
          )}
          <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {isDark ? "Modo claro" : "Modo oscuro"}
          </button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
                <LogOut className="h-4 w-4" />
                Cerrar sesión
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Cerrar sesión?</AlertDialogTitle>
                <AlertDialogDescription>Vas a salir de tu cuenta en el CRM.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={logout} className={buttonVariants({ variant: "destructive" })}>
                  Cerrar sesión
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </aside>
    </>
  )
}

function CRMBaseMark() {
  return <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-red-500 to-red-700 shadow-lg shadow-red-950/30"><Sparkles className="absolute -right-1 -top-1 h-3 w-3 text-orange-300" /><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="h-7 w-7"><circle cx="50" cy="50" r="48" fill="white" /><path d="M50,2 A24,24,0,0,0,50,50 A24,24,0,0,1,50,98 A48,48,0,0,0,50,2 Z" fill="#18181b" /><circle cx="50" cy="26" r="8" fill="#18181b" /><circle cx="50" cy="74" r="8" fill="white" /></svg></div>
}
