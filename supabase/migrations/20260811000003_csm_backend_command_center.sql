-- CSM + Backend command center. Additive and reversible: no historical data is removed.
alter table public.clientes
  add column if not exists csm_owner text,
  add column if not exists health_status text,
  add column if not exists last_contact_at timestamptz,
  add column if not exists next_action text,
  add column if not exists next_action_at timestamptz,
  add column if not exists backend_priority text,
  add column if not exists backend_status text,
  add column if not exists backend_potential_usd numeric(12,2),
  add column if not exists backend_offer text,
  add column if not exists backend_owner text,
  add column if not exists lifecycle_notes text;

do $$ begin
  alter table public.clientes add constraint clientes_health_status_check
    check (health_status is null or health_status in ('verde','amarillo','rojo'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.clientes add constraint clientes_backend_priority_check
    check (backend_priority is null or backend_priority in ('alta','media','baja','no_aplica'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.clientes add constraint clientes_backend_status_check
    check (backend_status is null or backend_status in ('sin_evaluar','contactar','conversando','ofertado','cerrado','no_ahora','no_califica'));
exception when duplicate_object then null; end $$;

create or replace function public.crm_record_client_command_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.person_id is not null and (
    new.csm_owner is distinct from old.csm_owner or
    new.health_status is distinct from old.health_status or
    new.next_action is distinct from old.next_action or
    new.next_action_at is distinct from old.next_action_at or
    new.backend_priority is distinct from old.backend_priority or
    new.backend_status is distinct from old.backend_status or
    new.backend_potential_usd is distinct from old.backend_potential_usd or
    new.backend_offer is distinct from old.backend_offer or
    new.backend_owner is distinct from old.backend_owner
  ) then
    insert into public.crm_events(person_id,event_type,occurred_at,source,source_record_type,source_record_id,title,metadata,dedupe_key)
    values(
      new.person_id,'customer_command_update',now(),'crm','clientes',new.id::text,'Actualización CSM / Backend',
      jsonb_strip_nulls(jsonb_build_object(
        'csm_owner',new.csm_owner,'health_status',new.health_status,
        'next_action',new.next_action,'next_action_at',new.next_action_at,
        'backend_priority',new.backend_priority,'backend_status',new.backend_status,
        'backend_potential_usd',new.backend_potential_usd,'backend_offer',new.backend_offer,
        'backend_owner',new.backend_owner
      )),
      'cliente:'||new.id||':command:'||floor(extract(epoch from clock_timestamp()) * 1000000)::bigint
    );
  end if;
  return new;
end $$;

drop trigger if exists clientes_command_event on public.clientes;
create trigger clientes_command_event
after update on public.clientes
for each row execute function public.crm_record_client_command_update();
