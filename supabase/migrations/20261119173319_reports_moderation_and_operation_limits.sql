-- HU40: reportes privados, evidencia mínima y decisiones auditables.
create table private.moderation_reports (
 id uuid primary key, reporter_id uuid not null references auth.users(id),
 kind text not null check(kind in ('establishment','message')),
 establishment_id uuid not null references public.establishments(id),
 site_id uuid, conversation_id uuid references public.chat_conversations(id), message_id uuid references public.chat_messages(id),
 category text not null check(category in ('incorrect_information','abuse','privacy','other')),
 reason text not null check(char_length(btrim(reason)) between 10 and 1000),
 evidence jsonb not null, status text not null default 'open' check(status in ('open','reviewing','resolved')),
 reviewer_id uuid references auth.users(id),revision integer not null default 1,
 decision text check(decision in ('corrected','suspended','dismissed','restored')),
 decision_reason text not null default '', created_at timestamptz not null default clock_timestamp(), resolved_at timestamptz,
 check((kind='message' and conversation_id is not null and message_id is not null) or (kind='establishment' and conversation_id is null and message_id is null))
);
create index moderation_reports_reporter on private.moderation_reports(reporter_id,created_at desc,id desc);
create index moderation_reports_queue on private.moderation_reports(created_at desc,id desc);
create index moderation_reports_establishment on private.moderation_reports(establishment_id);
create index moderation_reports_conversation on private.moderation_reports(conversation_id);
create index moderation_reports_message on private.moderation_reports(message_id);
create index moderation_reports_reviewer on private.moderation_reports(reviewer_id);
create table private.moderation_events (
 id uuid primary key default gen_random_uuid(), report_id uuid not null references private.moderation_reports(id),
 actor_id uuid references auth.users(id), kind text not null,reason text not null default '',created_at timestamptz not null default clock_timestamp()
);
create index moderation_events_report on private.moderation_events(report_id,created_at);
create index moderation_events_actor on private.moderation_events(actor_id);
create table private.moderation_restrictions (
 kind text not null check(kind in ('establishment','message')),target_id uuid not null,
 report_id uuid not null references private.moderation_reports(id),active boolean not null,
 updated_at timestamptz not null default clock_timestamp(), primary key(kind,target_id)
);
create index moderation_restrictions_report on private.moderation_restrictions(report_id);
alter table private.moderation_reports enable row level security;
alter table private.moderation_events enable row level security;
alter table private.moderation_restrictions enable row level security;
revoke all on private.moderation_reports,private.moderation_events,private.moderation_restrictions from public,anon,authenticated;
create policy moderation_reports_internal on private.moderation_reports for all to authenticated using(false) with check(false);
create policy moderation_events_internal on private.moderation_events for all to authenticated using(false) with check(false);
create policy moderation_restrictions_internal on private.moderation_restrictions for all to authenticated using(false) with check(false);

create function private.submit_report(p_id uuid,p_kind text,p_target uuid,p_site uuid,p_category text,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare previous private.moderation_reports; est uuid; convo uuid; evidence jsonb;
begin
 if not private.is_verified_user() then raise exception 'Inicia sesión con correo confirmado.' using errcode='42501'; end if;
 perform 1 from auth.users where id=auth.uid() for update;
 if p_id is null or p_target is null or p_kind not in ('establishment','message') or p_kind is null
 or p_category not in ('incorrect_information','abuse','privacy','other') or p_category is null
 or char_length(btrim(coalesce(p_reason,''))) not between 10 and 1000 then raise exception 'Completa referencia, categoría y motivo (10 a 1000 caracteres).' using errcode='23514'; end if;
 select * into previous from private.moderation_reports where id=p_id;
 if found then
  if previous.reporter_id<>auth.uid() or previous.kind<>p_kind or previous.category<>p_category or previous.reason<>btrim(p_reason)
   or (p_kind='message' and previous.message_id<>p_target) or (p_kind='establishment' and previous.establishment_id<>p_target)
   or previous.site_id is distinct from p_site then raise exception 'El identificador pertenece a otro reporte.' using errcode='23514'; end if;
  return previous.id;
 end if;
 if (select count(*) from private.moderation_reports where reporter_id=auth.uid() and created_at>clock_timestamp()-interval '1 day')>=10 then raise exception 'Límite de diez reportes diarios. Consulta los ya enviados.' using errcode='23514'; end if;
 if p_kind='establishment' then
  select id,document into est,evidence from public.establishment_publications where id=p_target;
  if est is null or (p_site is not null and not exists(select 1 from jsonb_array_elements(evidence->'sites') s where s->>'id'=p_site::text)) then raise exception 'La ficha o sede ya no está publicada.' using errcode='42501'; end if;
 else
  select m.conversation_id,c.establishment_id,jsonb_build_object('id',m.id,'body',m.body,'media',m.media,'created_at',m.created_at)
  into convo,est,evidence from public.chat_messages m join public.chat_conversations c on c.id=m.conversation_id where m.id=p_target;
  if convo is null or not private.can_read_chat(convo) then raise exception 'No tienes acceso a ese mensaje.' using errcode='42501'; end if;
 end if;
 insert into private.moderation_reports(id,reporter_id,kind,establishment_id,site_id,conversation_id,message_id,category,reason,evidence)
 values(p_id,auth.uid(),p_kind,est,p_site,convo,case when p_kind='message' then p_target end,p_category,btrim(p_reason),evidence);
 insert into private.moderation_events(report_id,actor_id,kind) values(p_id,auth.uid(),'submitted');
 return p_id;
end; $$;
create function public.submit_report(p_id uuid,p_kind text,p_target uuid,p_site uuid,p_category text,p_reason text) returns uuid
language sql security invoker set search_path='' as $$ select private.submit_report(p_id,p_kind,p_target,p_site,p_category,p_reason); $$;

create function private.report_page(p_scope text,p_before timestamptz,p_before_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_verified_user() or p_scope not in ('mine','admin') or p_scope is null or (p_scope='admin' and not private.is_admin()) then raise exception 'No tienes acceso a la bandeja.' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(q)),'[]') from (
  select id,kind,establishment_id,category,status,revision,decision,created_at,resolved_at,reviewer_id
  from private.moderation_reports where (p_scope='admin' or reporter_id=auth.uid())
  and (p_before is null or (created_at,id)<(p_before,p_before_id)) order by created_at desc,id desc limit 30
 ) q);
