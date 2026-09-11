# CRM · mapa técnico para Claude

> Si es la primera vez que abrís esta carpeta, leé [`EMPEZA-ACA.md`](EMPEZA-ACA.md) antes: ahí está
> cómo arranca la conversación y cómo se instala. Este archivo es la referencia técnica.

## Stack

Next.js 16 (App Router) + React 19 + Tailwind 4 + shadcn/Radix · Supabase (Postgres, Auth, RLS,
funciones SQL) · pnpm. Todo en español; solo quedan en inglés los términos del oficio (lead, closer,
setter, pipeline, cash collected).

## Estructura

```
app/(dashboard)/        una carpeta por pantalla del CRM (38) + sistema/* (capa de agentes)
app/api/                rutas del servidor (70): métricas, pagos, cobranza, sincronizaciones, crons
app/login, solicitar-acceso, pendiente     acceso
components/             UI del CRM (crm-navigation, content-workspace, kanban…) y components/ui (shadcn)
components/exposure/    el sistema de diseño "Exposure OS": tokens, primitivas (ui.tsx), pantallas de agentes y sus datos ficticios
components/exposure-rail.tsx   raíl de navegación de escritorio (lee los módulos de crm-navigation)
lib/                    reglas de negocio: role-access (permisos por rol y ruta), equipo (equipo y cuentas por env),
                        brand, operating-rules (reparto entre cuentas), fuentes, business-account, supabase-*
supabase/migrations/    esquema base + 25 migraciones de la plantilla original
scripts/                instalar.mjs (verificación + primer usuario), crear-usuario.mjs
public/panel/           "Panel del negocio": un HTML autosuficiente embebido en /panel/* que lee /api/panel/datos
middleware.ts           sesión + permisos por rol en cada request (fail-closed)
```

## Configuración: todo por variables de entorno

No hay nombres propios en el código. Lo que cambia por operación vive en `.env.local`
(ver `.env.example`, está comentado línea por línea):

- **Marca**: `NEXT_PUBLIC_BRAND_*` → `lib/brand.ts`. Se usa en layout, manifest, OG image, raíl, login.
- **Equipo y cuentas**: `NEXT_PUBLIC_CRM_*` → `lib/equipo.ts`. Desplegables de closers/setters, alias,
  ruteo por calificación, handles de las cuentas A y B, ventana de grabación.
- **Rankings y métricas**: `CRM_*_INACTIVOS`, `CRM_INACTIVOS_DESDE`, `CRM_METAS_PERSONALES`,
  `CRM_OWNER_CLOSER_NAME` → `app/api/leaderboard/route.ts` y `app/api/metricas/route.ts`.
- **Reparto entre cuentas dueñas**: `CRM_SPLIT_*`, `CRM_CUENTA_A_*` → `lib/operating-rules.ts`
  (`SPLITS`). Las claves internas de las cuentas son `paul` (A) y `cristian`/`cris` (B): así las
  nombran las tablas de finanzas. **No renombrarlas**: hay datos y funciones SQL que las usan.
- **Accesos**: `CRM_CEO_NAMES` (opcional), `NEXT_PUBLIC_CRM_CONTENT_ONLY_EMAILS` → `lib/role-access.ts`.

Las variables `NEXT_PUBLIC_*` se inyectan al compilar: cambiarlas exige reiniciar `dev` o volver a
hacer `build`.

## Base de datos

- **El esquema base es reconstruido.** La plantilla original solo trajo las migraciones que modifican
  las tablas, no las que las crean. `supabase/migrations/20260701000000_base_schema.sql` las crea a
  partir de cómo las usa el código. Ids: `uuid` en agendas/pagos/planes_pago/plan_pago_items,
  `bigint` en clientes/team_members/cuotas. Si aparece el volcado real del esquema original, reemplazar
  ese archivo por ese.
- Las migraciones llevan versión única `AAAAMMDD00000N_nombre.sql` y están en orden de dependencia.
  Una migración nueva va con la fecha de hoy y el siguiente `N`. Nunca dos con la misma versión.
- Se aplican con `npx supabase db push` (la carpeta se vincula con `npx supabase link`).
- RLS está activo. El acceso pasa por `team_members.estado = 'aprobado'` y el rol; el middleware
  redirige a `/pendiente` si no.

## Permisos

`lib/role-access.ts` tiene dos tablas: `pageRules` (qué rol entra a qué ruta) y `apiRules` (qué rol
llama a qué API y con qué método). Una pantalla nueva **tiene que** figurar ahí, si no queda abierta
solo al default. `effectiveCRMRole` devuelve el rol tal cual está en `team_members`.

## El sistema de diseño

Tokens en `app/globals.css` (`:root` y `.dark`): papel cálido, tinta, oro (`#c8a95d`) como único
acento, Inter y JetBrains Mono. Las primitivas (`Card`, `Stat`, `Tag`, `Bar`, `AgentBadge`…) están
en `components/exposure/ui.tsx`; las pantallas del CRM usan shadcn con esos tokens. El raíl es el
único bloque oscuro. No agregar colores nuevos de acento; los semáforos usan ok/warn/bad.

## Trampas conocidas

- **`Content-Security-Policy` está en `next.config.mjs`.** `upgrade-insecure-requests` se aplica solo
  en Vercel: en `localhost` rompería todo por http. Si agregás un script externo, sumá su dominio ahí.
- **`/panel/*` es un HTML estático** (`public/panel/index.html`) con router por hash, embebido por
  `app/(dashboard)/panel/[...]`. Sus datos salen de `/api/panel/datos`, que arma `datos.js` desde
  agendas y pagos (`lib/panel-negocio.ts`) o devuelve el demo si el CRM está vacío.
- **Las pantallas de `sistema/*` tienen datos ficticios** (`components/exposure/data.ts`). Son la
  maqueta de la capa de agentes; no leen Supabase.
- **`vercel.json` tiene los crons desactivados.** Activar de a uno después de configurar cada
  integración y `CRON_SECRET`.
- **pnpm no suele estar instalado global**: `npx pnpm <cmd>` funciona igual.

## Verificar antes de decir que está listo

```bash
npx tsc --noEmit          # tipos
npx pnpm build            # compila las 38 pantallas y 70 rutas
npx pnpm dev              # y abrir: /login → Home → Agendas → Pagos → un /sistema/*
```

Cero errores de consola en el navegador; en la Home tienen que aparecer los KPIs (en cero si no hay
datos) y el raíl con todos los grupos del rol.
