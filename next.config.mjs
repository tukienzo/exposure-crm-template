/** @type {import('next').NextConfig} */
// upgrade-insecure-requests solo cuando la app corre en https: en localhost
// (http) el navegador intentaba subir a https y fallaba un recurso por página.
const nextConfig = {
  poweredByHeader: false,
  images: {
    unoptimized: true,
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy", value: "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; media-src 'self' blob:; worker-src 'self' blob:" + (process.env.NEXT_PUBLIC_APP_URL?.startsWith("https") ? "; upgrade-insecure-requests" : "") },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=()" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
      ],
    }, {
      // El Panel del negocio (public/panel) se muestra adentro de un iframe
      // del propio CRM: solo acá se permite el embebido, y solo desde el
      // mismo origen. El micrófono es para el Service JARVIS.
      source: "/panel/:path*",
      headers: [
        { key: "Content-Security-Policy", value: "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self' blob:" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=()" },
      ],
    }]
  },
}

export default nextConfig
