create table if not exists public.crm_quality_resolutions (
  issue_key text primary key,
  status text not null check (status in ('resolved','ignored')),
  note text,
  resolved_by text,
  resolved_at timestamptz not null default now()
);

alter table public.crm_quality_resolutions enable row level security;
revoke all on public.crm_quality_resolutions from anon, authenticated;
grant all on public.crm_quality_resolutions to service_role;

create or replace view public.crm_data_quality_queue as
with issues as (
  select 'agenda:'||a.id||':setter' issue_key, 'agenda' entity_type, a.id::text entity_id,
    'Setter faltante' issue_type, 'alta' severity, 'Setter' assigned_role,
    coalesce(a.setter,'') owner_name, a.nombre entity_name, a.fecha_agenda occurred_at,
    jsonb_build_object('fecha',a.fecha_agenda,'closer',a.closer) evidence
  from public.agendas a where a.fecha_agenda >= '2026-08-01' and nullif(trim(a.setter),'') is null
  union all
  select 'agenda:'||a.id||':source','agenda',a.id::text,'Fuente faltante','alta','Setter',coalesce(a.setter,''),a.nombre,a.fecha_agenda,
    jsonb_build_object('fecha',a.fecha_agenda,'cuenta',a.cuenta)
  from public.agendas a where a.fecha_agenda >= '2026-08-01' and nullif(trim(a.fuente),'') is null
  union all
  select 'agenda:'||a.id||':grade','agenda',a.id::text,'Calificación pendiente','media','Setter',coalesce(a.setter,''),a.nombre,a.fecha_agenda,
    jsonb_build_object('fecha',a.fecha_agenda,'calificacion',a.calificacion)
  from public.agendas a where a.fecha_agenda >= '2026-08-01' and coalesce(trim(a.calificacion),'') !~* '^(LEAD )?[SABCD]$'
  union all
  select 'agenda:'||a.id||':chat','agenda',a.id::text,'Resumen de chat faltante','media','Manager MKT',coalesce(a.setter,''),a.nombre,a.fecha_agenda,
    jsonb_build_object('fecha',a.fecha_agenda)
  from public.agendas a where a.fecha_agenda >= '2026-08-01' and nullif(trim(a.resumen_chat),'') is null
  union all
  select 'payment:'||p.id||':setter','pago',p.id::text,'Pago sin setter','alta','Closer',coalesce(p.closer,''),p.cliente,p.fecha::timestamptz,
    jsonb_build_object('monto',p.monto,'tipo',p.tipo)
  from public.pagos p where p.record_status='active' and p.fecha >= '2026-08-01' and nullif(trim(p.setter),'') is null
  union all
  select 'payment:'||p.id||':receipt','pago',p.id::text,'Comprobante faltante','alta','Closer',coalesce(p.closer,''),p.cliente,p.fecha::timestamptz,
    jsonb_build_object('monto',p.monto,'tipo',p.tipo)
  from public.pagos p where p.record_status='active' and p.fecha >= '2026-08-01' and nullif(trim(p.comprobante),'') is null
  union all
  select 'call:'||c.id||':identity','llamada',c.id::text,'Fathom sin identidad','alta','Manager MKT','',coalesce(c.title,'Llamada'),c.occurred_at,
    jsonb_build_object('fathom_url',c.fathom_url,'needs_review',c.needs_review)
  from public.crm_call_records c where c.occurred_at >= '2026-07-01' and c.person_id is null
  union all
  select 'call:'||c.id||':agenda','llamada',c.id::text,'Fathom sin agenda','media','Manager MKT','',coalesce(c.title,'Llamada'),c.occurred_at,
    jsonb_build_object('fathom_url',c.fathom_url,'person_id',c.person_id)
  from public.crm_call_records c where c.occurred_at >= '2026-07-01' and c.agenda_id is null
  union all
  select 'client:'||c.id||':csm','cliente',c.id::text,'Cliente sin responsable CSM','alta','CSM',coalesce(c.csm_owner,''),c.nombre,c.fecha_ingreso::timestamptz,
    jsonb_build_object('etapa',c.etapa,'operacion',c.operacion_original)
  from public.clientes c where c.record_status='active' and nullif(trim(c.csm_owner),'') is null
  union all
  select 'client:'||c.id||':health','cliente',c.id::text,'Cliente sin salud','media','CSM',coalesce(c.csm_owner,''),c.nombre,c.fecha_ingreso::timestamptz,
    jsonb_build_object('etapa',c.etapa)
  from public.clientes c where c.record_status='active' and c.health_status is null
  union all
  select 'client:'||c.id||':next','cliente',c.id::text,'Cliente sin próxima acción','alta','CSM',coalesce(c.csm_owner,''),c.nombre,c.fecha_ingreso::timestamptz,
    jsonb_build_object('etapa',c.etapa,'next_action',c.next_action,'next_action_at',c.next_action_at)
  from public.clientes c where c.record_status='active' and (nullif(trim(c.next_action),'') is null or c.next_action_at is null)
  union all
  select 'content:'||c.id||':angle','contenido',c.id::text,'Contenido sin ángulo','media','Manager MKT','',c.title,coalesce(c.published_at,c.planned_at,now()),
    jsonb_build_object('format',c.format,'source_key',c.source_key)
  from public.crm_content_assets c where nullif(trim(c.angle),'') is null and c.status <> 'archived'
  union all
  select 'client-person:'||c.person_id||':duplicate','cliente',c.person_id::text,'Clientes duplicados con conflicto','alta','Manager MKT','',
    min(c.nombre),max(c.created_at),jsonb_build_object('rows',count(*),'client_ids',jsonb_agg(c.id order by c.id),'stages',jsonb_agg(c.etapa order by c.id))
  from public.clientes c
  where c.record_status <> 'merged' and c.person_id is not null
  group by c.person_id having count(*) > 1
)
select i.*, coalesce(r.status,'open') status, r.note, r.resolved_by, r.resolved_at
from issues i left join public.crm_quality_resolutions r using(issue_key);

revoke all on public.crm_data_quality_queue from anon, authenticated;
grant select on public.crm_data_quality_queue to service_role;
