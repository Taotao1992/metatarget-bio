# 团队例会自动提醒邮件

每天由 GitHub Actions 运行一次 `tools/reminder/send-reminder.mjs`；仅当
「布里斯班今天」= 会议前 3 天（即会议周的周四）时，向全体成员发送提醒邮件，
邮件附两地时间、Zoom 链接与议程（讨论区近三周活跃话题 + 上次会议未决事项）。

- 会议节奏：每 3 周，周日，布里斯班 22:00–23:30（锚点 2026-08-16，之后自动滚动）。
- 修改节奏/时间：改 `send-reminder.mjs` 顶部 `MEETING` 常量，
  **并同步修改**站点侧 `content-src/data/meeting-config.js`（改完重新 `node tools/encrypt.mjs <密码>` 发布）。

## 一次性配置：GitHub Secrets

仓库 `Settings` → `Secrets and variables` → `Actions` → `New repository secret`，添加：

| Secret | 内容 | 获取方式 |
| --- | --- | --- |
| `GMAIL_USER` | 发件用 Gmail 地址 | 一个你控制的 Gmail 账号 |
| `GMAIL_APP_PASSWORD` | 该账号的应用专用密码 | Google 账号开 2FA 后，到 https://myaccount.google.com/apppasswords 生成（16 位） |
| `REMINDER_TO` | 收件人列表，逗号分隔 | 示例：`taotao.cai@unisq.edu.au, yaoyuelin120@outlook.com, wangpengfei0703@gmail.com, xiaolei@ebi.ac.uk` |
| `ZOOM_LINK` | Zoom 会议链接 | 例会固定链接 |
| `MTB_SUPABASE_URL` | Supabase 项目 URL | 同 `content-src/data/sync-config.js` 里的 `url` |
| `MTB_SUPABASE_ANON_KEY` | Supabase anon key | 同上 `anonKey` |
| `MTB_SHARED_SECRET` | 讨论区共享密钥 | 同上 `sharedSecret` |

后三个只用于拉取讨论区议程；不配置也能发信，只是议程部分会降级为
「议程获取失败，请直接查看网站讨论区」。

## 验证

1. 配好 Secrets 后：仓库 `Actions` → `Meeting reminder` → `Run workflow`
   （test 保持 true）→ 几分钟内 4 个收件人应收到主题带【测试】的邮件。
2. 定时任务每天 UTC 23:05（布里斯班 09:05）自动运行；日志里可看到
   「今天不是提醒日，退出（幂等）」或「已发送」。

## 本地调试

```bash
node tools/reminder/send-reminder.mjs --dry           # 只打印邮件，不发信
TODAY_OVERRIDE=2026-08-13 node tools/reminder/send-reminder.mjs --dry
FORCE_SEND=1 node tools/reminder/send-reminder.mjs --dry
```

（`--dry` 不需要 nodemailer；真实发送需先 `npm i nodemailer`。）

## 讨论区新动态邮件（discuss-notify）

- `.github/workflows/discuss-notify.yml` 每小时检查一次讨论区，有新话题/评论就给
  `REMINDER_TO` 里的成员发摘要邮件；本地预览：`FORCE_SEND=1 node tools/reminder/notify-new.mjs --dry`。
- 游标存 Supabase：需先在 SQL Editor 执行 `tools/supabase/notify-state.sql`
  （渲染版 `tools/out/mtb-notify-state.sql`）。没执行也能跑——自动降级为「看最近 1 小时」，
  但可能重复提醒，建议尽快执行。

## 注意事项

- **GitHub 会在仓库 60 天无活动后自动暂停 scheduled workflow**。届时 Actions 页
  会有提示，点「Enable workflow」即可恢复；平时正常的提交活动即可避免。
- 仓库是公开的：收件人邮箱、Zoom 链接、各类凭据**只允许放在 Secrets**，
  不要写进 workflow 文件或脚本。
- Gmail 应用专用密码失效（改密码 / 关 2FA）会导致发送失败，Actions 日志会报错。
