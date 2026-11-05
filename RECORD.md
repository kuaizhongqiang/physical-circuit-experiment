# RECORD — 已进入仓库的提交

读者：AI / 负责人
类型：台账
权威：已提交变更的唯一清单
状态：2026-11-05 更新；已登记 `R-01`…`R-18`
依赖：`DECISION.md`（口径来源）

## 0 写法

- **只追加，不改旧条**。编号 `R-NN` 顺序递增。
- 一行一条：`R-NN` ＋ 提交哈希短号 ＋ 提交信息首行 ＋ 触及的主要路径。
- 不写待办、不写缘由（缘由在提交信息里）。
- ⚠️ **滞后登记**：squash 合并后的提交号在**合并之后**才产生，所以本次 PR 无法登记自己。
  规则是 **下一个 PR 补登记上一次合并的提交**。只追一条的滞后可以接受，不许形成"永远差两条"。

## 1 记录

| 编号 | 提交 | 信息首行 | 主要路径 |
|---|---|---|---|
| `R-01` | `e349c91` | `chore(repo): 初始化工程手册、设计文档与 agent 工具链` | `AGENT.md` `CODEBUDDY.md` `README.md` `.gitignore` `TODO.md` `DECISION.md` `RECORD.md` `docs/`(10) `.agent/`(19) `.github/`(7) |
| `R-02` | `7d1d13d` | `docs(record): 登记 R-01 并补记 RECORD 的滞后登记规则 (#30)` | `RECORD.md` `.github/workflows/ci.yml`（PR 全流程验证：分支 → PR → squash → 删分支） |
| `R-03` | `7ada698` | `docs(repo): 记录 CI 自动触发未生效的口径与对策 (#31)` | `DECISION.md`（D-27）`AGENT.md` §3 `.agent/notes/github-actions-triggers.md` `.agent/skills/doc-guard/check.mjs` |
| `R-04` | `71a9616` | `feat(core): M0–M4 落地 —— 内核 + C ABI + wasm + C# 绑定 + 演示页 (#32)` | `crates/` `bindings/` `fixtures/`(10) `scripts/` `docs/api.md` §7 `AGENT.md` §4 |
| `R-05` | `c7f31d3` | `fix(web): 修演示页「看不出接线」—— termById 未填充 + 导线红色 + 框内裁剪 + 开关符号 + 瞬动按钮 (#33)` | `bindings/web/demo.js` `bindings/web/demo.html` `docs/demo.md` §7 |
| `R-06` | `972270f` | `docs(repo): M5 收口 —— 门禁结果回写、台账齐账、CI 口径恢复、演示页验收记录 (#34)` | `docs/roadmap.md` §3.1 `docs/demo.md` §10.2 `DECISION.md`（D-29/D-30）`TODO.md` `RECORD.md` |
| `R-07` | `6b1084c` | `ci(release): 新增 tag 发布流水线，版本从 v0.0.0 起 (#35)` | `.github/workflows/release.yml` `Cargo.toml`(0.0.0) `crates/cabi`(版本串去硬编码) `.agent/workflows/05-release.md` `DECISION.md`（D-31） |
| `R-08` | `2ee29df` | `docs(record): 补登 R-06 / R-07 并标注当前版本 v0.0.0 (#36)` | `RECORD.md` `README.md` |
| `R-09` | `f0600ca` | `docs(playground): M6 切片 0 —— 实验台契约、口径与台账（纯文档） (#47)` | `docs/playground.md`(新) `docs/roadmap.md` §7 `docs/README.md` `AGENT.md` §5 `README.md` `TODO.md` `DECISION.md`（D-20261104-01…10）`RECORD.md`(R-08) `.agent/skills/gh-plan/plan.json` |
| `R-10` | `ba86fe4` | `feat(web): M6.1 器件图元元数据与几何映射（纯逻辑＋node 单测） (#48)` | `bindings/web/playground/device-catalog.js`(新) `geometry.js`(新) `model.js`(新) `test/`(4) `TODO.md` `RECORD.md` |
| `R-11` | `e8ff26c` | `feat(web): M6.2 画布编辑器骨架（白画布、放置/拖动/删除、即时求解） (#49)` | `bindings/web/playground/index.html` `canvas.js` `state.js` `solve.js` `test/` `evidence/` `TODO.md` `RECORD.md` |
| `R-12` | `92eff99` | `feat(web): M6.3 接线交互与导线渲染（点接点连线、删线、正交走线、框内裁剪） (#50)` | `bindings/web/playground/state.js` `canvas.js` `geometry.js` `index.html` `test/` `evidence/` `docs/playground.md` `DECISION.md` `TODO.md` `RECORD.md` |
| `R-13` | `ed7d17b` | `feat(web): M6.4 C1…C10 十样例与切换（layout sidecar ＋ 读 fixtures） (#51)` | `bindings/web/playground/samples/C1…C10.json` `samples.js` `model.js` `state.js` `index.html` `evidence/`(13) `test/` `TODO.md` `RECORD.md` |
| `R-14` | `98d553e` | `feat(web): M6.5 参数编辑与操作面板（属性表单 / 器件操作 / 诊断分级 / 接点表） (#43) (#52)` | `bindings/web/playground/index.html` `canvas.js` `device-catalog.js` `diag-text.js` `state.js` `test/` `evidence/` `docs/playground.md` `TODO.md` `RECORD.md` |
| `R-15` | `373d953` | `test(web): M6.6 自检脚本、页面自检页与 CI（10 样例 × 28 case ＋ 20 条误接） (#44) (#53)` | `scripts/playground-check.mjs` `scripts/lib/fixture-compare.mjs` `scripts/compare.mjs` `.github/workflows/ci.yml` `bindings/web/playground/selftest.html` `evidence/` `TODO.md` `RECORD.md` |
| `R-16` | `2cd55e7` | `feat(web): M6.7 Tailscale 部署与浏览器验收（--host、运行手册、本机记录） (#54)` | `scripts/serve.mjs` `bindings/web/playground/evidence/`(5) `docs/playground.md` §9 §10.3 `TODO.md` `RECORD.md` |
| `R-17` | `39b6157` | `docs(repo): M6 收口（README、索引、G6 回写与三台账齐账） (#46) (#63)` | `AGENT.md` `README.md` `bindings/web/README.md` `docs/README.md` `docs/playground.md` §10 `docs/roadmap.md` `TODO.md` `RECORD.md` |
| `R-18` | `39636a6` | `fix(web): 触点状态显示改读求解结果、非操作器件点击不改 state_bits (#61) (#64)` | `bindings/web/playground/contact-state.js` `index.html` `canvas.js` `state.js` `device-catalog.js` `test/contact-state.test.js` `evidence/`(3) `docs/playground.md` §5.4 §6.2 `RECORD.md` |