end; $$;
create function public.report_page(p_scope text default 'mine',p_before timestamptz default null,p_before_id uuid default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.report_page(p_scope,p_before,p_before_id); $$;

create function private.open_report(p_id uuid,p_revision integer) returns void language plpgsql security definer set search_path='' as $$
declare r private.moderation_reports;
begin
 if not private.is_admin() then raise exception 'Requiere administración.' using errcode='42501'; end if;
 select * into r from private.moderation_reports where id=p_id for update;
 if not found or r.revision<>p_revision then raise exception 'El reporte cambió. Actualiza.' using errcode='40001'; end if;
 if r.reporter_id=auth.uid() or exists(select 1 from public.establishments where id=r.establishment_id and owner_id=auth.uid())
 or exists(select 1 from public.chat_messages where id=r.message_id and author_id=auth.uid()) then raise exception 'Otra persona administradora debe revisar este reporte.' using errcode='42501'; end if;
 update private.moderation_reports set reviewer_id=auth.uid(),revision=revision+1,status=case when status='open' then 'reviewing' else status end where id=p_id;
 insert into private.moderation_events(report_id,actor_id,kind) values(p_id,auth.uid(),'review_access');
end; $$;
create function public.open_report(p_id uuid,p_revision integer) returns void language sql security invoker set search_path='' as $$ select private.open_report(p_id,p_revision); $$;

create function private.report_detail(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r private.moderation_reports; reviewer boolean; publication jsonb;
begin
 select * into r from private.moderation_reports where id=p_id;
 reviewer:=private.is_admin() and r.reviewer_id is not distinct from auth.uid();
 if not private.is_verified_user() or r.id is null or (r.reporter_id<>auth.uid() and not reviewer) then raise exception 'Sin acceso a este reporte.' using errcode='42501'; end if;
 if reviewer and r.kind='establishment' then
  select jsonb_build_object('document',p.document,'revision',e.revision,'can_correct',e.revision=p.revision and e.status='approved') into publication
  from public.establishments e join public.establishment_publications p using(id) where e.id=r.establishment_id;
 end if;
 return (to_jsonb(r)-'reporter_id'-'evidence')||jsonb_build_object('can_review',reviewer,'publication',publication,
 'evidence',case when reviewer and r.status='reviewing' then r.evidence else null end,
 'events',(select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'reason',reason,'created_at',created_at) order by created_at),'[]') from private.moderation_events where report_id=r.id));
