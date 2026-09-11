"use client"

import { useState, useMemo, useEffect } from "react"
import Link from "next/link"
import useSWR, { mutate } from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Trophy, Medal, Award, AlertTriangle, TrendingUp, Users, Loader2, BadgeDollarSign, Target, Coins, Star, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Strike } from "@/lib/supabase"
import { CrmPageIntro, CrmStat } from "@/components/crm-ui"
import { useSession } from "@/components/session-provider"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type CloserData = {
  nombre: string; initials: string
  cc_nuevo: number; cc_total: number; cc_paul: number; cc_cristian: number; cc_ponderado: number; unidades: number; fees: number
  llamadas: number; cerradas: number; tasa_cierre: number; tc_ab: number; aov: number; show_up: number
  feccu: number; feccpp: number; commissionable_cc: number
  nivel: 1 | 2 | 3; rate: number; unlocked_rate: number; strikes: number; comisiones: number
  is_top: boolean; next_target: number; next_rate: number; personal_goal: number | null
}
type SetterData = {
  nombre: string; initials: string
  cc_nuevo: number; cc_total: number; cc_paul: number; cc_cristian: number; cc_ponderado: number; unidades: number; fees: number
  agendas: number; agendas_ab: number; t_agenda: number | null; show_up: number
  feccu: number; feccpp: number; feccpp_excluido: number; commissionable_cc: number
  nivel: 1 | 2 | 3; rate: number; unlocked_rate: number; strikes: number; comisiones: number
  is_top: boolean; next_target: number; next_rate: number; personal_goal: number | null
}
type LeaderboardData = {
  closers: CloserData[]; setters: SetterData[]; csm_cc: number; csm_comision: number
  team_cc_total: number; team_cc_pond?: number
  team_feccu: number; team_feccpp: number; team_beccu: number
}

// Períodos válidos desde agosto 2024 (arranque real de datos históricos
// conciliados en el CRM), no solo desde que existe este preview.
function getMonthList(): { value: string; label: string }[] {
  const list: { value: string; label: string }[] = []
  const start = new Date(2024, 7, 1)
  const today = new Date()
  const minimumEnd = new Date(2026, 11, 1)
  const currentEnd = new Date(today.getFullYear(), today.getMonth(), 1)
  const end = currentEnd > minimumEnd ? currentEnd : minimumEnd
  let d = new Date(start)
  while (d <= end) {
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const raw = d.toLocaleDateString("es-ES", { month: "long", year: "numeric" })
    list.push({ value, label: raw.charAt(0).toUpperCase() + raw.slice(1) })
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  }
  return list
}

function fUSD(n: number): string {
  if (n === 0) return "—"
  return "$" + Math.round(n).toLocaleString("en-US")
}

function fPct(n: number | null): string {
  if (n === null || n === 0) return "0%"
  return n.toFixed(2) + "%"
}

function NivelBadge({ nivel }: { nivel: number }) {
  if (nivel === 3) return <Badge className="text-[10px] px-1.5 py-0 h-4 bg-emerald-500/20 text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/20">N3</Badge>
  if (nivel === 2) return <Badge className="text-[10px] px-1.5 py-0 h-4 bg-blue-500/20 text-blue-700 border-blue-500/30 hover:bg-blue-500/20">N2</Badge>
  if (nivel === 1) return <Badge className="text-[10px] px-1.5 py-0 h-4 bg-muted text-muted-foreground border-border hover:bg-muted">N1</Badge>
  return <Badge className="text-[10px] px-1.5 py-0 h-4 bg-red-500/10 text-red-600 border-red-500/20 hover:bg-red-500/10">Sin</Badge>
}

function RankIcon({ index }: { index: number }) {
  if (index === 0) return <Trophy className="h-5 w-5 text-amber-500" />
  if (index === 1) return <Medal className="h-5 w-5 text-slate-400" />
  if (index === 2) return <Award className="h-5 w-5 text-amber-700" />
  return <span className="text-sm font-medium text-muted-foreground">{index + 1}</span>
}

// Fotos de perfil del equipo: guardá los archivos en public/avatars/ y
// mapeá acá el primer nombre (en minúsculas, sin tildes) al archivo.
// Sin entrada, se muestran las iniciales.
const TEAM_AVATARS: Record<string, string> = {}
function avatarSrc(nombre: string): string | undefined {
  const first = nombre.trim().split(/\s+/)[0]
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  return TEAM_AVATARS[first]
}

