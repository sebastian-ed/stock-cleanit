-- Stock Clean It · actualización masiva de servicios y frecuencias
-- Ejecutar una vez en Supabase > SQL Editor sobre una instalación existente.
begin;

alter table public.services add column if not exists description text;

insert into public.services(name,address,description,notes,active) values
  ('Alvarez Thomas 550- Colegiales','Alvarez Thomas 550','Lunes a viernes de 13 a 17 hs. Sábado de 8 a 12 hs.',null,true),
  ('America Tampas- P.Industrial Pilar','Parque industrial, C. 9 1761, B1629 Pilar','Lunes a viernes de 8 a 16 hs. Sábado de 8 a 12 hs.',null,true),
  ('Av De los Incas 3502','Av De los Incas 3502','Lunes, miércoles y viernes de 13 a 17 hs.',null,true),
  ('Av MITRE 5834 - Caseros','Av MITRE 5834 - Caseros','Lunes, miércoles y viernes de 7:30 a 11:30 hs.',null,true),
  ('Av. San Juan 440','Av. San Juan 440','Martes, jueves y sábado de 8 a 12 hs.',null,true),
  ('Callao 441 - Centro','Callao 441 - Centro','Lunes a viernes de 13 a 17 hs.',null,true),
  ('Ceretti 2161 - Villa Urquiza','Ceretti 2161','Lunes a sábados de 8 a 12 hs.',null,true),
  ('Céspedes 2524, CABA','Céspedes 2524 - Adm Holmberg/Cespedes - Fernando','Lunes a viernes de 8 a 12 hs.',null,true),
  ('cons Cabildo 2659','Cabildo 2659','Lunes a viernes de 13 a 16 hs.',null,true),
  ('Cons. Agrelo 3641- Boedo','Agrelo 3641','Lunes, miércoles y viernes de 11:30 a 13:30 hs.',null,true),
  ('Cons. Araujo 61-Villa Luro','Araujo 61','Lunes, miércoles y viernes de 9 a 12 hs.',null,true),
  ('Cons. Av Directorio 1821','Av Directorio 1821','Viernes de 12:30 a 15:30 hs.',null,true),
  ('Cons. Av Los Incas 3501','Av Los Incas 3501','Lunes a sábados de 8 a 12 hs.',null,true),
  ('Cons. Beiro 4545- Villa Devoto','Avenida Beiro 4545','Lunes a sábados de 8:30 a 12:30 hs.','Lunes a sábados 8:30 a 12:30',true),
  ('Cons. Cabildo 2737- Nuñez','Cabildo 2737','Lunes a viernes de 8 a 12 hs.',null,true),
  ('Cons. Cachimayo 748- Parque Chacabuco','Cachimayo 748','Lunes a sábados de 8 a 12 hs.',null,true),
  ('Cons. Catamarca 586- San Cristóbal','Catamarca 586','Lunes, miércoles y viernes de 13 a 16 hs.',null,true),
  ('Cons. Cnel Diaz 1450','Coronel Diaz 1450','Lunes, miércoles y viernes de 8 a 12 hs.',null,true),
  ('Cons. Darwin 524- Villa Crespo','Darwin 524','Martes, jueves y sábado de 8 a 12 hs.',null,true),
  ('Cons. Gualeguaychú 1938- Villa Devoto','Gualeguaychú 1938','Martes, jueves y sábado de 8 a 12 hs.',null,true),
  ('Cons. Gualeguaychú 3809/11 caba','Gualeguaychú 3809','Martes y jueves de 8 a 11 hs.',null,true),
  ('Cons. Guardia Vieja 3919-Villa Crespo','Guardia Vieja 3919','Martes y sábado de 8 a 12 hs.',null,true),
  ('Cons. Hipólito Yrigoyen 3132- Once','Hipólito Yrigoyen 3132','Martes y jueves de 13 a 17 hs. Sábado de 8 a 12 hs.',null,true),
  ('Cons. Jose Hernández 2678- Belgrano','Jose Hernández 2678','Lunes y viernes de 8 a 11 hs.',null,true),
  ('Cons. José Marmol 2134 CABA','José Marmol 2134','Lunes, miércoles y viernes de 8 a 12 hs.',null,true),
  ('Cons. Juian Álvarez 1340- Villa Crespo','Julian Álvarez 1340','Martes y jueves de 7 a 12 hs. Sábado de 7 a 13 hs.',null,true),
  ('Cons. Juncal 2899','Juncal 2899','Lunes a sábados de 8 a 12 hs.',null,true),
  ('Cons. Lascano 4032','Lascano 4032','Miércoles y sábado de 8 a 12 hs.',null,true),
  ('Cons. Lezica 4475','Lezica 4475','Lunes a sábados de 8 a 12 hs.',null,true),
  ('Cons. Luis M Campos 1027','Luis M Campos 1027','Lunes a viernes de 8 a 14 hs. Sábado de 8 a 12 hs.',null,true),
  ('Cons. Manzanares 1753','Manzanares 1753','Martes, jueves y sábado de 13 a 17 hs.',null,true),
  ('Cons. Migueletes 1762','Migueletes 1762','Martes, jueves y sábado de 8 a 12 hs.',null,true),
  ('Cons. MIRABILA Humboldt 2045 CABA','Humboldt 2045','Sin cobertura activa informada en el archivo.',null,true),
  ('Cons. Moldes 1648- Nuñez','Moldes 1648','Lunes, miércoles y viernes de 8 a 12 hs.',null,true),
  ('Cons. Olagüer y Feliu 2970- Colegiales','Olagüer y Feliu 2970','Lunes a sábados de 13 a 16 hs.',null,true),
  ('Cons. Plaza 3547- Coghlan','Plaza 3547','Martes y viernes de 16 a 19 hs.',null,true),
  ('Cons. Puan 256/60- Caballito','Puan 256/60','Martes, jueves y sábado de 8 a 12 hs.',null,true),
  ('Cons. Rivadavia 9037-Floresta','Rivadavia 9037','Martes, jueves y sábado de 8 a 12 hs.',null,true),
  ('Cons. Roosevelt 1926- Belgrano','Roosevelt 1926','Lunes, miércoles y viernes de 8 a 12 hs.',null,true),
  ('Cons.Aristobulo del Valle 1301-La Boca.','Aristobulo del Valle 1301','Lunes a viernes de 8 a 16 hs. Sábado de 8 a 12 hs.',null,true),
  ('Cons.Ciudad de la Paz 575','Ciudad de la Paz 575','Martes, jueves y sábado de 8 a 12 hs.',null,true),
  ('Cons.Palacio Cabrera 5356- Palermo','Cabrera 5356','Lunes a viernes de 8 a 14 hs. Sábado de 8 a 12 hs.',null,true),
  ('Cons.Thomas Le Bretón 5153 - Villa Urquiza','Le Bretón 5153','Martes, jueves y sábado de 8 a 12 hs.',null,true),
  ('Florentino Ameghino 680','Florentino Ameghino 680','Lunes, miércoles y viernes de 12 a 16 hs.',null,true),
  ('Gym Formosa 168- Parque Chacabuco','Formosa 168','Martes y jueves de 13 a 17 hs.',null,true),
  ('Holmberg 4150 - Saavedra','Holmberg 4150','Miércoles y viernes de 13 a 17 hs.',null,true),
  ('ISEM SA','Emilio Mitre 1970','Lunes, miércoles y jueves de 12:30 a 16:30 hs.','DE BAJA',true),
  ('Laboratorio Eurolab -Juan de Garay 3831-Boedo','Juan de Garay 3831','Lunes a viernes de 8 a 11 hs.',null,true),
  ('Ludoplast Caseros LEONISMO ARGENTINO 3264 -CASEROS','LEONISMO ARGENTINO 3264','Lunes, miércoles y viernes de 8 a 12 hs.',null,true),
  ('Martinez castro 263','Martinez castro 263','Lunes y miércoles de 9 a 12 hs. Viernes de 8 a 12 hs.',null,true),
  ('Molycentro - A- Lamas 2135- V- Crespo','Andres Lamas 2135','Lunes, miércoles y viernes de 8 a 12 hs.',null,true),
  ('Molysil Avellaneda - Catamarca 1856','Catamarca 1856','Martes y jueves de 12 a 17 hs.',null,true),
  ('Molysil- Olagüer y Feliü 3398 Colegiales','Olagüer y Feliü 3398','Martes y jueves de 7:30 a 11:30 hs.',null,true),
  ('Monteagudo 121 Ramos Mejia','Monteagudo 121 Ramos Mejia - Adrián Palumbo','Lunes a sábados de 13 a 19 hs.',null,true),
  ('mundo chipa','Estrada 1859, villa maipú','Lunes a viernes de 13 a 17 hs.',null,true),
  ('Oficina Av Cordoba 1309','Av Cordoba 1309','Lunes, miércoles y viernes de 14 a 18 hs. Martes y jueves de 16 a 18 hs.',null,true),
  ('Oficina Naon Casa Central','Naon 3475','Lunes, miércoles y viernes de 12:30 a 16:30 hs.',null,true),
  ('Pergamino 160','Pergamino 160','Lunes, miércoles y viernes de 8 a 12 hs.',null,true),
  ('Peru 1566','Peru 1566','Sin cobertura activa informada en el archivo.','BAJA A PARTIR DEL 5/6',true),
  ('Serv Warnes 1243 caba','Warnes 1243','Lunes, miércoles y viernes de 8 a 13 hs.',null,true),
  ('sp . Vte López. Libertad 1650','Libertad 1650','Lunes a viernes de 7 a 15 hs. Sábado de 9 a 13 hs.',null,true),
  ('SP Const - Pueyrredón','Av. de los Constituyentes 6020','Lunes a viernes de 9 a 13 y 17 a 22 hs. Sábado de 10 a 14 hs.',null,true),
  ('Spital Hnos','COLECTORA, Acceso Sudeste KM. 12, Los Ciruelos 3748, B1874 Sarandí','Lunes, martes, miércoles y viernes de 9 a 14 hs. Jueves de 9 a 13 hs.','BAJA',true),
  ('Virrey Olaguer y Feliu 2453 CABA','Virrey Olaguer y Feliu 2453 - Kestelboim','Lunes a sábados de 8 a 12 hs.',null,true)
on conflict(name) do update set
  address=excluded.address,
  description=excluded.description,
  notes=excluded.notes,
  active=true,
  updated_at=now();

delete from public.services s
where s.name='Consorcio Demo'
  and not exists(select 1 from public.service_stock ss where ss.service_id=s.id)
  and not exists(select 1 from public.service_extra_stock es where es.service_id=s.id)
  and not exists(select 1 from public.profiles p where p.service_id=s.id);

commit;
