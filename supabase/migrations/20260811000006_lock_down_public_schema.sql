-- El CRM usa service_role exclusivamente desde APIs server-side. Ninguna tabla
-- del esquema public debe poder leerse o modificarse directamente con la clave
-- anon del navegador ni con un JWT authenticated.
do $$
declare
  object_row record;
begin
  for object_row in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table %I.%I enable row level security', object_row.schemaname, object_row.tablename);
    execute format('revoke all privileges on table %I.%I from anon, authenticated', object_row.schemaname, object_row.tablename);
    execute format('grant all privileges on table %I.%I to service_role', object_row.schemaname, object_row.tablename);
  end loop;

  for object_row in
    select sequence_schema, sequence_name
    from information_schema.sequences
    where sequence_schema = 'public'
  loop
    execute format('revoke all privileges on sequence %I.%I from anon, authenticated', object_row.sequence_schema, object_row.sequence_name);
    execute format('grant all privileges on sequence %I.%I to service_role', object_row.sequence_schema, object_row.sequence_name);
  end loop;
end $$;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
