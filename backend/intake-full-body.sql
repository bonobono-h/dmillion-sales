-- Keep the approval function, ownership checks and grants intact.
-- Match its input limit to the already stored source body limit.
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('public.crm_intake_approve(uuid,text,jsonb,jsonb,jsonb)'::regprocedure);
 if position('length(p_record->>''summary'')>8000' in definition)>0 then
  execute replace(definition,'length(p_record->>''summary'')>8000','length(p_record->>''summary'')>150000');
 elsif position('length(p_record->>''summary'')>150000' in definition)=0 then
  raise exception 'Unexpected intake approval definition; review before changing';
 end if;
end $$;
