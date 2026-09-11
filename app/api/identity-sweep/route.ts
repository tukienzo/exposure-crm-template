import { createClient } from "@supabase/supabase-js"
import { createHash } from "crypto"
import { NextResponse } from "next/server"
import { isPreviewRuntime } from "@/lib/preview-runtime"

export const dynamic = "force-dynamic"
// Con ~9.4k personas con nombre puede haber >200k pares candidatos; escribir
// de a uno agotaba el tiempo máximo del serverless function a mitad de
// camino (bug real encontrado: Leandro Quezada solo guardaba 1 de ~15 pares
// posibles). maxDuration + upsert en lotes lo resuelve sin cambiar la lógica
// de detección ni el comportamiento de solo-lectura sobre personas.
export const maxDuration = 60

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error("Missing Supabase config")
  return createClient(url, key)
}

function normalize(s: string | null): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
}

function tokens(s: string | null): string[] {
  return normalize(s).split(/\s+/).filter(Boolean)
}

// Distancia de Levenshtein, sin dependencias externas.
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[m][n]
}

type Person = { id: string; display_name: string | null; internal_code: string }
type PersonN = Person & { norm: string; toks: string[] }

type Candidate = {
  a: Person
  b: Person
  reason: "exact_normalized_match" | "exact_normalized_cluster_of_N" | "token_subset" | "levenshtein_close"
  distance: number | null
}

