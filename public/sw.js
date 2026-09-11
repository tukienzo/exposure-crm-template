// Service worker minimo para instalabilidad PWA (Safari iOS) y shell offline.
// Deliberadamente NO cachea datos del CRM (agendas, pagos, clientes): esto es
// un CRM con datos sensibles y en constante cambio; cachear respuestas de API
// arriesgaria mostrar informacion vieja o filtrar datos entre sesiones/roles.
// Solo cachea el shell offline estatico para que, sin red, el usuario vea un
// mensaje claro en vez de un error de navegador.
const CACHE_NAME = "yy-crm-shell-v1"
const OFFLINE_URL = "/offline.html"

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL)).then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return
  event.respondWith(
    fetch(event.request).catch(() => caches.match(OFFLINE_URL))
  )
})
