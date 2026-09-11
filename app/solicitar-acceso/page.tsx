"use client"

import { useState } from "react"
import { Loader2, CheckCircle2 } from "lucide-react"

const ROLES = ["Closer", "Setter", "Sales Manager", "Manager MKT", "Contaduria", "CSM", "Editor"]

export default function SolicitarAccesoPage() {
  const [nombre, setNombre] = useState("")
  const [email, setEmail] = useState("")
  const [rol, setRol] = useState("")
  const [password, setPassword] = useState("")
  const [err, setErr] = useState("")
  const [loading, setLoading] = useState(false)
  const [ok, setOk] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr("")
    if (!rol) return setErr("Elegí tu rol.")
    if (password.length < 12) return setErr("La contraseña debe tener al menos 12 caracteres.")
    setLoading(true)
    try {
      const r = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, email, rol, password }),
      }).then((x) => x.json())
      setLoading(false)
      if (r.error) return setErr(r.error)
      setOk(true)
    } catch {
      setLoading(false)
      setErr("Hubo un error. Probá de nuevo.")
    }
  }

  if (ok) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
            <CheckCircle2 className="h-7 w-7 text-emerald-500" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">¡Pedido enviado!</h1>
          <p className="text-sm text-muted-foreground mb-6">
            El dueño tiene que aprobarte. Cuando lo haga, entrá en la pantalla de ingreso con tu mail y la contraseña que elegiste.
          </p>
          <a href="/login" className="text-sm text-primary hover:underline">Ir a ingresar</a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="h-14 w-14 mb-3">
            <circle cx="50" cy="50" r="49" fill="#dc2626" />
            <path d="M50,1 A24.5,24.5,0,0,0,50,50 A24.5,24.5,0,0,1,50,99 A49,49,0,0,0,50,1 Z" fill="white" />
            <circle cx="50" cy="25.5" r="8.17" fill="#dc2626" />
            <circle cx="50" cy="74.5" r="8.17" fill="white" />
          </svg>
          <h1 className="text-xl font-bold text-foreground">Pedir acceso</h1>
          <p className="text-sm text-muted-foreground text-center">Completá tus datos. El dueño te habilita y entrás.</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Nombre y apellido</label>
            <input required value={nombre} onChange={(e) => setNombre(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Mail</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@mail.com"
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Tu rol</label>
            <select required value={rol} onChange={(e) => setRol(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary">
              <option value="">Elegí tu rol…</option>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Elegí una contraseña</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              placeholder="mínimo 12 caracteres"
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary" />
          </div>

          {err && <p className="text-sm text-red-600">{err}</p>}

          <button type="submit" disabled={loading}
            className="w-full h-10 rounded-md bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-60">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Enviando..." : "Pedir acceso"}
          </button>
          <p className="text-xs text-muted-foreground text-center pt-1">
            ¿Ya tenés acceso? <a href="/login" className="text-primary hover:underline">Ingresar</a>
          </p>
        </form>
      </div>
    </div>
  )
}