// Este barrido es de solo lectura sobre nombres + escritura exclusiva en la
// cola de revisión (crm_identity_conflicts, status=pending). Nunca fusiona
// personas ni modifica crm_people/crm_identities. La fusión sigue siendo
// 100% manual desde /conflictos-identidad con evidencia teléfono→Instagram→email.
export async function GET(request: Request) {
  if (!isPreviewRuntime()) {
    return NextResponse.json({ error: "Solo disponible en preview" }, { status: 403 })
  }
  const { searchParams } = new URL(request.url)
  const dryRun = searchParams.get("dry_run") === "1"
  // Con ~9.4k personas puede haber >200k pares candidatos: escribirlos todos
  // en una sola invocación excedía el tiempo máximo del serverless function
  // a mitad de camino y dejaba la cola incompleta (bug real: Leandro Quezada
  // solo guardaba 1 de ~15 pares posibles). El cálculo de pares es
  // determinístico dado el mismo estado de crm_people, así que se pagina la
  // ESCRITURA (no la detección) en tramos seguros que el operador puede
  // invocar en varias llamadas hasta completar `candidate_pairs` total.
  const writeOffset = Math.max(0, Number(searchParams.get("write_offset") || "0") || 0)
  const writeLimit = Math.min(20000, Math.max(1, Number(searchParams.get("write_limit") || "5000") || 5000))

  try {
    const sb = getSupabase()

    let all: Person[] = []
    let from = 0
    const pageSize = 1000
    while (true) {
      const { data, error } = await sb
        .from("crm_people")
        .select("id, display_name, internal_code")
        .range(from, from + pageSize - 1)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!data || data.length === 0) break
      all = all.concat(data as Person[])
      if (data.length < pageSize) break
      from += pageSize
    }

    const people: PersonN[] = all
      .filter(p => p.display_name && p.display_name.trim() && !/^sin nombre$/i.test(p.display_name.trim()))
      .map(p => ({ ...p, norm: normalize(p.display_name), toks: tokens(p.display_name) }))

    const buckets: Record<string, PersonN[]> = {}
    for (const p of people) {
      const key0 = p.toks[0] || ""
      if (!buckets[key0]) buckets[key0] = []
      buckets[key0].push(p)
    }

    const pairs: Candidate[] = []
    const seen = new Set<string>()

    // BUG REAL (encontrado 2026-07-23, reportado por Cuenta A: 202.513 "conflictos"
    // quando la base tiene ~9.4k personas nombradas): exact_normalized_match se
    // generaba como TODOS los pares dentro de un cluster de nombre normalizado
    // idéntico -- O(n²). Para nombres repetidos muchas veces (nombres de
    // organización tipo "CAE | Mentoring" x173, o nombres comunes reutilizados
    // en decenas de registros históricos distintos como "Valentin Antognini"
    // x168), esto explota combinatoriamente: 173 personas -> C(173,2)=14.878
    // "conflictos" que en realidad son UN solo hallazgo ("estas 173 filas
    // comparten este nombre normalizado"), no 14.878 colisiones par-a-par.
    // Verificado con datos reales: de 202.513 conflictos, 196.279 eran
    // name_exact_normalized y de esos 196.120 salían de solo 205 clusters de
    // 3+ personas -- la explosión cuadrática. Solo 159 pares eran de clusters
    // de tamaño exactamente 2 (candidatos reales tipo Miguel Ángel Rincón, el
    // precedente ya aprobado). Además, en una muestra de 40 clusters de 4+
    // personas, 29 (72.5%) tenían teléfono/Instagram/email CONTRADICTORIOS
    // entre miembros -- es decir, son objetivamente personas DISTINTAS que
    // por casualidad comparten nombre+apellido, no duplicados.
    //
    // Fix: los clusters de nombre exacto idéntico ya NO se expanden par-a-par.
    // - Cluster de tamaño 2: UN conflicto por pareja (igual que antes, este es
    //   el caso real tipo Miguel Ángel Rincón).
    // - Cluster de tamaño 3+: UN solo registro resumen por cluster completo
    //   (occurrences = tamaño del cluster), marcado con un reason distinto
    //   (exact_normalized_cluster) para diferenciarlo en la cola de revisión.
    //   Esto SIEMPRE va a revisión humana -- nunca se fusiona automáticamente
    //   un cluster de 3+ dado el alto porcentaje de contradicciones reales
    //   encontradas en la muestra.
    // token_subset y levenshtein_close no sufrían esta explosión (429 y 5.803
    // filas totales respectivamente) y mantienen su lógica par-a-par sin cambios.
    const exactGroups = new Map<string, PersonN[]>()
    for (const p of people) {
      if (!exactGroups.has(p.norm)) exactGroups.set(p.norm, [])
      exactGroups.get(p.norm)!.push(p)
    }
    for (const [, arr] of exactGroups) {
      if (arr.length < 2) continue
      if (arr.length === 2) {
        pairs.push({ a: arr[0], b: arr[1], reason: "exact_normalized_match", distance: 0 })
      } else {
        // Un solo hallazgo por cluster completo, no pares. Se usa el par
        // (primer id, segundo id) como representante estable para la unicidad
        // de la fila; occurrences refleja el tamaño real del cluster.
        pairs.push({ a: arr[0], b: arr[1], reason: "exact_normalized_cluster_of_N", distance: arr.length })
      }
    }

    function considerPair(a: PersonN, b: PersonN) {
      if (a.id === b.id) return
      if (a.norm === b.norm) return // ya cubierto arriba por exactGroups, no duplicar
      const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`
      if (seen.has(key)) return
      const shortToks = a.toks.length <= b.toks.length ? a.toks : b.toks
      const longToks = a.toks.length <= b.toks.length ? b.toks : a.toks
      const isSubset = shortToks.length >= 2 && shortToks.every(t => longToks.includes(t))
      if (isSubset && shortToks.length < longToks.length) {
        seen.add(key)
        pairs.push({ a, b, reason: "token_subset", distance: null })
        return
      }
      if (Math.abs(a.norm.length - b.norm.length) <= 3 && a.norm.length > 4) {
        const d = levenshtein(a.norm, b.norm)
        const maxLen = Math.max(a.norm.length, b.norm.length)
        if (d <= 2 && d / maxLen < 0.25) {
          seen.add(key)
          pairs.push({ a, b, reason: "levenshtein_close", distance: d })
        }
      }
    }

    for (const key0 of Object.keys(buckets)) {
      const arr = buckets[key0]
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) considerPair(arr[i], arr[j])
      }
    }

    const bucketKeys = Object.keys(buckets)
    for (let i = 0; i < bucketKeys.length; i++) {
      for (let j = i + 1; j < bucketKeys.length; j++) {
        const k1 = bucketKeys[i]
        const k2 = bucketKeys[j]
        if (!k1 || !k2 || k1.length < 3 || k2.length < 3) continue
        if (Math.abs(k1.length - k2.length) > 2) continue
        if (levenshtein(k1, k2) <= 1) {
          for (const a of buckets[k1]) for (const b of buckets[k2]) considerPair(a, b)
        }
      }
    }

    const reasonMap: Record<Candidate["reason"], string> = {
      exact_normalized_match: "name_exact_normalized",
      exact_normalized_cluster_of_N: "name_exact_normalized_cluster",
      token_subset: "name_token_subset",
      levenshtein_close: "name_typo_close",
    }

    let inserted = 0
    const byId = new Map(people.map(p => [p.id, p]))
    const summary = pairs.map(p => {
      const pa = byId.get(p.a.id)!
      const pb = byId.get(p.b.id)!
      const [lo, hi] = pa.id < pb.id ? [pa, pb] : [pb, pa]
      const valueHash = createHash("sha256").update(`${lo.norm}|${hi.norm}`).digest("hex")
      return {
        reason: reasonMap[p.reason],
        distance: p.distance,
        cluster_size: p.reason === "exact_normalized_cluster_of_N" ? p.distance : null,
        incoming: { person_id: lo.id, internal_code: lo.internal_code, display_name: lo.display_name },
        existing: { person_id: hi.id, internal_code: hi.internal_code, display_name: hi.display_name },
        value_hash: valueHash,
      }
    })

    const errors: string[] = []
    const windowSlice = summary.slice(writeOffset, writeOffset + writeLimit)
    if (!dryRun) {
      const rows = windowSlice.map(row => ({
        incoming_person_id: row.incoming.person_id,
        existing_person_id: row.existing.person_id,
        kind: "name_similarity" as const,
        value_hash: row.value_hash,
        source: "identity_sweep_manual",
        reason: row.reason,
        status: "pending" as const,
        occurrences: row.cluster_size ?? 1,
      }))
      // Upsert en lotes dentro de la ventana solicitada (probado ~2s por cada
      // 8000 filas contra Supabase). El total de pares puede requerir varias
      // llamadas con write_offset creciente para completarse sin exceder el
      // tiempo máximo del function.
      const batchSize = 4000
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize)
        const { error, count } = await sb.from("crm_identity_conflicts").upsert(batch, {
          onConflict: "kind,value_hash,incoming_person_id,existing_person_id,reason",
          ignoreDuplicates: true,
          count: "exact",
        })
        if (error) errors.push(error.message)
        else inserted += count ?? batch.length
      }
    }

    // La cola completa de candidatos puede superar 200k filas (~30MB+ de
    // JSON); devolver todo rompía el cliente (respuesta truncada). Se
    // conserva un resumen por motivo + una muestra acotada para inspección
    // manual; el conjunto completo ya queda persistido en
    // crm_identity_conflicts para revisión en /conflictos-identidad.
    const reasonCounts: Record<string, number> = {}
    for (const row of summary) reasonCounts[row.reason] = (reasonCounts[row.reason] || 0) + 1

    return NextResponse.json({
      total_people_with_name: people.length,
      candidate_pairs: pairs.length,
      reason_counts: reasonCounts,
      write_window: { offset: writeOffset, limit: writeLimit, processed: windowSlice.length },
      next_write_offset: writeOffset + windowSlice.length < pairs.length ? writeOffset + windowSlice.length : null,
      inserted_or_existing: dryRun ? 0 : inserted,
      write_errors: errors.length ? errors.slice(0, 10) : undefined,
      dry_run: dryRun,
      sample_candidates: summary.slice(0, 200),
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error de servidor" }, { status: 500 })
  }
}
