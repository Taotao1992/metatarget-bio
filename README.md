# 元靶科技 MetaTarget bio · 内部知识库（加密公开版）

团队内部知识网站：竞品分析 × 证据与决策框架 × 产品 Demo Lab × 团队档案与行动台。

## 访问

- 站点通过密码保护：全部内容以 AES-256-GCM 密文存放（`assets/js/payload.js`），
  访问者在浏览器本地输入密码后解密，密码不经过网络传输。
- 密码由团队内部单独分发，不出现在本仓库的任何文件中。
- `noindex, nofollow`：请勿提交到任何搜索引擎或公开目录。
- 安全边界：GitHub Pages 是静态托管，客户端加密只是低敏内部材料的临时门禁，
  不能替代服务器端身份、成员撤销与访问日志。高敏材料（CV 原件、匿名稿、
  客户数据、未公开实验结果）不进入构建产物。

## 更新内容

明文内容不保存在本仓库。内容维护在本机私有目录 `content-src/`（已 gitignore）：

- `content-src/pages/`：每页一个文件（`NN-id.js`），向 `window.SITE_PAGES` 追加；
- `content-src/data/`：Demo Lab 演示数据、档案中心索引等可替换数据；
- `content-src/demos/`：交互组件（`window.DEMOS`）。

修改后重新加密构建并推送：

```bash
node tools/encrypt.mjs <访问密码>   # 重新生成 assets/js/payload.js
node tools/smoke-test.mjs <访问密码> # 构建后冒烟测试
```

校验或恢复明文源：

```bash
node tools/decrypt.mjs <访问密码> [输出文件]   # 输出文件不得提交
```

## 运行

任意静态服务器即可，例如：

```bash
python3 -m http.server 8080
```

## 部署

推送到 `main` 后由 GitHub Pages 自动发布到
`https://taotao1992.github.io/metatarget-bio/`。

## 声明

内部参考资料｜含团队规划与未发表工作抽象描述｜请勿外传