function playUnlockSound() {
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass) return
  const context = new AudioContextClass()
  const now = context.currentTime
  ;[523.25, 659.25, 783.99].forEach((frequency, index) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = "sine"
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, now + index * 0.1)
    gain.gain.exponentialRampToValueAtTime(0.42, now + index * 0.1 + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.1 + 0.22)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(now + index * 0.1)
    oscillator.stop(now + index * 0.1 + 0.24)
  })
  window.setTimeout(() => void context.close(), 900)
}

function CommissionTrack({ rate }: { rate: number }) {
  const levels = [8, 9, 10, 11, 12]
  const progress = Math.max(0, Math.min(100, ((rate - 8) / 4) * 100))
  return (
    <div>
      <div className="mb-2 flex items-end justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[.16em] text-white/45">Comisión actual</p>
          <p className="text-4xl font-black tracking-tight text-white">{rate}%</p>
        </div>
        <div className="flex gap-1" aria-label={`${Math.max(1, levels.filter(level => rate >= level).length)} estrellas`}>
          {levels.map((level) => <Star key={level} className={cn("h-5 w-5 transition-all duration-700", rate >= level ? "fill-amber-300 text-amber-300 drop-shadow-[0_0_8px_rgba(252,211,77,.7)]" : "text-white/15")} />)}
        </div>
      </div>
      <div className="relative pt-5">
        <div className="h-4 overflow-hidden rounded-full border border-white/10 bg-black/35 shadow-inner">
          <div className="h-full rounded-full bg-gradient-to-r from-violet-500 via-amber-300 to-yellow-100 shadow-[0_0_20px_rgba(251,191,36,.55)] transition-[width] duration-1000 ease-out" style={{ width: `${Math.max(rate >= 8 ? 4 : 0, progress)}%` }} />
        </div>
        <div className="absolute inset-x-0 top-0 flex justify-between">
          {levels.map(level => <span key={level} className={cn("text-[10px] font-black", rate >= level ? "text-amber-200" : "text-white/30")}>{level}%</span>)}
        </div>
      </div>
    </div>
  )
}

function SetterCommissionTrack({ rate }: { rate: number }) {
  const levels = [4, 4.5, 5, 5.5, 6]
  const progress = Math.max(0, Math.min(100, ((rate - 4) / 2) * 100))
  return (
    <div>
      <div className="mb-2 flex items-end justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[.16em] text-white/45">Comisión actual</p>
          <p className="text-4xl font-black tracking-tight text-white">{rate}%</p>
        </div>
        <div className="flex gap-1" aria-label={`${levels.filter(level => rate >= level).length} estrellas`}>
          {levels.map((level) => <Star key={level} className={cn("h-5 w-5 transition-all duration-700", rate >= level ? "fill-cyan-300 text-cyan-300 drop-shadow-[0_0_8px_rgba(103,232,249,.7)]" : "text-white/15")} />)}
        </div>
      </div>
      <div className="relative pt-5">
        <div className="h-4 overflow-hidden rounded-full border border-white/10 bg-black/35 shadow-inner">
          <div className="h-full rounded-full bg-gradient-to-r from-blue-600 via-cyan-300 to-emerald-200 shadow-[0_0_20px_rgba(34,211,238,.5)] transition-[width] duration-1000 ease-out" style={{ width: `${Math.max(rate >= 4 ? 4 : 0, progress)}%` }} />
        </div>
        <div className="absolute inset-x-0 top-0 flex justify-between">
          {levels.map(level => <span key={level} className={cn("text-[10px] font-black", rate >= level ? "text-cyan-200" : "text-white/30")}>{level}%</span>)}
        </div>
      </div>
    </div>
  )
}

