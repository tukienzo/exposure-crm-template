alter table public.agendas
  add column if not exists calificacion_real text,
  add column if not exists motivo_calificacion_real text,
  add column if not exists angulo_entrada text,
  add column if not exists campaign_id text,
  add column if not exists ad_id text,
  add column if not exists creative_id text;

alter table public.agendas
  drop constraint if exists agendas_calificacion_real_check;

alter table public.agendas
  add constraint agendas_calificacion_real_check
  check (calificacion_real is null or calificacion_real in ('LEAD S','LEAD A','LEAD B','LEAD C','LEAD D'));

comment on column public.agendas.calificacion_real is
  'Score validado después de la llamada. No reemplaza calificacion, que conserva el score pre-call.';

comment on column public.agendas.motivo_calificacion_real is
  'Evidencia breve de la corrección post-call: capital subestimado/exagerado, dolor minimizado, dato no verificado u otro motivo observable.';

create index if not exists agendas_calificacion_real_idx
  on public.agendas(calificacion_real, fecha_closer desc);

create index if not exists agendas_angulo_entrada_idx
  on public.agendas(angulo_entrada, fecha_agenda desc);
