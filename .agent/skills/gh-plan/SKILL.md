---
name: gh-plan
description: 从 plan.json 幂等地建立 GitHub 标签、里程碑与 issue（可 dry-run）。当需要把 docs/roadmap.md 的计划落到 GitHub 里程碑、或批量新建/补齐任务 issue 时使用。
---

# gh-plan

## 何时用

- 计划（`docs/roadmap.md`）定稿后，要一次性落成里程碑 ＋ 任务 issue；
- 里程碑推进中新拆出任务，要补 issue；
- 仓库标签体系需要统一。

## 前置

- `gh` 已登录且有 `repo` 权限：`gh auth status`
- 在仓库工作区内运行（脚本自己定位仓库根，`gh api` 用 `{owner}/{repo}` 占位符）

## 怎么跑

```bash
# 先看会建什么，不写远端
node .agent/skills/gh-plan/apply.mjs --dry-run

# 真建
node .agent/skills/gh-plan/apply.mjs

# 只补 labels / 只补 issues
node .agent/skills/gh-plan/apply.mjs --only=labels
node .agent/skills/gh-plan/apply.mjs --only=issues
```

## 幂等

按 **标题** 去重：已存在的标签 / 里程碑 / issue 一律跳过，只补缺的。
所以可以反复跑，不会产生重复 issue。

## plan.json 结构

```jsonc
{
  "labels":     [{ "name": "area/core", "color": "1d76db", "description": "计算内核" }],
  "milestones": [{ "title": "M0 骨架与工具链", "description": "见 docs/roadmap.md §3" }],
  "issues":     [{ "title": "[M0] …", "milestone": "M0 骨架与工具链",
                   "labels": ["area/ci"], "body": "目标…\n验收…" }]
}
```

- `issues[].milestone` 用**标题**引用，脚本自动换成 milestone number。
- `issues[].labels` 中的标签必须先在 `labels` 里声明，否则 GitHub 会静默丢掉未知标签。

## 中文安全

所有中文都写在**文件里**，通过 `gh api --input <utf8 文件>` 提交，**绝不**把中文拼进命令行参数
（本机代码页 936，命令行中文会被就地转码，见 `../../notes/powershell-encoding.md`）。

## 输出

- 每条一行：`+ label area/core` / `= milestone M0 (已存在)` / `+ issue #12 [M0] …`
- 结束时打印统计：新建 / 跳过 各多少。
- 失败（非 0 退出）时打印 `gh` 的 stderr 原文，不吞错。
