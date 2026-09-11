do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'agendas' and column_name = 'resultado_ideal'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'agendas' and column_name = 'tiempo_problema'
  ) then
    alter table public.agendas rename column resultado_ideal to tiempo_problema;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'agendas' and column_name = 'relevancia'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'agendas' and column_name = 'intentos_previos'
  ) then
    alter table public.agendas rename column relevancia to intentos_previos;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'agendas' and column_name = 'profesion'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'agendas' and column_name = 'motivo_urgencia'
  ) then
    alter table public.agendas rename column profesion to motivo_urgencia;
  end if;
end $$;

comment on column public.agendas.tiempo_problema is 'Respuesta iClosed: ¿Hace cuánto arrastrás esto sin solucionarlo?';
comment on column public.agendas.intentos_previos is 'Respuesta iClosed: ¿Qué hiciste hasta ahora para resolverlo?';
comment on column public.agendas.motivo_urgencia is 'Respuesta iClosed: ¿Por qué querés resolverlo ahora?';
