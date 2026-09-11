import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { effectiveCRMRole } from "@/lib/role-access"
import { createSupabaseServer } from "@/lib/supabase-server"
import { canExportRole } from "@/lib/export-access"

export type ExportActor = { email: string; role: "CEO" }

// Fail closed. El rol llega desde la tabla canónica y no desde metadata o un
// parámetro del cliente. Todas las rutas que generan archivos deben llamarlo.
export async function getExportActor(): Promise<ExportActor | null> {
  try {
    const supabase = await createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    const email = (user?.email || "").trim().toLowerCase()
    if (!email) return null

    const admin = createSupabaseAdmin()
    const { data } = await admin
      .from("team_members")
      .select("rol,estado,nombre")
      .eq("email", email)
      .maybeSingle()

    if (data?.estado !== "aprobado" || !canExportRole(effectiveCRMRole(data.rol, data.nombre))) return null
    return { email, role: "CEO" }
  } catch {
    return null
  }
}
