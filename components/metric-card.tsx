import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown, Activity } from "lucide-react"

interface MetricCardProps {
  title: string
  value: string
  change?: number
  subtitle?: string
  className?: string
}

export function MetricCard({ title, value, change, subtitle, className }: MetricCardProps) {
  return (
    <Card className={cn("surface surface-hover group border-border", className)}>
      <CardContent className="relative p-5">
        <div className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-xl border border-white/80 bg-gradient-to-br from-white to-zinc-200 text-zinc-400 shadow-sm transition duration-300 group-hover:-translate-y-0.5 group-hover:text-[#9c7a37] dark:border-white/10 dark:from-zinc-700 dark:to-zinc-900"><Activity className="h-4 w-4" /></div>
        <div className="flex flex-col gap-1 pr-10">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {title}
          </p>
          <p className="text-2xl font-semibold tracking-[-.03em] text-foreground">{value}</p>
          {(change !== undefined || subtitle) && (
            <div className="flex items-center gap-2 mt-1">
              {change !== undefined && (
                <span
                  className={cn(
                    "flex items-center gap-0.5 text-xs font-medium",
                    change >= 0 ? "text-emerald-600" : "text-red-500"
                  )}
                >
                  {change >= 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {Math.abs(change)}%
                </span>
              )}
              {subtitle && (
                <span className="text-xs text-muted-foreground">{subtitle}</span>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
