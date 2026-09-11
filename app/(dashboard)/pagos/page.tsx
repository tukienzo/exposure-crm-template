"use client"
import { CircleDollarSign, PlusCircle } from "lucide-react"
import { ModuleTabs } from "@/components/module-tabs"
import TodosPagosPage from "../todos-pagos/page"
import CargaPagosPage from "../carga-pagos/page"

export default function PagosHub() { return <ModuleTabs title="Pagos" subtitle="" tabs={[
  { id: "lista", label: "Todos los pagos", hint: "control e historial", icon: <CircleDollarSign className="h-4 w-4" />, content: <TodosPagosPage /> },
  { id: "carga", label: "Cargar pago", hint: "venta, fee o cuota", icon: <PlusCircle className="h-4 w-4" />, content: <CargaPagosPage /> },
]} /> }
