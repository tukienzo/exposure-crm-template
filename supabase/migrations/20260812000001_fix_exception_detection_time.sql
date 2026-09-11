begin;

create or replace view public.crm_exception_queue as
with detected as (
  select q.*,
    greatest(
      coalesce(q.occurred_at, timestamptz '2026-08-12 02:18:00+00'),
      timestamptz '2026-08-12 02:18:00+00'
    ) as detected_at
  from public.crm_data_quality_queue q
)
select
  d.issue_key, d.entity_type, d.entity_id, d.issue_type, d.severity,
  d.assigned_role, d.owner_name, d.entity_name, d.occurred_at, d.evidence,
  d.status, d.note, d.resolved_by, d.resolved_at,
  case d.severity
    when 'alta' then d.detected_at + interval '2 hours'
    when 'media' then d.detected_at + interval '24 hours'
    else d.detected_at + interval '72 hours'
  end as due_at,
  now() > case d.severity
    when 'alta' then d.detected_at + interval '2 hours'
    when 'media' then d.detected_at + interval '24 hours'
    else d.detected_at + interval '72 hours'
  end as is_overdue,
  concat(d.issue_key, ':', coalesce(d.owner_name, d.assigned_role), ':', to_char(d.detected_at, 'YYYY-MM-DD')) as notification_key,
  d.detected_at
from detected d;

create or replace function public.crm_queue_exception_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare inserted_count integer;
begin
  insert into public.crm_notification_outbox (
    notification_key, channel, account_id, assigned_role, owner_name,
    title, body, source_issue_key, available_at
  )
  select
    e.notification_key, 'whatsapp', 'default', e.assigned_role,
    nullif(trim(e.owner_name), ''),
    'Excepción CRM vencida',
    concat(e.issue_type, ' · ', e.entity_name, ' · SLA ', to_char(e.due_at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI')),
    e.issue_key, now()
  from public.crm_exception_queue e
  where e.status = 'open'
    and e.is_overdue
    and e.detected_at >= now() - interval '30 days'
    and nullif(trim(e.owner_name), '') is not null
  on conflict (notification_key) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

update public.crm_notification_outbox n
set status='cancelled', updated_at=now(), last_error='SLA recalculado desde detección; aviso previo cancelado.'
where n.status='pending'
  and exists (
    select 1 from public.crm_exception_queue e
    where e.issue_key=n.source_issue_key and not e.is_overdue
  );

commit;
