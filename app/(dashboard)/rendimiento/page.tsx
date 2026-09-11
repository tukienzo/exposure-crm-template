"use client"
import { BarChart3, CalendarRange, ChartNoAxesCombined } from "lucide-react"
import { ModuleTabs } from "@/components/module-tabs"
import MetricasPage from "../metricas/page"
import EvolucionPage from "../evolucion-diaria/page"
import TableroSemanalPage from "../tablero-semanal/page"

export default function RendimientoHub() { return <ModuleTabs title="Métricas y evolución" subtitle="" tabs={[
  { id: "semanal", label: "Semanal", hint: "semana actual vs meta $50k", icon: <CalendarRange className="h-4 w-4" />, content: <TableroSemanalPage /> },
  { id: "metricas", label: "Métricas", hint: "funnel, cash y conversiones", icon: <BarChart3 className="h-4 w-4" />, content: <MetricasPage /> },
  { id: "evolucion", label: "Evolución", hint: "tendencias en el tiempo", icon: <ChartNoAxesCombined className="h-4 w-4" />, content: <EvolucionPage /> },
]} /> }
