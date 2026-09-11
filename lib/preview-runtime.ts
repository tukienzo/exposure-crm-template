export function supabaseProjectRef() {
  try {
    return new URL(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "",
    ).hostname.split(".")[0] || null
  } catch {
    return null
  }
}

export function isPreviewRuntime() {
  return process.env.VERCEL_ENV === "preview"
}
