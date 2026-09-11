"use client"

import { useState } from "react"
import { createSupabaseBrowser } from "@/lib/supabase-browser"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { BRAND } from "@/lib/brand"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [err, setErr] = useState("")
  const [loading, setLoading] = useState(false)
  const [linkSent, setLinkSent] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr("")
    setLoading(true)
    const supabase = createSupabaseBrowser()
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    if (error) {
      setErr("Mail o contraseña incorrectos.")
      setLoading(false)
      return
    }
    let deviceId = window.localStorage.getItem("crm_security_device_id")
    if (!deviceId) {
      deviceId = window.crypto.randomUUID()
      window.localStorage.setItem("crm_security_device_id", deviceId)
    }
    await fetch("/api/security/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, event: "login" }),
    }).catch(() => undefined)
    window.location.href = "/"
  }

  async function sendMagicLink() {
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      setErr("Ingresá tu mail para recibir el acceso.")
      return
    }
    setErr("")
    setLoading(true)
    const supabase = createSupabaseBrowser()
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: { emailRedirectTo: `${window.location.origin}/contenido-angulos` },
    })
    if (error) {
      setErr("No se pudo enviar el acceso. Revisá el mail e intentá otra vez.")
      setLoading(false)
      return
    }
    setLinkSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <span className="mb-3 grid place-items-center" style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(160deg,#2a2419,#141414)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 0 28px rgba(200,169,93,0.18)' }}>
            <svg width="30" height="30" viewBox="0 0 16 16" fill="none"><path d="M8 1.4 L14 8 L8 14.6 L2 8 Z" stroke="#c8a95d" strokeWidth="1" opacity="0.95" /><path d="M8 4.6 L11.4 8 L8 11.4 L4.6 8 Z" fill="#dec27c" opacity="0.3" /><circle cx="8" cy="8" r="1.5" fill="#dec27c" /></svg>
          </span>
          <h1 className="text-xl font-bold text-foreground">{BRAND.name}</h1>
          <p className="text-sm text-muted-foreground">Ingresá con tu cuenta</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 rounded-[16px] border border-border bg-card p-6 shadow-[0_1px_2px_rgba(20,16,8,0.03),0_10px_30px_rgba(20,16,8,0.04)]">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Mail</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@mail.com"
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Contraseña</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-10 rounded-md border border-input bg-background px-3 pr-10 text-sm outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {err && <p className="text-sm text-red-600">{err}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded-md bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Ingresando..." : "Ingresar"}
          </button>

          <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><span className="h-px flex-1 bg-border" />o<span className="h-px flex-1 bg-border" /></div>

          <button
            type="button"
            disabled={loading}
            onClick={sendMagicLink}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-border bg-background text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
          >
            {linkSent ? "Link enviado · revisá tu mail" : "Entrar con link al mail"}
          </button>

          <p className="text-xs text-muted-foreground text-center pt-1">
            ¿Sos del equipo y no tenés acceso?{" "}
            <a href="/solicitar-acceso" className="text-primary hover:underline">Pedí acceso</a>
          </p>
        </form>
      </div>
    </div>
  )
}
