-- Historia unificada del lead. Diseñada para correr primero en preview.
create extension if not exists pgcrypto;

create sequence if not exists public.crm_lead_number_seq start 1;

create table if not exists public.crm_people (
  id uuid primary key default gen_random_uuid(),
  internal_code text not null unique default ('L-' || lpad(nextval('public.crm_lead_number_seq')::text, 6, '0')),
  display_name text,
  primary_phone text,
  primary_instagram text,
  primary_email text,
  status text not null default 'lead',
  merged_into uuid references public.crm_people(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_identities (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.crm_people(id) on delete cascade,
  kind text not null check (kind in ('phone','instagram','email','manychat','iclosed','external')),
  value text not null,
  source text,
  verified boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(kind, value)
);

create table if not exists public.crm_events (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.crm_people(id) on delete cascade,
  event_type text not null,
  occurred_at timestamptz not null,
  source text not null,
  source_record_type text,
  source_record_id text,
  title text,
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text unique,
  created_at timestamptz not null default now()
);

create index if not exists crm_identities_person_idx on public.crm_identities(person_id);
create index if not exists crm_events_person_time_idx on public.crm_events(person_id, occurred_at desc);
create index if not exists crm_events_type_time_idx on public.crm_events(event_type, occurred_at desc);

create or replace function public.crm_norm_phone(v text) returns text
language sql immutable as $$ select nullif(regexp_replace(coalesce(v,''), '[^0-9]', '', 'g'), '') $$;

create or replace function public.crm_norm_instagram(v text) returns text
language sql immutable as $$ select nullif(lower(regexp_replace(trim(coalesce(v,'')), '^@', '')), '') $$;

create or replace function public.crm_touch_person() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists crm_people_touch on public.crm_people;
create trigger crm_people_touch before update on public.crm_people for each row execute function public.crm_touch_person();

-- La identidad canónica se agrega sin romper las tablas actuales.
do $$ begin
  if to_regclass('public.agendas') is not null then alter table public.agendas add column if not exists person_id uuid references public.crm_people(id); end if;
  if to_regclass('public.pagos') is not null then alter table public.pagos add column if not exists person_id uuid references public.crm_people(id); end if;
  if to_regclass('public.clientes') is not null then alter table public.clientes add column if not exists person_id uuid references public.crm_people(id); end if;
  if to_regclass('public.planes_pago') is not null then alter table public.planes_pago add column if not exists person_id uuid references public.crm_people(id); end if;
end $$;

-- Resuelve una persona priorizando teléfono, después Instagram. Nunca une solo por nombre.
create or replace function public.crm_resolve_person(p_name text, p_phone text, p_instagram text, p_source text)
returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid; phone text := crm_norm_phone(p_phone); ig text := crm_norm_instagram(p_instagram);
begin
  if phone is not null then select person_id into pid from crm_identities where kind='phone' and value=phone;
  end if;
  if pid is null and ig is not null then select person_id into pid from crm_identities where kind='instagram' and value=ig;
  end if;
  if pid is null then
    insert into crm_people(display_name, primary_phone, primary_instagram) values (nullif(trim(p_name),''), phone, ig) returning id into pid;
  else
    update crm_people set display_name=coalesce(nullif(trim(p_name),''),display_name), primary_phone=coalesce(primary_phone,phone), primary_instagram=coalesce(primary_instagram,ig) where id=pid;
  end if;
  if phone is not null then insert into crm_identities(person_id,kind,value,source) values(pid,'phone',phone,p_source) on conflict(kind,value) do update set last_seen_at=now(); end if;
  if ig is not null then insert into crm_identities(person_id,kind,value,source) values(pid,'instagram',ig,p_source) on conflict(kind,value) do update set last_seen_at=now(); end if;
  return pid;
end $$;

-- Backfill seguro: agenda primero porque suele contener teléfono + Instagram.
do $$ declare r record; pid uuid; begin
  if to_regclass('public.agendas') is not null then
    for r in select id,nombre,telefono,instagram from public.agendas where person_id is null loop
      pid := public.crm_resolve_person(r.nombre,r.telefono,r.instagram,'agendas');
      update public.agendas set person_id=pid where id=r.id;
    end loop;
  end if;
  if to_regclass('public.pagos') is not null then
    for r in select id,cliente,telefono from public.pagos where person_id is null loop
      pid := public.crm_resolve_person(r.cliente,r.telefono,null,'pagos');
      update public.pagos set person_id=pid where id=r.id;
    end loop;
  end if;
  if to_regclass('public.clientes') is not null then
    for r in select id,nombre,telefono from public.clientes where person_id is null loop
      pid := public.crm_resolve_person(r.nombre,r.telefono,null,'clientes');
      update public.clientes set person_id=pid where id=r.id;
    end loop;
  end if;
  if to_regclass('public.planes_pago') is not null then
    for r in select id,cliente,telefono from public.planes_pago where person_id is null loop
      pid := public.crm_resolve_person(r.cliente,r.telefono,null,'planes_pago');
      update public.planes_pago set person_id=pid where id=r.id;
    end loop;
  end if;
end $$;

-- Línea de tiempo histórica derivada de los datos que ya existen.
insert into public.crm_events(person_id,event_type,occurred_at,source,source_record_type,source_record_id,title,metadata,dedupe_key)
select person_id,'lead_created',coalesce(fecha_lead,created_at),'crm','agenda',id::text,'Lead ingresó',jsonb_strip_nulls(jsonb_build_object('fuente',fuente,'cuenta',cuenta,'recurso',recurso)),'agenda:'||id||':lead'
from public.agendas where person_id is not null and coalesce(fecha_lead,created_at) is not null on conflict(dedupe_key) do nothing;

insert into public.crm_events(person_id,event_type,occurred_at,source,source_record_type,source_record_id,title,metadata,dedupe_key)
select person_id,'call_booked',coalesce(fecha_agenda,created_at),'lead','agenda',id::text,'Agendó llamada',jsonb_strip_nulls(jsonb_build_object('closer',closer,'setter',setter,'calificacion',calificacion,'utm',fuente)),'agenda:'||id||':booked'
from public.agendas where person_id is not null and coalesce(fecha_agenda,created_at) is not null on conflict(dedupe_key) do nothing;

insert into public.crm_events(person_id,event_type,occurred_at,source,source_record_type,source_record_id,title,metadata,dedupe_key)
select person_id,case when show then 'call_showed' else 'call_no_show' end,coalesce(fecha_closer,fecha_agenda,created_at),'crm','agenda',id::text,case when show then 'Se presentó a la llamada' else 'No se presentó' end,jsonb_strip_nulls(jsonb_build_object('closer',closer,'fathom',link_fathom,'resultado',estado,'motivo',motivo_no_cierre)),'agenda:'||id||':call_result'
from public.agendas where person_id is not null and (show=true or estado='No Show') on conflict(dedupe_key) do nothing;

insert into public.crm_events(person_id,event_type,occurred_at,source,source_record_type,source_record_id,title,metadata,dedupe_key)
select person_id,'payment_received',coalesce(fecha,created_at),'crm','pago',id::text,'Pago recibido',jsonb_strip_nulls(jsonb_build_object('monto',monto,'tipo',tipo,'operacion',operacion,'closer',closer,'medio',medio_de_pago)),'pago:'||id
from public.pagos where person_id is not null and coalesce(fecha,created_at) is not null on conflict(dedupe_key) do nothing;

insert into public.crm_events(person_id,event_type,occurred_at,source,source_record_type,source_record_id,title,metadata,dedupe_key)
select person_id,'onboarding',coalesce(fecha_primer_call,fecha_ingreso,created_at),'crm','cliente',id::text,'Onboarding / ingreso',jsonb_strip_nulls(jsonb_build_object('etapa',etapa,'programa',operacion_original,'link',link_call_onboarding)),'cliente:'||id||':onboarding'
from public.clientes where person_id is not null and coalesce(fecha_primer_call,fecha_ingreso,created_at) is not null on conflict(dedupe_key) do nothing;

-- Mantiene la ficha enlazada y la línea de tiempo actualizada en cada cambio futuro.
create or replace function public.crm_agenda_before() returns trigger language plpgsql security definer set search_path=public as $$
begin
  new.person_id := crm_resolve_person(new.nombre,new.telefono,new.instagram,'agendas');
  return new;
end $$;
drop trigger if exists crm_agenda_before on public.agendas;
create trigger crm_agenda_before before insert or update of nombre,telefono,instagram on public.agendas for each row execute function public.crm_agenda_before();

create or replace function public.crm_agenda_after() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.fecha_agenda is not null then
    insert into crm_events(person_id,event_type,occurred_at,source,source_record_type,source_record_id,title,metadata,dedupe_key)
    values(new.person_id,'call_booked',new.fecha_agenda,'lead','agenda',new.id::text,'Agendó llamada',jsonb_strip_nulls(jsonb_build_object('closer',new.closer,'setter',new.setter,'calificacion',new.calificacion,'utm',new.fuente)),'agenda:'||new.id||':booked')
    on conflict(dedupe_key) do update set occurred_at=excluded.occurred_at,metadata=excluded.metadata;
  end if;
  if new.show=true or new.estado='No Show' then
    insert into crm_events(person_id,event_type,occurred_at,source,source_record_type,source_record_id,title,metadata,dedupe_key)
    values(new.person_id,case when new.show then 'call_showed' else 'call_no_show' end,coalesce(new.fecha_closer,new.fecha_agenda,now()),'crm','agenda',new.id::text,case when new.show then 'Se presentó a la llamada' else 'No se presentó' end,jsonb_strip_nulls(jsonb_build_object('closer',new.closer,'fathom',new.link_fathom,'resultado',new.estado,'motivo',new.motivo_no_cierre)),'agenda:'||new.id||':call_result')
    on conflict(dedupe_key) do update set event_type=excluded.event_type,occurred_at=excluded.occurred_at,title=excluded.title,metadata=excluded.metadata;
  end if;
  return new;
end $$;
drop trigger if exists crm_agenda_after on public.agendas;
create trigger crm_agenda_after after insert or update on public.agendas for each row execute function public.crm_agenda_after();

create or replace function public.crm_pago_before() returns trigger language plpgsql security definer set search_path=public as $$
begin new.person_id := crm_resolve_person(new.cliente,new.telefono,null,'pagos'); return new; end $$;
drop trigger if exists crm_pago_before on public.pagos;
create trigger crm_pago_before before insert or update of cliente,telefono on public.pagos for each row execute function public.crm_pago_before();

create or replace function public.crm_pago_after() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into crm_events(person_id,event_type,occurred_at,source,source_record_type,source_record_id,title,metadata,dedupe_key)
  values(new.person_id,'payment_received',coalesce(new.fecha,now()),'crm','pago',new.id::text,'Pago recibido',jsonb_strip_nulls(jsonb_build_object('monto',new.monto,'tipo',new.tipo,'operacion',new.operacion,'closer',new.closer,'medio',new.medio_de_pago)),'pago:'||new.id)
  on conflict(dedupe_key) do update set occurred_at=excluded.occurred_at,metadata=excluded.metadata;
  update crm_people set status='cliente' where id=new.person_id;
  return new;
end $$;
drop trigger if exists crm_pago_after on public.pagos;
create trigger crm_pago_after after insert or update on public.pagos for each row execute function public.crm_pago_after();

create or replace function public.crm_cliente_before() returns trigger language plpgsql security definer set search_path=public as $$
begin new.person_id := crm_resolve_person(new.nombre,new.telefono,null,'clientes'); return new; end $$;
drop trigger if exists crm_cliente_before on public.clientes;
create trigger crm_cliente_before before insert or update of nombre,telefono on public.clientes for each row execute function public.crm_cliente_before();

create or replace function public.crm_cliente_after() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if coalesce(new.fecha_primer_call,new.fecha_ingreso) is not null then
    insert into crm_events(person_id,event_type,occurred_at,source,source_record_type,source_record_id,title,metadata,dedupe_key)
    values(new.person_id,'onboarding',coalesce(new.fecha_primer_call,new.fecha_ingreso),'crm','cliente',new.id::text,'Onboarding / ingreso',jsonb_strip_nulls(jsonb_build_object('etapa',new.etapa,'programa',new.operacion_original,'link',new.link_call_onboarding)),'cliente:'||new.id||':onboarding')
    on conflict(dedupe_key) do update set occurred_at=excluded.occurred_at,metadata=excluded.metadata;
  end if;
  update crm_people set status='cliente' where id=new.person_id;
  return new;
end $$;
drop trigger if exists crm_cliente_after on public.clientes;
create trigger crm_cliente_after after insert or update on public.clientes for each row execute function public.crm_cliente_after();

alter table public.crm_people enable row level security;
alter table public.crm_identities enable row level security;
alter table public.crm_events enable row level security;

comment on table public.crm_people is 'Ficha canónica de persona. internal_code es técnico y no reemplaza el nombre visible.';
comment on table public.crm_events is 'Eventos append-only extensibles. event_type admite señales de marketing (manychat_tag, sales_angle, content_viewed/replied, cta_replied), venta, pago, onboarding_step, upsell, resell y offboarding; metadata conserva atributos de cada fuente sin inventar columnas ni datos.';
