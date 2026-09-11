-- Consolidación canónica del CRM.
-- Aplicar primero y exclusivamente en la rama Supabase preview.
-- Esta migración es re-ejecutable: no borra datos y usa claves naturales para
-- que backfills, imports y triggers sean idempotentes.

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

alter table public.crm_people add column if not exists name_normalized text;
alter table public.crm_people add column if not exists first_seen_at timestamptz;
alter table public.crm_people add column if not exists last_seen_at timestamptz;

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

create table if not exists public.crm_identity_conflicts (
  id uuid primary key default gen_random_uuid(),
  incoming_person_id uuid references public.crm_people(id),
  existing_person_id uuid references public.crm_people(id),
  kind text not null,
  value_hash text not null,
  source text,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','resolved','ignored')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  occurrences integer not null default 1,
  unique(kind, value_hash, incoming_person_id, existing_person_id, reason)
);

create table if not exists public.crm_import_runs (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  source_sha256 text not null,
  status text not null default 'running' check (status in ('running','completed','failed','dry_run')),
  records_seen integer not null default 0,
  records_imported integer not null default 0,
  records_skipped integer not null default 0,
  conflicts integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique(source_name, source_sha256)
);

create table if not exists public.crm_content_assets (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  title text not null,
  platform text,
  angle text,
  format text,
  topic text,
  cta text,
  planned_at timestamptz,
  published_at timestamptz,
  source_url text,
  status text not null default 'historical',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_people_name_seen_idx
  on public.crm_people(name_normalized, first_seen_at)
  where merged_into is null;
create index if not exists crm_identities_person_idx on public.crm_identities(person_id);
create index if not exists crm_events_person_time_idx on public.crm_events(person_id, occurred_at desc);
create index if not exists crm_events_type_time_idx on public.crm_events(event_type, occurred_at desc);
create index if not exists crm_events_content_angle_idx
  on public.crm_events ((metadata->>'angle'), occurred_at desc);
create index if not exists crm_content_angle_time_idx
  on public.crm_content_assets(angle, (coalesce(published_at, planned_at)) desc);

create or replace function public.crm_norm_phone(v text) returns text
language sql immutable parallel safe as $$
  with cleaned as (
    select regexp_replace(coalesce(v,''), '[^0-9]', '', 'g') as digits
  ), international as (
    select case when digits like '00%' then substring(digits from 3) else digits end as digits
    from cleaned
  )
  select case when length(digits) between 8 and 15 then digits else null end
  from international
$$;

create or replace function public.crm_norm_instagram(v text) returns text
language sql immutable parallel safe as $$
  with cleaned as (
    select lower(trim(coalesce(v,''))) as value
  ), handle as (
    select regexp_replace(
      regexp_replace(
        regexp_replace(value, '^https?://(www\.)?instagram\.com/', ''),
        '[/?#].*$', ''
      ),
      '^@', ''
    ) as value
    from cleaned
  )
  select case when value ~ '^[a-z0-9._]{1,30}$' then value else null end
  from handle
$$;

create or replace function public.crm_norm_email(v text) returns text
language sql immutable parallel safe as $$
  select case
    when lower(trim(coalesce(v,''))) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      then lower(trim(v))
    else null
  end
$$;

create or replace function public.crm_norm_name(v text) returns text
language sql immutable parallel safe as $$
  select nullif(
    trim(regexp_replace(
      translate(lower(coalesce(v,'')), 'áéíóúüñ', 'aeiouun'),
      '[^a-z0-9]+', ' ', 'g'
    )),
    ''
  )
$$;

create or replace function public.crm_touch_person() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.name_normalized := public.crm_norm_name(new.display_name);
  return new;
end
$$;

drop trigger if exists crm_people_touch on public.crm_people;
create trigger crm_people_touch
before insert or update of display_name on public.crm_people
for each row execute function public.crm_touch_person();

-- Completa los campos agregados cuando esta migración corre después de la
-- primera versión de historia de leads.
update public.crm_people
set
  name_normalized = public.crm_norm_name(display_name),
  first_seen_at = coalesce(first_seen_at, created_at),
  last_seen_at = coalesce(last_seen_at, updated_at, created_at)
where
  name_normalized is distinct from public.crm_norm_name(display_name)
  or first_seen_at is null
  or last_seen_at is null;

create or replace function public.crm_touch_content() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists crm_content_touch on public.crm_content_assets;
create trigger crm_content_touch
before update on public.crm_content_assets
for each row execute function public.crm_touch_content();

do $$
begin
  if to_regclass('public.agendas') is not null then
    alter table public.agendas add column if not exists person_id uuid references public.crm_people(id);
  end if;
  if to_regclass('public.pagos') is not null then
    alter table public.pagos add column if not exists person_id uuid references public.crm_people(id);
    alter table public.pagos add column if not exists grants_access boolean;
  end if;
  if to_regclass('public.clientes') is not null then
    alter table public.clientes add column if not exists person_id uuid references public.crm_people(id);
    alter table public.clientes add column if not exists source_payment_id uuid;
    alter table public.clientes add column if not exists onboarding_form_at timestamptz;
    alter table public.clientes add column if not exists contract_client_signed_at timestamptz;
    alter table public.clientes add column if not exists contract_ceo_signed_at timestamptz;
    alter table public.clientes add column if not exists discord_access_at timestamptz;
    alter table public.clientes add column if not exists skool_access_at timestamptz;
    alter table public.clientes add column if not exists onboarding_completed_at timestamptz;
  end if;
  if to_regclass('public.planes_pago') is not null then
    alter table public.planes_pago add column if not exists person_id uuid references public.crm_people(id);
  end if;
end
$$;

drop index if exists public.clientes_person_program_unique;
create index if not exists clientes_person_program_idx
  on public.clientes(person_id, lower(coalesce(operacion_original,'')))
  where person_id is not null;
create unique index if not exists clientes_source_payment_unique
  on public.clientes(source_payment_id)
  where source_payment_id is not null;

create or replace function public.crm_record_identity_conflict(
  p_incoming uuid,
  p_existing uuid,
  p_kind text,
  p_value text,
  p_source text,
  p_reason text
) returns void
language plpgsql security definer set search_path = public as $$
declare value_digest text := encode(extensions.digest(coalesce(p_value,''), 'sha256'), 'hex');
begin
  insert into public.crm_identity_conflicts(
    incoming_person_id, existing_person_id, kind, value_hash, source, reason
  )
  values(p_incoming, p_existing, p_kind, value_digest, p_source, p_reason)
  on conflict(kind, value_hash, incoming_person_id, existing_person_id, reason)
  do update set
    last_seen_at = now(),
    occurrences = public.crm_identity_conflicts.occurrences + 1,
    source = coalesce(excluded.source, public.crm_identity_conflicts.source);
end
$$;

create or replace function public.crm_attach_identity(
  p_person uuid,
  p_kind text,
  p_value text,
  p_source text,
  p_seen_at timestamptz
) returns boolean
language plpgsql security definer set search_path = public as $$
declare existing_person uuid;
begin
  if p_value is null then return false; end if;
  select person_id into existing_person
  from public.crm_identities
  where kind = p_kind and value = p_value;

  if existing_person is not null and existing_person <> p_person then
    perform public.crm_record_identity_conflict(
      p_person, existing_person, p_kind, p_value, p_source, 'identity_owned_by_other_person'
    );
    return false;
  end if;

  insert into public.crm_identities(person_id, kind, value, source, first_seen_at, last_seen_at)
  values(
    p_person, p_kind, p_value, p_source,
    coalesce(p_seen_at, now()), coalesce(p_seen_at, now())
  )
  on conflict(kind, value) do update set
    first_seen_at = least(public.crm_identities.first_seen_at, excluded.first_seen_at),
    last_seen_at = greatest(public.crm_identities.last_seen_at, excluded.last_seen_at),
    source = coalesce(public.crm_identities.source, excluded.source);
  return true;
end
$$;

-- Prioridad: teléfono > Instagram > email.
-- Si los identificadores apuntan a personas distintas no se fusiona nada:
-- se conserva la prioridad y se registra un conflicto auditable.
-- El fallback por nombre solo existe cuando no hay ninguna identidad estable,
-- el nombre es exacto, hay fecha y existe un único candidato visto a ±14 días.
create or replace function public.crm_resolve_person(
  p_name text,
  p_phone text,
  p_instagram text,
  p_email text,
  p_source text,
  p_seen_at timestamptz default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  pid uuid;
  candidate uuid;
  phone text := public.crm_norm_phone(p_phone);
  ig text := public.crm_norm_instagram(p_instagram);
  email text := public.crm_norm_email(p_email);
  normalized_name text := public.crm_norm_name(p_name);
  seen_at timestamptz := coalesce(p_seen_at, now());
  candidate_count integer := 0;
begin
  if phone is not null then
    select person_id into pid from public.crm_identities where kind='phone' and value=phone;
  end if;
  if pid is null and ig is not null then
    select person_id into pid from public.crm_identities where kind='instagram' and value=ig;
  end if;
  if pid is null and email is not null then
    select person_id into pid from public.crm_identities where kind='email' and value=email;
  end if;

  if pid is null
     and phone is null and ig is null and email is null
     and normalized_name is not null and p_seen_at is not null then
    select count(*), min(id::text)::uuid
      into candidate_count, candidate
    from public.crm_people
    where merged_into is null
      and name_normalized = normalized_name
      and coalesce(first_seen_at, created_at)
        between seen_at - interval '14 days' and seen_at + interval '14 days';
    if candidate_count = 1 then pid := candidate; end if;
  end if;

  if pid is null then
    insert into public.crm_people(
      display_name, name_normalized, primary_phone, primary_instagram,
      primary_email, first_seen_at, last_seen_at
    )
    values(
      nullif(trim(p_name),''), normalized_name, phone, ig, email, seen_at, seen_at
    )
    returning id into pid;
  else
    update public.crm_people set
      display_name = coalesce(display_name, nullif(trim(p_name),'')),
      primary_phone = coalesce(primary_phone, phone),
      primary_instagram = coalesce(primary_instagram, ig),
      primary_email = coalesce(primary_email, email),
      first_seen_at = least(coalesce(first_seen_at, seen_at), seen_at),
      last_seen_at = greatest(coalesce(last_seen_at, seen_at), seen_at)
    where id = pid;
  end if;

  perform public.crm_attach_identity(pid, 'phone', phone, p_source, seen_at);
  perform public.crm_attach_identity(pid, 'instagram', ig, p_source, seen_at);
  perform public.crm_attach_identity(pid, 'email', email, p_source, seen_at);
  return pid;
end
$$;

-- Compatibilidad con triggers/versiones anteriores que todavía llaman 4 args.
create or replace function public.crm_resolve_person(
  p_name text,
  p_phone text,
  p_instagram text,
  p_source text
) returns uuid
language sql security definer set search_path = public as $$
  select public.crm_resolve_person(p_name, p_phone, p_instagram, null, p_source, now())
$$;

create or replace function public.crm_import_event(
  p_source text,
  p_source_record_id text,
  p_name text,
  p_phone text,
  p_instagram text,
  p_email text,
  p_event_type text,
  p_occurred_at timestamptz,
  p_title text,
  p_metadata jsonb,
  p_dedupe_key text
) returns table(person_id uuid, event_id uuid, inserted boolean)
language plpgsql security definer set search_path = public as $$
declare
  resolved_person uuid;
  resolved_event uuid;
  was_inserted boolean := false;
begin
  if nullif(trim(p_source),'') is null
     or nullif(trim(p_event_type),'') is null
     or p_occurred_at is null
     or nullif(trim(p_dedupe_key),'') is null then
    raise exception 'source, event_type, occurred_at and dedupe_key are required';
  end if;

  resolved_person := public.crm_resolve_person(
    p_name, p_phone, p_instagram, p_email, p_source, p_occurred_at
  );

  insert into public.crm_events(
    person_id, event_type, occurred_at, source, source_record_type,
    source_record_id, title, metadata, dedupe_key
  )
  values(
    resolved_person, p_event_type, p_occurred_at, p_source, 'historical_import',
    p_source_record_id, p_title, coalesce(p_metadata, '{}'::jsonb), p_dedupe_key
  )
  on conflict(dedupe_key) do update set
    person_id = excluded.person_id,
    event_type = excluded.event_type,
    occurred_at = excluded.occurred_at,
    title = excluded.title,
    metadata = excluded.metadata
  returning id, (xmax = 0) into resolved_event, was_inserted;

  return query select resolved_person, resolved_event, was_inserted;
end
$$;

create or replace function public.crm_payment_type_grants_access(p_type text)
returns boolean language sql immutable parallel safe as $$
  select coalesce(p_type,'') = any(array[
    'Venta Nueva',
    'Venta Nueva (En Call)',
    'Venta Nueva (Post Fee)',
    'Completó PIF (Post Fee)',
    'Completa Total (Post Venta)',
    'Venta Nueva Interna',
    'Venta Nueva Interna (Post Fee)'
  ])
$$;

create or replace function public.crm_ensure_onboarding_from_payment(p_payment_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  payment record;
  grants boolean := false;
begin
  select * into payment from public.pagos where id = p_payment_id;
  if payment.id is null or payment.person_id is null then return null; end if;

  grants := coalesce(payment.grants_access, false)
    or public.crm_payment_type_grants_access(payment.tipo);

  if not grants and to_regclass('public.plan_pago_items') is not null then
    select exists(
      select 1 from public.plan_pago_items
      where pago_id = payment.id::text
        and da_acceso = true
        and estado = 'pagado'
    ) into grants;
  end if;

  if not grants then return null; end if;

  update public.clientes set
    source_payment_id = coalesce(source_payment_id, payment.id),
    telefono = coalesce(telefono, payment.telefono),
    medio_de_pago = coalesce(medio_de_pago, payment.medio_de_pago),
    calificacion = coalesce(calificacion, payment.calificacion)
  where id = (
    select coalesce(
      (select min(id) from public.clientes where source_payment_id = payment.id),
      (select min(id) from public.clientes
       where person_id = payment.person_id
         and lower(coalesce(operacion_original,'')) = lower(coalesce(payment.operacion,'')))
    )
  );

  if not found then
    insert into public.clientes(
    person_id, source_payment_id, nombre, telefono, fecha_ingreso,
    operacion_original, medio_de_pago, calificacion, etapa, estado
    )
    values(
      payment.person_id, payment.id, payment.cliente, payment.telefono,
      coalesce(payment.fecha, current_date), payment.operacion,
      payment.medio_de_pago, payment.calificacion, 'onboarding_pendiente', 'activo'
    );
  end if;

  insert into public.crm_events(
    person_id, event_type, occurred_at, source, source_record_type,
    source_record_id, title, metadata, dedupe_key
  )
  values(
    payment.person_id, 'onboarding_step',
    coalesce(payment.fecha::timestamptz, payment.created_at, now()),
    'crm', 'pago', payment.id::text, 'Onboarding pendiente',
    jsonb_strip_nulls(jsonb_build_object(
      'step', 'onboarding_pendiente',
      'programa', payment.operacion,
      'payment_type', payment.tipo,
      'payment_id', payment.id
    )),
    'pago:' || payment.id || ':onboarding_enabled'
  )
  on conflict(dedupe_key) do update set metadata = excluded.metadata;

  update public.crm_people set status='cliente' where id=payment.person_id;
  return payment.person_id;
end
$$;

create or replace function public.crm_agenda_before() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  new.person_id := public.crm_resolve_person(
    new.nombre, new.telefono, new.instagram, null, 'agendas',
    coalesce(new.fecha_lead, new.fecha_agenda, new.created_at, now())
  );
  return new;
end
$$;

drop trigger if exists crm_agenda_before on public.agendas;
create trigger crm_agenda_before
before insert or update of nombre,telefono,instagram on public.agendas
for each row execute function public.crm_agenda_before();

create or replace function public.crm_pago_before() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  new.person_id := public.crm_resolve_person(
    new.cliente, new.telefono, null, null, 'pagos',
    coalesce(new.fecha::timestamptz, new.created_at, now())
  );
  new.grants_access := coalesce(new.grants_access, false)
    or public.crm_payment_type_grants_access(new.tipo);
  return new;
end
$$;

drop trigger if exists crm_pago_before on public.pagos;
create trigger crm_pago_before
before insert or update of cliente,telefono,tipo,fecha on public.pagos
for each row execute function public.crm_pago_before();

create or replace function public.crm_pago_after() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.crm_events(
    person_id,event_type,occurred_at,source,source_record_type,
    source_record_id,title,metadata,dedupe_key
  )
  values(
    new.person_id,'payment_received',coalesce(new.fecha::timestamptz,new.created_at,now()),
    'crm','pago',new.id::text,'Pago recibido',
    jsonb_strip_nulls(jsonb_build_object(
      'monto',new.monto,'tipo',new.tipo,'operacion',new.operacion,
      'closer',new.closer,'medio',new.medio_de_pago,'grants_access',new.grants_access
    )),
    'pago:'||new.id
  )
  on conflict(dedupe_key) do update set
    occurred_at=excluded.occurred_at,
    metadata=excluded.metadata;

  perform public.crm_ensure_onboarding_from_payment(new.id);
  return new;
end
$$;

drop trigger if exists crm_pago_after on public.pagos;
create trigger crm_pago_after
after insert or update on public.pagos
for each row execute function public.crm_pago_after();

create or replace function public.crm_agenda_after() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if coalesce(new.fecha_lead,new.created_at) is not null then
    insert into public.crm_events(
      person_id,event_type,occurred_at,source,source_record_type,
      source_record_id,title,metadata,dedupe_key
    )
    values(
      new.person_id,'lead_created',coalesce(new.fecha_lead,new.created_at),
      'crm','agenda',new.id::text,'Lead ingresó',
      jsonb_strip_nulls(jsonb_build_object(
        'fuente',new.fuente,'cuenta',new.cuenta,'recurso',new.recurso,
        'manychat',new.manychat,'contenido',new.puntos_contacto
      )),
      'agenda:'||new.id||':lead'
    )
    on conflict(dedupe_key) do update set
      occurred_at=excluded.occurred_at,
      metadata=excluded.metadata;
  end if;

  if new.fecha_agenda is not null then
    insert into public.crm_events(
      person_id,event_type,occurred_at,source,source_record_type,
      source_record_id,title,metadata,dedupe_key
    )
    values(
      new.person_id,'call_booked',new.fecha_agenda,'crm','agenda',
      new.id::text,'Agendó llamada',
      jsonb_strip_nulls(jsonb_build_object(
        'closer',new.closer,'setter',new.setter,'calificacion',new.calificacion,
        'fuente',new.fuente,'contenido',new.puntos_contacto
      )),
      'agenda:'||new.id||':booked'
    )
    on conflict(dedupe_key) do update set
      occurred_at=excluded.occurred_at,
      metadata=excluded.metadata;
  end if;

  if new.show=true or new.estado='No Show' then
    insert into public.crm_events(
      person_id,event_type,occurred_at,source,source_record_type,
      source_record_id,title,metadata,dedupe_key
    )
    values(
      new.person_id,
      case when new.show then 'call_showed' else 'call_no_show' end,
      coalesce(new.fecha_closer,new.fecha_agenda,new.created_at,now()),
      'crm','agenda',new.id::text,
      case when new.show then 'Se presentó a la llamada' else 'No se presentó' end,
      jsonb_strip_nulls(jsonb_build_object(
        'closer',new.closer,'fathom',new.link_fathom,'resultado',new.estado,
        'motivo',new.motivo_no_cierre,'calificacion',new.calificacion
      )),
      'agenda:'||new.id||':call_result'
    )
    on conflict(dedupe_key) do update set
      event_type=excluded.event_type,
      occurred_at=excluded.occurred_at,
      title=excluded.title,
      metadata=excluded.metadata;
  end if;
  return new;
end
$$;

drop trigger if exists crm_agenda_after on public.agendas;
create trigger crm_agenda_after
after insert or update on public.agendas
for each row execute function public.crm_agenda_after();

create or replace function public.crm_cliente_before() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  new.person_id := public.crm_resolve_person(
    new.nombre, new.telefono, null, null, 'clientes',
    coalesce(new.fecha_ingreso::timestamptz,new.created_at,now())
  );
  return new;
end
$$;

drop trigger if exists crm_cliente_before on public.clientes;
create trigger crm_cliente_before
before insert or update of nombre,telefono,fecha_ingreso on public.clientes
for each row execute function public.crm_cliente_before();

create or replace function public.crm_cliente_after() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if coalesce(new.fecha_primer_call,new.fecha_ingreso) is not null then
    insert into public.crm_events(
      person_id,event_type,occurred_at,source,source_record_type,
      source_record_id,title,metadata,dedupe_key
    )
    values(
      new.person_id,'onboarding',
      coalesce(new.fecha_primer_call::timestamptz,new.fecha_ingreso::timestamptz),
      'crm','cliente',new.id::text,'Onboarding / ingreso',
      jsonb_strip_nulls(jsonb_build_object(
        'etapa',new.etapa,'programa',new.operacion_original,
        'link',new.link_call_onboarding
      )),
      'cliente:'||new.id||':onboarding'
    )
    on conflict(dedupe_key) do update set
      occurred_at=excluded.occurred_at,
      metadata=excluded.metadata;
  end if;

  insert into public.crm_events(
    person_id,event_type,occurred_at,source,source_record_type,
    source_record_id,title,metadata,dedupe_key
  )
  select
    new.person_id,'onboarding_step',step_at,'crm','cliente',new.id::text,
    step_title,jsonb_build_object('step',step_key,'programa',new.operacion_original),
    'cliente:'||new.id||':onboarding_step:'||step_key
  from (values
    ('form_received','Formulario recibido',new.onboarding_form_at),
    ('contract_client_signed','Contrato firmado por cliente',new.contract_client_signed_at),
    ('contract_ceo_signed','Contrato firmado por CEO',new.contract_ceo_signed_at),
    ('discord_access','Acceso a Discord',new.discord_access_at),
    ('skool_access','Acceso a Skool',new.skool_access_at),
    ('onboarding_completed','Onboarding completado',new.onboarding_completed_at)
  ) as steps(step_key,step_title,step_at)
  where step_at is not null
  on conflict(dedupe_key) do update set
    occurred_at=excluded.occurred_at,
    metadata=excluded.metadata;

  if new.etapa is not null and (tg_op='INSERT' or new.etapa is distinct from old.etapa) then
    insert into public.crm_events(
      person_id,event_type,occurred_at,source,source_record_type,
      source_record_id,title,metadata,dedupe_key
    )
    values(
      new.person_id,
      case
        when new.etapa='en_charla_upsell' then 'upsell'
        when new.etapa='offboarding_pendiente' then 'offboarding'
        else 'service_stage'
      end,
      now(),'crm','cliente',new.id::text,'Etapa de cliente',
      jsonb_build_object('etapa',new.etapa,'programa',new.operacion_original),
      'cliente:'||new.id||':stage:'||new.etapa
    )
    on conflict(dedupe_key) do update set metadata=excluded.metadata;
  end if;

  update public.crm_people set status='cliente' where id=new.person_id;
  return new;
end
$$;

drop trigger if exists crm_cliente_after on public.clientes;
create trigger crm_cliente_after
after insert or update on public.clientes
for each row execute function public.crm_cliente_after();

create or replace function public.crm_plan_before() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  new.person_id := public.crm_resolve_person(
    new.cliente, new.telefono, null, null, 'planes_pago',
    coalesce(new.fecha_alta::timestamptz,new.created_at,now())
  );
  return new;
end
$$;

drop trigger if exists crm_plan_before on public.planes_pago;
create trigger crm_plan_before
before insert or update of cliente,telefono,fecha_alta on public.planes_pago
for each row execute function public.crm_plan_before();

create or replace function public.crm_plan_item_access_after() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.pago_id is not null and new.da_acceso = true and new.estado = 'pagado' then
    update public.pagos set grants_access=true where id::text=new.pago_id;
    if new.pago_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      perform public.crm_ensure_onboarding_from_payment(new.pago_id::uuid);
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists crm_plan_item_access_after on public.plan_pago_items;
create trigger crm_plan_item_access_after
after insert or update of pago_id,da_acceso,estado on public.plan_pago_items
for each row execute function public.crm_plan_item_access_after();

-- Backfill de enlaces. Es re-ejecutable y nunca une automáticamente dos
-- personas cuando identidades estables entran en conflicto.
do $$
declare r record; resolved uuid;
begin
  for r in
    select id,nombre,telefono,instagram,fecha_lead,fecha_agenda,created_at
    from public.agendas where person_id is null
  loop
    resolved := public.crm_resolve_person(
      r.nombre,r.telefono,r.instagram,null,'agendas',
      coalesce(r.fecha_lead,r.fecha_agenda,r.created_at,now())
    );
    update public.agendas set person_id=resolved where id=r.id;
  end loop;

  for r in
    select id,cliente,telefono,fecha,created_at
    from public.pagos where person_id is null
  loop
    resolved := public.crm_resolve_person(
      r.cliente,r.telefono,null,null,'pagos',
      coalesce(r.fecha::timestamptz,r.created_at,now())
    );
    update public.pagos set person_id=resolved where id=r.id;
  end loop;

  for r in
    select id,nombre,telefono,fecha_ingreso,created_at
    from public.clientes where person_id is null
  loop
    resolved := public.crm_resolve_person(
      r.nombre,r.telefono,null,null,'clientes',
      coalesce(r.fecha_ingreso::timestamptz,r.created_at,now())
    );
    update public.clientes set person_id=resolved where id=r.id;
  end loop;

  for r in
    select id,cliente,telefono,fecha_alta,created_at
    from public.planes_pago where person_id is null
  loop
    resolved := public.crm_resolve_person(
      r.cliente,r.telefono,null,null,'planes_pago',
      coalesce(r.fecha_alta::timestamptz,r.created_at,now())
    );
    update public.planes_pago set person_id=resolved where id=r.id;
  end loop;
end
$$;

insert into public.crm_events(
  person_id,event_type,occurred_at,source,source_record_type,
  source_record_id,title,metadata,dedupe_key
)
select
  person_id,'lead_created',coalesce(fecha_lead,created_at),'crm','agenda',
  id::text,'Lead ingresó',
  jsonb_strip_nulls(jsonb_build_object('fuente',fuente,'cuenta',cuenta,'recurso',recurso)),
  'agenda:'||id||':lead'
from public.agendas
where person_id is not null and coalesce(fecha_lead,created_at) is not null
on conflict(dedupe_key) do nothing;

insert into public.crm_events(
  person_id,event_type,occurred_at,source,source_record_type,
  source_record_id,title,metadata,dedupe_key
)
select
  person_id,'call_booked',coalesce(fecha_agenda,created_at),'crm','agenda',
  id::text,'Agendó llamada',
  jsonb_strip_nulls(jsonb_build_object(
    'closer',closer,'setter',setter,'calificacion',calificacion,
    'fuente',fuente,'contenido',puntos_contacto
  )),
  'agenda:'||id||':booked'
from public.agendas
where person_id is not null and coalesce(fecha_agenda,created_at) is not null
on conflict(dedupe_key) do nothing;

insert into public.crm_events(
  person_id,event_type,occurred_at,source,source_record_type,
  source_record_id,title,metadata,dedupe_key
)
select
  person_id,
  case when show then 'call_showed' else 'call_no_show' end,
  coalesce(fecha_closer,fecha_agenda,created_at),'crm','agenda',id::text,
  case when show then 'Se presentó a la llamada' else 'No se presentó' end,
  jsonb_strip_nulls(jsonb_build_object(
    'closer',closer,'fathom',link_fathom,'resultado',estado,
    'motivo',motivo_no_cierre,'calificacion',calificacion
  )),
  'agenda:'||id||':call_result'
from public.agendas
where person_id is not null and (show=true or estado='No Show')
on conflict(dedupe_key) do nothing;

insert into public.crm_events(
  person_id,event_type,occurred_at,source,source_record_type,
  source_record_id,title,metadata,dedupe_key
)
select
  person_id,'payment_received',coalesce(fecha::timestamptz,created_at),'crm','pago',
  id::text,'Pago recibido',
  jsonb_strip_nulls(jsonb_build_object(
    'monto',monto,'tipo',tipo,'operacion',operacion,'closer',closer,
    'medio',medio_de_pago,'grants_access',coalesce(grants_access,public.crm_payment_type_grants_access(tipo))
  )),
  'pago:'||id
from public.pagos
where person_id is not null and coalesce(fecha::timestamptz,created_at) is not null
on conflict(dedupe_key) do update set metadata=excluded.metadata;

do $$
declare r record;
begin
  for r in select id from public.pagos loop
    perform public.crm_ensure_onboarding_from_payment(r.id);
  end loop;
end
$$;

alter table public.crm_people enable row level security;
alter table public.crm_identities enable row level security;
alter table public.crm_events enable row level security;
alter table public.crm_identity_conflicts enable row level security;
alter table public.crm_import_runs enable row level security;
alter table public.crm_content_assets enable row level security;

revoke all on function public.crm_import_event(
  text,text,text,text,text,text,text,timestamptz,text,jsonb,text
) from public, anon, authenticated;
revoke all on function public.crm_record_identity_conflict(
  uuid,uuid,text,text,text,text
) from public, anon, authenticated;
revoke all on function public.crm_attach_identity(
  uuid,text,text,text,timestamptz
) from public, anon, authenticated;
revoke all on function public.crm_resolve_person(
  text,text,text,text,text,timestamptz
) from public, anon, authenticated;
revoke all on function public.crm_resolve_person(
  text,text,text,text
) from public, anon, authenticated;
revoke all on function public.crm_ensure_onboarding_from_payment(
  uuid
) from public, anon, authenticated;
grant execute on function public.crm_import_event(
  text,text,text,text,text,text,text,timestamptz,text,jsonb,text
) to service_role;
grant execute on function public.crm_resolve_person(
  text,text,text,text,text,timestamptz
) to service_role;
grant execute on function public.crm_resolve_person(
  text,text,text,text
) to service_role;
grant execute on function public.crm_ensure_onboarding_from_payment(
  uuid
) to service_role;

comment on table public.crm_people is
  'Ficha canónica de persona; internal_code es técnico y no reemplaza el nombre visible.';
comment on table public.crm_events is
  'Historia append-only e idempotente: estímulo, chat, agenda, show, venta, pago, onboarding, servicio, upsell/resell y offboarding.';
comment on table public.crm_identity_conflicts is
  'Colisiones de identidad que requieren conciliación humana; no contiene el valor crudo, solo hash.';
comment on table public.crm_content_assets is
  'Catálogo trazable de contenido, formatos y ángulos importado desde fuentes como Notion.';
