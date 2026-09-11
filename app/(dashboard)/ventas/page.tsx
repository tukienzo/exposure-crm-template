"use client"
import { Kanban, Rows3 } from "lucide-react"
import { ModuleTabs } from "@/components/module-tabs"
import PipelinePage from "../pipeline/page"
import AgendasPage from "../centro-agendas/page"

export default function VentasHub() { return <ModuleTabs title="Agendas" subtitle="" initial="pipeline" tabs={[
  { id: "pipeline", label: "Pipeline visual", hint: "mover oportunidades", icon: <Kanban className="h-5 w-5" />, content: <PipelinePage /> },
  { id: "agendas", label: "Vista de agendas", hint: "editar campos", icon: <Rows3 className="h-5 w-5" />, content: <AgendasPage /> },
]} /> }
