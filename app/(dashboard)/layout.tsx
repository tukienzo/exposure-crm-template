import { redirect } from "next/navigation"
import { CRMNavigation } from "@/components/crm-navigation"
import { ExposureRail } from "@/components/exposure-rail"
import { SessionProvider } from "@/components/session-provider"
import { createSupabaseServer } from "@/lib/supabase-server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { CrmSoundscape } from "@/components/crm-soundscape"
import { effectiveCRMRole } from "@/lib/role-access"
import { SecuritySessionTracker } from "@/components/security-session-tracker"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) redirect("/login")

  let member: { rol: string | null; estado: string | null; nombre: string | null } | null = null
  try {
    const admin = createSupabaseAdmin()
    const { data } = await admin
      .from("team_members")
      .select("rol,estado,nombre")
      .eq("email", user.email.toLowerCase())
      .maybeSingle()
    member = data
  } catch {
    member = null
  }

  // Fail-closed: si no está aprobado, no entra al dashboard.
  if (!member || member.estado !== "aprobado") redirect("/pendiente")
  const effectiveRole = effectiveCRMRole(member.rol, member.nombre) ?? ""

  return (
    <div className="min-h-screen bg-background">
      <div className="ambient" aria-hidden />
      <SecuritySessionTracker />
      <CrmSoundscape />
      <CRMNavigation rol={effectiveRole} nombre={member.nombre ?? ""} email={user.email} />
      <ExposureRail rol={effectiveRole} nombre={member.nombre ?? ""} email={user.email} />
      <main className="crm-main relative z-10 min-h-screen">
        <SessionProvider value={{ rol: effectiveRole, email: user.email, nombre: member.nombre ?? "" }}>
          {children}
        </SessionProvider>
      </main>
    </div>
  )
}