end; $$;
create function public.report_detail(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.report_detail(p_id); $$;

create function private.resolve_report(p_id uuid,p_revision integer,p_action text,p_reason text,p_publication_revision integer,p_correction jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare r private.moderation_reports; e public.establishments; doc jsonb; target uuid; s jsonb; sites jsonb:='[]';
begin
 if not private.is_admin() then raise exception 'Requiere administración.' using errcode='42501'; end if;
 select establishment_id into target from private.moderation_reports where id=p_id;
 select * into e from public.establishments where id=target for update;
 select * into r from private.moderation_reports where id=p_id for update;
 if not found or r.reviewer_id is distinct from auth.uid() then raise exception 'Abre una revisión autorizada antes de decidir.' using errcode='42501'; end if;
 if r.revision<>p_revision or (r.status<>'reviewing' and not (r.status='resolved' and r.decision='suspended' and p_action='restored')) then raise exception 'El reporte cambió o ya fue resuelto.' using errcode='40001'; end if;
 if p_action is null or p_action not in ('corrected','suspended','dismissed','restored') or char_length(btrim(coalesce(p_reason,''))) not between 10 and 1000 then raise exception 'Indica decisión y motivo (10 a 1000 caracteres).' using errcode='23514'; end if;
 target:=case when r.kind='message' then r.conversation_id else r.establishment_id end;
 if p_action='corrected' then
  if r.kind<>'establishment' or e.revision is distinct from p_publication_revision or e.status<>'approved'
  or not exists(select 1 from public.establishment_publications where id=e.id and revision=e.revision) then raise exception 'La ficha cambió o tiene edición pendiente. No se sobrescribe.' using errcode='40001'; end if;
  if jsonb_typeof(p_correction) is distinct from 'object' or p_correction='{}' or p_correction-array['name','category','phone','email','site_id','site_address','site_phone']<>'{}' then raise exception 'Corrección no admitida.' using errcode='23514'; end if;
  doc:=e.document||(p_correction-array['site_id','site_address','site_phone']);
  if p_correction?'site_address' or p_correction?'site_phone' then
   if not exists(select 1 from jsonb_array_elements(doc->'sites') s where s->>'id'=p_correction->>'site_id') then raise exception 'Elige la sede de la corrección.' using errcode='23514'; end if;
   for s in select value from jsonb_array_elements(doc->'sites') loop
    if s->>'id'=p_correction->>'site_id' then s:=s||case when p_correction?'site_address' then jsonb_build_object('address',p_correction->'site_address') else '{}'::jsonb end||case when p_correction?'site_phone' then jsonb_build_object('phone',p_correction->'site_phone') else '{}'::jsonb end; end if;
    sites:=sites||jsonb_build_array(s);
   end loop;
   doc:=jsonb_set(doc,'{sites}',sites);
  end if;
  perform private.validate_establishment(doc,e.owner_id);
  if doc=e.document then raise exception 'La corrección no cambia la información publicada.' using errcode='23514'; end if;
  update public.establishments set document=doc,revision=revision+1 where id=e.id;
  update public.establishment_publications set document=doc-'responsible_name',revision=e.revision+1,published_at=clock_timestamp() where id=e.id;
  insert into public.establishment_decisions(establishment_id,revision,decision,reason,reviewer_id) values(e.id,e.revision+1,'approved',btrim(p_reason),auth.uid());
 elsif p_action='suspended' then
  insert into private.moderation_restrictions(kind,target_id,report_id,active) values(r.kind,target,r.id,true)
   on conflict(kind,target_id) do update set report_id=excluded.report_id,active=true,updated_at=clock_timestamp();
  if r.kind='establishment' then
   delete from public.establishment_publications where id=e.id;
   update public.establishments set status='changes_requested',revision=revision+1 where id=e.id;
   insert into public.establishment_decisions(establishment_id,revision,decision,reason,reviewer_id) values(e.id,e.revision+1,'changes_requested',btrim(p_reason),auth.uid());
  end if;
 elsif p_action='restored' then
  update private.moderation_restrictions set active=false,updated_at=clock_timestamp() where kind=r.kind and target_id=target and report_id=r.id and active;
  if not found then raise exception 'Existe otra decisión de suspensión vigente.' using errcode='40001'; end if;
  -- Restaurar permite nueva revisión; no publica automáticamente una ficha retirada.
 end if;
 update private.moderation_reports set status='resolved',decision=p_action,decision_reason=btrim(p_reason),resolved_at=clock_timestamp(),revision=revision+1,evidence='{}' where id=r.id;
 insert into private.moderation_events(report_id,actor_id,kind,reason) values(r.id,auth.uid(),p_action,btrim(p_reason));
end; $$;
create function public.resolve_report(p_id uuid,p_revision integer,p_action text,p_reason text,p_publication_revision integer default null,p_correction jsonb default '{}') returns void
language sql security invoker set search_path='' as $$ select private.resolve_report(p_id,p_revision,p_action,p_reason,p_publication_revision,p_correction); $$;

create function private.guard_moderated_publication() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.moderation_restrictions where kind='establishment' and target_id=new.id and active)
 or exists(select 1 from public.establishments e join private.account_deletion_requests d on d.owner_id=e.owner_id where e.id=new.id and d.status<>'requested') then raise exception 'La ficha está suspendida o su titular fue eliminado.' using errcode='42501'; end if;
 return new;
end; $$;
create trigger moderated_publication before insert or update on public.establishment_publications for each row execute function private.guard_moderated_publication();
create function private.guard_moderated_message() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.moderation_restrictions where kind='message' and target_id=new.conversation_id and active) then raise exception 'Esta conversación está suspendida para nuevos envíos.' using errcode='42501'; end if;
 return new;
