-- HU24: conversaciones de una cuenta con el equipo autorizado de una sede.
alter table public.establishment_collaborators drop constraint establishment_collaborators_permissions_check,
 add constraint establishment_collaborators_permissions_check check(cardinality(permissions) between 1 and 4 and permissions <@ array['services','schedule','read','messages']);
create function private.chat_team(p_establishment uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_verified_user() and (exists(select 1 from public.establishments where id=p_establishment and owner_id=auth.uid())
 or exists(select 1 from public.establishment_collaborators where establishment_id=p_establishment and user_id=auth.uid() and status='accepted' and 'messages'=any(permissions)));
$$;
revoke all on function private.chat_team(uuid) from public,anon;
grant execute on function private.chat_team(uuid) to authenticated;
create table public.chat_conversations (
 id uuid primary key default gen_random_uuid(), customer_id uuid not null references auth.users(id), establishment_id uuid not null references public.establishments(id), site_id uuid not null,
 establishment_name text not null,site_name text not null,
 last_seq bigint not null default 0,customer_read_seq bigint not null default 0,team_read_seq bigint not null default 0,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(customer_id,establishment_id,site_id),check(customer_read_seq between 0 and last_seq and team_read_seq between 0 and last_seq)
);
create index chat_conversations_team on public.chat_conversations(establishment_id,updated_at desc,id);
create index chat_conversations_customer on public.chat_conversations(customer_id,updated_at desc,id);
create function private.can_read_chat(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_verified_user() and exists(select 1 from public.chat_conversations where id=p_id and (customer_id=auth.uid() or private.chat_team(establishment_id)));
$$;
revoke all on function private.can_read_chat(uuid) from public,anon;
grant execute on function private.can_read_chat(uuid) to authenticated;
create table public.chat_messages (
 id uuid primary key,conversation_id uuid not null references public.chat_conversations(id),author_id uuid not null references auth.users(id),author_side text not null check(author_side in ('customer','team')),
 seq bigint generated always as identity unique,body text not null check(char_length(body) between 1 and 4000 and body=btrim(body)),created_at timestamptz not null default clock_timestamp()
);
create index chat_messages_cursor on public.chat_messages(conversation_id,seq);
create index chat_messages_author on public.chat_messages(author_id);
alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
revoke all on public.chat_conversations,public.chat_messages from public,anon,authenticated;
grant select on public.chat_conversations,public.chat_messages to authenticated;
create policy chat_conversations_related on public.chat_conversations for select to authenticated using((select private.is_verified_user()) and (customer_id=(select auth.uid()) or private.chat_team(establishment_id)));
create policy chat_messages_related on public.chat_messages for select to authenticated using(private.can_read_chat(conversation_id));
create function private.chat_payload(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select (to_jsonb(c)-'customer_id')||jsonb_build_object('last_seq',last_seq::text,'customer_read_seq',customer_read_seq::text,'team_read_seq',team_read_seq::text,'side',case when customer_id=auth.uid() then 'customer' else 'team' end)
 from public.chat_conversations c where c.id=p_id and private.can_read_chat(p_id);
$$;
revoke all on function private.chat_payload(uuid) from public,anon,authenticated;

create function private.open_chat(p_establishment uuid,p_site uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid; business jsonb; site jsonb;
begin
 if not private.is_verified_user() then raise exception 'Accede y confirma tu correo para conversar.' using errcode='42501'; end if;
 perform 1 from auth.users where id=auth.uid() for update;
 select id into target from public.chat_conversations where customer_id=auth.uid() and establishment_id=p_establishment and site_id=p_site;
 if target is null then
  select document into business from public.establishment_publications where id=p_establishment;
  select s into site from jsonb_array_elements(business->'sites') s where s->>'id'=p_site::text;
  if site is null then raise exception 'Esta sede no está publicada.' using errcode='23514'; end if;
  insert into public.chat_conversations(customer_id,establishment_id,site_id,establishment_name,site_name)
   values(auth.uid(),p_establishment,p_site,business->>'name',site->>'name') returning id into target;
 end if;
 return private.chat_payload(target);
end; $$;
create function public.open_chat(p_establishment uuid,p_site uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.open_chat(p_establishment,p_site); $$;

create function private.chat_inbox(p_scope text,p_before timestamptz,p_before_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.is_verified_user() then raise exception 'Accede con correo confirmado.' using errcode='42501'; end if;
 if p_scope is null or p_scope not in ('mine','team') or (p_before is null)<>(p_before_id is null) then raise exception 'Consulta inválida.' using errcode='23514'; end if;
 return (select coalesce(jsonb_agg(private.chat_payload(q.id) order by q.updated_at desc,q.id desc),'[]'::jsonb) from
  (select id,updated_at from public.chat_conversations where (case when p_scope='mine' then customer_id=auth.uid() else private.chat_team(establishment_id) end)
   and (p_before is null or (updated_at,id)<(p_before,p_before_id)) order by updated_at desc,id desc limit 30) q);
end; $$;
create function public.chat_inbox(p_scope text default 'mine',p_before timestamptz default null,p_before_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select private.chat_inbox(p_scope,p_before,p_before_id); $$;

create function private.chat_history(p_conversation uuid,p_after bigint,p_before bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare rows jsonb;
begin
 if not private.can_read_chat(p_conversation) then raise exception 'Sin acceso a la conversación.' using errcode='42501'; end if;
 if (p_after is not null and p_before is not null) or coalesce(p_after,0)<0 or coalesce(p_before,0)<0 then raise exception 'Cursor inválido.' using errcode='23514'; end if;
 if p_after is not null then
  select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('seq',m.seq::text) order by m.seq),'[]'::jsonb) into rows from
   (select * from public.chat_messages where conversation_id=p_conversation and seq>p_after order by seq limit 100) m;
 else
  select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('seq',m.seq::text) order by m.seq),'[]'::jsonb) into rows from
   (select * from public.chat_messages where conversation_id=p_conversation and (p_before is null or seq<p_before) order by seq desc limit 50) m;
 end if;
 return jsonb_build_object('conversation',private.chat_payload(p_conversation),'messages',rows);
end; $$;
create function public.chat_history(p_conversation uuid,p_after bigint default null,p_before bigint default null) returns jsonb language sql security invoker set search_path='' as $$ select private.chat_history(p_conversation,p_after,p_before); $$;

create function private.send_chat_message(p_id uuid,p_conversation uuid,p_body text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.chat_conversations; m public.chat_messages;
begin
 if not private.can_read_chat(p_conversation) then raise exception 'Sin acceso a la conversación.' using errcode='42501'; end if;
 if p_id is null or p_body is null or char_length(btrim(p_body)) not between 1 and 4000 then raise exception 'Escribe entre 1 y 4000 caracteres.' using errcode='23514'; end if;
 perform 1 from public.establishments where id=(select establishment_id from public.chat_conversations where id=p_conversation) for update;
 select * into c from public.chat_conversations where id=p_conversation for update;
 -- La revocación se comprueba otra vez tras esperar el bloqueo.
 if not private.can_read_chat(p_conversation) then raise exception 'Permiso revocado.' using errcode='42501'; end if;
 select * into m from public.chat_messages where id=p_id;
 if found then
  if m.author_id<>auth.uid() or m.conversation_id<>p_conversation or m.body<>btrim(p_body) then raise exception 'Este identificador corresponde a otro mensaje.' using errcode='23514'; end if;
 else
  insert into public.chat_messages(id,conversation_id,author_id,author_side,body) values(p_id,p_conversation,auth.uid(),case when c.customer_id=auth.uid() then 'customer' else 'team' end,btrim(p_body)) returning * into m;
  update public.chat_conversations set last_seq=m.seq,updated_at=m.created_at where id=p_conversation;
 end if;
 return to_jsonb(m)||jsonb_build_object('seq',m.seq::text);
end; $$;
create function public.send_chat_message(p_id uuid,p_conversation uuid,p_body text) returns jsonb language sql security invoker set search_path='' as $$ select private.send_chat_message(p_id,p_conversation,p_body); $$;

create function private.read_chat(p_conversation uuid,p_through bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.chat_conversations;
begin
 if not private.can_read_chat(p_conversation) then raise exception 'Sin acceso a la conversación.' using errcode='42501'; end if;
 perform 1 from public.establishments where id=(select establishment_id from public.chat_conversations where id=p_conversation) for update;
 select * into c from public.chat_conversations where id=p_conversation for update;
 if not private.can_read_chat(p_conversation) then raise exception 'Permiso revocado.' using errcode='42501'; end if;
 if p_through is null or p_through<0 or p_through>c.last_seq then raise exception 'Lectura inválida.' using errcode='23514'; end if;
 if c.customer_id=auth.uid() then update public.chat_conversations set customer_read_seq=greatest(customer_read_seq,p_through) where id=p_conversation;
 else update public.chat_conversations set team_read_seq=greatest(team_read_seq,p_through) where id=p_conversation; end if;
 return private.chat_payload(p_conversation);
end; $$;
create function public.read_chat(p_conversation uuid,p_through bigint) returns jsonb language sql security invoker set search_path='' as $$ select private.read_chat(p_conversation,p_through); $$;

revoke all on function private.open_chat(uuid,uuid),public.open_chat(uuid,uuid),private.chat_inbox(text,timestamptz,uuid),public.chat_inbox(text,timestamptz,uuid),
 private.chat_history(uuid,bigint,bigint),public.chat_history(uuid,bigint,bigint),private.send_chat_message(uuid,uuid,text),public.send_chat_message(uuid,uuid,text),private.read_chat(uuid,bigint),public.read_chat(uuid,bigint) from public,anon;
grant execute on function private.open_chat(uuid,uuid),public.open_chat(uuid,uuid),private.chat_inbox(text,timestamptz,uuid),public.chat_inbox(text,timestamptz,uuid),
 private.chat_history(uuid,bigint,bigint),public.chat_history(uuid,bigint,bigint),private.send_chat_message(uuid,uuid,text),public.send_chat_message(uuid,uuid,text),private.read_chat(uuid,bigint),public.read_chat(uuid,bigint) to authenticated;
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.chat_messages,public.chat_conversations;
 end if;
end; $$;

create or replace function private.offering_workspaces() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'name',e.document->>'name',
    'sites',(select jsonb_agg(jsonb_build_object('id',s->>'id','name',s->>'name','timezone',s->>'timezone'))
      from jsonb_array_elements(e.document->'sites') s),
    'owner',e.owner_id=auth.uid(),
    'permissions',case when e.owner_id=auth.uid() then array['services','schedule','read','messages']
      else (select c.permissions from public.establishment_collaborators c where c.establishment_id=e.id and c.user_id=auth.uid() and c.status='accepted' limit 1) end
  ) order by e.document->>'name'),'[]'::jsonb)
  from public.establishments e where private.offering_permission(e.id,'read');
$$;

create or replace function private.manage_offering_invitation(p_establishment uuid,p_action text,p_id uuid,p_email text,p_permissions text[]) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target public.establishment_collaborators; result uuid;
begin
  if actor is null or not private.is_verified_user() then raise exception 'Confirma tu correo.' using errcode='42501'; end if;
  -- Orden estable de bloqueos: establecimiento y después invitación.
  perform 1 from public.establishments where id=p_establishment for update;
  if p_action='accept' then
    select * into target from public.establishment_collaborators where id=p_id and establishment_id=p_establishment for update;
    if not found or target.status<>'pending' or target.expires_at<=now()
      or target.email is distinct from (select lower(email) from auth.users where id=actor) then
      raise exception 'La invitación no está vigente o no corresponde a tu correo.' using errcode='42501';
    end if;
    update public.establishment_collaborators set status='accepted',user_id=actor where id=p_id;
    return p_id;
  end if;
  if not exists(select 1 from public.establishments where id=p_establishment and owner_id=actor) then
    raise exception 'Solo el responsable puede invitar o revocar colaboradores.' using errcode='42501';
  end if;
  if p_action='revoke' then
    update public.establishment_collaborators set status='revoked' where id=p_id and establishment_id=p_establishment returning id into result;
    if result is null then raise exception 'No se encontró la vinculación.' using errcode='23514'; end if;
    return result;
  end if;
  if p_action is distinct from 'invite' or p_email is null or lower(btrim(p_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or char_length(p_email)>254 or p_permissions is null or cardinality(p_permissions) not between 1 and 4
    or not p_permissions <@ array['services','schedule','read','messages'] or array_position(p_permissions,null) is not null then
    raise exception 'Revisa el correo y los permisos de la invitación.' using errcode='23514';
  end if;
  if exists(select 1 from public.establishment_collaborators where establishment_id=p_establishment and email=lower(btrim(p_email)) and status='accepted') then
    raise exception 'Revoca la vinculación antes de cambiar los permisos.' using errcode='23514';
  end if;
  insert into public.establishment_collaborators(establishment_id,email,permissions)
    values(p_establishment,lower(btrim(p_email)),p_permissions)
    on conflict(establishment_id,email) do update set status='pending',user_id=null,permissions=excluded.permissions,expires_at=now()+interval '7 days'
    returning id into result;
  return result;
end;
$$;
