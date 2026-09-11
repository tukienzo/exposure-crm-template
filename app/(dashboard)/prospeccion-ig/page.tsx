"use client"

import { DateFilter } from "@/components/date-filter"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { Instagram, MessageCircle, UserPlus, ExternalLink } from "lucide-react"

const prospeccionData = [
  { id: "1", usuario: "@emprendedor.mx", nombre: "Juan Emprendedor", seguidores: "15.2K", estado: "DM Enviado", setter: "Ana Ruiz", fecha: "2024-01-15", respuesta: "Pendiente" },
  { id: "2", usuario: "@coach.fitness", nombre: "María Fitness", seguidores: "28.5K", estado: "Agendado", setter: "Carmen López", fecha: "2024-01-15", respuesta: "Positiva" },
  { id: "3", usuario: "@negocios.online", nombre: "Carlos Business", seguidores: "8.7K", estado: "DM Enviado", setter: "Ana Ruiz", fecha: "2024-01-14", respuesta: "Pendiente" },
  { id: "4", usuario: "@mentor.ventas", nombre: "Roberto Ventas", seguidores: "42.1K", estado: "Seguimiento", setter: "Carmen López", fecha: "2024-01-14", respuesta: "Interesado" },
  { id: "5", usuario: "@digital.mkt", nombre: "Sofía Marketing", seguidores: "19.8K", estado: "No Interesado", setter: "Ana Ruiz", fecha: "2024-01-13", respuesta: "Negativa" },
  { id: "6", usuario: "@crypto.trader", nombre: "Diego Trader", seguidores: "65.3K", estado: "Agendado", setter: "Carmen López", fecha: "2024-01-13", respuesta: "Positiva" },
  { id: "7", usuario: "@life.coaching", nombre: "Laura Coach", seguidores: "11.4K", estado: "DM Enviado", setter: "Ana Ruiz", fecha: "2024-01-12", respuesta: "Pendiente" },
  { id: "8", usuario: "@inversionista", nombre: "Miguel Investor", seguidores: "33.9K", estado: "Seguimiento", setter: "Carmen López", fecha: "2024-01-12", respuesta: "Interesado" },
]

const estadoColors: Record<string, string> = {
  "DM Enviado": "bg-blue-500/10 text-blue-600 border-blue-500/20",
  "Agendado": "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  "Seguimiento": "bg-amber-500/10 text-amber-600 border-amber-500/20",
  "No Interesado": "bg-red-500/10 text-red-600 border-red-500/20",
}

const respuestaColors: Record<string, string> = {
  "Pendiente": "text-muted-foreground",
  "Positiva": "text-emerald-600",
  "Interesado": "text-amber-600",
  "Negativa": "text-red-500",
}

export default function ProspeccionIGPage() {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
    })
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Prospección Instagram</h1>
          <p className="text-sm text-muted-foreground">
            Gestión de prospectos desde Instagram
          </p>
        </div>
        <DateFilter />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <Card className="border border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Instagram className="h-4 w-4 text-pink-500" />
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Prospectos</p>
            </div>
            <p className="text-2xl font-bold mt-1">{prospeccionData.length}</p>
          </CardContent>
        </Card>
        <Card className="border border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <MessageCircle className="h-4 w-4 text-blue-500" />
              <p className="text-xs text-muted-foreground uppercase tracking-wide">DMs Enviados</p>
            </div>
            <p className="text-2xl font-bold mt-1">{prospeccionData.filter(p => p.estado === "DM Enviado").length}</p>
          </CardContent>
        </Card>
        <Card className="border border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <UserPlus className="h-4 w-4 text-emerald-500" />
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Agendados</p>
            </div>
            <p className="text-2xl font-bold mt-1 text-emerald-600">{prospeccionData.filter(p => p.estado === "Agendado").length}</p>
          </CardContent>
        </Card>
        <Card className="border border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Tasa de Conversión</p>
            <p className="text-2xl font-bold mt-1 text-primary">25%</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="border border-border">
        <CardHeader className="pb-0">
          <CardTitle className="text-lg font-semibold">Lista de Prospectos</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Usuario</TableHead>
                  <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Nombre</TableHead>
                  <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Seguidores</TableHead>
                  <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Estado</TableHead>
                  <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Setter</TableHead>
                  <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Fecha</TableHead>
                  <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Respuesta</TableHead>
                  <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Perfil</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prospeccionData.map((prospecto) => (
                  <TableRow key={prospecto.id} className="hover:bg-muted/50">
                    <TableCell>
                      <a 
                        href={`https://instagram.com/${prospecto.usuario.replace("@", "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-sm text-primary hover:underline font-medium"
                      >
                        <Instagram className="h-3 w-3" />
                        {prospecto.usuario}
                      </a>
                    </TableCell>
                    <TableCell className="font-medium">{prospecto.nombre}</TableCell>
                    <TableCell className="text-sm">{prospecto.seguidores}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("font-medium", estadoColors[prospecto.estado])}>
                        {prospecto.estado}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{prospecto.setter}</TableCell>
                    <TableCell className="text-sm">{formatDate(prospecto.fecha)}</TableCell>
                    <TableCell className={cn("text-sm font-medium", respuestaColors[prospecto.respuesta])}>
                      {prospecto.respuesta}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
                        <a 
                          href={`https://instagram.com/${prospecto.usuario.replace("@", "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-4 w-4" />
                          <span className="sr-only">Ver perfil de Instagram</span>
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
