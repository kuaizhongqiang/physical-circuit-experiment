#!/usr/bin/env node
// doc-guard: 校验文档地图、AGENT 索引、三台账编号、fixture 必填字段、产物未入库。
// 零依赖。退出码 0 = 全过，1 = 有违规。

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");

const errors = [];
const notes = [];
const fail = (file, msg) => errors.push(`${file}: ${msg}`);

const read = (rel) => {
  const p = join(ROOT, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
};
const exists = (rel) => existsSync(join(ROOT, rel));

// ---------- 1 docs/README.md 表格里的每个 .md 都要存在 ----------
{
  const txt = read("docs/README.md");
  if (txt === null) fail("docs/README.md", "文件不存在");
  else {
    const seen = new Set();
    for (const line of txt.split(/\r?\n/)) {
      if (!line.startsWith("|")) continue;
      for (const m of line.matchAll(/`([\w./-]+\.md)`/g)) {
        const name = m[1];
        if (name.includes("..") || seen.has(name)) continue;
        seen.add(name);
        if (!exists(join("docs", name))) {
          fail("docs/README.md", `索引里列了 ${name}，但 docs/${name} 不存在`);
        }
      }
    }
    notes.push(`docs/README.md 索引条目：${seen.size}`);
  }
}

// ---------- 2 AGENT.md 里引用的 docs/*.md 都要存在 ----------
{
  const txt = read("AGENT.md");
  if (txt === null) fail("AGENT.md", "文件不存在");
  else {
    for (const m of new Set([...txt.matchAll(/`(docs\/[\w./-]+\.md)`/g)].map((x) => x[1]))) {
      if (!exists(m)) fail("AGENT.md", `引用了 ${m}，但文件不存在`);
    }
  }
}

// ---------- 3 docs/*.md 五行头 ----------
{
  const heads = ["读者", "类型", "权威", "状态", "依赖"];
  const dir = join(ROOT, "docs");
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".md")) continue;
    const p = join(dir, f);
    if (!statSync(p).isFile()) continue;
    const lines = readFileSync(p, "utf8").split(/\r?\n/).slice(2, 8).join("\n");
    const miss = heads.filter((h) => !lines.includes(h));
    if (miss.length) fail(`docs/${f}`, `第 3~7 行缺五行头字段：${miss.join(" / ")}`);
  }
}

// ---------- 4~6 台账编号唯一（只认定义行，不认引用） ----------
function checkIds(file, pattern, label) {
  const txt = read(file);
  if (txt === null) return;
  const ids = [];
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(pattern);
    if (m) ids.push(m[1]);
  }
  const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
  for (const d of new Set(dup)) fail(file, `${label} ${d} 重复定义`);
  notes.push(`${file} ${label}：${ids.length} 条`);
}
checkIds("TODO.md", /^### (P-\d{2})\b/, "待拍板编号");
checkIds("TODO.md", /^- \*\*(T-\d{2})\*\*/, "待办编号");
checkIds("DECISION.md", /^### (D-\d{8}-\d{2})\b/, "决策编号");
checkIds("RECORD.md", /^\|\s*(R-\d{2})\s*\|/, "提交登记编号");

// ---------- 7 fixtures 必填字段与 PE ----------
{
  const dir = join(ROOT, "fixtures");
  if (!existsSync(dir)) notes.push("fixtures/ 尚未建立，跳过 fixture 校验");
  else {
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      let j;
      try {
        j = JSON.parse(readFileSync(join(dir, f), "utf8"));
      } catch (e) {
        fail(`fixtures/${f}`, `JSON 解析失败：${e.message}`);
        continue;
      }
      for (const k of ["case", "baseline_source", "devices", "wires", "expect"]) {
        if (!(k in j)) fail(`fixtures/${f}`, `缺必填字段 ${k}`);
      }
      if (Array.isArray(j.devices)) {
        const pe = j.devices.filter((d) => (d.kind || "").toUpperCase() === "PE").length;
        if (pe !== 1) fail(`fixtures/${f}`, `必须恰好一个 PE，实际 ${pe} 个（solver.md §4）`);
      }
    }
  }
}

// ---------- 8 产物不得被跟踪 ----------
{
  try {
    const tracked = execSync("git ls-files", { cwd: ROOT, encoding: "utf8" })
      .split(/\r?\n/)
      .filter(Boolean);
    const bad = tracked.filter(
      (p) =>
        /\.(dll|wasm|pdb|lib|exe)$/i.test(p) ||
        /(^|\/)(target|pkg|dist|node_modules)\//.test(p)
    );
    for (const p of bad) fail(p, "构建产物不应入库（AGENT.md §2 二进制不进库）");
    notes.push(`已跟踪文件：${tracked.length}`);
  } catch {
    notes.push("git 不可用，跳过产物检查");
  }
}

// ---------- 汇总 ----------
if (errors.length) {
  console.error("\ndoc-guard 失败：\n");
  for (const e of errors) console.error("  ✗ " + e);
  console.error(`\n共 ${errors.length} 处违规。\n`);
  process.exit(1);
}
console.log("doc-guard 全过");
for (const n of notes) console.log("  · " + n);
process.exit(0);
