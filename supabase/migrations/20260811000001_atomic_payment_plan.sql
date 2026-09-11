create table if not exists public.crm_operation_requests (
  request_id text primary key,
  operation text not null,
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.crm_operation_requests enable row level security;
revoke all on public.crm_operation_requests from anon, authenticated;
grant all on public.crm_operation_requests to service_role;

create or replace function public.crm_create_payment_plan_atomic(
  p_request_id text,
  p_payment jsonb,
  p_plan jsonb,
  p_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_result jsonb;
  resolved_person uuid;
  payment_id uuid;
  plan_id uuid;
  agenda_id uuid;
  client_id bigint;
  item jsonb;
  result_payload jsonb;
  is_fee boolean;
begin
  if nullif(trim(p_request_id), '') is null then
    raise exception 'request_id requerido';
  end if;
  select r.result into existing_result
  from public.crm_operation_requests r
  where r.request_id = p_request_id and r.operation = 'payment_plan';
  if existing_result is not null then return existing_result; end if;

  insert into public.crm_operation_requests(request_id,operation)
  values(p_request_id,'payment_plan')
  on conflict(request_id) do nothing;
  if not found then
    raise exception 'Operación idéntica todavía en proceso';
  end if;

  resolved_person := nullif(p_payment->>'person_id','')::uuid;
  if resolved_person is null then
    resolved_person := public.crm_resolve_person(
      p_payment->>'cliente', p_payment->>'telefono', null, 'atomic_payment'
    );
  end if;
  if resolved_person is null then raise exception 'No se pudo resolver identidad'; end if;

  insert into public.pagos(
    cliente,operacion,monto,tipo,medio_de_pago,closer,fecha,comprobante,
    fecha_alta,fecha_baja,telefono,setter,calificacion,cc_ars,ppp,fuente,
    contenido_contestado,tipo_cambio_usd,otras_comisiones,es_reactivacion,person_id
  ) values (
    nullif(p_payment->>'cliente',''), nullif(p_payment->>'operacion',''),
    nullif(p_payment->>'monto','')::numeric, nullif(p_payment->>'tipo',''),
    nullif(p_payment->>'medio_de_pago',''), nullif(p_payment->>'closer',''),
    nullif(p_payment->>'fecha','')::timestamp, nullif(p_payment->>'comprobante',''),
    nullif(p_payment->>'fecha_alta',''), nullif(p_payment->>'fecha_baja',''),
    nullif(p_payment->>'telefono',''), nullif(p_payment->>'setter',''),
    nullif(p_payment->>'calificacion',''), nullif(p_payment->>'cc_ars','')::numeric,
    nullif(p_payment->>'ppp',''), nullif(p_payment->>'fuente',''),
    nullif(p_payment->>'contenido_contestado',''), nullif(p_payment->>'tipo_cambio_usd','')::numeric,
    nullif(p_payment->>'otras_comisiones',''), coalesce((p_payment->>'es_reactivacion')::boolean,false),
    resolved_person
  ) returning id into payment_id;

  insert into public.planes_pago(
    cliente,telefono,operacion,closer,setter,calificacion,fuente,
    contenido_contestado,fecha_alta,fecha_baja,person_id
  ) values (
    nullif(p_plan->>'cliente',''), nullif(p_plan->>'telefono',''),
    nullif(p_plan->>'operacion',''), nullif(p_plan->>'closer',''),
    nullif(p_plan->>'setter',''), nullif(p_plan->>'calificacion',''),
    nullif(p_plan->>'fuente',''), nullif(p_plan->>'contenido_contestado',''),
    nullif(p_plan->>'fecha_alta','')::date, nullif(p_plan->>'fecha_baja','')::date,
    resolved_person
  ) returning id into plan_id;

  for item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    insert into public.plan_pago_items(
      plan_id,orden,concepto,numero_cuota,monto,fecha_planeada,medio_de_pago,
      da_acceso,estado,pago_id
    ) values (
      plan_id, coalesce((item->>'orden')::integer,0), nullif(item->>'concepto',''),
      nullif(item->>'numero_cuota','')::integer, nullif(item->>'monto','')::numeric,
      nullif(item->>'fecha_planeada','')::date, nullif(item->>'medio_de_pago',''),
      coalesce((item->>'da_acceso')::boolean,false), coalesce(nullif(item->>'estado',''),'pendiente'),
      case when coalesce((item->>'use_new_payment')::boolean,false) then payment_id::text else nullif(item->>'pago_id','') end
    );
  end loop;

  agenda_id := nullif(p_payment->>'agenda_id','')::uuid;
  if agenda_id is null then
    select a.id into agenda_id from public.agendas a
    where a.person_id = resolved_person
    order by a.fecha_agenda desc nulls last, a.created_at desc
    limit 1;
  end if;
  is_fee := coalesce(p_payment->>'tipo','') ilike '%fee%';
  if agenda_id is not null then
    update public.agendas set
      cerro=true,
      estado=case when is_fee then 'Fee' else 'Adentro en Call' end,
      operacion=coalesce(nullif(p_payment->>'operacion',''),operacion),
      plan_de_pago=coalesce(nullif(p_payment->>'ppp',''),plan_de_pago),
      medio_de_pago=coalesce(nullif(p_payment->>'medio_de_pago',''),medio_de_pago),
      comprobante=coalesce(nullif(p_payment->>'comprobante',''),comprobante),
      cc_dia_1=coalesce(nullif(p_payment->>'monto','')::numeric,cc_dia_1),
      fecha_tc=case when not is_fee then coalesce(nullif(p_payment->>'fecha','')::timestamp,now()::timestamp) else fecha_tc end,
      fecha_baja=coalesce(nullif(p_payment->>'fecha_baja','')::timestamp,fecha_baja),
      link_fathom=coalesce(nullif(p_payment->>'link_fathom',''),link_fathom)
    where id=agenda_id and person_id=resolved_person;
  end if;

  select c.id into client_id from public.clientes c
  where c.person_id=resolved_person and c.record_status='active'
  order by c.fecha_ingreso desc nulls last, c.created_at desc limit 1;

  result_payload := jsonb_build_object(
    'success',true,'payment_id',payment_id,'plan_id',plan_id,
    'person_id',resolved_person,'agenda_id',agenda_id,'client_id',client_id
  );
  update public.crm_operation_requests
  set result=result_payload, completed_at=now() where request_id=p_request_id;
  return result_payload;
end $$;

revoke all on function public.crm_create_payment_plan_atomic(text,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.crm_create_payment_plan_atomic(text,jsonb,jsonb,jsonb) to service_role;
