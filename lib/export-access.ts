// La UI puede usar esta regla como mejora de experiencia, pero la autorización
// real siempre se vuelve a validar contra team_members en el servidor.
export function canExportRole(role: string | null | undefined) {
  return role === "CEO"
}

export function canExportAgendas(_role: string | null | undefined, email: string | null | undefined) {
  return configuredEmails("AGENDA_EXPORT_EMAILS").has((email || "").trim().toLowerCase())
}

function configuredEmails(name: "AGENDA_EXPORT_EMAILS" | "PAYMENT_EXPORT_EMAILS") {
  return new Set(String(process.env[name] || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean))
}

export function canExportPayments(email: string | null | undefined) {
  return configuredEmails("PAYMENT_EXPORT_EMAILS").has((email || "").trim().toLowerCase())
}
