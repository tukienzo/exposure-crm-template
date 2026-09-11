"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ShieldAlert } from "lucide-react"
import { cn } from "@/lib/utils"

type Rule = { name: string; detail: string; sanction: string | null; hidden?: boolean }
type Category = { label: string; rules: Rule[] }

const categories: Category[] = [
  {
    label: "Ventas, Cuotas y Recompras",
    rules: [
      {
        name: "Recompras",
        detail: "Un resell o upsell se considera toda venta realizada mientras el cliente tenga estado ACTIVO (acceso vigente y/o pagos al día) o dentro de los 30 días corridos posteriores al vencimiento de su programa. Pasado ese plazo, se considera nueva venta.",
        sanction: null,
      },
      {
        name: "Autorización de recompra",
        detail: 'Todo upsell o resell debe contar con autorización escrita previa por WhatsApp y quedar registrado en el CRM en el campo "Autorización Resell/Upsell". Si no se cumple, no se paga la comisión correspondiente.',
        sanction: "No cobrar la comisión por la venta",
      },
      {
        name: "Sobreventa",
        detail: "Se considera sobreventa: prometer resultados garantizados, ofrecer entregables no incluidos, exagerar casos de éxito, modificar precios o condiciones no aprobadas, u ofrecer beneficios fuera de la propuesta oficial.",
        sanction: "No cobrar la comisión por la venta",
      },
      {
        name: "Completar PIF",
        detail: "El pago PIF debe completarse dentro de los 14 días corridos desde el primer pago del programa. Pasado ese plazo se cobra precio actualizado SIN EXCEPCIÓN, salvo autorización escrita previa al día 15.",
        sanction: "No cobrar la comisión del monto retrasado",
      },
      {
        name: "Cobro de Cuotas",
        detail: "Las cuotas deben cobrarse como máximo el día de vencimiento. Si no se cumple, la primera vez es 1 strike. Desde el día siguiente al vencimiento se descuenta 1% por día de retraso sobre la comisión generada por esa venta.",
        sanction: "1 Strike + 1% descuento por día sobre comisión de esa venta",
      },
      {
        name: "Momento de Upsell",
        detail: 'Los upsells o abonos de diferencia pueden realizarse dentro de los 30 días corridos posteriores al pago inicial. Debe registrarse en CRM con etiqueta "Upsell".',
        sanction: null,
      },
    ],
  },
  {
    label: "Asistencia y Presentación a Llamadas",
    rules: [
      {
        name: "Impuntualidad (Daily/Weekly o Llamadas)",
        detail: "La tolerancia máxima de espera es 10 minutos para reuniones internas y 5 minutos para llamadas de venta, salvo aviso previo mínimo de 1 hora por canal oficial. Fuerza mayor requiere evidencia y notificación inmediata.",
        sanction: "1 Strike",
      },
      {
        name: "Grabación de Llamadas de Venta",
        detail: "Todas las llamadas de venta deben grabarse SIN EXCEPCIONES. Todas las comunicaciones con los leads deben estar registradas, tales como llamadas por teléfono, comunicación ÚNICAMENTE por el grupo de WhatsApp, etc. Si ocurre falla técnica, debe reportarse el mismo día con evidencia (screenshot error).",
        sanction: "No cobrar la comisión por la venta",
      },
      {
        name: "Presentación a Llamadas de Venta",
        detail: "Las llamadas deben realizarse desde computadora, con buena conexión, audio claro y entorno profesional. Excepciones (viaje/emergencia) deben avisarse previamente.",
        sanction: "1 Strike",
      },
      {
        name: "Tratamiento de Leads y Llamadas",
        detail: "No presentarse, reprogramar, eliminar o reasignar un lead requiere autorización escrita del Sales Manager. Razones válidas: conflicto real de horario, problema técnico comprobable o solicitud expresa del lead.",
        sanction: "1 Strike",
      },
    ],
  },
  {
    label: "Horarios y Disponibilidad",
    rules: [
      {
        name: "Horas Abiertas en Calendario",
        detail: "Cada closer debe mantener mínimo 10 horas abiertas por semana dentro del horario operativo (10:00 a 20:00).",
        sanction: "No cobra bonus + si supera 3 días incumplidos = -0,5% comisión del mes",
      },
      {
        name: "Tomarse un día o medio día",
        detail: "Para tomar días libres se requiere aviso mínimo de 7 días corridos. Sin aviso previo aplica 1 strike salvo emergencia validada.",
        sanction: "1 Strike",
      },
      {
        name: "Bloquear horas en calendario",
        detail: "No se puede bloquear más de 2 horas por día dentro del horario operativo (10:00–20:00 ART) sin aviso con una semana de anticipación.",
        sanction: "No cobra bonus",
      },
    ],
  },
  {
    label: "Procesos Administrativos y Reportes",
    rules: [
      {
        name: "EOD",
        detail: "Completar el reporte de fin de día (End of Day) dentro del horario establecido.",
        sanction: "1 Strike",
      },
      {
        name: "CRM",
        detail: "Desde el 1 de agosto de 2026, el CRM debe quedar completo todos los días antes de las 23:59 ARG, sin excepción. Toro puede enviar hasta 4 recordatorios privados durante el día. Los recordatorios son ayuda operativa y no extienden el plazo. A las 23:59 se audita automáticamente: si falta información obligatoria, corresponde strike.",
        sanction: "CRM incompleto a las 23:59 ARG = 1 Strike",
      },
      {
        name: "Tiempos de Respuesta Pre-Call",
        detail: "Todo lead agendado debe recibir respuesta dentro COMO MÁXIMO 2 horas hábiles (dentro de ventana operativa 10:00–23:00).",
        sanction: "1 Strike",
        hidden: true,
      },
      {
        name: "Tiempos de Respuesta Setting",
        detail: "No responder un lead calificado dentro de 12 horas hábiles genera apercibimiento. Reincidencia genera strike.",
        sanction: "1 Apercibimiento + 1 Strike",
      },
      {
        name: "Proceso Pre-Call",
        detail: "No respetar el proceso, dejar un lead sin seguimiento activo por más de 8 horas hábiles o afectar el show-up rate genera strike.",
        sanction: "1 Strike",
        hidden: true,
      },
      {
        name: "Tiempo de Carga de Pagos",
        detail: "Los pagos deben cargarse el mismo día del ingreso, hasta las 23:59 ARG. Si llega después de esa hora, como excepción debe estar cargado como máximo a las 10am del día siguiente.",
        sanction: "1 Strike",
      },
      {
        name: "Detalle Carga de Pagos",
        detail: "Al cargar un pago, todos los campos deben completarse correctamente (monto, medio, fecha, producto, responsable).",
        sanction: "1 Strike",
      },
      {
        name: "Limpiar Carga de Pagos",
        detail: 'Después de cargar un pago debe presionarse "LIMPIAR" para refrescar el sistema. Primera vez apercibimiento, luego strike.',
        sanction: "1 Apercibimiento + 1 Strike",
      },
      {
        name: "Comprobante de Pagos",
        detail: "Los pagos solo se cargan con comprobante enviado correctamente dentro de 3 días corridos. Sin comprobante no se carga y no se paga comisión.",
        sanction: "1 Strike",
      },
      {
        name: "Comprobantes de RECA",
        detail: "Los comprobantes en pesos deben enviarse inmediatamente al grupo de RECA. Demora mayor a 3 horas se considera falta.",
        sanction: "1 Strike",
      },
    ],
  },
  {
    label: "Política de Clientes y Fees",
    rules: [
      {
        name: "Reservas de Cupo",
        detail: "Las reservas de cupo y de precio se hacen por un período MÁXIMO de 30 días (contados desde el momento en que se realiza el pago). No hay devoluciones. Si se encuentra en etapa de venta pública por aumento de precio (Why Now), las reservas de cupo se harán por un período MÁXIMO de 10 días.",
        sanction: null,
      },
      {
        name: "Fees Reembolsables",
        detail: "Los fees de compromiso no son reembolsables pasadas 24 horas de realizado el pago. Apenas se realiza se debe enviar el loom post-fee OBLIGATORIAMENTE.",
        sanction: null,
      },
      {
        name: "Vencimiento de Reservas",
        detail: "Las reservas de cupo tienen validez máxima de 30 días corridos desde el pago (salvo excepciones). No son reembolsables. Si no se concreta la compra dentro del plazo, se pierde el cupo y el monto abonado.",
        sanction: null,
      },
    ],
  },
  {
    label: "Entrega de Servicio",
    rules: [
      {
        name: "Resumen de Wins",
        detail: "El resumen semanal de wins de clientes debe estar completo antes de las 18hs del Lunes de cada semana. El resumen mensual debe estar listo y enviado por el #logros antes de las 18hs del día 1° de cada mes.",
        sanction: "1 Strike",
      },
    ],
  },
  {
    label: "Política de Strikes, Métricas y Atribución",
    rules: [
      {
        name: "Política de Strikes",
        detail: "Desde agosto de 2026, los strikes se cuentan por mes y se reinician el día 1. Cada strike descuenta 0,5 puntos porcentuales sobre la comisión ganada por rendimiento. El piso es 8% para closers y 4% para setters. Los strikes por CRM incompleto se aplican con independencia del Cash Collected y deben informarse con evidencia.",
        sanction: null,
      },
      {
        name: "Fuente Oficial de Métricas",
        detail: "Todas las métricas que determinan comisiones y bonos se toman exclusivamente del CRM y la planilla oficial de métricas. En caso de discrepancia, prevalece el CRM (timestamp y owner).",
        sanction: null,
      },
      {
        name: "Atribución de Ventas",
        detail: "La venta se atribuye al setter dueño del lead en CRM al momento de la reserva. Reasignaciones requieren autorización escrita previa del Sales Manager.",
        sanction: null,
      },
      {
        name: "Proceso de Excepciones y Reclamos",
        detail: "Cualquier reclamo sobre comisiones o sanciones debe presentarse dentro de 48 horas hábiles con evidencia (CRM + grabación). Pasado ese plazo la decisión queda firme.",
        sanction: null,
      },
      {
        name: "Comisiones de Cuotas",
        detail: "Closers: cobran sobre todo el Cash Collected frontend que recolectan (FECCU + FECCPP). Setters: cobran únicamente FECCU + FECCPP recibido entre el primer pago y el día 30 inclusive; desde el día 31 la cuota no genera comisión para el setter. La clasificación se calcula por fecha real de pago, no por una etapa manual. Pagos archivados o reembolsados no computan.",
        sanction: null,
      },
      {
        name: "Competencia individual de comisiones",
        detail: "Closers: 10% base; 11% desde USD 40.000 frontend; 12% solo para el Top Closer desde USD 45.000 en agosto de 2026 y USD 50.000 desde septiembre. Setters: 5% base; 5,5% desde USD 25.000 comisionables en su ventana; 6% solo para el Top Setter desde USD 30.000. Si dos personas superan el máximo, únicamente el puesto #1 accede al porcentaje máximo.",
        sanction: null,
      },
    ],
  },
]

