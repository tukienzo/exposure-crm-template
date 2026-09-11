import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { canAccessApi, canAccessPage, effectiveCRMRole, homeForRole, isContentOnlyAccount } from "@/lib/role-access"

// Estas rutas tienen autenticacion propia y no dependen de una sesion web:
// - ingest/* valida x-ingest-key dentro de cada handler.
// - *-sync valida CRON_SECRET dentro de cada handler.
function hasIndependentAuth(pathname: string, method: string) {
  return pathname.startsWith("/api/ingest/")
    || ["/api/fathom-sync", "/api/fathom-show-reconcile", "/api/manychat-sync", "/api/iclosed-sync", "/api/lead-scoring-sync", "/api/operations-refresh", "/api/finance-monthly-refresh"].includes(pathname)
    || (method === "POST" && (pathname === "/api/cuotas" || pathname === "/api/strikes"))
}

function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

async function approvedMember(email: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { ok: false, configurationError: true }

  const params = new URLSearchParams({
    select: "rol,estado,nombre",
    email: `eq.${email.toLowerCase()}`,
    limit: "1",
  })
  const response = await fetch(`${url}/rest/v1/team_members?${params}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    cache: "no-store",
  })
  if (!response.ok) return { ok: false, configurationError: true }
  const rows = (await response.json()) as Array<{ rol?: string; estado?: string; nombre?: string }>
  const member = rows[0]
  return {
    ok: member?.estado === "aprobado",
    role: effectiveCRMRole(member?.rol, member?.nombre),
    configurationError: false,
  }
}

// Refresca la sesion y, ademas, protege TODA la capa /api. El layout ya
// protegia las pantallas, pero los handlers usaban service role y quedaban
// accesibles directamente sin login.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })
  const { pathname } = request.nextUrl

  const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method)

  // Las paginas ya se protegen en el layout del dashboard. Este middleware
  // existe para cerrar la capa API que antes quedaba publica; no necesita
  // crear un cliente Supabase para una navegacion web normal.
  // Estas rutas validan sus propias credenciales dentro del handler y no
  // dependen de una cookie de sesion web.
  if (pathname.startsWith("/api/") && hasIndependentAuth(pathname, request.method)) return response

  // Defensa CSRF para todas las mutaciones basadas en cookie. Los webhooks e
  // ingestiones salen antes porque usan secretos propios y no una sesión web.
  if (pathname.startsWith("/api/") && isMutation) {
    const origin = request.headers.get("origin")
    if (!origin || origin !== request.nextUrl.origin) return apiError("Origen no permitido", 403)
  }
  if (pathname.startsWith("/api/") && pathname === "/api/team" && request.method === "POST") return response

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  let user: { email?: string | null } | null = null
  try {
    const result = await supabase.auth.getUser()
    user = result.data.user
  } catch {
    user = null
  }

  if (!user?.email) {
    if (pathname.startsWith("/api/")) return apiError("No autenticado", 401)
    return NextResponse.redirect(new URL("/login", request.url))
  }
  const member = await approvedMember(user.email)
  if (member.configurationError) return pathname.startsWith("/api/") ? apiError("No se pudo validar el acceso", 503) : NextResponse.redirect(new URL("/pendiente", request.url))
  if (!member.ok) return pathname.startsWith("/api/") ? apiError("Acceso pendiente o no autorizado", 403) : NextResponse.redirect(new URL("/pendiente", request.url))
  if (pathname.startsWith("/api/") && !canAccessApi(pathname, member.role, request.method, user.email)) return apiError("Tu cuenta no tiene acceso a este módulo", 403)
  if (!pathname.startsWith("/api/") && !canAccessPage(pathname, member.role, user.email)) return NextResponse.redirect(new URL(homeForRole(member.role, user.email), request.url))

  // Cuenta B puede consultar el Home, pero las APIs comerciales quedan
  // forzadas del lado servidor a Cuenta de Cris. No depende del selector ni
  // de parámetros manipulables en el navegador.
  if (isContentOnlyAccount(user.email) && ["/api/metricas", "/api/home-ceo-profit"].includes(pathname)) {
    const restrictedUrl = request.nextUrl.clone()
    restrictedUrl.searchParams.set("account", "cris")
    const restrictedResponse = NextResponse.rewrite(restrictedUrl)
    restrictedResponse.headers.set("Cache-Control", "private, no-store, max-age=0")
    return restrictedResponse
  }

  // Las pantallas siguen usando el layout del dashboard para redirigir al
  // login. Mantener esa responsabilidad fuera del middleware evita que la
  // proteccion de previews de Vercel interfiera con la redireccion web.
  if (pathname.startsWith("/api/")) response.headers.set("Cache-Control", "private, no-store, max-age=0")
  return response
}

export const config = {
  matcher: [
    // todo menos assets estaticos, PWA (manifest/service worker) y rutas de auth publicas
    "/((?!_next|_vercel/static|_next/image|favicon.ico|opengraph-image|login|pendiente|solicitar-acceso|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
