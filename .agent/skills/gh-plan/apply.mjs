#!/usr/bin/env node
// gh-plan: 从 plan.json 幂等地建立 GitHub 标签 / 里程碑 / issue。
// 用法：
//   node .agent/skills/gh-plan/apply.mjs --dry-run
//   node .agent/skills/gh-plan/apply.mjs
//   node .agent/skills/gh-plan/apply.mjs --only=labels|milestones|issues
// 中文一律走 UTF-8 文件（gh api --input），不进命令行。

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
const ONLY = (argv.find((a) => a.startsWith("--only=")) || "").split("=")[1] || "all";
const want = (k) => ONLY === "all" || ONLY === k;

const R = "repos/{owner}/{repo}";
const plan = JSON.parse(readFileSync(join(HERE, "plan.json"), "utf8"));
const TMP = mkdtempSync(join(tmpdir(), "gh-plan-"));
let seq = 0;

function gh(args, label) {
  const r = spawnSync("gh", args, { cwd: ROOT, encoding: "utf8" });
  if (r.error) {
    throw new Error(
      `调用 gh 失败（${r.error.code || r.error.message}）。请确认 gh 已在 PATH 且为 gh.exe，` +
        `并已在仓库工作区内运行。`
    );
  }
  if (r.status !== 0) throw new Error(`${label} 失败：\n${(r.stderr || r.stdout || "").trim()}`);
  return r.stdout;
}

function apiGet(path, label) {
  try {
    const out = gh(["api", path], label || `GET ${path}`);
    return out.trim() ? JSON.parse(out) : [];
  } catch (e) {
    console.warn(`  ! 读取失败，按空集处理：${label || path}\n    ${String(e.message).split("\n")[0]}`);
    return [];
  }
}

function apiPost(path, obj) {
  if (DRY) {
    console.log(`  ~ [dry-run] POST ${path}`);
    return {};
  }
  const f = join(TMP, `body-${++seq}.json`);
  writeFileSync(f, JSON.stringify(obj), "utf8");
  return JSON.parse(gh(["api", "--method", "POST", "--input", f, path], `POST ${path}`) || "{}");
}

const stat = { created: 0, skipped: 0 };

try {
  console.log(`gh-plan  ${DRY ? "[dry-run]" : ""} only=${ONLY}  root=${ROOT}\n`);

  // ---------- labels ----------
  const existingLabels = new Set(apiGet(`${R}/labels?per_page=100`).map((l) => l.name));
  if (want("labels")) {
    console.log("labels:");
    for (const l of plan.labels || []) {
      if (existingLabels.has(l.name)) {
        console.log(`  = ${l.name}（已存在）`);
        stat.skipped++;
        continue;
      }
      apiPost(`${R}/labels`, l);
      console.log(`  + ${l.name}`);
      stat.created++;
    }
  }

  // ---------- milestones ----------
  const msMap = new Map(apiGet(`${R}/milestones?state=all&per_page=100`).map((m) => [m.title, m.number]));
  if (DRY) for (const m of plan.milestones || []) if (!msMap.has(m.title)) msMap.set(m.title, -1);
  if (want("milestones")) {
    console.log("\nmilestones:");
    for (const m of plan.milestones || []) {
      if (msMap.has(m.title)) {
        console.log(`  = ${m.title}（已存在，#${msMap.get(m.title)}）`);
        stat.skipped++;
        continue;
      }
      const created = apiPost(`${R}/milestones`, { title: m.title, description: m.description });
      const num = created.number;
      if (num) msMap.set(m.title, num);
      console.log(`  + ${m.title}${num ? ` #${num}` : ""}`);
      stat.created++;
    }
  } else {
    // 未建里程碑时仍需要已有编号来挂 issue
    for (const m of plan.milestones || []) if (!msMap.has(m.title)) msMap.set(m.title, 0);
  }

  // ---------- issues ----------
  if (want("issues")) {
    const existing = new Set(
      apiGet(`${R}/issues?state=all&per_page=100&direction=asc`).map((i) => i.title)
    );
    console.log("\nissues:");
    for (const it of plan.issues || []) {
      if (existing.has(it.title)) {
        console.log(`  = ${it.title}（已存在）`);
        stat.skipped++;
        continue;
      }
      const payload = { title: it.title, body: it.body || "" };
      if (it.milestone) {
        const num = msMap.get(it.milestone);
        if (num && num > 0) payload.milestone = num;
        else if (!DRY) console.warn(`  ! 里程碑「${it.milestone}」未找到编号，issue 将不带里程碑`);
      }
      if (Array.isArray(it.labels) && it.labels.length) payload.labels = it.labels;
      const created = apiPost(`${R}/issues`, payload);
      const num = created.number;
      console.log(`  + ${num ? `#${num} ` : ""}${it.title}`);
      stat.created++;
    }
  }

  console.log(`\n完成：新建 ${stat.created} 项，跳过 ${stat.skipped} 项（已存在）。`);
  if (DRY) console.log("（dry-run，未写远端）");
  console.log(`临时文件目录：${TMP}`);
} catch (e) {
  console.error("\ngh-plan 失败：\n" + e.message + "\n");
  process.exit(1);
}
