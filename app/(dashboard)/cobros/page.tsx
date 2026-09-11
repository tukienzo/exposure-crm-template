"use client"
import { BellRing, CalendarClock } from "lucide-react"
import { ModuleTabs } from "@/components/module-tabs"
import RecordatoriosPage from "../recordatorios/page"
import CuotasPage from "../cuotas/page"

export default function CobrosHub() { return <ModuleTabs title="Cuotas y cobros" subtitle="Seguimiento, vencimientos y próximas acciones en un solo lugar" tabs={[
  { id: "recordatorios", label: "Cobros y recordatorios", hint: "qué contactar ahora", icon: <BellRing className="h-4 w-4" />, content: <RecordatoriosPage /> },
  { id: "cuotas", label: "Todas las cuotas", hint: "historial y calendario", icon: <CalendarClock className="h-4 w-4" />, content: <CuotasPage /> },
]} /> }

