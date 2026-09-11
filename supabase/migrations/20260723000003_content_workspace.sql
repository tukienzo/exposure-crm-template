-- Espacio operativo semanal de Contenido (cuenta B / editor) dentro del CRM.
-- Extiende crm_content_assets (ya existente, ver 20260723_crm_consolidation.sql)
-- con los campos que Notion tenía y el CRM todavía no cubría: responsable,
-- guion completo, insight/nota de producción, nivel de consciencia y las
-- etiquetas de semana/día que usa el calendario editorial.
-- No se borra ni se sobreescribe ningún registro existente (histórico del
-- import por bloques de Notion se conserva intacto).

alter table public.crm_content_assets
  add column if not exists assigned_to text,
  add column if not exists script_text text,
  add column if not exists insight_notes text,
  add column if not exists awareness_level text,
  add column if not exists week_label text,
  add column if not exists day_of_week text;

comment on column public.crm_content_assets.assigned_to is
  'Responsable operativo de la pieza (cuenta, editor, etc.). Distinto de metadata; es un campo de trabajo diario.';
comment on column public.crm_content_assets.script_text is
  'Guion completo de la pieza (lo que antes vivía solo en Notion).';
comment on column public.crm_content_assets.insight_notes is
  'Insight/nota de producción para quien graba o edita.';
comment on column public.crm_content_assets.awareness_level is
  'Nivel de consciencia del copy: PROBLEMA, SOLUCIÓN, MENTALIDAD o PRODUCTO.';
comment on column public.crm_content_assets.week_label is
  'Etiqueta de semana tal como la usa el calendario editorial (ej. "Semana 3 Mayo").';
comment on column public.crm_content_assets.day_of_week is
  'Día de la semana en texto libre, tal como se calendariza (ej. "1. Lunes").';

create index if not exists crm_content_assets_assigned_idx
  on public.crm_content_assets (assigned_to);
create index if not exists crm_content_assets_status_idx
  on public.crm_content_assets (status);
create index if not exists crm_content_assets_planned_at_idx
  on public.crm_content_assets (planned_at);