function CloserGameCard({ closer, index, businessGoal }: { closer: CloserData; index: number; businessGoal: number }) {
  const uses2026Scheme = businessGoal === 100000
  const commissionCc = uses2026Scheme ? closer.cc_total : closer.cc_ponderado
  const nextCash = closer.personal_goal || (uses2026Scheme ? closer.next_target : businessGoal)
  const cashProgress = Math.min(100, (commissionCc / nextCash) * 100)
  const nextLabel = closer.personal_goal ? "Objetivo personal del mes" : uses2026Scheme ? `Desbloquea ${closer.next_rate}%${closer.next_rate === 12 ? " · solo Top 1" : ""}` : "Meta del negocio"
  return (
    <article className="group relative overflow-hidden rounded-[30px] border border-white/10 bg-gradient-to-br from-zinc-900/95 via-zinc-950 to-violet-950/50 p-5 shadow-[0_22px_70px_rgba(0,0,0,.32)] transition duration-300 hover:-translate-y-1 hover:border-amber-300/30 sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-violet-500/15 blur-3xl transition group-hover:bg-amber-300/15" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[.07]"><RankIcon index={index} /></div>
          <Avatar className="h-12 w-12 border border-white/10">
            <AvatarImage src={avatarSrc(closer.nombre)} alt={closer.nombre} />
            <AvatarFallback className="bg-white/10 text-white font-black">{closer.initials}</AvatarFallback>
          </Avatar>
          <div><h3 className="text-xl font-black text-white sm:text-2xl">{closer.nombre}</h3><p className="text-xs font-bold uppercase tracking-[.16em] text-white/40">Closer · Nivel {closer.nivel}</p></div>
        </div>
        <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-right"><p className="text-[10px] font-black uppercase text-emerald-200/60">Comisión</p><p className="text-lg font-black text-emerald-300">{fUSD(closer.comisiones)}</p><p className="text-[9px] font-bold text-emerald-100/45">Base neta {fUSD(closer.commissionable_cc)}</p></div>
      </div>
      <div className="relative mt-5 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl border border-violet-300/15 bg-violet-400/[.07] p-3"><p className="text-[10px] font-black uppercase text-white/35">CC Cuenta A</p><p className="text-lg font-black text-violet-200">{fUSD(closer.cc_paul)}</p></div>
        <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/[.07] p-3"><p className="text-[10px] font-black uppercase text-white/35">CC Cuenta B</p><p className="text-lg font-black text-cyan-200">{fUSD(closer.cc_cristian)}</p></div>
        <div className="rounded-2xl border border-emerald-300/15 bg-emerald-400/[.07] p-3"><p className="text-[10px] font-black uppercase text-white/35">CC Total</p><p className="text-lg font-black text-emerald-300">{fUSD(closer.cc_total)}</p></div>
      </div>
      <div className="relative mt-6"><CommissionTrack rate={closer.rate ?? (closer.nivel === 3 ? 10 : closer.nivel === 2 ? 9 : 8)} /></div>
      <div className="relative mt-6 rounded-2xl border border-white/[.07] bg-white/[.035] p-4">
        <div className="mb-2 flex justify-between text-xs"><span className="font-bold text-white/55">{nextLabel}</span><span className="font-black text-white">{fUSD(commissionCc)} / {fUSD(nextCash)}</span></div>
        <div className="h-2.5 overflow-hidden rounded-full bg-white/[.07]"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-300 transition-[width] duration-1000" style={{ width: `${cashProgress}%` }} /></div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
          <div><p className="text-[10px] font-black uppercase text-white/35">FECCU</p><p className="text-lg font-black text-emerald-300">{fUSD(closer.feccu)}</p></div>
          <div><p className="text-[10px] font-black uppercase text-white/35">FECCPP</p><p className="text-lg font-black text-cyan-300">{fUSD(closer.feccpp)}</p></div>
          <div><p className="text-[10px] font-black uppercase text-white/35">Unidades</p><p className="text-lg font-black text-white">{closer.unidades || "—"}</p></div>
          <div><p className="text-[10px] font-black uppercase text-white/35">Cierre sobre presentada</p><p className="text-lg font-black text-white">{fPct(closer.tasa_cierre)}</p></div>
          <div><p className="text-[10px] font-black uppercase text-white/35">Calls</p><p className="text-lg font-black text-white">{closer.llamadas || "—"}</p></div>
        </div>
      </div>
    </article>
  )
}

