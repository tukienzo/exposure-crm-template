import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { effectiveCRMRole } from "@/lib/role-access"
import { createSupabaseServer } from "@/lib/supabase-server"

// Devuelve el cliente admin SOLO si quien llama es CEO o Contaduria aprobado.
// Si no, devuelve null (el endpoint responde 403).
export async function requireFinanzas() {
  const supabase = await createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) return null
  const admin = createSupabaseAdmin()
  const { data } = await admin
    .from("team_members")
    .select("rol,estado,nombre")
    .eq("email", user.email.toLowerCase())
    .maybeSingle()
  const role = effectiveCRMRole(data?.rol, data?.nombre)
  if (data?.estado === "aprobado" && (role === "CEO" || role === "Contaduria")) {
    return admin
  }
  return null
}
