---
name: doc-guard
description: 校验文档地图、AGENT 索引、三台账编号是否自洽；CI 的 guard job 与提交前自检都跑它。当改动 docs/、AGENT.md、TODO.md、DECISION.md、RECORD.md 或新增 fixtures 后，必须跑一次。
---

# doc-guard

## 何时用

- 改完 `docs/` 下任何文件、`AGENT.md`、或三份台账（`TODO.md` / `DECISION.md` / `RECORD.md`）之后；
- 新增 / 改名 / 删除文档之后；
- 新增 `fixtures/*.json` 之后；
- CI：`.github/workflows/ci.yml` 的 `guard` job 第一步。

## 怎么跑

```bash
node .agent/skills/doc-guard/check.mjs
```

- **零依赖**，只用 Node 内置模块；Node ≥ 18。
- 退出码 `0` = 全过；`1` = 有违规，stderr 逐条列出「文件: 问题」。
- 在仓库任意子目录跑都行（脚本自己定位仓库根）。

## 它检查什么

| # | 规则 | 为什么 |
|---|---|---|
| 1 | `docs/README.md` 表格里出现的每个 `x.md` 都真实存在 | 索引写了文件却不在，是最常见的幻影文档 |
| 2 | `AGENT.md` 里出现的每个 `docs/x.md` 引用都存在 | 手册指向不存在的文档，会把后续 agent 带到沟里 |
| 3 | `TODO.md` 的 `T-NN` / `P-NN` 编号不重复 | 编号重复会让 RECORD 与提交信息对不上账 |
| 4 | `DECISION.md` 的 `D-YYYYMMDD-NN` 不重复 | 同上；DECISION 只追加不改，重复即事故 |
| 5 | `RECORD.md` 的 `R-NN` 不重复 | 同上 |
| 6 | `fixtures/*.json` 必含 `case` / `baseline_source` / `devices` / `wires` / `expect`，且恰好一个 `PE` | fixture 是判据，缺字段等于判据不成立 |
| 7 | 工作树里**没有被跟踪的**产物（`*.dll` / `*.wasm` / `target/` / `pkg/` / `dist/`） | 二进制入库不可逆 |

## 不检查什么

以下故意不管，因为判不出真假，只会制造噪音：

- 文档措辞、章节顺序、字数；
- 数值是否与代码一致（那要靠 `cargo test`）；
- 中文标点、markdown 渲染效果。

## 修不动的怎么办

如果某条规则本身不合适，**改规则要同批改这份 `SKILL.md` 与 `.agent/README.md`**，
并在 PR 里说明为什么原来的规则判错了 —— 不要为了过检查去改文档。