function SetterGameCard({ setter, index, businessGoal }: { setter: SetterData; index: number; businessGoal: number }) {
  const target = setter.personal_goal || setter.next_target || 30000
  const cashProgress = Math.min(100, (setter.cc_total / target) * 100)
  const rate = setter.rate ?? (setter.nivel === 3 ? 5 : setter.nivel === 2 ? 4.5 : 4)
  return (
    <article className="group relative overflow-hidden rounded-[30px] border border-white/10 bg-gradient-to-br from-zinc-900/95 via-zinc-950 to-blue-950/50 p-5 shadow-[0_22px_70px_rgba(0,0,0,.32)] transition duration-300 hover:-translate-y-1 hover:border-cyan-300/30 sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-blue-500/15 blur-3xl transition group-hover:bg-cyan-300/15" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[.07]"><RankIcon index={index} /></div>
          <Avatar className="h-12 w-12 border border-white/10">
            <AvatarImage src={avatarSrc(setter.nombre)} alt={setter.nombre} />
            <AvatarFallback className="bg-white/10 font-black text-white">{setter.initials}</AvatarFallback>
          </Avatar>
          <div><h3 className="text-xl font-black text-white sm:text-2xl">{setter.nombre}</h3><p className="text-xs font-bold uppercase tracking-[.16em] text-white/40">Setter · Nivel {setter.nivel}</p></div>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:w-auto">
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-right">
            <p className="text-[10px] font-black uppercase text-emerald-200/60">Comisión</p>
            <p className="text-lg font-black text-emerald-300">{fUSD(setter.comisiones)}</p>
          </div>
        </div>
      </div>
      <div className="relative mt-5 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl border border-violet-300/15 bg-violet-400/[.07] p-3"><p className="text-[10px] font-black uppercase text-white/35">CC Cuenta A</p><p className="text-lg font-black text-violet-200">{fUSD(setter.cc_paul)}</p></div>
        <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/[.07] p-3"><p className="text-[10px] font-black uppercase text-white/35">CC Cuenta B</p><p className="text-lg font-black text-cyan-200">{fUSD(setter.cc_cristian)}</p></div>
        <div className="rounded-2xl border border-emerald-300/15 bg-emerald-400/[.07] p-3"><p className="text-[10px] font-black uppercase text-white/35">CC Total</p><p className="text-lg font-black text-emerald-300">{fUSD(setter.cc_total)}</p></div>
      </div>
      <div className="relative mt-6"><SetterCommissionTrack rate={rate} /></div>
      <div className="relative mt-6 rounded-2xl border border-white/[.07] bg-white/[.035] p-4">
        <div className="mb-2 flex justify-between text-xs"><span className="font-bold text-white/55">{setter.personal_goal ? "Objetivo personal del mes" : `Desbloquea ${setter.next_rate}%${setter.next_rate === 6 ? " · solo Top 1" : ""}`}</span><span className="font-black text-white">{fUSD(setter.cc_total)} / {fUSD(target)}</span></div>
        <div className="h-2.5 overflow-hidden rounded-full bg-white/[.07]"><div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-300 transition-[width] duration-1000" style={{ width: `${cashProgress}%` }} /></div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
          <div><p className="text-[10px] font-black uppercase text-white/35">FECCU ≤30d</p><p className="text-lg font-black text-emerald-300">{fUSD(setter.feccu)}</p></div>
          <div><p className="text-[10px] font-black uppercase text-white/35">FECCPP ≤30d</p><p className="text-lg font-black text-cyan-300">{fUSD(setter.feccpp)}</p></div>
          <div><p className="text-[10px] font-black uppercase text-white/35">Agendas</p><p className="text-lg font-black text-white">{setter.agendas || "—"}</p></div>
          <div><p className="text-[10px] font-black uppercase text-white/35">Calificadas</p><p className="text-lg font-black text-white">{setter.agendas_ab || "—"}</p></div>
          <div><p className="text-[10px] font-black uppercase text-white/35">T. agenda</p><p className="text-lg font-black text-white">{setter.t_agenda !== null ? fPct(setter.t_agenda) : "—"}</p></div>
        </div>
      </div>
    </article>
  )
}

function StrikeCounter({ strike }: { strike: Strike }) {
  const [loading, setLoading] = useState(false)
  const setCount = async (n: number) => {
    if (loading || n === strike.count) return
    setLoading(true)
    await fetch("/api/strikes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: strike.id, count: n }) })
    await mutate("/api/strikes")
    setLoading(false)
  }
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5">
        <Avatar className="h-8 w-8"><AvatarFallback className="bg-muted text-muted-foreground text-xs font-semibold">{strike.nombre.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
        <div><p className="text-sm font-medium leading-tight">{strike.nombre}</p><p className="text-xs text-muted-foreground">{strike.rol}</p></div>
      </div>
      <div className="ml-auto flex items-center gap-1">
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : (
          [0, 1, 2].map((n) => (
            <button key={n} onClick={() => setCount(n)} className={cn(
              "w-8 h-8 rounded-md text-sm font-semibold border transition-colors",
              strike.count === n
                ? n === 0 ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                  : n === 1 ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                  : "bg-red-500/10 text-red-600 border-red-500/30"
                : "bg-transparent text-muted-foreground border-border hover:bg-muted"
            )}>{n}</button>
          ))
        )}
      </div>
    </div>
  )
}

