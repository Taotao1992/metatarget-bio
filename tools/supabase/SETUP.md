# 团队输入中心 · Supabase 同步后端设置指南

约 10 分钟。做完第 4 步后把两个值发给网站实现者即可。

## 1. 注册并建项目

1. 打开 https://supabase.com ，用 GitHub 账号登录（免费）。
2. `New project` → 选 Free 套餐；区域建议 `Singapore`（国内访问较近）。
3. 数据库密码随意填并保存（本站用不到，但 Supabase 要求设置）。
4. 等项目初始化完成（约 2 分钟）。

## 2. 执行建库 SQL

1. 左侧菜单 `SQL Editor` → `New query`。
2. 打开本机文件 `tools/out/mtb-setup.sql`（网站实现者已渲染好密钥的版本；
   不要手动改动其中的密钥串），整段复制粘贴进去 → `Run`。
3. 看到 `Success` 即可。它创建了：
   - `mtb_submissions` 表（表单提交记录；RLS 全开、无表级放行）；
   - 4 个带密钥校验的 RPC：`mtb_ping` / `mtb_upsert` / `mtb_list` / `mtb_set_status`。

## 3. 验证（可选）

在 `Table Editor` 里应能看到 `mtb_submissions`（空表）。
直接匿名访问 `https://<项目>.supabase.co/rest/v1/mtb_submissions` 应返回权限错误——这是预期行为。

## 4. 把两个值发给网站实现者

左侧 `Project Settings` → `API`：

- **Project URL**（形如 `https://abcdefgh.supabase.co`）
- **anon public key**（`eyJ...` 长串，标着 `anon` `public`）

这两个值会被写进本地 `content-src/data/sync-config.js`（gitignored），
加密进站点 payload 后重新发布。它们不是高危密钥：
没有共享密钥，anon key 读不到任何数据；共享密钥只在加密 payload 内。

## 5. 完成后的体验

- 小蕾/悦临打开输入中心 → 顶部徽章显示 `TEAM SHARED`（真实连通后才会点亮，否则回落 LOCAL PROTOTYPE）；
- Save Draft / Submit / Approve / Freeze 全部实时同步；
- 任何团队成员解锁站点后都能在任务卡上看到最新提交与状态流转记录。

## 备注

- 免费额度（500MB 数据库、每日请求量）对本场景绰绰有余。
- 附件永远不经过该后端，只在表单里登记 manifest（文件名/大小/保密等级）。
- 若要撤销访问：在 Supabase `API` 页重置 anon key，并告知实现者重新渲染 SQL 换密钥。
