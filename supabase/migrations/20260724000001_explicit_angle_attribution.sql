-- Backfill conservador de persona -> ángulo, exclusivo de preview.
-- Solo usa el campo Recurso cuando contiene literalmente un nombre canónico.
-- No infiere por fecha, CTA, título, similitud ni nombre de persona.
with explicit_resource_angles as (
  select
    a.id as agenda_id,
    a.person_id,
    coalesce(a.fecha_agenda, a.created_at, now()) as occurred_at,
    a.recurso,
    case
      when lower(a.recurso) ~ '(^|[^a-z])game([^a-z]|$)' then 'Game'
      when lower(a.recurso) like '%el visto%' then 'El visto'
      when lower(a.recurso) like '%hombre bueno%' then 'Hombre bueno'
      when lower(a.recurso) like '%no te anim%' then 'No te animás'
      when lower(a.recurso) like '%needy%' then 'Escasez / Needy'
      when lower(a.recurso) like '%post%separ%' then 'Post-separación'
      when lower(a.recurso) ~ '(^|[^a-z])looks([^a-z]|$)' then 'Looks'
      else null
    end as angle
  from public.agendas a
  where a.person_id is not null and nullif(trim(a.recurso), '') is not null
), eligible as (
  select * from explicit_resource_angles where angle is not null
)
insert into public.crm_events(
  person_id, event_type, occurred_at, source, source_record_type,
  source_record_id, title, metadata, dedupe_key
)
select
  person_id,
  'sales_angle',
  occurred_at,
  'agenda_resource',
  'agenda',
  agenda_id::text,
  'Ángulo explícito: ' || angle,
  jsonb_build_object(
    'angle', angle,
    'evidence_field', 'agendas.recurso',
    'evidence_value', recurso,
    'attribution_method', 'explicit_canonical_angle_literal'
  ),
  'angle:agenda:' || agenda_id::text || ':' || lower(replace(angle, ' ', '-'))
from eligible
on conflict (dedupe_key) do nothing;
