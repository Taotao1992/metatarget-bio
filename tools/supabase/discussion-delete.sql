-- 元靶科技内部站 · 讨论区删除功能（Supabase）
-- 依赖：已执行过 mtb-setup.sql 与 mtb-discussion.sql。
-- 执行前：把所有 __MTB_SHARED_SECRET__ 替换为团队共享密钥
-- （本地渲染版见 tools/out/mtb-delete.sql，不出现在公开仓库）。
--
-- 安全模型与现有一致：表开 RLS 且无表级 policy；删除经 security definer RPC，
-- 函数内校验共享密钥。话题删除时评论随外键 ON DELETE CASCADE 一并删除。
-- 权限口径：前端只对「作者本人」显示删除按钮（与「标记已解决」同一判定），
-- 服务端不再二次校验作者（共享密钥即团队通行证，与现状一致）。

-- 删除话题（评论级联删除）
create or replace function public.mtb_topic_delete(secret text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if secret <> '__MTB_SHARED_SECRET__' then raise exception 'unauthorized'; end if;
  delete from public.mtb_topics where id = p_id;
  if not found then raise exception 'topic not found'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- 删除单条评论
create or replace function public.mtb_comment_delete(secret text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if secret <> '__MTB_SHARED_SECRET__' then raise exception 'unauthorized'; end if;
  delete from public.mtb_comments where id = p_id;
  if not found then raise exception 'comment not found'; end if;
  return jsonb_build_object('ok', true);
end $$;
