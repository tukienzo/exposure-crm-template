import { createClient } from "@supabase/supabase-js"

// Cliente ADMIN (service role). SOLO server-side. Bypassa RLS.
// Nunca importar esto en componentes de cliente.
export function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}
