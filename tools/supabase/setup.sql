-- 元靶科技内部站 · 团队输入中心同步后端（Supabase）
-- 用法：在 Supabase 项目 SQL Editor 中整段执行。
-- 执行前：把所有 __MTB_SHARED_SECRET__ 替换为团队共享密钥
-- （密钥由网站实现者生成，本地渲染版见 tools/out/mtb-setup.sql，不出现在公开仓库）。
--
-- 安全模型：
--   1) 表开启 RLS 且没有任何表级 policy → anon key 无法直接读写表；
--   2) 所有读写经由 security definer 的 RPC，函数内部校验共享密钥；
--   3) 共享密钥只存在于加密后的站点 payload 中（团队密码解锁后才可用），
--      因此知道站点密码的人 = 可以读写提交记录的人，与现有威胁模型一致。
--   4) 附件从不经过此后端（只登记 manifest）。

create table if not exists public.mtb_submissions (
  id            uuid primary key default gen_random_uuid(),
  form_id       text not null,
  submission_id text not null,
  owner         text not null default '',
  status        text not null default 'draft',
  version       int  not null default 1,
  record        jsonb not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (form_id, submission_id)
);

alter table public.mtb_submissions enable row level security;

-- 健康检查 / 连通性验证（TEAM SHARED 徽章只在它成功后点亮）
create or replace function public.mtb_ping(secret text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if secret <> '__MTB_SHARED_SECRET__' then raise exception 'unauthorized'; end if;
  return jsonb_build_object('ok', true, 'ts', now());
end $$;

-- 草稿保存 / 提交：按 (form_id, submission_id) 幂等 upsert
create or replace function public.mtb_upsert(secret text, payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if secret <> '__MTB_SHARED_SECRET__' then raise exception 'unauthorized'; end if;
  insert into public.mtb_submissions (form_id, submission_id, owner, status, version, record)
  values (
    payload->>'formId',
    payload->>'submissionId',
    coalesce(payload->>'owner', ''),
    coalesce(payload->>'status', 'draft'),
    coalesce((payload->>'version')::int, 1),
    payload
  )
  on conflict (form_id, submission_id) do update
    set owner = excluded.owner,
        status = excluded.status,
        version = excluded.version,
        record = excluded.record,
        updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

-- 全量拉取（MVP 规模足够；后续可按 form_id/status 过滤）
create or replace function public.mtb_list(secret text)
returns setof public.mtb_submissions
language plpgsql security definer set search_path = public as $$
begin
  if secret <> '__MTB_SHARED_SECRET__' then raise exception 'unauthorized'; end if;
  return query select * from public.mtb_submissions order by updated_at desc;
end $$;

-- 状态流转（Submit / RequestChanges / Approve / Freeze / NewVersion）
create or replace function public.mtb_set_status(secret text, p_form_id text, p_submission_id text, p_status text, p_actor text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if secret <> '__MTB_SHARED_SECRET__' then raise exception 'unauthorized'; end if;
  update public.mtb_submissions
     set status = p_status,
         record = jsonb_set(
                    jsonb_set(record, '{auditEvents}',
                      coalesce(record->'auditEvents', '[]'::jsonb) ||
                      jsonb_build_object('at', now(), 'action', p_status, 'actor', p_actor)),
                    '{status}', to_jsonb(p_status)),
         updated_at = now()
   where form_id = p_form_id and submission_id = p_submission_id;
  if not found then raise exception 'submission not found'; end if;
  return jsonb_build_object('ok', true);
end $$;
