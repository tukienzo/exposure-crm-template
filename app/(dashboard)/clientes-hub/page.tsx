"use client"
import { History, UserRoundCheck } from "lucide-react"
import { ModuleTabs } from "@/components/module-tabs"
import ClientesPage from "../clientes/page"
import HistorialPage from "../historia-leads/page"

export default function ClientesHub() { return <ModuleTabs title="Clientes" subtitle="Activos, pasados y recorrido completo de cada persona" tabs={[
  { id: "activos", label: "Clientes activos", hint: "entrega y seguimiento", icon: <UserRoundCheck className="h-4 w-4" />, content: <ClientesPage /> },
  { id: "historial", label: "Pasados e historial", hint: "ficha integral 2026", icon: <History className="h-4 w-4" />, content: <HistorialPage /> },
]} /> }