end; $$;
create trigger moderated_message before insert on public.chat_messages for each row execute function private.guard_moderated_message();
create trigger moderated_media before insert on public.chat_media_uploads for each row execute function private.guard_moderated_message();
create function private.chat_writable(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.can_read_chat(p_id) and not exists(select 1 from private.moderation_restrictions where kind='message' and target_id=p_id and active); $$;
create function public.chat_writable(p_id uuid) returns boolean language sql security invoker set search_path='' as $$ select private.chat_writable(p_id); $$;
create function private.report_media(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.moderation_reports; result jsonb;
begin
 select * into r from private.moderation_reports where id=p_id;
 if not private.is_admin() or r.reviewer_id is distinct from auth.uid() or r.status<>'reviewing' or r.message_id is null then raise exception 'No tienes acceso a esta evidencia.' using errcode='42501'; end if;
 select jsonb_build_object('path',object_path,'mime',mime) into result from public.chat_media_uploads where id=r.message_id and published_at is not null and discarded_at is null;
 if result is null then raise exception 'La evidencia ya no está disponible.' using errcode='42501'; end if;
 insert into private.moderation_events(report_id,actor_id,kind) values(r.id,auth.uid(),'media_access');
 return result;
end; $$;
create function public.report_media(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.report_media(p_id); $$;

revoke all on function private.submit_report(uuid,text,uuid,uuid,text,text),public.submit_report(uuid,text,uuid,uuid,text,text),private.report_page(text,timestamptz,uuid),public.report_page(text,timestamptz,uuid),private.open_report(uuid,integer),public.open_report(uuid,integer),private.report_detail(uuid),public.report_detail(uuid),private.resolve_report(uuid,integer,text,text,integer,jsonb),public.resolve_report(uuid,integer,text,text,integer,jsonb),private.chat_writable(uuid),public.chat_writable(uuid),private.report_media(uuid),public.report_media(uuid) from public,anon;
grant execute on function private.submit_report(uuid,text,uuid,uuid,text,text),public.submit_report(uuid,text,uuid,uuid,text,text),private.report_page(text,timestamptz,uuid),public.report_page(text,timestamptz,uuid),private.open_report(uuid,integer),public.open_report(uuid,integer),private.report_detail(uuid),public.report_detail(uuid),private.resolve_report(uuid,integer,text,text,integer,jsonb),public.resolve_report(uuid,integer,text,text,integer,jsonb),private.chat_writable(uuid),public.chat_writable(uuid),private.report_media(uuid),public.report_media(uuid) to authenticated;
revoke all on function private.guard_moderated_publication(),private.guard_moderated_message() from public,anon,authenticated;

create function private.export_report_page(p_actor uuid,p_offset integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if p_offset<0 or p_offset>1000000 or not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null)
 or exists(select 1 from private.account_deletion_requests where owner_id=p_actor and status<>'requested') then raise exception 'Cuenta no disponible.' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(q)),'[]') from (select id,kind,establishment_id,site_id,conversation_id,message_id,category,reason,status,decision,decision_reason,created_at,resolved_at from private.moderation_reports where reporter_id=p_actor order by id limit 500 offset p_offset) q);
end; $$;
create function public.export_report_page(p_actor uuid,p_offset integer) returns jsonb language sql security invoker set search_path='' as $$ select private.export_report_page(p_actor,p_offset); $$;
revoke all on function private.export_report_page(uuid,integer),public.export_report_page(uuid,integer) from public,anon,authenticated;
grant execute on function private.export_report_page(uuid,integer),public.export_report_page(uuid,integer) to service_role;
create function private.purge_moderation_personal_data() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='completed' and old.status is distinct from 'completed' then
  update private.moderation_reports set reason='Contenido retirado por eliminación de cuenta',evidence='{}',decision_reason='' where reporter_id=new.owner_id;
  update private.moderation_reports set evidence='{}' where message_id in(select id from public.chat_messages where author_id=new.owner_id);
  update private.moderation_events set reason='' where actor_id=new.owner_id or report_id in(select id from private.moderation_reports where reporter_id=new.owner_id);
 end if;
 return new;
end; $$;
revoke all on function private.purge_moderation_personal_data() from public,anon,authenticated;
create trigger purge_moderation_personal_data after update of status on private.account_deletion_requests for each row execute function private.purge_moderation_personal_data();
