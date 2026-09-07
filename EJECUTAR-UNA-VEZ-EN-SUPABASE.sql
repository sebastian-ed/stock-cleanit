-- Stock Clean It · actualización v6
-- Ejecutar UNA sola vez en Supabase > SQL Editor antes de usar observaciones desde la carga pública.
-- Es idempotente y no borra datos existentes.

alter table public.service_stock add column if not exists notes text;

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
  v_notes text;
  v_control_type text;
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
      if v_control_type <> 'quantity_condition' or coalesce(v_condition,'') not in('good','used','replace') then
        v_condition := null;
      end if;
      v_notes := case when v_control_type = 'quantity_condition' then nullif(left(btrim(coalesce(v_item->>'notes','')),500),'') else null end;

      insert into public.service_stock(service_id,material_id,quantity,condition_status,notes,updated_by,updated_at)
      values(p_service_id,v_material_id,v_quantity,v_condition,v_notes,v_user,now())
      on conflict(service_id,material_id) do update set
        quantity=excluded.quantity,
        condition_status=excluded.condition_status,
        notes=excluded.notes,
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

grant execute on function public.public_submit_inventory(uuid,jsonb,jsonb,text) to anon,authenticated;
