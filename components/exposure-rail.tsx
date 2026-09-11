"use client"

/* ══ RAÍL — negro mate, el único bloque oscuro del producto ══════════
   El patrón de navegación de Exposure OS aplicado a los módulos del CRM:
   grupos con etiqueta chica en mayúsculas, ítem activo con barrita dorada,
   la marca arriba y la cuenta abajo. Solo en escritorio (≥ 900px); en el
   celular sigue el header con el cajón lateral de crm-navigation. */

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LogOut, Palette, Search, Settings2, UsersRound } from "lucide-react"
import { createSupabaseBrowser } from "@/lib/supabase-browser"
import { Mark } from "@/components/exposure/ui"
import { GROUP_ORDER, groupColors, isActive, modules, type NavItem } from "@/components/crm-navigation"
import { BRAND } from "@/lib/brand"

const ACENTO = "var(--rail-accent)"

export function ExposureRail({ rol = "", nombre = "", email = "" }: { rol?: string; nombre?: string; email?: string }) {
  const pathname = usePathname()
  const visible = modules.filter((item) => !item.roles || item.roles.includes(rol))
  const groups = GROUP_ORDER.map((label) => ({ label, items: visible.filter((i) => i.group === label) })).filter((g) => g.items.length)
  const isManager = rol === "CEO" || rol === "Contaduria"

  async function logout() {
    await createSupabaseBrowser().auth.signOut()
    window.location.href = "/login"
  }
  const abrirBusqueda = () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }))
  const abrirAjustes = () => window.dispatchEvent(new CustomEvent("crm:open-settings"))

  return (
    <aside
      className="exposure-rail hidden min-[900px]:flex fixed inset-y-0 left-0 z-40 w-[250px] flex-col"
      style={{
        background: "var(--rail-bg)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        boxShadow: "var(--rail-shadow)",
        color: "var(--rail-fg)",
      }}
    >
      <Link href="/" className="flex items-center gap-2.5 px-5 flex-none" style={{ height: 76 }}>
        <Mark size={32} />
        <span className="min-w-0">
          <span className="block text-[15px] leading-none" style={{ fontWeight: 600, letterSpacing: "-0.02em", color: "var(--rail-fg-strong)" }}>
            {BRAND.name}
          </span>
          <span className="block mt-[7px] text-[11px] leading-none" style={{ color: "var(--rail-muted)" }}>
            {BRAND.tagline}
          </span>
        </span>
      </Link>

      <button
        type="button"
        onClick={abrirBusqueda}
        className="mx-3 mb-2 flex items-center gap-2 rounded-[10px] px-3 text-left transition-colors"
        style={{ height: 34, background: "var(--rail-item)", color: "var(--rail-fg-2)" }}
      >
        <Search size={14} strokeWidth={1.9} style={{ color: "var(--rail-icon)" }} />
        <span className="text-[12.5px] flex-1 truncate">Buscar cliente, agenda, pago…</span>
        <span className="mono text-[10.5px]" style={{ color: "var(--rail-muted-2)" }}>⌘K</span>
      </button>

      <nav className="scroll flex-1 min-h-0 px-3 pb-3">
        {groups.map((g) => (
          <div key={g.label} className="pt-4">
            <div className="lbl px-3 pb-2" style={{ color: groupColors[g.label] ?? "var(--rail-muted-2)", opacity: 0.9 }}>
              {g.label}
            </div>
            {g.items.map((item) => (
              <RailItem key={item.href} item={item} on={isActive(item, pathname)} />
            ))}
          </div>
        ))}
      </nav>

      <div className="mt-auto p-3 flex-none">
        <div className="rounded-[12px] px-3.5 py-3" style={{ background: "var(--rail-item)" }}>
          <div className="flex items-center gap-2.5">
            <span
              className="grid place-items-center flex-none text-[12px]"
              style={{ width: 30, height: 30, borderRadius: 9, background: "var(--rail-avatar)", color: ACENTO, fontWeight: 600, boxShadow: "0 0 0 1px var(--rail-accent-ring)" }}
            >
              {(nombre || email || "U").charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] leading-none truncate" style={{ fontWeight: 520, color: "var(--rail-fg-strong)" }}>{nombre || email}</span>
              <span className="block mt-[6px] text-[11px] leading-none truncate" style={{ color: "var(--rail-muted)" }}>{rol || "Sin rol"}</span>
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {isManager && <RailMini href="/reglas" icon={<Settings2 size={13} />} label="Reglas" />}
            {rol === "CEO" && <RailMini href="/accesos" icon={<UsersRound size={13} />} label="Accesos" />}
            <RailMini onClick={abrirAjustes} icon={<Palette size={13} />} label="Ajustes" />
            <RailMini onClick={logout} icon={<LogOut size={13} />} label="Salir" tone="warn" />
          </div>
        </div>
      </div>
    </aside>
  )
}

function RailItem({ item, on }: { item: NavItem; on: boolean }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      aria-current={on ? "page" : undefined}
      className="relative flex w-full items-center gap-2.5 rounded-[10px] pl-3.5 pr-2.5 mb-[3px] transition-colors duration-150 hover:bg-white/[.03]"
      style={{ height: 36, background: on ? "var(--rail-item-on)" : undefined, color: on ? "var(--rail-fg-strong)" : "var(--rail-fg-2)" }}
    >
      {on && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2"
          style={{ width: 2.5, height: 17, borderRadius: 99, background: ACENTO, boxShadow: "0 0 12px var(--rail-accent-glow)" }}
        />
      )}
      <Icon size={15} strokeWidth={1.8} style={{ color: on ? ACENTO : "var(--rail-icon)", flex: "none" }} />
      <span className="text-[13px] truncate" style={{ fontWeight: on ? 520 : 450 }}>{item.label}</span>
    </Link>
  )
}

function RailMini({ href, onClick, icon, label, tone }: { href?: string; onClick?: () => void; icon: React.ReactNode; label: string; tone?: "warn" }) {
  const cls = "flex items-center justify-center gap-1.5 rounded-[8px] text-[11.5px] transition-colors hover:bg-white/[.06]"
  const style = { height: 30, color: tone === "warn" ? "var(--rail-warn)" : "var(--rail-fg)", background: "var(--rail-item)", fontWeight: 500 }
  return href ? (
    <Link href={href} className={cls} style={style}>{icon}{label}</Link>
  ) : (
    <button type="button" onClick={onClick} className={cls} style={style}>{icon}{label}</button>
  )
}
