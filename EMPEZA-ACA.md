# Empezá acá

> **Esto es para vos, Claude, no para la persona.** Es lo primero que tenés que leer al abrir esta
> carpeta. Define cómo instalás el CRM para alguien que no programa y cómo le hablás.

## Quién está del otro lado

El dueño o la dueña de una operación de ventas (formación, consultoría, agencia). No programa y no
tiene por qué. Te habla en castellano y espera respuestas en castellano.

1. **No le muestres código** salvo que te lo pida. Decile qué hiciste y qué va a ver distinto.
2. **Nada de jerga.** No existen "el .env", "el middleware", "la migración". Existen "el archivo de
   claves", "la protección de acceso", "la base de datos".
3. **Preguntá poco y en batch.** Todo lo que falte, en una sola lista numerada, con una opción por
   defecto en cada punto.

## Lo primero que hacés

**Paso 1 — leé [`README.md`](README.md).** Ahí está la instalación completa. No la inventes.

**Paso 2 — pedile lo que hace falta, todo junto:**

> Para instalarte el CRM necesito:
> 1. **Cómo se llama tu negocio** (va en el menú y en la pestaña del navegador).
> 2. **Una cuenta en Supabase** (supabase.com, gratis). Si no la tenés, creála y decime cuando esté;
>    si querés, te guío.
> 3. **Tu mail y una contraseña** para el usuario dueño (rol CEO).
> 4. **Los nombres de tus closers y setters**, y el usuario de Instagram de tu cuenta principal.
> 5. Opcional: si tenés dos cuentas de Instagram que venden, el usuario de la segunda.

**Paso 3 — ejecutá la instalación del README**, en orden, sin saltear el paso de las migraciones.
Al terminar, abrí `http://localhost:3000`, entrá con su usuario y **mirá vos la Home, Agendas y Pagos
antes de decirle que está listo**.

**Paso 4 — contale qué está viendo, en tres líneas**, y ofrecele lo que sigue:

> 1. **Cargar tus datos** (agendas, pagos, clientes): una planilla, un export o a mano.
> 2. **Sumar al equipo**: cada persona pide acceso desde la pantalla de login y vos la aprobás en Accesos.
> 3. **Publicarlo en internet** (Vercel) para que el equipo entre desde cualquier lado.

Y frenás. Que elija.

## Qué se toca para cada pedido

| Si te pide… | Vas a… |
|---|---|
| "cambiá el nombre / la frase del menú" | `.env.local` → `NEXT_PUBLIC_BRAND_*`, y reiniciar |
| "agregá un closer / setter" | `.env.local` → `NEXT_PUBLIC_CRM_CLOSERS` / `_SETTERS`; el acceso se da en Accesos |
| "este closer aparece dos veces" | `.env.local` → `NEXT_PUBLIC_CRM_CLOSER_ALIASES` |
| "los leads buenos van a X y los otros a Y" | `NEXT_PUBLIC_CRM_CLOSER_SAB` / `_CD` |
| "tengo dos cuentas de Instagram" | `NEXT_PUBLIC_CRM_CUENTA_A_HANDLE` / `_B_HANDLE` |
| "cómo se reparte la plata entre los socios" | `CRM_SPLIT_*` y `CRM_CUENTA_A_*` |
| "cambiá las comisiones o las reglas" | `app/(dashboard)/esquema-comisiones/page.tsx` y `app/(dashboard)/reglas/page.tsx` (son texto) |
| "las fotos del equipo" | archivos en `public/avatars/` + el mapa `TEAM_AVATARS` en `app/(dashboard)/equipo/page.tsx` |
| "conectá ManyChat / Fathom / Meta" | la clave en `.env.local`, después el cron correspondiente en `vercel.json` |
| "sacá una pantalla" | el item en `components/crm-navigation.tsx` (lista `modules`) y su carpeta en `app/(dashboard)/` |

## Las reglas que no se negocian

1. **Nunca reutilizar claves de otra operación.** Cada instalación tiene su proyecto de Supabase y
   su `.env.local`. Si ves una clave que no es de esta operación, avisá y no la uses.
2. **La service role de Supabase no sale del servidor.** Nada de ponerla en una variable `NEXT_PUBLIC_*`.
3. **Las migraciones se aplican en orden y una sola vez.** Si `db push` falla, no "arreglés" la base
   a mano: leé el error, corregí la migración y volvé a correr.
4. **Cero datos inventados.** Si el CRM está vacío, está vacío; no cargues demos en las tablas reales.
   Las únicas pantallas con datos ficticios son las de "Sistema IA" y el panel en modo demostración, y
   lo dicen en pantalla.

Después de cada cambio: compilá (`npx pnpm build` o al menos `npx tsc --noEmit`), abrí la pantalla que
tocaste y recién ahí avisá. El detalle técnico está en [`CLAUDE.md`](CLAUDE.md).
