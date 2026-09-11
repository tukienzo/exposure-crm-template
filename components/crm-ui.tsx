import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Sparkles } from "lucide-react"

export function CrmPageIntro({
  eyebrow,
  title,
  description,
  icon,
  actions,
  tone = "red",
}: {
  eyebrow: string
  title: string
  description: string
  icon: ReactNode
  actions?: ReactNode
  tone?: "red" | "amber" | "emerald" | "violet" | "blue" | "fuchsia"
}) {
  const tones = {
    red: "from-[#c8a95d] to-[#9c7a37] shadow-[#c8a95d]/25",
    amber: "from-amber-400 to-orange-500 shadow-amber-500/25",
    emerald: "from-emerald-500 to-teal-400 shadow-emerald-500/25",
    violet: "from-violet-500 to-fuchsia-400 shadow-violet-500/25",
    blue: "from-blue-500 to-cyan-400 shadow-blue-500/25",
    fuchsia: "from-fuchsia-500 to-rose-400 shadow-fuchsia-500/25",
  }

  return (
    <section className="crm-hero">
      <div className="relative z-10 flex min-w-0 items-start gap-4">
        <span className={cn("crm-hero-icon bg-gradient-to-br text-white shadow-xl", tones[tone])}>{icon}</span>
        <div className="min-w-0">
          <p className="crm-eyebrow"><Sparkles className="h-3 w-3" />{eyebrow}</p>
          <h1>{title}</h1>
          <p className="crm-hero-copy">{description}</p>
        </div>
      </div>
      {actions && <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </section>
  )
}

export function CrmStat({
  label,
  value,
  detail,
  icon,
  tone = "neutral",
}: {
  label: string
  value: ReactNode
  detail?: ReactNode
  icon: ReactNode
  tone?: "neutral" | "red" | "amber" | "emerald" | "violet" | "blue" | "fuchsia"
}) {
  const tones = {
    neutral: "from-zinc-500/15 to-zinc-400/5 text-zinc-600 dark:text-zinc-200",
    red: "from-[#c8a95d]/25 to-[#dec27c]/5 text-[#8f6f2e] dark:text-[#dec27c]",
    amber: "from-amber-500/18 to-orange-400/5 text-amber-700 dark:text-amber-300",
    emerald: "from-emerald-500/18 to-teal-400/5 text-emerald-700 dark:text-emerald-300",
    violet: "from-violet-500/18 to-fuchsia-400/5 text-violet-700 dark:text-violet-300",
    blue: "from-blue-500/18 to-cyan-400/5 text-blue-700 dark:text-blue-300",
    fuchsia: "from-fuchsia-500/18 to-rose-400/5 text-fuchsia-700 dark:text-fuchsia-300",
  }

  return (
    <div className="crm-stat">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="crm-stat-label">{label}</p>
          <div className="crm-stat-value">{value}</div>
          {detail && <p className="crm-stat-detail">{detail}</p>}
        </div>
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br", tones[tone])}>{icon}</span>
      </div>
    </div>
  )
}

export function CrmEmpty({
  icon,
  title,
  detail,
}: {
  icon: ReactNode
  title: string
  detail: string
}) {
  return (
    <div className="crm-empty">
      <span className="metal-icon grid h-12 w-12 place-items-center rounded-2xl">{icon}</span>
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  )
}
