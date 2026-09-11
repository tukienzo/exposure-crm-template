"use client"

import { FormEvent, useState } from "react"
import { Bot, Database, Loader2, Send, ShieldCheck, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useSession } from "@/components/session-provider"
import { cn } from "@/lib/utils"

type Message = { role: "user" | "assistant"; text: string; evidence?: Record<string, unknown> | null; error?: boolean }

const EXAMPLES = [
  "¿Cuánto revenue y cash collected llevamos este mes?",
  "Cruzame las llamadas de un closer con sus cierres y decime su tasa.",
  "¿Qué clientes tienen cuotas vencidas y quién es el closer?",
  "¿Qué ángulos trajeron más leads S este año?",
]

export default function AsistentePage() {
  const session = useSession()
  const [question, setQuestion] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [busy, setBusy] = useState(false)

  async function ask(event?: FormEvent, suggested?: string) {
    event?.preventDefault()
    const text = (suggested || question).trim()
    if (!text || busy) return
    setMessages(current => [...current, { role: "user", text }])
    setQuestion("")
    setBusy(true)
    try {
      const response = await fetch("/api/asistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      })
      const body = await response.json()
      setMessages(current => [...current, {
        role: "assistant",
        text: body.respuesta || body.error || "Sin respuesta",
        evidence: body.evidencia,
        error: !response.ok,
      }])
    } catch {
      setMessages(current => [...current, { role: "assistant", text: "No pude consultar el CRM. Reintentá.", error: true }])
    } finally {
      setBusy(false)
    }
  }

  return <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6 lg:p-8">
    <header className="relative overflow-hidden rounded-[28px] border bg-gradient-to-br from-violet-950 via-zinc-950 to-zinc-900 p-6 text-white shadow-2xl sm:p-8">
      <div className="absolute -right-14 -top-16 h-48 w-48 rounded-full bg-fuchsia-500/20 blur-3xl" />
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-white/10 text-white hover:bg-white/10"><Sparkles className="mr-1 h-3 w-3" /> Asistente CRM</Badge>
        <Badge variant="outline" className="border-emerald-400/30 text-emerald-300"><ShieldCheck className="mr-1 h-3 w-3" /> {session.rol}</Badge>
      </div>
      <h1 className="mt-4 text-3xl font-black tracking-tight">Preguntá cualquier cosa del CRM</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">Cruza pagos, revenue, agendas, llamadas, clientes, cuotas, contenido, métricas y equipo. Siempre consulta los datos antes de responder.</p>
    </header>

    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="min-h-[460px] space-y-4 p-4 sm:p-6">
          {!messages.length && <div className="flex min-h-[390px] flex-col items-center justify-center text-center">
            <span className="grid h-16 w-16 place-items-center rounded-3xl bg-violet-500/10 text-violet-600"><Bot className="h-8 w-8" /></span>
            <h2 className="mt-4 text-lg font-bold">Consulta libre, sin menú de preguntas permitidas</h2>
            <p className="mt-1 max-w-lg text-sm text-muted-foreground">Pedile un dato puntual o que cruce varias partes del CRM.</p>
            <div className="mt-5 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
              {EXAMPLES.map(example => <button key={example} onClick={() => ask(undefined, example)} className="rounded-2xl border p-3 text-left text-sm transition hover:border-violet-500/40 hover:bg-violet-500/5">{example}</button>)}
            </div>
          </div>}
          {messages.map((message, index) => <div key={index} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm", message.role === "user" ? "bg-violet-600 text-white" : message.error ? "border border-red-500/30 bg-red-500/10" : "border bg-muted/40")}>
              <p className="leading-6">{message.text}</p>
              {message.evidence && <details className="mt-3 border-t pt-2 text-xs">
                <summary className="cursor-pointer font-bold"><Database className="mr-1 inline h-3.5 w-3.5" /> Ver consultas usadas</summary>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/5 p-2 font-mono">{JSON.stringify(message.evidence, null, 2)}</pre>
              </details>}
            </div>
          </div>)}
          {busy && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cruzando datos del CRM…</div>}
        </div>
        <form onSubmit={ask} className="border-t bg-muted/20 p-4">
          <div className="flex gap-2">
            <Input aria-label="Pregunta para el CRM" placeholder="Ej: comparame revenue, gasto y ROAS de julio contra junio" value={question} onChange={event => setQuestion(event.target.value)} />
            <Button type="submit" disabled={busy || !question.trim()}><Send className="mr-2 h-4 w-4" /> Preguntar</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  </div>
}
