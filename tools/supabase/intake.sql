-- 元靶科技内部站 · Demo 真实数据填写表后端（Supabase）
-- 依赖：已执行过 mtb-setup.sql（共享密钥口径一致）。
-- 执行前：把所有 __MTB_SHARED_SECRET__ 替换为团队共享密钥
-- （本地渲染版见 tools/out/mtb-intake.sql，不出现在公开仓库）。
--
-- 安全模型与讨论区一致：表开 RLS 且无表级 policy；读写经 security definer RPC，
-- 函数内校验共享密钥。payload 为 jsonb，容纳「范围 + 每个 gene–disease pair 的
-- 七模块结论行」，字段由前端表单约束。

create table if not exists public.mtb_intake (
  id         uuid primary key default gen_random_uuid(),
  author     text not null default '',
  scope      text not null default '',           -- 疾病/pair 摘要（列表页展示用）
  payload    jsonb not null,                     -- 完整表单内容
  created_at timestamptz not null default now()
);

alter table public.mtb_intake enable row level security;
create index if not exists mtb_intake_created_idx on public.mtb_intake (created_at desc);

-- 提交一条填写记录，返回新行
create or replace function public.mtb_intake_submit(secret text, p_author text, p_scope text, p_payload jsonb)
returns public.mtb_intake
language plpgsql security definer set search_path = public as $$
declare r public.mtb_intake;
begin
  if secret <> '__MTB_SHARED_SECRET__' then raise exception 'unauthorized'; end if;
  insert into public.mtb_intake (author, scope, payload) values (p_author, p_scope, p_payload)
  returning * into r;
  return r;
end $$;

-- 最近 N 条（默认 20）
create or replace function public.mtb_intake_list(secret text, p_limit int default 20)
returns setof public.mtb_intake
language plpgsql security definer set search_path = public as $$
begin
  if secret <> '__MTB_SHARED_SECRET__' then raise exception 'unauthorized'; end if;
  return query select * from public.mtb_intake order by created_at desc limit greatest(1, least(coalesce(p_limit, 20), 100));
end $$;
