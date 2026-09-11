export function normalizeLeadEmail(value: unknown) {
  const email = String(value || "").trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

export async function attachEmailToPerson(
  admin: any,
  personId: string | null | undefined,
  rawEmail: unknown,
  source = "crm",
) {
  const email = normalizeLeadEmail(rawEmail)
  if (!email || !personId) return { email, attached: false }

  const { data: existing, error: existingError } = await admin
    .from("crm_identities")
    .select("person_id")
    .eq("kind", "email")
    .eq("value", email)
    .maybeSingle()
  if (existingError) throw existingError
  if (existing?.person_id && existing.person_id !== personId) {
    throw new Error("Ese email ya está vinculado a otra persona. Revisá el conflicto de identidad antes de guardarlo.")
  }

  const now = new Date().toISOString()
  const { error: identityError } = await admin.from("crm_identities").upsert(
    { person_id: personId, kind: "email", value: email, source, last_seen_at: now },
    { onConflict: "kind,value" },
  )
  if (identityError) throw identityError

  const { error: peopleError } = await admin
    .from("crm_people")
    .update({ primary_email: email, updated_at: now })
    .eq("id", personId)
  if (peopleError) throw peopleError
  return { email, attached: true }
}

export function exposeAgendaEmail(row: any) {
  if (!row) return row
  const { crm_people, ...agenda } = row
  return { ...agenda, email: crm_people?.primary_email || null }
}
