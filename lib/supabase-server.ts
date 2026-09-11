import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

// Cliente Supabase con la sesion del usuario (lee cookies). Server-side.
export async function createSupabaseServer() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Llamado desde un Server Component: no se pueden setear cookies aca.
            // El middleware ya refresca la sesion, asi que es seguro ignorarlo.
          }
        },
      },
    },
  )
}
