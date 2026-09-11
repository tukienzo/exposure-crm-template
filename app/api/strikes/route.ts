import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isPreviewRuntime } from '@/lib/preview-runtime'
import { createSupabaseServer } from '@/lib/supabase-server'

const INGEST_KEY = process.env.CRM_INGEST_KEY
const MANAGER_ROLES = new Set(['CEO', 'Contaduria'])

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase credentials not configured')
  return createClient(url, key)
}

// Strikes son visibles solo para CEO/Contaduria; el equipo (closers/setters)
// nunca debe ver strikes propios ni ajenos. En preview la sesion se fuerza a
// rol CEO (revision de Cuenta A/Lisan), asi que se sirve igual que produccion.
async function requireManager(): Promise<boolean> {
  if (isPreviewRuntime()) return true
  try {
    const supabase = await createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return false
    const admin = getSupabaseClient()
    const { data } = await admin
      .from('team_members')
      .select('rol,estado')
      .eq('email', user.email.toLowerCase())
      .maybeSingle()
    return data?.estado === 'aprobado' && MANAGER_ROLES.has(data.rol || '')
  } catch {
    return false
  }
}

export async function GET() {
  try {
    if (!(await requireManager())) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('strikes')
      .select('*')
      .order('id', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data || [])
  } catch (err) {
    return NextResponse.json({ error: 'Error de servidor' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    if (!(await requireManager())) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }
    const supabase = getSupabaseClient()
    const { id, count } = await request.json()
    if (typeof id !== 'number' || typeof count !== 'number' || count < 0 || count > 2) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
    }
    const { error } = await supabase
      .from('strikes')
      .update({ count, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Error de servidor' }, { status: 500 })
  }
}

// Resetea el roster de strikes (borra todo + inserta). Protegido con x-ingest-key.
export async function POST(request: Request) {
  try {
    if (!INGEST_KEY) {
      return NextResponse.json({ error: 'CRM_INGEST_KEY no configurada' }, { status: 503 })
    }
    if (request.headers.get('x-ingest-key') !== INGEST_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const supabase = getSupabaseClient()
    const { rows } = await request.json()
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'rows requerido' }, { status: 400 })
    }
    const { error: delErr } = await supabase.from('strikes').delete().neq('id', -1)
    if (delErr) return NextResponse.json({ error: `delete: ${delErr.message}` }, { status: 500 })
    const clean = rows.map((r: { nombre: string; rol?: string; count?: number }) => ({
      nombre: r.nombre, rol: r.rol ?? null, count: r.count ?? 0,
    }))
    const { error: insErr } = await supabase.from('strikes').insert(clean)
    if (insErr) return NextResponse.json({ error: `insert: ${insErr.message}` }, { status: 500 })
    return NextResponse.json({ ok: true, inserted: clean.length })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
