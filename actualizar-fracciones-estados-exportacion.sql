-- Stock Clean It · actualización v5
-- Agrega cantidades fraccionables, estado de elementos reutilizables y soporte de exportación.
-- Ejecutar una sola vez en Supabase > SQL Editor antes de publicar los archivos nuevos.

alter table public.materials
  add column if not exists control_type text not null default 'integer';

alter table public.materials
  drop constraint if exists materials_control_type_check;

alter table public.materials
  add constraint materials_control_type_check
  check(control_type in('integer','fractional','quantity_condition'));

alter table public.service_stock
  add column if not exists condition_status text;

alter table public.service_stock
  drop constraint if exists service_stock_condition_status_check;

alter table public.service_stock
  add constraint service_stock_condition_status_check
  check(condition_status is null or condition_status in('good','used','replace'));

alter table public.stock_history add column if not exists old_condition text;
alter table public.stock_history add column if not exists new_condition text;

create or replace function public.audit_stock_change()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_reporter text := nullif(current_setting('app.reporter_name',true),'');
begin
  if tg_op='INSERT' then
    insert into public.stock_history(
      service_id,material_id,old_quantity,new_quantity,
      old_condition,new_condition,changed_by,reporter_name
    ) values(
      new.service_id,new.material_id,null,new.quantity,
      null,new.condition_status,coalesce(new.updated_by,auth.uid()),v_reporter
    );
  elsif old.quantity is distinct from new.quantity
     or old.condition_status is distinct from new.condition_status then
    insert into public.stock_history(
      service_id,material_id,old_quantity,new_quantity,
      old_condition,new_condition,changed_by,reporter_name
    ) values(
      new.service_id,new.material_id,old.quantity,new.quantity,
      old.condition_status,new.condition_status,coalesce(new.updated_by,auth.uid()),v_reporter
    );
  end if;
  return new;
end;
$$;

drop trigger if exists service_stock_audit on public.service_stock;
create trigger service_stock_audit
after insert or update on public.service_stock
for each row execute function public.audit_stock_change();

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
    select m.id,m.slug,m.name,m.category,m.detail,m.unit,m.control_type,
           m.image_url,m.critical_level,m.target_level,m.sort_order,m.active
    from public.materials m
    where m.active=true
      and (
        p_service_id is null
        or not exists(
          select 1
          from public.service_material_visibility smv
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
      select ss.id,ss.service_id,ss.material_id,ss.quantity,
             ss.condition_status,ss.notes,ss.updated_at
      from public.service_stock ss
      join public.materials m on m.id=ss.material_id and m.active=true
      where ss.service_id=p_service_id
        and not exists(
          select 1
          from public.service_material_visibility smv
          where smv.service_id=p_service_id
            and smv.material_id=ss.material_id
            and smv.enabled=false
        )
    ) x;

    select coalesce(jsonb_agg(to_jsonb(x) order by x.name),'[]'::jsonb)
    into v_extras
    from (
      select id,service_id,name,unit,quantity,notes,image_url,
             critical_level,target_level,submitted_by,active,created_at,updated_at
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
  v_condition text;
  v_control_type text;
  v_reporter text := left(coalesce(nullif(btrim(p_reporter_name),''),'Operario sin identificar'),100);
  v_user uuid;
  v_count integer := 0;
begin
  if not exists(select 1 from public.services where id=p_service_id and active=true) then
    raise exception 'El servicio seleccionado no existe o está inactivo.';
  end if;

  if jsonb_typeof(coalesce(p_stock_items,'[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_extra_items,'[]'::jsonb)) <> 'array' then
    raise exception 'El formato del relevamiento no es válido.';
  end if;

  if jsonb_array_length(coalesce(p_stock_items,'[]'::jsonb)) > 250
     or jsonb_array_length(coalesce(p_extra_items,'[]'::jsonb)) > 100 then
    raise exception 'El relevamiento supera la cantidad permitida de registros.';
  end if;

  select id into v_user from public.profiles where id=auth.uid();
  perform set_config('app.reporter_name',v_reporter,true);

  for v_item in select value from jsonb_array_elements(coalesce(p_stock_items,'[]'::jsonb)) loop
    v_material_id := (v_item->>'material_id')::uuid;
    v_quantity := greatest(0,least(999999,coalesce((v_item->>'quantity')::numeric,0)));

    select m.control_type into v_control_type
    from public.materials m
    where m.id=v_material_id
      and m.active=true
      and not exists(
        select 1
        from public.service_material_visibility smv
        where smv.service_id=p_service_id
          and smv.material_id=m.id
          and smv.enabled=false
      );

    if found then
      v_condition := nullif(v_item->>'condition_status','');
      if v_control_type <> 'quantity_condition'
         or coalesce(v_condition,'') not in('good','used','replace') then
        v_condition := null;
      end if;

      insert into public.service_stock(
        service_id,material_id,quantity,condition_status,updated_by,updated_at
      ) values(
        p_service_id,v_material_id,v_quantity,v_condition,v_user,now()
      )
      on conflict(service_id,material_id) do update set
        quantity=excluded.quantity,
        condition_status=excluded.condition_status,
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

-- Valores iniciales recomendados. Después pueden editarse desde Administración > Insumos.
update public.materials
set control_type='fractional'
where slug in(
  'detergente-bio-ultra','perfume-flower','lavandina-bio-lav','alcohol-al70'
);

update public.materials
set control_type='quantity_condition'
where slug in(
  'trapo-piso','rejilla','microfibra','fibra-verde',
  'esponja-acero','esponja-amarilla','ballerina'
);
