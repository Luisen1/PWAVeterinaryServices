-- Índices completos para las FK, incluidos apartados vencidos/liberados.
-- Los índices parciales de agenda cubren las consultas activas, no estas referencias.
create index slot_holds_professional_reference on public.slot_holds(professional_id);
create index slot_holds_resource_reference on public.slot_holds(resource_id);
