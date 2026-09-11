-- Separa "existe evidencia de cierre final" de "el desglose numérico está completo".
-- La segunda revisión OCR/audio confirmó 21 de 22 cierres, aunque solo 11
-- tienen todas las cifras necesarias para reproducir el detalle financiero.

alter table public.finance_closings
  add column if not exists closing_verified boolean not null default false,
  add column if not exists verification_source text,
  add column if not exists verification_summary text;

update public.finance_closings
set
  closing_verified = true,
  verification_source = coalesce(verification_source, evidence_source),
  verification_summary = coalesce(verification_summary, evidence_summary)
where evidence_level = 'completo';

update public.finance_closings
set closing_verified = true,
    verification_source = 'ocr_audio_segunda_revision',
    verification_summary = case period_start
      when date '2024-10-01' then 'Captura final: facturación 141.241, efectivo neto 118.693,47, beneficios netos 87.314,53 y margen 72,54%; moneda no explicitada, por eso el desglose monetario no se fuerza a USD.'
      when date '2024-11-01' then 'Capturas y audio confirman ganancia final de USD 1.669 por socio; la diferencia de liquidez/pasivo se mantiene separada.'
      when date '2025-02-01' then 'Mensaje y captura confirman ganancia del período de USD 1.264 por socio; el pago mayor incluye deuda de otro período.'
      when date '2025-03-01' then 'Captura confirma USD 2.506,83 por socio; la deuda pendiente se trata por separado.'
      when date '2025-04-01' then 'Cuadro final ajustado confirma Cash Collected neto USD 7.761,25 y distribución USD 3.221,22 por socio.'
      when date '2025-05-01' then 'Captura y texto confirman Cash Collected USD 16.091,02, gastos USD 4.825,35, distribuible USD 11.265,66 y USD 5.632,83 por socio.'
      when date '2025-10-01' then 'Cuadro final confirma USD 888 y ARS 2.435.365,38 por socio; se conserva multimoneda sin convertir a USD.'
      when date '2026-01-01' then 'Capturas y mensajes confirman USD 5.000 y ARS 5.016.910,71 por socio; se conserva multimoneda sin convertir.'
      when date '2026-05-01' then 'Evidencia adicional confirma USD 3.000 y ARS 3.065.605,19 por socio; compensaciones personales se mantienen separadas.'
      when date '2026-06-01' then 'PDF final confirma facturación USD 18.642,69, gastos de plataforma USD 689,40, honorarios USD 9.380,12, software/marketing USD 6.194,23, profit USD 2.378,95 y margen 12,76%.'
      else verification_summary
    end
where period_start in (
  date '2024-10-01', date '2024-11-01', date '2025-02-01',
  date '2025-03-01', date '2025-04-01', date '2025-05-01',
  date '2025-10-01', date '2026-01-01', date '2026-05-01',
  date '2026-06-01'
);

update public.finance_closings
set closing_verified = false,
    verification_source = 'ocr_audio_segunda_revision',
    verification_summary = 'Se encontraron ventas, cuotas, gastos, comisiones y confirmación operativa, pero no ganancia neta final ni reparto entre socios.'
where period_start = date '2025-01-01';

