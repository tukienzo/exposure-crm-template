// Instalador guiado. Verifica el entorno, prueba la conexión con Supabase y,
// si se pide, crea el primer usuario (CEO).
//
//   node scripts/instalar.mjs
//   node scripts/instalar.mjs --usuario ceo@empresa.com "Contraseña123" "Nombre Apellido" [rol]
//
// No toca la base de datos salvo para crear el usuario. Las migraciones se
// aplican con `npx supabase db push` (ver README, paso 3).
import { existsSync, readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

const ok = (m) => console.log("  ✓", m)
const falta = (m) => { console.log("  ✗", m); fallos++ }
let fallos = 0

console.log("\nInstalador del CRM\n")

// 1) Node
const mayor = Number(process.versions.node.split(".")[0])
if (mayor >= 20) ok(`Node ${process.versions.node}`); else falta(`Node ${process.versions.node}: hace falta 20 o más`)

// 2) .env.local
if (!existsSync(".env.local")) {
  falta(".env.local no existe. Copiá .env.example a .env.local y completá las claves de Supabase.")
  process.exit(1)
}
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).split(" #")[0].trim()] }))

const obligatorias = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET"]
for (const k of obligatorias) env[k] ? ok(k) : falta(`${k} vacía en .env.local`)
if (!env.SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_URL) ok("SUPABASE_URL: se usa NEXT_PUBLIC_SUPABASE_URL")
if (!env.NEXT_PUBLIC_BRAND_NAME) console.log("  · NEXT_PUBLIC_BRAND_NAME vacía: el CRM se va a llamar \"CRM\"")
if (!env.NEXT_PUBLIC_CRM_CLOSERS) console.log("  · NEXT_PUBLIC_CRM_CLOSERS vacía: los desplegables de closer solo van a tener \"Sin closer\"")
if (!env.NEXT_PUBLIC_CRM_CUENTA_A_HANDLE) console.log("  · NEXT_PUBLIC_CRM_CUENTA_A_HANDLE vacía: la cuenta A se muestra como \"Cuenta A\"")
if (fallos) { console.log("\nCorregí lo marcado con ✗ y volvé a correr.\n"); process.exit(1) }

// 3) conexión con Supabase
const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const { error: eTabla } = await admin.from("team_members").select("id", { count: "exact", head: true })
if (eTabla) {
  falta(`No se pudo leer team_members: ${eTabla.message}`)
  console.log("    Si la tabla no existe, faltan las migraciones: npx supabase db push (README, paso 3).")
  process.exit(1)
}
ok("Supabase responde y las tablas están creadas")

// 4) primer usuario (opcional)
const i = process.argv.indexOf("--usuario")
if (i >= 0) {
  const [email, password, nombre, rol = "CEO"] = process.argv.slice(i + 1)
  if (!email || !password || !nombre) { console.log("\nuso: node scripts/instalar.mjs --usuario <email> <password> \"<nombre>\" [rol]\n"); process.exit(1) }
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nombre } })
  if (error) {
    if (!/already|exists|registered/i.test(error.message)) throw error
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 })
    const u = list.users.find((x) => x.email?.toLowerCase() === email.toLowerCase())
    if (u) await admin.auth.admin.updateUserById(u.id, { password, email_confirm: true })
    ok("el usuario ya existía: contraseña actualizada")
  } else ok(`usuario creado en Supabase Auth (${data.user.id})`)
  const { error: e2 } = await admin.from("team_members").upsert({ email: email.toLowerCase(), nombre, rol, estado: "aprobado" }, { onConflict: "email" })
  if (e2) throw e2
  ok(`team_members: ${email.toLowerCase()} · ${rol} · aprobado`)
} else {
  const { count } = await admin.from("team_members").select("id", { count: "exact", head: true })
  if (!count) console.log("  · Todavía no hay usuarios. Creá el primero:\n    node scripts/instalar.mjs --usuario ceo@empresa.com \"Contraseña\" \"Nombre Apellido\"")
  else ok(`${count} integrante(s) en team_members`)
}

console.log("\nListo. Para correrlo: npx pnpm dev  →  http://localhost:3000\n")
