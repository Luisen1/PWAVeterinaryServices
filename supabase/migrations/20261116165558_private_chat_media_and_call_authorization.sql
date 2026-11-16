-- HU25-HU26: únicamente el backend valida/sube/publica archivos privados.
create table public.chat_media_uploads (
 id uuid primary key, conversation_id uuid not null references public.chat_conversations(id), owner_id uuid not null references auth.users(id),
 kind text not null check(kind in ('image','audio')), mime text not null, bytes integer not null check(bytes between 1 and 5242880),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), duration_ms integer, width integer, height integer,
 object_path text not null unique, created_at timestamptz not null default clock_timestamp(), published_at timestamptz, discarded_at timestamptz,
 check((kind='image' and mime in ('image/jpeg','image/png','image/webp') and duration_ms is null and width is not null and height is not null and width between 1 and 4096 and height between 1 and 4096)
 or (kind='audio' and mime in ('audio/webm','audio/ogg','audio/mp4') and duration_ms is not null and duration_ms between 1 and 60000 and width is null and height is null))
);
create index chat_media_uploads_owner on public.chat_media_uploads(owner_id,created_at);
create index chat_media_uploads_conversation on public.chat_media_uploads(conversation_id);
alter table public.chat_media_uploads enable row level security;
revoke all on public.chat_media_uploads from public,anon,authenticated;
grant select on public.chat_media_uploads to authenticated;
create policy chat_media_owner on public.chat_media_uploads for select to authenticated using(owner_id=(select auth.uid()) and (select private.is_verified_user()));
alter table public.chat_messages
 add column media jsonb,
 drop constraint chat_messages_body_check,
 drop constraint chat_messages_nonblank,
 add constraint chat_messages_content check((media is null and char_length(body) between 1 and 4000 and body=btrim(body) and body ~ '[^[:space:]]')
   or (media is not null and body='' and media->>'id'=id::text and media->>'kind' in ('image','audio')));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('chat-media','chat-media',false,5242880,array['image/jpeg','image/png','image/webp','audio/webm','audio/ogg','audio/mp4']);
-- Sin políticas de objetos para anon/authenticated: la descarga pasa por Edge y RLS de mensajes.

