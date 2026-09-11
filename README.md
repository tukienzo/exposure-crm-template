# CRM Template · Exposure OS

Plantilla de CRM para una operación de ventas (formación, consultoría, agencia): agendas, pipeline,
pagos, cuotas y cobranza, clientes, métricas, equipo y comisiones, contenido, finanzas, calidad de
datos y conectores opcionales. Con el diseño de **Exposure OS** (raíl oscuro, papel cálido, oro como
único acento) y su capa de agentes como grupo "Sistema IA".

No contiene datos, usuarios, claves ni nombres propios. Todo lo que cambia por operación se configura
en un solo archivo (`.env.local`).

> ¿Lo vas a instalar con Claude Code? Abrí Claude en esta carpeta y pegale:
> **"Leé EMPEZA-ACA.md y hacé lo que dice."** Te va a pedir lo que falta y lo instala.

## Requisitos

- Node 20 o más (`node -v`)
- Una cuenta en [Supabase](https://supabase.com) (plan gratis alcanza)
- Opcional para publicarlo: una cuenta en [Vercel](https://vercel.com)

No hace falta instalar pnpm: `npx pnpm <comando>` funciona igual.

## Instalación (15 minutos)

**1. Descargá el proyecto y las dependencias**

```bash
git clone <este repo> mi-crm && cd mi-crm
npx pnpm install
```

**2. Creá un proyecto nuevo en Supabase** (Dashboard → New project). Anotá la contraseña de la base
de datos: la vas a necesitar en el paso 3.

**3. Aplicá el esquema de la base de datos**

```bash
npx supabase login                    # abre el navegador una vez
npx supabase link --project-ref <ref> # el ref está en la URL del proyecto
npx supabase db push                  # aplica supabase/migrations en orden
```

**4. Completá las claves**

```bash
cp .env.example .env.local
```

Abrí `.env.local` y completá, como mínimo, las cuatro de Supabase (Settings → API del proyecto) y
`CRON_SECRET` (cualquier cadena larga al azar). Después el nombre de tu negocio, tus closers y setters
y el usuario de Instagram de tu cuenta. Cada variable está explicada en el archivo.

**5. Verificá y creá el primer usuario (rol CEO)**

```bash
node scripts/instalar.mjs --usuario ceo@tuempresa.com "una-contraseña" "Nombre Apellido"
```

El script revisa Node, las claves y la conexión con Supabase antes de crear nada.

**6. Corrélo**

```bash
npx pnpm dev        # http://localhost:3000
```

**7. Publicalo (opcional)**: creá un proyecto en Vercel apuntando a este repo y cargá las mismas
variables de `.env.local` (con `NEXT_PUBLIC_APP_URL` en la URL final). Los crons de `vercel.json`
están apagados: activá de a uno después de configurar cada integración.

## Qué configura cada variable

| Grupo | Variables | Qué hacen |
|---|---|---|
| Marca | `NEXT_PUBLIC_BRAND_NAME`, `_TAGLINE`, `_DESCRIPTION` | Nombre y frase del menú, pestaña del navegador, login, imagen al compartir |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROJECT_REF` | Conexión. La service role solo vive en el servidor |
| Seguridad | `CRON_SECRET`, `CRM_INGEST_KEY`, `AGENDA_EXPORT_EMAILS`, `PAYMENT_EXPORT_EMAILS`, `CRM_CEO_NAMES`, `NEXT_PUBLIC_CRM_CONTENT_ONLY_EMAILS` | Crons, cargas externas, quién exporta, quién es CEO, cuentas "solo contenido" |
| Equipo | `NEXT_PUBLIC_CRM_CLOSERS`, `_SETTERS`, `_CLOSER_ALIASES`, `_CLOSER_SAB`, `_CLOSER_CD` | Desplegables, unificación de nombres, ruteo por calificación |
| Cuentas | `NEXT_PUBLIC_CRM_CUENTA_A_HANDLE`, `_CUENTA_B_HANDLE` | Hasta dos cuentas de Instagram que venden ("Cuenta A" y "Cuenta B") |
| Rankings | `CRM_OWNER_CLOSER_NAME`, `CRM_*_INACTIVOS`, `CRM_INACTIVOS_DESDE`, `CRM_METAS_PERSONALES` | Leaderboard y tablas de métricas |
| Finanzas | `CRM_SPLIT_*`, `CRM_CUENTA_A_VENDEDORES`, `CRM_CUENTA_A_ORIGENES` | Reparto de utilidad entre las dos cuentas dueñas |
| Panel | `PANEL_META_MENSUAL`, `PANEL_PRECIO_BASE` | El panel del negocio |
| Integraciones | `MANYCHAT_API_KEY`, `FATHOM_API_KEY`, `ICLOSED_API_KEY`, `ANTHROPIC_API_KEY`, `META_*`, `MERCURY_API_TOKEN` | Vacías = apagadas |

Las `NEXT_PUBLIC_*` se fijan al compilar: después de cambiarlas, reiniciá `dev` o volvé a hacer `build`.

## Qué incluye

- **Ventas**: Centro de Agendas, Seguimientos, Pipeline, Pagos y Carga de Pagos, Planes de pago,
  Cuotas y Cobranza, Reporte de llamadas, Historia de leads.
- **Producto**: Clientes, Leaderboard, Equipo, Esquema de comisiones, Reglas, Strikes.
- **Marketing**: Contenido (ángulos, formatos, espacio semanal), Testimonios, Prospección IG.
- **Operaciones**: Métricas, Tablero semanal, Evolución diaria, Calidad de datos, Finanzas, Gastos,
  Payroll, Accesos, SOP, Asistente y Análisis IA (con `ANTHROPIC_API_KEY`).
- **Panel del negocio**: un tablero autosuficiente (`/panel/*`) que se arma solo con los datos del
  CRM: resumen, embudo, pipeline, año, equipo, fuentes, contenido, cobranzas, proyección, más una
  consola de voz y un generador de carruseles de muestra.
- **Sistema IA**: Centro de Mando, Agentes, Tareas, Agenda, Herramientas, Analítica, Contenido y
  Memoria compartida. **Son maquetas con datos ficticios** hasta que se conecten.
- **Conectores** (opcionales): ManyChat, Fathom, iClosed, Meta Ads, Mercury, Anthropic.

## Qué no incluye

Datos históricos, backups, comprobantes, campañas, fotos del equipo, el esquema original de la
base de datos (ver abajo) y secretos de terceros.

## Cosas que conviene saber

- **El esquema base de la base de datos está reconstruido.** La plantilla de la que deriva solo
  trajo las migraciones que modifican tablas, no las que las crean. `20260701000000_base_schema.sql`
  crea las tablas a partir de cómo las usa el código. Funciona, pero si tenés el volcado real del
  esquema original, reemplazá ese archivo.
- **Las comisiones y las reglas del equipo** (`/esquema-comisiones`, `/reglas`) son texto de ejemplo
  con un esquema típico; adaptalas a tu operación.
- **Las dos cuentas dueñas** se llaman internamente `paul` (A) y `cristian`/`cris` (B) en las tablas
  de finanzas. Es herencia de la plantilla original; no renombrarlas.
- **Fotos del equipo**: van en `public/avatars/` y se mapean en `app/(dashboard)/equipo/page.tsx`.
- **Las imágenes del generador de carruseles** (`public/panel/estilos/`) son placeholders: reemplazalas
  por tus referencias.

## Para desarrolladores

Stack: Next.js 16, React 19, Tailwind 4, shadcn/Radix, Supabase, pnpm. El mapa técnico (estructura,
permisos por rol, sistema de diseño, trampas conocidas) está en [`CLAUDE.md`](CLAUDE.md).

```bash
npx tsc --noEmit      # tipos
npx pnpm build        # producción
npx next start        # servir el build
```

## Créditos

Funcionalidades del CRM: plantilla `crm-template` de Paul. Diseño y capa de agentes: Exposure OS.
