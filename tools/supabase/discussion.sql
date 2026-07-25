-- 元靶科技内部站 · 团队讨论区后端（Supabase）
-- 依赖：已执行过 mtb-setup.sql（共享密钥口径一致）。
-- 执行前：把所有 __MTB_SHARED_SECRET__ 替换为团队共享密钥
-- （本地渲染版见 tools/out/mtb-discussion.sql，不出现在公开仓库）。
--
-- 安全模型与表单同步一致：表开 RLS 且无表级 policy；全部读写经 security definer RPC，
-- 函数内校验共享密钥；密钥只存在于加密站点 payload 中。
-- 图片以 base64 文本存 mtb_images（前端入库前压缩到 ≤ ~900KB base64），
-- 不启用 Storage bucket，保持单一密钥模型。

create table if not exists public.mtb_topics (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 1 and 200),
  body       text not null default '' check (char_length(body) <= 20000),
  author     text not null default '',
  status     text not null default 'open' check (status in ('open','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mtb_comments (
  id         uuid primary key default gen_random_uuid(),
  topic_id   uuid not null references public.mtb_topics(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 10000),
  author     text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.mtb_images (
  id         uuid primary key default gen_random_uuid(),
  author     text not null default '',
  mime       text not null check (mime in ('image/jpeg','image/png','image/webp','image/gif')),
  data       text not null check (char_length(data) <= 1400000),  -- base64，约 ≤1MB 原始
  bytes      int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.mtb_topics   enable row level security;
alter table public.mtb_comments enable row level security;
alter table public.mtb_images   enable row level security;

create index if not exists mtb_comments_topic_idx on public.mtb_comments (topic_id, created_at);

-- 话题列表（带评论数与最新动态时间）
create or replace function public.mtb_topic_list(secret text)
returns table (id uuid, title text, body text, author text, status text,
               created_at timestamptz, updated_at timestamptz, comment_count bigint)
language plpgsql security definer set search_path = public as $$
begin
  if secret <> '__MTB_SHARED_SECRET__' then raise exception 'unauthorized'; end if;
  return query
    select t.id, t.title, t.body, t.author, t.status, t.created_at, t.updated_at,
           (select count(*) from public.mtb_comments c where c.topic_id = t.id) as comment_count
      from public.mtb_topics t
     order by greatest(t.updated_at,
             coalesce((select max(c.created_at) from public.mtb_comments c where c.topic_id = t.id), t.updated_at)
            ) desc;
end $$;

-- 建话题，返回新行
create or replace function public.mtb_topic_create(secret text, p_title text, p_body text, p_author text)
returns public.mtb_topics
language plpgsql security definer set search_path = public as $$
declare r public.mtb_topics;
begin
  if secret <> '__MTB_SHARED_SECRET__' then raise exception 'unauthorized'; end if;
  insert into public.mtb_topics (title, body, author) values (p_title, p_body, p_author)
  returning * into r;
  return r;
end $$;

-- 话题状态（open / resolved）
create or replace function public.mtb_topic_set_status(secret text, p_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if secret <> '__MTB_SHARED_SECRET__' then raise exception 'unauthorized'; end if;
  if p_status not in ('open','resolved') then raise exception 'bad status'; end if;
  update public.mtb_topics set status = p_status, updated_at = now() where id = p_id;
  if not found then raise exception 'topic not found'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- 评论列表
create or replace function public.mtb_comment_list(secret text, p_topic_id uuid)
returns setof public.mtb_comments
language plpgsql security definer set search_path = public as $$
begin
  if secret <> '__MTB_SHARED_SECRET__' then raise exception 'unauthorized'; end if;
  return query select * from public.mtb_comments where topic_id = p_topic_id order by created_at asc;
end $$;

-- 发评论，返回新行（并触碰话题 updated_at）
create or replace function public.mtb_comment_add(secret text, p_topic_id uuid, p_body text, p_author text)
returns public.mtb_comments
language plpgsql security definer set search_path = public as $$
declare r public.mtb_comments;
begin
  if secret <> '__MTB_SHARED_SECRET__' then raise exception 'unauthorized'; end if;
  insert into public.mtb_comments (topic_id, body, author) values (p_topic_id, p_body, p_author)
  returning * into r;
  update public.mtb_topics set updated_at = now() where id = p_topic_id;
  return r;
end $$;

-- 传图（base64），返回图片 id
create or replace function public.mtb_image_add(secret text, p_mime text, p_data text, p_author text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if secret <> '__MTB_SHARED_SECRET__' then raise exception 'unauthorized'; end if;
  insert into public.mtb_images (mime, data, bytes, author)
  values (p_mime, p_data, char_length(p_data), p_author)
  returning id into new_id;
  return new_id;
end $$;

-- 取图
create or replace function public.mtb_image_get(secret text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare img record;
begin
  if secret <> '__MTB_SHARED_SECRET__' then raise exception 'unauthorized'; end if;
  select mime, data into img from public.mtb_images where id = p_id;
  if not found then raise exception 'image not found'; end if;
  return jsonb_build_object('mime', img.mime, 'data', img.data);
end $$;
