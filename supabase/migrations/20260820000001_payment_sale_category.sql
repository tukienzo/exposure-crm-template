alter table public.planes_pago
  add column if not exists categoria_venta text;

do $$ begin
  alter table public.planes_pago add constraint planes_pago_categoria_venta_check
    check (categoria_venta is null or categoria_venta in ('Front End', 'Back End'));
exception when duplicate_object then null; end $$;

-- Conserva la implementación atómica probada y la envuelve para persistir la
-- categoría dentro de la misma transacción. Los planes históricos quedan null.
do $$ begin
  if to_regprocedure('public.crm_create_payment_plan_atomic_v1(text,jsonb,jsonb,jsonb)') is null
     and to_regprocedure('public.crm_create_payment_plan_atomic(text,jsonb,jsonb,jsonb)') is not null then
    alter function public.crm_create_payment_plan_atomic(text,jsonb,jsonb,jsonb)
      rename to crm_create_payment_plan_atomic_v1;
  end if;
end $$;

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
  result_payload jsonb;
  category text;
  created_plan_id uuid;
begin
  category := nullif(trim(p_plan->>'categoria_venta'), '');
  if category not in ('Front End', 'Back End') then
    raise exception 'Categoría de Venta inválida';
  end if;

  result_payload := public.crm_create_payment_plan_atomic_v1(
    p_request_id, p_payment, p_plan, p_items
  );
  created_plan_id := nullif(result_payload->>'plan_id', '')::uuid;
  if created_plan_id is null then
    raise exception 'No se pudo identificar el plan creado';
  end if;

  update public.planes_pago
  set categoria_venta = category
  where id = created_plan_id;

  return result_payload || jsonb_build_object('categoria_venta', category);
end;
$$;

revoke all on function public.crm_create_payment_plan_atomic(text,jsonb,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.crm_create_payment_plan_atomic(text,jsonb,jsonb,jsonb)
  to service_role;

