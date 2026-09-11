"use client"

import { createSupabaseBrowser } from "@/lib/supabase-browser"
import { Clock } from "lucide-react"

export default function PendientePage() {
  async function logout() {
    const supabase = createSupabaseBrowser()
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10">
          <Clock className="h-7 w-7 text-amber-500" />
        </div>
        <h1 className="text-xl font-bold text-foreground mb-2">Acceso pendiente</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Tu cuenta todavía no fue habilitada por el dueño. En cuanto te aprueben vas a poder entrar.
        </p>
        <button
          onClick={logout}
          className="h-10 px-4 rounded-md border border-border text-sm font-medium hover:bg-muted"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
