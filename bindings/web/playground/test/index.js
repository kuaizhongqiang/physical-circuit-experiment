// Node ≥ 22 把 `node --test <目录>` 的位置参数当作文件路径（不再递归扫描目录）。
// 该聚合入口让 issue #39 的验收命令 `node --test bindings/web/playground/test/` 可用：
//   目录解析到 test/index.js → 这里显式导入全部 *.test.js。
// 在仍按目录扫描的 Node 版本里，本文件不匹配 `*.test.js`，不会重复执行。
import "./catalog.test.js";
import "./geometry.test.js";
import "./model.test.js";
