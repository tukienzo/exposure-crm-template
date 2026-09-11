import type { SupabaseClient } from "@supabase/supabase-js"

export async function beginIntegrationJob(
  client: SupabaseClient,
  provider: string,
  jobType: string,
  externalId: string,
  payload: Record<string, unknown> = {},
) {
  const { data } = await client.rpc("crm_enqueue_integration_job", {
    p_provider: provider,
    p_job_type: jobType,
    p_external_id: externalId,
    p_payload: payload,
  })
  return typeof data === "string" ? data : null
}

export async function finishIntegrationJob(
  client: SupabaseClient,
  input: { jobId: string | null; provider: string; route: string; startedAt: number; success: boolean; error?: unknown },
) {
  const duration = Math.max(0, Date.now() - input.startedAt)
  const error = input.error instanceof Error ? input.error.message : input.error ? String(input.error) : null
  if (input.jobId) {
    await client.rpc("crm_finish_integration_job", {
      p_job_id: input.jobId,
      p_success: input.success,
      p_duration_ms: duration,
      p_error: error,
    })
  }
  await client.from("crm_api_observations").insert({
    route: input.route,
    provider: input.provider,
    status_code: input.success ? 200 : 500,
    duration_ms: duration,
    error_code: input.success ? null : "integration_error",
    metadata: error ? { error: error.slice(0, 300) } : {},
  })
}
