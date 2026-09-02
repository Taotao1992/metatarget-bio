-- 元靶科技内部站 · 讨论区新动态邮件通知的状态表（Supabase）
-- 依赖：已执行过 mtb-setup.sql（共享密钥口径一致）。
-- 执行前：把所有 __MTB_SHARED_SECRET__ 替换为团队共享密钥
-- （本地渲染版见 tools/out/mtb-notify-state.sql，不出现在公开仓库）。
-- 用途：GitHub Actions 每小时跑 notify-new.mjs，用这张表存「上次通知到哪个时间点」的游标。

create table if not exists public.mtb_notify_state (
  k text primary key,
  v jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.mtb_notify_state enable row level security;

create or replace function public.mtb_notify_get(secret text, p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if secret <> '__MTB_SHARED_SECRET__' then raise exception 'unauthorized'; end if;
  select v into r from public.mtb_notify_state where k = p_key;
  return coalesce(r, 'null'::jsonb);
end $$;

create or replace function public.mtb_notify_set(secret text, p_key text, p_value jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if secret <> '__MTB_SHARED_SECRET__' then raise exception 'unauthorized'; end if;
  insert into public.mtb_notify_state (k, v) values (p_key, p_value)
  on conflict (k) do update set v = excluded.v, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;