create function private.prepare_chat_media(p_id uuid,p_conversation uuid,p_kind text,p_mime text,p_bytes integer,p_hash text,p_duration integer,p_width integer,p_height integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.chat_conversations; u public.chat_media_uploads; actor uuid:=auth.uid(); path text;
begin
 if not private.can_read_chat(p_conversation) then raise exception 'No tienes acceso a esta conversación.' using errcode='42501'; end if;
 perform 1 from auth.users where id=actor for update;
 perform 1 from public.establishments where id=(select establishment_id from public.chat_conversations where id=p_conversation) for update;
 select * into c from public.chat_conversations where id=p_conversation for update;
 if not private.can_read_chat(p_conversation) then raise exception 'Permiso revocado.' using errcode='42501'; end if;
 if p_id is null or p_kind is null or p_mime is null or p_bytes is null or p_hash is null then raise exception 'Datos del archivo incompletos.' using errcode='23514'; end if;
 select * into u from public.chat_media_uploads where id=p_id;
 if found then
  if u.owner_id<>actor then raise exception 'Operación ajena.' using errcode='42501'; end if;
  if u.discarded_at is not null then raise exception 'Este archivo fue descartado; prepara uno nuevo.' using errcode='23514'; end if;
  if u.conversation_id<>p_conversation or u.kind<>p_kind or u.mime<>p_mime or u.bytes<>p_bytes or u.sha256<>p_hash
    or u.duration_ms is distinct from p_duration or u.width is distinct from p_width or u.height is distinct from p_height then raise exception 'El identificador corresponde a otro archivo.' using errcode='23514'; end if;
  return to_jsonb(u);
 end if;
 if exists(select 1 from public.chat_messages where id=p_id) then raise exception 'El identificador ya corresponde a otro mensaje.' using errcode='23514'; end if;
 -- Cota de pendientes y tráfico de subida por cuenta, sin almacenar contenido inválido.
 if (select count(*) from public.chat_media_uploads where owner_id=actor and published_at is null and discarded_at is null)>=5
  or (select count(*) from public.chat_media_uploads where owner_id=actor and created_at>clock_timestamp()-interval '1 hour')>=60 then
  raise exception 'Alcanzaste el límite de archivos pendientes o de envíos por hora. Descarta o reintenta los existentes.' using errcode='23514'; end if;
 path:=p_conversation::text||'/'||actor::text||'/'||p_id::text;
 insert into public.chat_media_uploads(id,conversation_id,owner_id,kind,mime,bytes,sha256,duration_ms,width,height,object_path)
 values(p_id,p_conversation,actor,p_kind,p_mime,p_bytes,p_hash,p_duration,p_width,p_height,path) returning * into u;
 return to_jsonb(u);
end; $$;
create function public.prepare_chat_media(p_id uuid,p_conversation uuid,p_kind text,p_mime text,p_bytes integer,p_hash text,p_duration integer default null,p_width integer default null,p_height integer default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.prepare_chat_media(p_id,p_conversation,p_kind,p_mime,p_bytes,p_hash,p_duration,p_width,p_height); $$;
revoke all on function private.prepare_chat_media(uuid,uuid,text,text,integer,text,integer,integer,integer),public.prepare_chat_media(uuid,uuid,text,text,integer,text,integer,integer,integer) from public,anon;
grant execute on function private.prepare_chat_media(uuid,uuid,text,text,integer,text,integer,integer,integer),public.prepare_chat_media(uuid,uuid,text,text,integer,text,integer,integer,integer) to authenticated;

-- Auxiliar de identidad exclusivo del backend, sin confiar en metadatos editables.
create function private.chat_actor_allowed(p_conversation uuid,p_actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null)
 and exists(select 1 from public.chat_conversations c where c.id=p_conversation and (c.customer_id=p_actor
  or exists(select 1 from public.establishments e where e.id=c.establishment_id and e.owner_id=p_actor)
  or exists(select 1 from public.establishment_collaborators x where x.establishment_id=c.establishment_id and x.user_id=p_actor and x.status='accepted' and 'messages'=any(x.permissions))));
$$;
revoke all on function private.chat_actor_allowed(uuid,uuid) from public,anon,authenticated;
create function private.finalize_chat_media(p_id uuid,p_owner uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u public.chat_media_uploads; c public.chat_conversations; m public.chat_messages; payload jsonb;
begin
 select * into u from public.chat_media_uploads where id=p_id and owner_id=p_owner;
 if not found or u.discarded_at is not null then raise exception 'No existe esta subida o fue descartada.' using errcode='42501'; end if;
 perform 1 from public.establishments where id=(select establishment_id from public.chat_conversations where id=u.conversation_id) for update;
 select * into c from public.chat_conversations where id=u.conversation_id for update;
 select * into u from public.chat_media_uploads where id=p_id for update;
 if u.discarded_at is not null then raise exception 'El archivo fue descartado.' using errcode='23514'; end if;
 if not private.chat_actor_allowed(c.id,p_owner) then raise exception 'El permiso para enviar fue revocado.' using errcode='42501'; end if;
 select * into m from public.chat_messages where id=p_id;
 if found then
  if m.author_id<>p_owner or m.conversation_id<>c.id or m.media->>'id' is distinct from p_id::text then raise exception 'Identificador ocupado.' using errcode='23514'; end if;
 else
  payload:=jsonb_build_object('id',u.id,'kind',u.kind,'mime',u.mime,'bytes',u.bytes,'duration_ms',u.duration_ms,'width',u.width,'height',u.height);
  insert into public.chat_messages(id,conversation_id,author_id,author_side,body,media)
  values(p_id,c.id,p_owner,case when c.customer_id=p_owner then 'customer' else 'team' end,'',payload) returning * into m;
  update public.chat_conversations set last_seq=m.seq,updated_at=m.created_at where id=c.id;
  update public.chat_media_uploads set published_at=m.created_at where id=p_id;
 end if;
 return to_jsonb(m)||jsonb_build_object('seq',m.seq::text);
end; $$;
create function public.finalize_chat_media(p_id uuid,p_owner uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.finalize_chat_media(p_id,p_owner); $$;
revoke all on function private.finalize_chat_media(uuid,uuid),public.finalize_chat_media(uuid,uuid) from public,anon,authenticated;
-- service_role existe en Supabase; la prueba embebida declara este rol explícitamente.
grant usage on schema private to service_role;
grant execute on function private.finalize_chat_media(uuid,uuid),public.finalize_chat_media(uuid,uuid) to service_role;
grant select on public.chat_media_uploads to service_role;
create function private.discard_chat_media(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u public.chat_media_uploads;
begin
 if not private.is_verified_user() then raise exception 'Confirma tu cuenta.' using errcode='42501'; end if;
 select * into u from public.chat_media_uploads where id=p_id and owner_id=auth.uid();
 if not found then return null; end if;
 perform 1 from public.establishments where id=(select establishment_id from public.chat_conversations where id=u.conversation_id) for update;
 perform 1 from public.chat_conversations where id=u.conversation_id for update;
 select * into u from public.chat_media_uploads where id=p_id for update;
 if u.published_at is null then update public.chat_media_uploads set discarded_at=coalesce(discarded_at,clock_timestamp()) where id=p_id; end if;
 return jsonb_build_object('path',u.object_path,'published',u.published_at is not null);
end; $$;
create function public.discard_chat_media(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.discard_chat_media(p_id); $$;
revoke all on function private.discard_chat_media(uuid),public.discard_chat_media(uuid) from public,anon;
grant execute on function private.discard_chat_media(uuid),public.discard_chat_media(uuid) to authenticated;

-- HU27: asignar una cuenta verificable al profesional de la cita virtual.
create table public.appointment_call_hosts (
 appointment_id uuid primary key references public.offering_appointments(id),
 host_id uuid not null references auth.users(id), professional_id uuid not null references public.offering_items(id),
 assigned_by uuid not null references auth.users(id), revision integer not null default 1, updated_at timestamptz not null default clock_timestamp()
);
create index appointment_call_hosts_host on public.appointment_call_hosts(host_id);
create index appointment_call_hosts_professional on public.appointment_call_hosts(professional_id);
create index appointment_call_hosts_actor on public.appointment_call_hosts(assigned_by);
alter table public.appointment_call_hosts enable row level security;
revoke all on public.appointment_call_hosts from public,anon,authenticated;
grant select on public.appointment_call_hosts to authenticated;
create policy appointment_call_hosts_related on public.appointment_call_hosts for select to authenticated using(private.can_read_appointment(appointment_id));
create function private.call_staff_allowed(p_establishment uuid,p_actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null) and (
  exists(select 1 from public.establishments where id=p_establishment and owner_id=p_actor)
  or exists(select 1 from public.establishment_collaborators where establishment_id=p_establishment and user_id=p_actor and status='accepted' and 'schedule'=any(permissions)));
$$;
revoke all on function private.call_staff_allowed(uuid,uuid) from public,anon,authenticated;
create function private.call_team_candidates(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.offering_appointments;
begin
 select * into a from public.offering_appointments where id=p_id;
 if not found or not private.appointment_permission(a.establishment_id,true) then raise exception 'No tienes permiso para asignar profesional.' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(nullif(p.display_name,''),'Cuenta del equipo')) order by p.id),'[]')
  from public.profiles p join (select owner_id id from public.establishments where id=a.establishment_id union select user_id from public.establishment_collaborators where establishment_id=a.establishment_id and status='accepted' and 'schedule'=any(permissions)) team on team.id=p.id
  where p.id<>a.owner_id and private.call_staff_allowed(a.establishment_id,p.id));
end; $$;
create function public.call_team_candidates(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.call_team_candidates(p_id); $$;
create function private.assign_call_host(p_id uuid,p_host uuid,p_revision integer,p_host_revision integer) returns void language plpgsql security definer set search_path='' as $$
declare a public.offering_appointments; h public.appointment_call_hosts;
begin
 select * into a from public.offering_appointments where id=p_id;
 if not found then raise exception 'No tienes acceso a la cita.' using errcode='42501'; end if;
 perform 1 from public.establishments where id=a.establishment_id for update;
 if not private.appointment_permission(a.establishment_id,true) then raise exception 'No puedes asignar la cuenta profesional.' using errcode='42501'; end if;
 select * into a from public.offering_appointments where id=p_id for update;
 if a.revision is distinct from p_revision then raise exception 'La cita cambió. Actualiza.' using errcode='40001'; end if;
 if a.modality is distinct from 'Virtual' or a.status not in ('requested','confirmed') or a.ends_at<=clock_timestamp()
 or p_host=a.owner_id or not private.call_staff_allowed(a.establishment_id,p_host) then raise exception 'Elige otra cuenta verificada del equipo con permiso de agenda para esta cita virtual vigente.' using errcode='23514'; end if;
 select * into h from public.appointment_call_hosts where appointment_id=p_id for update;
 if found and h.host_id=p_host and h.professional_id=a.professional_id then return; end if;
 if coalesce(h.revision,0) is distinct from p_host_revision then raise exception 'La cuenta profesional fue cambiada por otra sesión. Actualiza.' using errcode='40001'; end if;
 insert into public.appointment_call_hosts(appointment_id,host_id,professional_id,assigned_by) values(p_id,p_host,a.professional_id,auth.uid())
 on conflict(appointment_id) do update set host_id=excluded.host_id,professional_id=excluded.professional_id,assigned_by=excluded.assigned_by,
  revision=case when appointment_call_hosts.host_id=excluded.host_id and appointment_call_hosts.professional_id=excluded.professional_id then appointment_call_hosts.revision else appointment_call_hosts.revision+1 end,updated_at=clock_timestamp();
end; $$;
create function public.assign_call_host(p_id uuid,p_host uuid,p_revision integer,p_host_revision integer default 0) returns void language sql security invoker set search_path='' as $$ select private.assign_call_host(p_id,p_host,p_revision,p_host_revision); $$;

-- Sala opaca por revisión de cita/asignación; ventana inicial 10 min antes y 15 después.
create table private.appointment_call_rooms (
 room text primary key, appointment_id uuid not null references public.offering_appointments(id),
 customer_id uuid not null references auth.users(id),host_id uuid not null references auth.users(id),
 closes_at timestamptz not null, invalidated_at timestamptz, closed_at timestamptz
);
create index call_rooms_appointment on private.appointment_call_rooms(appointment_id);
create index call_rooms_customer on private.appointment_call_rooms(customer_id);
create index call_rooms_host on private.appointment_call_rooms(host_id);
create index call_rooms_pending on private.appointment_call_rooms(closes_at) where closed_at is null;
alter table private.appointment_call_rooms enable row level security;
revoke all on private.appointment_call_rooms from public,anon,authenticated;
grant select on private.appointment_call_rooms to service_role;
create policy call_rooms_backend on private.appointment_call_rooms for select to service_role using(true);
create function private.invalidate_appointment_calls() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='offering_appointments' then
  if new.revision<>old.revision or new.status is distinct from old.status or new.starts_at<>old.starts_at or new.ends_at<>old.ends_at then
   update private.appointment_call_rooms set invalidated_at=coalesce(invalidated_at,clock_timestamp()) where appointment_id=new.id and closed_at is null;
  end if;
 else
  if new.revision<>old.revision then update private.appointment_call_rooms set invalidated_at=coalesce(invalidated_at,clock_timestamp()) where appointment_id=new.appointment_id and closed_at is null; end if;
 end if;
 return new;
end; $$;
revoke all on function private.invalidate_appointment_calls() from public,anon,authenticated;
create trigger appointment_call_invalidation after update on public.offering_appointments for each row execute function private.invalidate_appointment_calls();
create trigger appointment_call_host_invalidation after update on public.appointment_call_hosts for each row execute function private.invalidate_appointment_calls();
create function private.invalidate_revoked_call_host() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.user_id is not null and 'schedule'=any(old.permissions) and (tg_op='DELETE' or new.status<>'accepted' or not ('schedule'=any(new.permissions)) or new.user_id is distinct from old.user_id) then
  update private.appointment_call_rooms r set invalidated_at=coalesce(r.invalidated_at,clock_timestamp())
   where r.host_id=old.user_id and r.closed_at is null and exists(select 1 from public.offering_appointments a where a.id=r.appointment_id and a.establishment_id=old.establishment_id);
 end if;
 return null;
end; $$;
revoke all on function private.invalidate_revoked_call_host() from public,anon,authenticated;
create trigger call_host_permission_invalidation after update or delete on public.establishment_collaborators for each row execute function private.invalidate_revoked_call_host();
create function private.authorize_appointment_call(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.offering_appointments; h public.appointment_call_hosts; now_at timestamptz:=clock_timestamp(); until_at timestamptz; room_name text;
begin
 if not private.is_verified_user() then raise exception 'Confirma tu cuenta para entrar.' using errcode='42501'; end if;
 select * into a from public.offering_appointments where id=p_id;
 if not found then raise exception 'No tienes acceso a esta llamada.' using errcode='42501'; end if;
 perform 1 from public.establishments where id=a.establishment_id for update;
 select * into a from public.offering_appointments where id=p_id for share;
 select * into h from public.appointment_call_hosts where appointment_id=p_id;
 if h.appointment_id is null or not (a.owner_id=auth.uid() or h.host_id=auth.uid())
  or h.professional_id<>a.professional_id or not private.call_staff_allowed(a.establishment_id,h.host_id) then raise exception 'Solo la cuenta solicitante y el profesional asignado pueden entrar.' using errcode='42501'; end if;
 if a.status<>'confirmed' or a.modality is distinct from 'Virtual' then raise exception 'La llamada requiere una cita virtual confirmada.' using errcode='23514'; end if;
 until_at:=a.ends_at+interval '15 minutes';
 if now_at<a.starts_at-interval '10 minutes' or now_at>=until_at then raise exception 'La sala abre 10 minutos antes y cierra 15 minutos después del fin de la cita.' using errcode='23514'; end if;
 room_name:='appointment-'||a.id::text||'-'||a.revision::text||'-'||h.revision::text;
 insert into private.appointment_call_rooms(room,appointment_id,customer_id,host_id,closes_at) values(room_name,a.id,a.owner_id,h.host_id,until_at) on conflict(room) do nothing;
 return jsonb_build_object('appointment_id',a.id,'participant',auth.uid(),'role',case when a.owner_id=auth.uid() then 'customer' else 'professional' end,
  'room',room_name,
  'expires_at',least(now_at+interval '60 seconds',until_at),'closes_at',until_at,'server_now',now_at);
end; $$;
create function public.authorize_appointment_call(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.authorize_appointment_call(p_id); $$;
revoke all on function private.call_team_candidates(uuid),public.call_team_candidates(uuid),private.assign_call_host(uuid,uuid,integer,integer),public.assign_call_host(uuid,uuid,integer,integer),private.authorize_appointment_call(uuid),public.authorize_appointment_call(uuid) from public,anon;
grant execute on function private.call_team_candidates(uuid),public.call_team_candidates(uuid),private.assign_call_host(uuid,uuid,integer,integer),public.assign_call_host(uuid,uuid,integer,integer),private.authorize_appointment_call(uuid),public.authorize_appointment_call(uuid) to authenticated;

create function private.call_rooms_to_close(p_appointment uuid) returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') from (select room,customer_id,host_id from private.appointment_call_rooms
  where closed_at is null and (invalidated_at is not null or closes_at<=clock_timestamp()) and (p_appointment is null or appointment_id=p_appointment)
  order by closes_at,room limit 20) q;
$$;
create function public.call_rooms_to_close(p_appointment uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select private.call_rooms_to_close(p_appointment); $$;
create function private.acknowledge_closed_call(p_room text) returns void language sql security definer set search_path='' as $$ update private.appointment_call_rooms set closed_at=clock_timestamp() where room=p_room; $$;
create function public.acknowledge_closed_call(p_room text) returns void language sql security invoker set search_path='' as $$ select private.acknowledge_closed_call(p_room); $$;
revoke all on function private.call_rooms_to_close(uuid),public.call_rooms_to_close(uuid),private.acknowledge_closed_call(text),public.acknowledge_closed_call(text) from public,anon,authenticated;
grant execute on function private.call_rooms_to_close(uuid),public.call_rooms_to_close(uuid),private.acknowledge_closed_call(text),public.acknowledge_closed_call(text) to service_role;

-- La plantilla nueva describe la integración real; los snapshots históricos no se reescriben.
create function private.virtual_call_request_instructions() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.modality='Virtual' and new.owner_id is not null then
  new.snapshot:=jsonb_set(new.snapshot,'{instructions}',to_jsonb('Ten conexión estable, cámara, micrófono y los antecedentes de tu mascota. La sala requiere confirmación, cuenta profesional asignada y servicio de videollamadas activado. Si no está disponible, coordina por chat.'::text));
 end if;
 return new;
end; $$;
revoke all on function private.virtual_call_request_instructions() from public,anon,authenticated;
create trigger virtual_call_request_instructions before insert on public.offering_appointments for each row execute function private.virtual_call_request_instructions();
