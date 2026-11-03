# gh CLI 用法笔记

读者：AI
类型：笔记
权威：本仓库批量建标签 / 里程碑 / issue 的安全写法
状态：2026-11-03 建立
依赖：`../skills/gh-plan/SKILL.md`、`./powershell-encoding.md`

## 1 先确认登录与权限

```bash
gh auth status          # 需要 repo 权限
gh repo view --json nameWithOwner
```

## 2 中文永远走 `--input`

```bash
gh api --method POST --input body.json repos/{owner}/{repo}/issues
```

- `body.json` 用 UTF-8 写（Node 的 `writeFileSync(f, JSON.stringify(o), "utf8")` 即可）。
- **不要**把中文拼进 `-f title=中文` / `--title 中文`：本机代码页 936 会在传参时就地转码。
- `{owner}` / `{repo}` 占位符在仓库工作区内由 gh 自动替换，不用手拼仓库名。

## 3 URL 里的 `&` 是 Windows 的雷

```bash
gh api "repos/{owner}/{repo}/issues?state=all&per_page=100"
```

- 通过 `cmd.exe` 调用时 `&` 会被当成命令分隔符，后半段直接被当成新命令。
- 处置：**用 `spawnSync("gh", args)` 且 `shell: false`**（默认值），不要 `shell: true`；
  Node 在 Windows 上能直接解析 `gh.exe`。
- 若确实需要 shell，则必须给整个 URL 加引号，且别在引号里再用 `^`。

## 4 常用端点

| 动作 | 端点 |
|---|---|
| 列标签 | `repos/{owner}/{repo}/labels?per_page=100` |
| 建标签 | `POST repos/{owner}/{repo}/labels`，body `{name,color,description}` |
| 列里程碑 | `repos/{owner}/{repo}/milestones?state=all&per_page=100` |
| 建里程碑 | `POST repos/{owner}/{repo}/milestones`，body `{title,description}` |
| 列 issue | `repos/{owner}/{repo}/issues?state=all&per_page=100&direction=asc` |
| 建 issue | `POST repos/{owner}/{repo}/issues`，body `{title,body,milestone,labels}` |

注意：列表接口里 **PR 也会出现在 `/issues`** 中，按标题去重时要容忍这一点。

## 5 幂等做法

1. 先 `GET` 列表，把已有标题收进 `Set`；
2. 逐条比标题，已存在就跳过；
3. 建 milestone 时把返回的 `number` 记下来，建 issue 时用它填 `milestone` 字段（**不是标题**）。

本仓库已封装：`node .agent/skills/gh-plan/apply.mjs [--dry-run] [--only=labels|milestones|issues]`。

## 6 issue 模板与 CLI 的关系

`.github/ISSUE_TEMPLATE/*.yml` 只对**网页新建**生效；用 `gh` / `gh api` 建 issue 时模板不会自动套，
所以要自己把同样的字段（目标、验收判据、涉及文档）写进 `body`。

## 7 回读核对时不要相信控制台

**现象**：`gh api repos/{owner}/{repo}/milestones` 在 PowerShell 里回显成 `M0 ���gN�]wQ��`，
正文里还夹着 `਍൞ഊ匊湹慴` 这种怪字符，看着像"远端数据被写坏了"。

**真相**：数据是好的，坏的是**显示**。gh 输出的是 UTF-8 字节，PowerShell 5.1 用代码页 936 解码再回显，
中文被按 GBK 切碎；再叠上 `>` 重定向写入 UTF-16，就会出现那种"半个汉字＋乱码"的假象。

**正确的核对姿势**：

```powershell
gh api "repos/{owner}/{repo}/issues?state=all&per_page=100" | Out-File -Encoding utf8 $env:TEMP\is.json
node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync(process.env.TEMP+'/is.json','utf8').replace(/^\uFEFF/,''));console.log(JSON.stringify(j[0].title))"
```

要点三条：
1. 写文件用 `Out-File -Encoding utf8`（别用 `>`）；
2. 读文件先去掉 BOM（`/^\uFEFF/`）；
3. 打印用 `JSON.stringify` —— 非 ASCII 会被转成 `\uXXXX`，**输出全是 ASCII，绕开代码页**。

只要 `JSON.stringify` 出来的 `\u` 序列能对应回中文（如 `\u9aa8\u67b6` = 骨架），就说明数据完好。

