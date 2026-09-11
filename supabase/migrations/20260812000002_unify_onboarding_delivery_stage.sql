-- Onboarding completo es un hito del cliente, no una etapa paralela a la entrega.
-- Conservamos onboarding_completed_at y unificamos el pipeline en Entrega activa.
update public.clientes
set etapa = 'calls_pendientes'
where etapa = 'onboardeado';
