import Link from "next/link"
import {
  AlertTriangle, ArrowRight, Bot, CalendarCheck, CheckCircle2,
  CircleDollarSign, FileWarning, Kanban, MessageCircle, Receipt,
  Smartphone, Trophy, Users,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const steps = [
  ["01", "Inicio", "Resolver primero vencidos, faltantes y registros sin responsable. El panel de Reconciliación CEO (Revenue vs Cash Collected) vive acá para roles CEO/Contaduría.", "/", "Abrir Inicio", CalendarCheck],
  ["02", "Pipeline", "Después de cada call: show/no-show, resultado, motivo, oferta/plan y próxima acción.", "/pipeline", "Abrir Pipeline", Kanban],
  ["03", "Cobros", "Trabajar Sin gestionar; registrar contacto, promesa y fecha siguiente.", "/recordatorios", "Abrir Cobros", MessageCircle],
  ["04", "Pagos", "Cargar dinero efectivamente recibido con monto, medio, fecha y respaldo.", "/carga-pagos", "Cargar pago", Receipt],
  ["05", "Leaderboard", "Nivel, comisión y ranking de closers/setters con foto de perfil real. Tablero semanal compara el avance vs meta prorrateada.", "/equipo", "Abrir Leaderboard", Trophy],
  // Paso "Conflictos de identidad" sacado del SOP: la pantalla ya no está en
  // el nav (feedback 23/07 lote 2). La deteccion/cola siguen existiendo como
  // utilidad interna (/api/identity-sweep, /api/identity-conflicts) por si
  // hace falta en el futuro, solo no tienen pantalla visible.
] as const

const roles = [
  ["CEO / Cuenta A", "Revisa Revenue, Cash, ROAS, períodos, matches en revisión, excepciones, exportaciones y cambios estructurales."],
  ["Closer", "Completa la llamada y seguimiento el mismo día. La IA y Fathom aportan evidencia, no reemplazan su carga."],
  ["Setter", "Completa fuente/UTM/ManyChat, asignación y scoring. S/A/B es calificada; nunca pisa manual con shadow."],
  ["Precaller (pausado)", "Desde agosto de 2026 el paso está oculto por el experimento sin precaller. El histórico se conserva para reactivarlo sin perder datos."],
  ["CSM / Tony", "Completa formulario, contrato, accesos, onboarding, objetivos/dolores, T1–T4, accionables y upsell."],
  ["Contenido · Cuenta B / Editor", "Pestaña Semanal: cargan/editan fecha, responsable, guion, formato y ángulo (reemplaza Notion). Pestaña Métricas: leen tasas con N y cobertura explícita."],
]

const fields = [
  ["Revenue", "Valor contractual total vendido."],
  ["Cash Collected", "Dinero efectivamente ingresado."],
  ["Calificada", "Exclusivamente S/A/B."],
  ["Próxima acción", "Responsable + acción + fecha."],
  ["Confianza", "Calidad de la evidencia; no probabilidad de compra."],
  ["Sin datos", "No existen filas/evidencia. No significa cero."],
]

export default function SopCrmPage() {
  return (
    <div className="page-enter mx-auto max-w-6xl space-y-8 p-4 sm:p-6 lg:p-8 xl:p-10">
      <header className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-zinc-950 to-zinc-800 p-7 text-white shadow-2xl sm:p-10">
        <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-red-600/25 blur-3xl" />
        <Badge className="mb-4 bg-white/10 text-white hover:bg-white/10">SOP DEL CRM</Badge>
        <h1 className="max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">Operación diaria por rol</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">
          El CRM es la fuente de cumplimiento. Fathom, ManyChat, iClosed y WhatsApp VENTAS lo alimentan con trazabilidad; sin datos nunca se completa con cero.
        </p>
      </header>

      <section className="grid gap-4">
        {steps.map(([number, title, description, href, action, Icon]) => (
          <article key={number} className="surface surface-hover p-5 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Icon className="h-6 w-6" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold tracking-widest text-muted-foreground">PASO {number}</p>
                <h2 className="mt-1 text-xl font-bold">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
              </div>
              <Button asChild variant="outline"><Link href={href}>{action}<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
            </div>
          </article>
        ))}
      </section>

      <section>
        <div className="mb-4 flex items-center gap-2"><Users className="h-5 w-5 text-primary" /><h2 className="text-xl font-black">Responsabilidad por rol</h2></div>
        <div className="grid gap-3 md:grid-cols-2">
          {roles.map(([role, text]) => <Rule key={role} title={role} text={text} />)}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center gap-2"><CircleDollarSign className="h-5 w-5 text-primary" /><h2 className="text-xl font-black">Campos que no se mezclan</h2></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map(([field, text]) => <Rule key={field} title={field} text={text} />)}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Info icon={Bot} title="Automatizaciones" text="Cada 30 min: Fathom; catálogo ManyChat y señales recibidas; últimas 500 llamadas iClosed con respuestas/UTM/IDs; y asignaciones explícitas del export WhatsApp VENTAS. Meta CAPI corre en su job separado. Todo es idempotente y vincula solo por identidad estable." />
        <Info icon={FileWarning} title="Siempre humano" text="Calificación ambigua, motivo de no cierre, show no confirmado, oferta/monto/TC sin evidencia, resolución de identidades, exportación y cambios estructurales." />
        <Info icon={AlertTriangle} title="Si algo no coincide" text="Revisá período, fecha y fuente. Cuotas se corrige en planes_pago, no en la tabla vieja. No tapes una discrepancia con una fila inventada." />
        <Info icon={CheckCircle2} title="Cierre diario" text="Llamadas, cobros y pagos el mismo día; CRM completo antes de las 23:59 Argentina. Domingo cierre semanal; lunes métricas y reporte." />
      </section>

      <section>
        <div className="mb-4 flex items-center gap-2"><Bot className="h-5 w-5 text-primary" /><h2 className="text-xl font-black">Funciones del sistema</h2></div>
        <div className="grid gap-3 md:grid-cols-2">
          <Rule title="Reconciliación CEO (Inicio)" text="Compara Revenue y Cash Collected del sistema contra el corte declarado por Cuenta A. Muestra fórmula, fuente y diferencia exacta; nunca oculta un conflicto ni inventa un número. Solo CEO/Contaduría." />
          <Rule title="Tablero semanal" text="Agendas por origen, scoring S/A/B/C/D, presentadas, ventas, Revenue y Cash Collected por closer en la semana en curso, con avance vs objetivo semanal prorrateado de la meta mensual (USD 50k) y ritmo necesario para las semanas restantes. Todo desde agendas/pagos/planes_pago, con numerador y denominador explícitos." />
          <Rule title="Conflictos de identidad" text="Cola de revisión de colisiones teléfono/Instagram/email (tabla crm_identity_conflicts, solo lectura). Nunca se fusiona automáticamente por nombre; la resolución final la hace una persona con evidencia." />
          <Rule title="Asistente interno" text="Responde 5 consultas deterministas sin IA generativa ni web: teléfono de una persona, ángulos con más leads S, brecha vs meta mensual, mejor mes histórico de Cash Collected, y métricas propias por rol. Cada respuesta trae su fuente/fórmula o dice explícitamente que no hay evidencia suficiente. Consultas globales solo CEO/Contaduría; closers/setters solo ven sus propias métricas. Nunca escribe datos." />
          <Rule title="Avatares del equipo (Leaderboard)" text="Las fotos del equipo van en public/avatars/ y se mapean en la pantalla Equipo; sin foto se muestran las iniciales." />
          <Rule title="Contenido · espacio semanal" text="La pestaña Semanal en /contenido-angulos reúne Esta semana + Biblioteca/Calendario, con detalle por pieza (guion, insight, responsable, ángulo, formato y estado). El planificador histórico de Notion está importado en el CRM. La pestaña Métricas y ángulos concentra la lectura de resultados." />
          <Rule title="Trazabilidad de ángulos" text="Solo se crea persona→ángulo cuando la fuente lo nombra explícitamente (por ejemplo, Recurso = GAME) o una señal estructurada trae primary_angle con evidencia. CTA, título, fecha, palabra parecida o nombre de persona no alcanzan. Sin prueba queda Sin ángulo." />
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[.035] p-5">
        <div className="mb-2 flex items-center gap-2"><Smartphone className="h-5 w-5 text-primary" /><h2 className="text-lg font-black">Instalar como app (PWA)</h2></div>
        <p className="text-sm leading-6 text-muted-foreground">En el celular (Safari/Chrome), abrir el CRM y usar “Agregar a pantalla de inicio” / “Instalar app”. Funciona como app nativa con icono propio; el modo offline solo muestra una pantalla básica de “sin conexión”, nunca cachea datos del CRM (siempre se ven datos en vivo cuando hay señal).</p>
      </section>
    </div>
  )
}

function Rule({ title, text }: { title: string; text: string }) {
  return <article className="rounded-2xl border bg-muted/20 p-5"><h3 className="font-bold">{title}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p></article>
}

function Info({ icon: Icon, title, text }: { icon: typeof Bot; title: string; text: string }) {
  return <article className="rounded-2xl border border-white/10 bg-white/[.035] p-5"><Icon className="h-5 w-5 text-primary" /><h3 className="mt-3 font-bold">{title}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p></article>
}
