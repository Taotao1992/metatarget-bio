-- 元靶科技内部站 · 讨论区富文本与附件升级（Supabase）
-- 依赖：已执行过 mtb-setup.sql 与 mtb-discussion.sql。
-- 变更内容：
--   1) 放宽正文长度上限（富文本 HTML 体积大于纯文本）；
--   2) 新建 Storage bucket `mtb-attachments` 存放视频 / 音频 / 文档附件：
--      - public 读：URL 形如 /storage/v1/object/public/mtb-attachments/<uuid>-<文件名>，
--        路径含随机 UUID 不可枚举，与站点「低敏内部材料」口径一致；
--      - 允许 anon 角色仅向该 bucket 写入（上传无需 sharedSecret——
--        anon key 本身只随加密站点 payload 分发，风险口径与 anon key 相同）；
--      - 单文件上限 200MB（免费套餐 Storage 总量 1GB，注意清理旧文件）。
-- 执行方式：Supabase 控制台 → SQL Editor → 整段粘贴 → Run。

-- 1) 放宽正文长度
alter table public.mtb_topics   drop constraint if exists mtb_topics_body_check;
alter table public.mtb_topics   add  constraint mtb_topics_body_check
  check (char_length(body) <= 60000);
alter table public.mtb_comments drop constraint if exists mtb_comments_body_check;
alter table public.mtb_comments add  constraint mtb_comments_body_check
  check (char_length(body) between 1 and 30000);

-- 2) 附件 bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mtb-attachments', 'mtb-attachments', true, 209715200, null)
on conflict (id) do nothing;

-- anon 可上传（仅该 bucket）
drop policy if exists mtb_att_insert on storage.objects;
create policy mtb_att_insert on storage.objects
  for insert to anon
  with check (bucket_id = 'mtb-attachments');

-- 注意：不授予 anon select policy——public bucket 的 /object/public/ 读取不经过 RLS，
-- 而授予 select 会让持有 anon key 的人「列出」bucket 全部文件，破坏随机路径不可枚举模型。
