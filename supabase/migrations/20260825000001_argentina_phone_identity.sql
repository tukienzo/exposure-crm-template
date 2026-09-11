-- Canonicaliza teléfonos argentinos y evita personas duplicadas por el prefijo +54.
-- Conserva todas las filas operativas: solo reasigna person_id y marca el duplicado.

create or replace function public.crm_norm_phone(v text) returns text
language sql immutable parallel safe as $$
  with cleaned as (
    select regexp_replace(coalesce(v,''), '[^0-9]', '', 'g') as digits
  ), international as (
    select case when digits like '00%' then substring(digits from 3) else digits end as digits
    from cleaned
  ), argentina as (
    select case
      -- WhatsApp/E.164 móvil: 54 9 + diez dígitos nacionales.
      when length(digits) = 13 and digits like '549%' then '54' || substring(digits from 4)
      -- Formato nacional con cero troncal.
      when length(digits) = 11 and digits like '0%' then '54' || substring(digits from 2)
      -- Número argentino nacional sin código de país.
      when length(digits) = 10 then '54' || digits
      else digits
    end as digits
    from international
  )
  select case when length(digits) between 8 and 15 then digits else null end
  from argentina
$$;

-- El sync de iClosed/ManyChat puede crear identidades en paralelo. El lock es
-- transaccional y breve; evita una consolidación partida por una escritura concurrente.
lock table public.crm_identities in share row exclusive mode;
lock table public.crm_people in share row exclusive mode;
lock table public.agendas, public.pagos, public.clientes, public.planes_pago,
  public.crm_events, public.crm_call_records, public.crm_client_growth_queue
  in share row exclusive mode;

do $$
declare
  grp record;
  loser uuid;
  canonical uuid;
begin
  -- Repite porque una persona puede aportar más de una identidad y conectar
  -- dos grupos después de una primera fusión.
  loop
    select
      public.crm_norm_phone(i.value) as canonical_phone,
      array_agg(distinct i.person_id) as people
    into grp
    from public.crm_identities i
    join public.crm_people p on p.id = i.person_id
    where i.kind = 'phone' and p.merged_into is null
    group by public.crm_norm_phone(i.value)
    having count(distinct i.person_id) > 1
    order by public.crm_norm_phone(i.value)
    limit 1;

    exit when grp.canonical_phone is null;

    -- Prefiere una ficha con nombre humano y después la de mayor actividad.
    select p.id into canonical
    from public.crm_people p
    where p.id = any(grp.people)
    order by
      case
        when p.display_name is null or btrim(p.display_name) = '' then 0
        when p.display_name ~* '@' then 0
        when p.display_name ~* '^(cae|yin yang)[ |]' then 0
        else 1
      end desc,
      ((select count(*) from public.agendas a where a.person_id=p.id) +
       (select count(*) from public.pagos x where x.person_id=p.id) +
       (select count(*) from public.clientes c where c.person_id=p.id) +
       (select count(*) from public.planes_pago pp where pp.person_id=p.id) +
       (select count(*) from public.crm_events e where e.person_id=p.id)) desc,
      p.created_at asc,
      p.id
    limit 1;

    foreach loser in array grp.people loop
      continue when loser = canonical;

      update public.agendas set person_id=canonical where person_id=loser;
      update public.pagos set person_id=canonical where person_id=loser;
      update public.clientes set person_id=canonical where person_id=loser;
      update public.planes_pago set person_id=canonical where person_id=loser;
      update public.crm_events set person_id=canonical where person_id=loser;
      update public.crm_call_records set person_id=canonical where person_id=loser;
      update public.crm_client_growth_queue set person_id=canonical where person_id=loser;

      -- Los valores no telefónicos se conservan como aliases de la ficha ganadora.
      update public.crm_identities
      set person_id=canonical
      where person_id=loser and kind <> 'phone';

      delete from public.crm_identities where person_id=loser and kind='phone';
      update public.crm_people set merged_into=canonical where id=loser;
      update public.crm_identity_conflicts
      set status='resolved', last_seen_at=now()
      where status='pending' and (incoming_person_id=loser or existing_person_id=loser);
    end loop;

    -- Reemplaza variantes 299..., 54299... y 549299... por una sola identidad.
    delete from public.crm_identities
    where kind='phone' and person_id=canonical
      and public.crm_norm_phone(value)=grp.canonical_phone;
    insert into public.crm_identities(person_id,kind,value,source,verified,first_seen_at,last_seen_at)
    values(canonical,'phone',grp.canonical_phone,'argentina_phone_canonicalization',true,now(),now())
    on conflict(kind,value) do update set
      person_id=excluded.person_id,
      verified=true,
      last_seen_at=now();

    update public.crm_people
    set primary_phone=grp.canonical_phone, updated_at=now()
    where id=canonical;
  end loop;

  -- Normaliza también los teléfonos argentinos que todavía tenían una sola ficha.
  delete from public.crm_identities i
  using (
    select id, row_number() over (
      partition by person_id, public.crm_norm_phone(value)
      order by verified desc, last_seen_at desc, id
    ) as rn
    from public.crm_identities
    where kind='phone'
  ) duplicates
  where i.id=duplicates.id and duplicates.rn > 1;

  update public.crm_identities
  set value=public.crm_norm_phone(value), last_seen_at=now()
  where kind='phone' and value is distinct from public.crm_norm_phone(value);

  update public.crm_people p
  set primary_phone=i.value, updated_at=now()
  from public.crm_identities i
  where i.person_id=p.id and i.kind='phone' and p.merged_into is null
    and p.primary_phone is distinct from i.value;
end
$$;
