create table if not exists public.crm_api_settings (
  key text primary key,
  encrypted_value text not null,
  iv text not null,
  auth_tag text not null,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint crm_api_settings_known_key check (
    key in (
      'OPENAI_API_KEY',
      'OPENAI_TRANSCRIPTION_MODEL',
      'OPENAI_ANALYSIS_MODEL',
      'OPENAI_REALTIME_TRANSCRIPTION_MODEL',
      'SOLAPI_API_KEY',
      'SOLAPI_API_SECRET',
      'SOLAPI_SENDER_NUMBER',
      'CALLBRIDGE_API_KEY',
      'CALLBRIDGE_AGENT_API_KEY',
      'CALLBRIDGE_BASE_URL',
      'CALLBRIDGE_DISPLAY_NUMBER'
    )
  )
);

alter table public.crm_api_settings enable row level security;

revoke all on table public.crm_api_settings from anon, authenticated;
grant select, insert, update, delete on table public.crm_api_settings to service_role;

create or replace function public.set_crm_api_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_crm_api_settings_updated_at on public.crm_api_settings;
create trigger set_crm_api_settings_updated_at
before update on public.crm_api_settings
for each row
execute function public.set_crm_api_settings_updated_at();
