begin;

-- Campos adicionales, no destructivos, para mostrar el estado de cada cierre
-- en lenguaje simple en la UI (sin tecnicismos ni checklists granulares).
alter table public.finance_closings
  add column if not exists evidence_level text not null default 'completo'
    check (evidence_level in ('completo', 'parcial')),
  add column if not exists evidence_source text not null default 'historico_chat'
    check (evidence_source in ('pdf_cierre', 'historico_chat', 'estimado')),
  add column if not exists evidence_summary text;

comment on column public.finance_closings.evidence_level is
  'completo = cifras respaldadas por PDF de cierre o desglose claro; parcial = reconstruido con info incompleta del historico, se avisa al usuario en lenguaje simple.';
comment on column public.finance_closings.evidence_source is
  'De donde sale el cierre: pdf_cierre (PDF formal enviado por contadora), historico_chat (capturas/mensajes con desglose), estimado (reconstruccion con informacion parcial).';
comment on column public.finance_closings.evidence_summary is
  'Nota simple, sin jerga tecnica, para mostrar al usuario cuando el cierre es parcial o vale una aclaracion breve.';

commit;
