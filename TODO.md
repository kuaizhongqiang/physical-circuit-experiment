# TODO — 还没做 / 待拍板

读者：AI / 负责人
类型：台账
权威：**待办与待拍板项的唯一清单**
状态：2026-11-04 更新 — M0–M5 已完成；**M6 网页实验台进行中**，剩余切片见 §2；§1 无待拍板
依赖：`AGENT.md`（纪律）、`docs/README.md`（文档地图）、`docs/roadmap.md`（里程碑与门禁，§7 为 M6）、`DECISION.md`（已定口径）

## 0 用法

- **§1 待拍板（P-NN）**：只有负责人能定口径。AI **不得**自行选一个继续往下写；未拍的条目不写进 `DECISION.md`。
- **§2 待办（T-NN）**：我方动作，不需要拍板即可做；括号里是它所属里程碑。
- 做完 / 拍板即**同批删掉**该条（拍板的同时在 `DECISION.md` 追加 `D-YYYYMMDD-NN`）。不写缘由、不写提交号、不留"已完成"。
- 新增待拍板项一律追加到 §1 末尾，**编号不复用**（P-01…P-22 已用尽，从 P-23 起）。

## 1 待拍板

**（无）** 口径已全部拍板：`DECISION.md` D-20261103-01…31 ＋ D-20261104-01…10（M6 网页实验台）。新问题出现时按编号 P-23 起追加于此。

## 2 待办

M6 网页电路实验台按切片串行推进（一片一 PR，顺序与门禁见 `docs/roadmap.md` §7、契约见 `docs/playground.md`）：

- **T-16**（M6.2 / #40）画布编辑器骨架：`state.js` / `solve.js` / `canvas.js` / `index.html`，白画布放置 / 拖动 / 删除与即时求解。
- **T-17**（M6.3 / #41）接线交互与导线渲染：点接点连线、删线、正交走线、框内裁剪（Liang–Barsky）与单测。
- **T-18**（M6.4 / #42）C1…C10 十样例与切换：`samples/C*.json`（layout ＋ 操作状态）＋ `samples.js` ＋ `scripts/playground-check.mjs` 首版。
- **T-19**（M6.5 / #43）参数编辑与操作面板：可编辑参数子集、器件操作、C9 转速滑块。
- **T-20**（M6.6 / #44）自检脚本、页面自检页与 CI：`scripts/lib/fixture-compare.mjs`、完整 `playground-check.mjs`、`selftest.html`、CI `wasm` job 加一步。
- **T-21**（M6.7 / #45）Tailscale 部署与浏览器验收：`scripts/serve.mjs` 可选 `--host`、`docs/playground.md` §9 / §10 回填。
- **T-22**（M6.8 / #46）M6 收口：README、索引、G6 结果回写与三台账齐账。

**二期再启动时**：从 `docs/roadmap.md` §6 与 GitHub milestone `二期` 取条目，按新一轮 P 编号重新开待拍板；本文件不预置二期待办。
