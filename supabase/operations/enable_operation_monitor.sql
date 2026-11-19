-- Operador: ejecutar después de aplicar las migraciones. No reinicia datos.
do $$
begin
 if not exists(select 1 from pg_extension where extname='pg_cron') then raise exception 'Habilita pg_cron en el ambiente previsto.'; end if;
 if exists(select 1 from cron.job where jobname='veterinary-operation-monitor') then
  perform cron.unschedule(jobid) from cron.job where jobname='veterinary-operation-monitor';
 end if;
 perform cron.schedule('veterinary-operation-monitor','* * * * *','select private.run_operation_monitor();');
end; $$;
