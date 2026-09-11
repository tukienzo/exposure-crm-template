import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { createSupabaseServer } from "@/lib/supabase-server"
import { effectiveCRMRole } from "@/lib/role-access"

export type FinanceActor = {
  userId: string | null
  role: "CEO" | "Contaduria"
  partnerKey: "partner_a" | "partner_b" | null
  preview: boolean
}

export async function requireFinanceActor(options: { write?: boolean } = {}): Promise<FinanceActor> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id || !user.email) throw new FinanceAccessError("No autenticado", 401)

  const admin = createSupabaseAdmin()
  const [{ data: member }, { data: authorization }] = await Promise.all([
    admin
      .from("team_members")
      .select("rol,estado,nombre")
      .eq("email", user.email.toLowerCase())
      .maybeSingle(),
    admin
      .from("finance_partner_authorizations")
      .select("partner_key")
      .eq("user_id", user.id)
      .maybeSingle(),
  ])
  const role = effectiveCRMRole(member?.rol, member?.nombre)
  if (
    member?.estado !== "aprobado"
    || (role !== "CEO" && role !== "Contaduria")
  ) throw new FinanceAccessError("Sin acceso al Centro Financiero", 403)

  return {
    userId: user.id,
    role,
    partnerKey: authorization?.partner_key ?? null,
    preview: false,
  }
}

export class FinanceAccessError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}