function SanctionBadge({ text }: { text: string }) {
  const t = text.toLowerCase()
  const isStrike = t.includes("strike") && !t.includes("apercibimiento")
  const isBothStrikeAndWarning = t.includes("strike") && t.includes("apercibimiento")
  const isNoComision = t.includes("no cobrar") || t.includes("no se paga")
  const isNoBonus = t.includes("no cobra bonus") || t.includes("no cobra bonus")
  const isWarning = t.includes("apercibimiento") && !t.includes("strike")

  const cls = isBothStrikeAndWarning
    ? "bg-orange-500/10 text-orange-700 border-orange-500/20"
    : isStrike
    ? "bg-red-500/10 text-red-600 border-red-500/20"
    : isNoComision
    ? "bg-red-500/10 text-red-700 border-red-500/20"
    : isNoBonus
    ? "bg-amber-500/10 text-amber-700 border-amber-500/20"
    : isWarning
    ? "bg-yellow-500/10 text-yellow-700 border-yellow-500/20"
    : "bg-muted text-muted-foreground border-border"

  return (
    <Badge variant="outline" className={cn("text-xs font-medium whitespace-normal text-left leading-snug", cls)}>
      {text}
    </Badge>
  )
}

export default function ReglasPage() {
  return (
    <div className="p-6 lg:p-8 space-y-6">

      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-amber-500" />
          Reglas del Equipo
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Reglas comunes aplicables a todo el equipo comercial
        </p>
      </div>

      {categories.map((cat) => (
        <Card key={cat.label} className="border border-border">
          <CardHeader className="pb-3 pt-5">
            <CardTitle className="text-base font-semibold text-foreground">{cat.label}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground w-48">Regla</th>
                    <th className="pb-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Detalle</th>
                    <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground w-56">Sanción</th>
                  </tr>
                </thead>
                <tbody>
                  {cat.rules.filter((rule) => !("hidden" in rule && rule.hidden)).map((rule, i) => (
                    <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30 align-top">
                      <td className="py-3 pr-4 text-sm font-medium text-foreground leading-snug">{rule.name}</td>
                      <td className="py-3 pr-4 text-sm text-muted-foreground leading-relaxed">{rule.detail}</td>
                      <td className="py-3">
                        {rule.sanction
                          ? <SanctionBadge text={rule.sanction} />
                          : <span className="text-muted-foreground/30 text-xs">—</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}

    </div>
  )
}
