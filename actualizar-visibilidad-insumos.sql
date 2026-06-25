-- Stock Clean It · actualización v4
-- Ejecutar una sola vez en Supabase > SQL Editor sobre una instalación existente.
-- No modifica servicios, inventarios, usuarios ni frecuencias.

create table if not exists public.service_material_visibility(
  service_id uuid not null references public.services(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete cascade,
  enabled boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(service_id,material_id)
);

create index if not exists idx_visibility_service on public.service_material_visibility(service_id);
create index if not exists idx_visibility_material on public.service_material_visibility(material_id);

drop trigger if exists service_material_visibility_set_updated_at on public.service_material_visibility;
create trigger service_material_visibility_set_updated_at
before update on public.service_material_visibility
for each row execute function public.set_updated_at();

alter table public.service_material_visibility enable row level security;

grant select,insert,update,delete on table public.service_material_visibility to authenticated;

drop policy if exists visibility_read_scope on public.service_material_visibility;
drop policy if exists visibility_admin_insert on public.service_material_visibility;
drop policy if exists visibility_admin_update on public.service_material_visibility;
drop policy if exists visibility_admin_delete on public.service_material_visibility;

create policy visibility_read_scope on public.service_material_visibility
for select to authenticated
using(public.is_admin() or service_id=public.current_profile_service_id());

create policy visibility_admin_insert on public.service_material_visibility
for insert to authenticated with check(public.is_admin());

create policy visibility_admin_update on public.service_material_visibility
for update to authenticated using(public.is_admin()) with check(public.is_admin());

create policy visibility_admin_delete on public.service_material_visibility
for delete to authenticated using(public.is_admin());

create or replace function public.public_inventory_bootstrap(p_service_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_services jsonb;
  v_materials jsonb;
  v_stocks jsonb := '[]'::jsonb;
  v_extras jsonb := '[]'::jsonb;
begin
  if p_service_id is not null and not exists(
    select 1 from public.services where id=p_service_id and active=true
  ) then
    raise exception 'El servicio seleccionado no existe o está inactivo.';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.name),'[]'::jsonb)
  into v_services
  from (
    select id,name,address,description,active
    from public.services
    where active=true
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.category,x.sort_order,x.name),'[]'::jsonb)
  into v_materials
  from (
    select m.id,m.slug,m.name,m.category,m.detail,m.unit,m.image_url,m.critical_level,m.target_level,m.sort_order,m.active
    from public.materials m
    where m.active=true
      and (
        p_service_id is null
        or not exists(
          select 1 from public.service_material_visibility smv
          where smv.service_id=p_service_id
            and smv.material_id=m.id
            and smv.enabled=false
        )
      )
  ) x;

  if p_service_id is not null then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc),'[]'::jsonb)
    into v_stocks
    from (
      select ss.id,ss.service_id,ss.material_id,ss.quantity,ss.notes,ss.updated_at
      from public.service_stock ss
      join public.materials m on m.id=ss.material_id and m.active=true
      where ss.service_id=p_service_id
        and not exists(
          select 1 from public.service_material_visibility smv
          where smv.service_id=p_service_id
            and smv.material_id=ss.material_id
            and smv.enabled=false
        )
    ) x;

    select coalesce(jsonb_agg(to_jsonb(x) order by x.name),'[]'::jsonb)
    into v_extras
    from (
      select id,service_id,name,unit,quantity,notes,image_url,critical_level,target_level,submitted_by,active,created_at,updated_at
      from public.service_extra_stock
      where service_id=p_service_id and active=true
    ) x;
  end if;

  return jsonb_build_object(
    'services',v_services,
    'materials',v_materials,
    'stocks',v_stocks,
    'extra_stocks',v_extras
  );
end;
$$;

create or replace function public.public_submit_inventory(
  p_service_id uuid,
  p_stock_items jsonb,
  p_extra_items jsonb default '[]'::jsonb,
  p_reporter_name text default 'Operario sin identificar'
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_item jsonb;
  v_material_id uuid;
  v_extra_id uuid;
  v_quantity numeric(12,2);
  v_reporter text := left(coalesce(nullif(btrim(p_reporter_name),''),'Operario sin identificar'),100);
  v_user uuid;
  v_count integer := 0;
begin
  if not exists(select 1 from public.services where id=p_service_id and active=true) then
    raise exception 'El servicio seleccionado no existe o está inactivo.';
  end if;
  if jsonb_typeof(coalesce(p_stock_items,'[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_extra_items,'[]'::jsonb)) <> 'array' then
    raise exception 'El formato del relevamiento no es válido.';
  end if;
  if jsonb_array_length(coalesce(p_stock_items,'[]'::jsonb)) > 250 or jsonb_array_length(coalesce(p_extra_items,'[]'::jsonb)) > 100 then
    raise exception 'El relevamiento supera la cantidad permitida de registros.';
  end if;

  select id into v_user from public.profiles where id=auth.uid();
  perform set_config('app.reporter_name',v_reporter,true);

  for v_item in select value from jsonb_array_elements(coalesce(p_stock_items,'[]'::jsonb)) loop
    v_material_id := (v_item->>'material_id')::uuid;
    v_quantity := greatest(0,least(999999,coalesce((v_item->>'quantity')::numeric,0)));
    if exists(
      select 1
      from public.materials m
      where m.id=v_material_id
        and m.active=true
        and not exists(
          select 1 from public.service_material_visibility smv
          where smv.service_id=p_service_id
            and smv.material_id=m.id
            and smv.enabled=false
        )
    ) then
      insert into public.service_stock(service_id,material_id,quantity,updated_by,updated_at)
      values(p_service_id,v_material_id,v_quantity,v_user,now())
      on conflict(service_id,material_id) do update set
        quantity=excluded.quantity,
        updated_by=excluded.updated_by,
        updated_at=now();
      v_count := v_count + 1;
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_extra_items,'[]'::jsonb)) loop
    v_extra_id := (v_item->>'id')::uuid;
    v_quantity := greatest(0,least(999999,coalesce((v_item->>'quantity')::numeric,0)));
    update public.service_extra_stock
    set quantity=v_quantity,submitted_by=v_reporter,updated_by=v_user,updated_at=now()
    where id=v_extra_id and service_id=p_service_id and active=true;
    if found then v_count := v_count + 1; end if;
  end loop;

  return jsonb_build_object('ok',true,'updated_records',v_count,'updated_at',now());
end;
$$;

revoke all on function public.public_inventory_bootstrap(uuid) from public;
revoke all on function public.public_submit_inventory(uuid,jsonb,jsonb,text) from public;
grant execute on function public.public_inventory_bootstrap(uuid) to anon,authenticated;
grant execute on function public.public_submit_inventory(uuid,jsonb,jsonb,text) to anon,authenticated;

do $$ begin
  if not exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='service_material_visibility'
  ) then
    alter publication supabase_realtime add table public.service_material_visibility;
  end if;
end $$;