export default function EquipoPage() {
  const session = useSession()
  const isManager = session.rol === "CEO" || session.rol === "Contaduria"
  const monthList = useMemo(() => getMonthList(), [])
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  })
  // El toggle de sonido se saco de la UI a pedido de Cuenta A (no lo quiere ver
  // en Equipo); el sonido de logro queda activo siempre, sin control visible.
  const soundEnabled = true
  const [unlock, setUnlock] = useState<{ nombre: string; rate: number } | null>(null)

  const monthLabel = useMemo(() => monthList.find(m => m.value === selectedMonth)?.label ?? selectedMonth, [monthList, selectedMonth])
  const businessGoal = selectedMonth >= "2026-08" ? 100000 : 50000

  const { data: raw, isLoading: lbLoading } = useSWR<LeaderboardData>(
    `/api/leaderboard?month=${selectedMonth}`, fetcher, { revalidateOnFocus: false }
  )
  // Strikes son informacion de auditoria interna para Cuenta A/CEO; el equipo
  // (closers/setters) nunca debe verlas, ni el conteo ni el endpoint.
  const { data: strikes, isLoading: strikesLoading } = useSWR<Strike[]>(isManager ? "/api/strikes" : null, fetcher)

  const closers = raw?.closers || []
  const setters = raw?.setters || []
  const csmCc = raw?.csm_cc ?? 0
  const csmComision = raw?.csm_comision ?? 0
  const teamCCTotal = raw?.team_cc_total ?? raw?.team_cc_pond ?? 0
  const goalBuckets = [
    { label: "FECCU", value: raw?.team_feccu ?? 0, goal: 60000, color: "from-violet-600 to-fuchsia-400" },
    { label: "FECCPP", value: raw?.team_feccpp ?? 0, goal: 20000, color: "from-cyan-500 to-blue-400" },
    { label: "BECCU", value: raw?.team_beccu ?? 0, goal: 20000, color: "from-orange-500 to-amber-300" },
  ]
  const goalCollected = goalBuckets.reduce((sum, bucket) => sum + bucket.value, 0)

  useEffect(() => {
    if (!raw?.closers?.length) return
    const storageKey = `yy-leaderboard-levels-${selectedMonth}`
    const current = Object.fromEntries(raw.closers.map(c => [c.nombre, c.rate]))
    const savedRaw = window.localStorage.getItem(storageKey)
    if (!savedRaw) {
      window.localStorage.setItem(storageKey, JSON.stringify(current))
      return
    }
    try {
      const saved = JSON.parse(savedRaw) as Record<string, number>
      const promoted = raw.closers.find(c => typeof saved[c.nombre] === "number" && c.rate > saved[c.nombre])
      if (promoted) {
        setUnlock({ nombre: promoted.nombre, rate: promoted.rate })
        if (soundEnabled) playUnlockSound()
        window.setTimeout(() => setUnlock(null), 6500)
      }
    } catch {
      // A stale local preference must never block the leaderboard.
    }
    window.localStorage.setItem(storageKey, JSON.stringify(current))
  }, [raw, selectedMonth, soundEnabled])

  const closerTotals = useMemo(() => ({
    cc_total: closers.reduce((s, c) => s + c.cc_total, 0),
    cc_paul: closers.reduce((s, c) => s + c.cc_paul, 0),
    cc_cristian: closers.reduce((s, c) => s + c.cc_cristian, 0),
    cc_ponderado: closers.reduce((s, c) => s + c.cc_ponderado, 0),
    unidades: closers.reduce((s, c) => s + c.unidades, 0),
    fees: closers.reduce((s, c) => s + c.fees, 0),
    llamadas: closers.reduce((s, c) => s + c.llamadas, 0),
    comisiones: closers.reduce((s, c) => s + c.comisiones, 0),
  }), [closers])

  const setterTotals = useMemo(() => ({
    cc_total: setters.reduce((s, c) => s + c.cc_total, 0),
    cc_paul: setters.reduce((s, c) => s + c.cc_paul, 0),
    cc_cristian: setters.reduce((s, c) => s + c.cc_cristian, 0),
    unidades: setters.reduce((s, c) => s + c.unidades, 0),
    fees: setters.reduce((s, c) => s + c.fees, 0),
    agendas: setters.reduce((s, c) => s + c.agendas, 0),
    agendas_ab: setters.reduce((s, c) => s + c.agendas_ab, 0),
    comisiones: setters.reduce((s, c) => s + c.comisiones, 0),
  }), [setters])

  return (
    <div className="crm-module-page">
      <CrmPageIntro
        eyebrow="Leaderboard comercial"
        title="Equipo comercial"
        description="Niveles y comisiones calculados con el rendimiento real del período."
        icon={<Trophy className="h-6 w-6" />}
        tone="amber"
        actions={<>
          <Button asChild variant="outline" className="border-white/10 bg-white/10 text-white hover:bg-white/15 hover:text-white"><Link href="/esquema-comisiones"><BadgeDollarSign className="mr-2 h-4 w-4" />Comisiones</Link></Button>
          {!lbLoading && teamCCTotal > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs text-white/55">
              CC Total: <span className="font-bold text-white">{fUSD(teamCCTotal)}</span>
            </div>
          )}
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2.5">
            <span className="mr-1 text-[10px] font-black uppercase tracking-wider text-white/40">Mes</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="cursor-pointer bg-transparent text-sm font-bold text-white focus:outline-none [&_option]:text-zinc-950"
            >
              {monthList.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </>}
      />

      {unlock && (
        <div className="fixed inset-x-4 top-24 z-[100] mx-auto max-w-xl animate-in slide-in-from-top-6 fade-in duration-500">
          <div className="rounded-[28px] border border-amber-200/40 bg-gradient-to-br from-amber-300 via-yellow-500 to-violet-700 p-[1px] shadow-[0_24px_90px_rgba(251,191,36,.4)]">
            <div className="rounded-[27px] bg-zinc-950/95 px-6 py-5 text-center backdrop-blur-xl">
              <Sparkles className="mx-auto mb-2 h-7 w-7 text-amber-300" />
              <p className="text-xs font-black uppercase tracking-[.24em] text-amber-200">Logro desbloqueado</p>
              <p className="mt-1 text-2xl font-black text-white">{unlock.nombre} pasó al {unlock.rate}%</p>
              <p className="mt-1 text-sm font-medium text-white/55">Bien ahí. Ahora no te mandes cagadas y cuidá el nivel.</p>
            </div>
          </div>
        </div>
      )}

      <section className="overflow-hidden rounded-[30px] border border-white/10 bg-zinc-950 p-5 text-white shadow-[0_22px_70px_rgba(0,0,0,.28)] sm:p-7">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div><p className="text-xs font-black uppercase tracking-[.18em] text-violet-300">Objetivo mensual del negocio</p><p className="mt-1 text-3xl font-black sm:text-4xl">{fUSD(goalCollected)} <span className="text-lg text-white/35">/ {fUSD(businessGoal)}</span></p></div>
          <p className="text-2xl font-black text-amber-300">{Math.min(100, Math.round((goalCollected / businessGoal) * 100))}%</p>
        </div>
        <div className="mt-5 flex gap-1">
          {goalBuckets.map((bucket) => (
            <div key={bucket.label} style={{ width: `${(bucket.goal / businessGoal) * 100}%` }}>
              <div className="mb-2 flex items-end justify-between gap-2 text-[10px] font-black uppercase tracking-wider">
                <span className="text-white/70">{bucket.label}</span>
                <span className="text-white/40">{fUSD(bucket.value)} / {fUSD(bucket.goal)}</span>
              </div>
              <div className="h-5 overflow-hidden rounded-md border border-white/10 bg-white/[.06]">
                <div className={`h-full bg-gradient-to-r ${bucket.color} transition-[width] duration-1000`} style={{ width: `${Math.min(100, (bucket.value / bucket.goal) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[10px] font-black uppercase tracking-wider text-white/30"><span>$0</span><span>$60K</span><span>$80K</span><span>$100K</span></div>
      </section>

      <div className="crm-kpis">
        <CrmStat label="CC total equipo" value={fUSD(teamCCTotal)} detail={monthLabel} icon={<Target className="h-5 w-5" />} tone="amber" />
        <CrmStat label="Unidades cerradas" value={closerTotals.unidades} detail={`${closerTotals.fees} fees adicionales`} icon={<Trophy className="h-5 w-5" />} tone="red" />
        <CrmStat label="Agendas setters" value={setterTotals.agendas} detail={`${setterTotals.agendas_ab} calificadas presentadas`} icon={<Users className="h-5 w-5" />} tone="blue" />
        <CrmStat label="Comisiones" value={fUSD(closerTotals.comisiones + setterTotals.comisiones + csmComision)} detail="closers + setters + CSM" icon={<Coins className="h-5 w-5" />} tone="emerald" />
      </div>

      {lbLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* CLOSERS */}
          <section>
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-300/10"><TrendingUp className="h-6 w-6 text-amber-400" /></div>
              <div><h2 className="text-3xl font-black tracking-tight">Closers</h2><p className="text-sm text-muted-foreground">Progreso individual, nivel y comisión en tiempo real</p></div>
            </div>
            {closers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Sin datos para {monthLabel}</p>
            ) : (
              <>
                <div className="grid gap-5 xl:grid-cols-2">
                  {closers.map((closer, index) => <CloserGameCard key={closer.nombre} closer={closer} index={index} businessGoal={businessGoal} />)}
                </div>
                <div className="hidden">
                <div className="crm-mobile-stack">
                  {closers.map((m, i) => (
                    <article key={m.nombre} className="premium-panel p-4">
                      <div className="flex items-center justify-between"><div className="flex items-center gap-3"><RankIcon index={i} /><Avatar className="h-9 w-9"><AvatarFallback className="bg-primary/10 text-xs font-black text-primary">{m.initials}</AvatarFallback></Avatar><div><p className="text-sm font-black">{m.nombre}</p><NivelBadge nivel={m.nivel} /></div></div><p className="text-lg font-black text-primary">{fUSD(m.cc_total)}</p></div>
                      <div className="mt-3 grid grid-cols-3 gap-2 rounded-2xl bg-black/[.025] p-3 text-center dark:bg-white/[.03]"><div><p className="crm-stat-label">Unidades</p><p className="font-black">{m.unidades || "—"}</p></div><div><p className="crm-stat-label">TC</p><p className="font-black">{fPct(m.tc_ab)}</p></div><div><p className="crm-stat-label">Comisión</p><p className="font-black text-emerald-600">{fUSD(m.comisiones)}</p></div></div>
                    </article>
                  ))}
                </div>
                <Card className="crm-desktop-table border border-border">
                  <CardContent className="pt-4">
                    <div className="crm-scroll-shell">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="w-8 text-xs font-semibold uppercase text-muted-foreground">#</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Closer</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Nivel</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">CC Total</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Unidades Cerradas</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Fees</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Calls Atendidas</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Tasa de Cierre (Presentadas)</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">AOV TC</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Comisiones</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {closers.map((m, i) => (
                            <TableRow key={m.nombre} className="hover:bg-muted/50">
                              <TableCell><RankIcon index={i} /></TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Avatar className="h-7 w-7">
                                    <AvatarImage src={avatarSrc(m.nombre)} alt={m.nombre} />
                                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{m.initials}</AvatarFallback>
                                  </Avatar>
                                  <span className="font-medium whitespace-nowrap">{m.nombre}</span>
                                </div>
                              </TableCell>
                              <TableCell><NivelBadge nivel={m.nivel} /></TableCell>
                              <TableCell className="text-sm whitespace-nowrap">{fUSD(m.cc_total)}</TableCell>
                              <TableCell className="text-center text-sm">{m.unidades || "—"}</TableCell>
                              <TableCell className="text-center text-sm">{m.fees || "—"}</TableCell>
                              <TableCell className="text-center text-sm">{m.llamadas || "—"}</TableCell>
                              <TableCell className="text-sm whitespace-nowrap">{fPct(m.tc_ab)}</TableCell>
                              <TableCell className="text-sm whitespace-nowrap">{m.aov > 0 ? fUSD(m.aov) : "—"}</TableCell>
                              <TableCell className="text-sm font-medium text-emerald-600 whitespace-nowrap">{fUSD(m.comisiones)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-muted/30 font-semibold">
                            <TableCell /><TableCell className="text-xs uppercase text-muted-foreground">Totales</TableCell>
                            <TableCell />
                            <TableCell className="whitespace-nowrap">{fUSD(closerTotals.cc_total)}</TableCell>
                            <TableCell className="text-center">{closerTotals.unidades || "—"}</TableCell>
                            <TableCell className="text-center">{closerTotals.fees || "—"}</TableCell>
                            <TableCell className="text-center">{closerTotals.llamadas || "—"}</TableCell>
                            <TableCell />
                            <TableCell />
                            <TableCell className="text-emerald-600 whitespace-nowrap">{fUSD(closerTotals.comisiones)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
                </div>
              </>
            )}
          </section>

          {/* SETTERS */}
          <section>
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10"><Users className="h-6 w-6 text-cyan-400" /></div>
              <div><h2 className="text-3xl font-black tracking-tight">Setters</h2><p className="text-sm text-muted-foreground">Progreso individual, nivel y comisión en tiempo real</p></div>
            </div>
            {setters.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Sin datos para {monthLabel}</p>
            ) : (
              <>
                <div className="grid gap-5 xl:grid-cols-2">
                  {setters.map((setter, index) => <SetterGameCard key={setter.nombre} setter={setter} index={index} businessGoal={businessGoal} />)}
                </div>
                <Card className="hidden">
                  <CardContent className="pt-4">
                    <div className="crm-scroll-shell">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="w-8 text-xs font-semibold uppercase text-muted-foreground">#</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Setter</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Nivel</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">CC Total</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Unidades Cerradas</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Fees</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Agendas Totales</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Agendas Calificadas Presentadas</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Tasa de Agenda</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Comisiones</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {setters.map((m, i) => (
                            <TableRow key={m.nombre} className="hover:bg-muted/50">
                              <TableCell><RankIcon index={i} /></TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Avatar className="h-7 w-7">
                                    <AvatarImage src={avatarSrc(m.nombre)} alt={m.nombre} />
                                    <AvatarFallback className="bg-blue-500/10 text-blue-600 text-xs font-semibold">{m.initials}</AvatarFallback>
                                  </Avatar>
                                  <span className="font-medium whitespace-nowrap">{m.nombre}</span>
                                </div>
                              </TableCell>
                              <TableCell><NivelBadge nivel={m.nivel} /></TableCell>
                              <TableCell className="font-semibold text-blue-600 whitespace-nowrap">{fUSD(m.cc_total)}</TableCell>
                              <TableCell className="text-center text-sm">{m.unidades || "—"}</TableCell>
                              <TableCell className="text-center text-sm">{m.fees || "—"}</TableCell>
                              <TableCell className="text-center text-sm">{m.agendas || "—"}</TableCell>
                              <TableCell className="text-center text-sm">{m.agendas_ab || "—"}</TableCell>
                              <TableCell className="text-sm whitespace-nowrap">{m.t_agenda !== null ? fPct(m.t_agenda) : <span className="text-muted-foreground/50 text-xs">sin conv.</span>}</TableCell>
                              <TableCell className="text-sm font-medium text-emerald-600 whitespace-nowrap">{fUSD(m.comisiones)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-muted/30 font-semibold">
                            <TableCell /><TableCell className="text-xs uppercase text-muted-foreground">Totales</TableCell>
                            <TableCell />
                            <TableCell className="text-blue-600 whitespace-nowrap">{fUSD(setterTotals.cc_total)}</TableCell>
                            <TableCell className="text-center">{setterTotals.unidades || "—"}</TableCell>
                            <TableCell className="text-center">{setterTotals.fees || "—"}</TableCell>
                            <TableCell className="text-center">{setterTotals.agendas || "—"}</TableCell>
                            <TableCell className="text-center">{setterTotals.agendas_ab || "—"}</TableCell>
                            <TableCell />
                            <TableCell className="text-emerald-600 whitespace-nowrap">{fUSD(setterTotals.comisiones)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </section>
        </>
      )}

      {/* CSM + STRIKES */}
      <div className={cn("grid grid-cols-1 gap-6", isManager && "sm:grid-cols-2")}>
        <Card className="border border-border">
          <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">CSM</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Avatar className="h-12 w-12 border-2 border-border">
                <AvatarFallback className="bg-primary/10 text-primary font-semibold">TO</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">Tony</p>
                <p className="text-xs text-muted-foreground">Customer Success Manager</p>
                <p className="text-sm text-muted-foreground mt-1">
                  CC Backend: <span className="font-medium text-foreground">{lbLoading ? "..." : csmCc > 0 ? fUSD(csmCc) : "—"}</span>
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Comisiones (5%): <span className="font-medium text-emerald-600">{lbLoading ? "..." : csmComision > 0 ? fUSD(csmComision) : "—"}</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        {isManager && (
          <Card className="border border-border">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <CardTitle className="text-base font-semibold">Strikes</CardTitle>
                <span className="text-xs text-muted-foreground ml-1">clic en 0 / 1 / 2 para actualizar</span>
              </div>
            </CardHeader>
            <CardContent>
              {strikesLoading ? (
                <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="space-y-2">
                  {strikes?.map((s) => <StrikeCounter key={s.id} strike={s} />)}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

    </div>
  )
}
