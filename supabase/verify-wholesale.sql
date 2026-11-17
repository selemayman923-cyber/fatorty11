select
  to_regprocedure('public.sns_wholesale_status(uuid)') is not null as status_ready,
  to_regprocedure('public.sns_wholesale_enable(uuid,boolean)') is not null as enable_ready,
  to_regprocedure('public.sns_wholesale_read(uuid,text,jsonb,integer,uuid)') is not null as read_ready,
  to_regprocedure('public.sns_wholesale_command(uuid,uuid,text,jsonb)') is not null as write_ready;
