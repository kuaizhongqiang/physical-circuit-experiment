## 摘要

<!-- 一句话说清这个 PR 让仓库里多了什么可验证的东西 -->

## 关联

- Issue：`#`
- TODO：`T-`
- DECISION（若本 PR 落的是已拍板口径）：`D-`

## 变更类型

- [ ] `feat` 新增能力
- [ ] `fix` 修缺陷
- [ ] `docs` 只改文档（不改实现语义）
- [ ] `contract` 契约变更（`api.md` / `domain-model.md`）
- [ ] `chore` 构建 / 工具链 / CI
- [ ] `refactor` 不改行为的重构
- [ ] 破坏性变更（提交信息需带 `!`）

## 契约与实现是否同批

- [ ] 改了 `docs/api.md` 或 `docs/domain-model.md`，且 C# / TS 绑定在同一 PR 内改完
- [ ] 改了数值口径（`solver.md` §5 `N-*`），且 `core::consts` 同批对齐
- [ ] 改了器件接点表，且 `fixtures/` 与 `docs/demo.md` 的接点几何同批更新
- [ ] 本 PR 不涉及契约

## 分支与检查

- [ ] 本 PR **从分支合入** `main`（`main` 受保护，直推会被拒）
- [ ] `guard` 检查已绿；`rust` / `wasm` 若红已修（M0 前仅 notice 跳过属预期）
- [ ] 合并方式为 **squash**，合并后删除分支

## 台账同步（缺一视为未完成）

- [ ] `TODO.md`：完成的 `T-NN` 已删除；新发现的待拍板项已登记 `P-NN`
- [ ] `DECISION.md`：若有新拍板口径，已追加 `D-YYYYMMDD-NN`
- [ ] `RECORD.md`：合并后登记 `R-NN`

## 门禁

- [ ] 非里程碑收尾 PR
- [ ] 里程碑收尾，对应门禁：`G`，判据见 `docs/roadmap.md` §3

## 自查（对应 `AGENT.md` §2 红线）

- [ ] 电气规则只在 `core` 里写，绑定层没有第二份判定
- [ ] 数值全 `f64`，没有 `f32` 泄漏
- [ ] 输出顺序与编号确定，不依赖哈希遍历
- [ ] 每个接点都给齐 4 个 `f64` ＋ `flags`，没有"无数据"的接点
- [ ] 二进制与构建产物未入库（`target/`、`pkg/`、`*.dll`、`*.wasm`）
- [ ] 文档改动已同步 `docs/README.md` 索引（若有新增 / 改名）
