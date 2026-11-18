-- Una cancelación de cita puede invalidar una entrega ya reclamada por el worker.
-- Cerrar también el intento, conservando su historial y sin aceptar un ack de lease viejo.
create function private.finish_cancelled_push_attempt() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update private.push_attempts set outcome='cancelled',finished_at=clock_timestamp()
 where delivery_id=new.id and outcome='processing';
 return new;
end; $$;
revoke all on function private.finish_cancelled_push_attempt() from public,anon,authenticated;
create trigger cancelled_push_attempt after update of state on private.push_deliveries
 for each row when(new.state='cancelled' and old.state is distinct from 'cancelled')
 execute function private.finish_cancelled_push_attempt();
update private.push_attempts t set outcome='cancelled',finished_at=clock_timestamp()
from private.push_deliveries d where t.delivery_id=d.id and d.state='cancelled' and t.outcome='processing';
