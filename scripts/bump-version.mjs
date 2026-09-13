#!/usr/bin/env node
/**
 * 一键升级版本号（package.json 为唯一事实源，纯 Node 实现，不依赖 npm/git 子进程）
 * 移植自 SIE-Operations-and-Maintenance-Team/publish-tools（SmomPublish）的 bump-version.mjs
 *
 * 用法：
 *   npm run version:bump -- patch    # 1.10.0 → 1.10.1
 *   npm run version:bump -- minor    # 1.10.0 → 1.11.0
 *   npm run version:bump -- 1.11.0   # 指定具体版本
 *
 * 同步更新：
 *   1. package.json / admin-web/package.json
 *   2. CHANGELOG.md 顶部插入新版本骨架（已存在同名条目则跳过）
 *
 * 之后：填写 CHANGELOG → npm publish 发布新版本
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf-8");
const write = (p, content) => writeFileSync(path.join(root, p), content, "utf-8");

const target = process.argv[2] || "patch";
if (!/^(patch|minor|major|\d+\.\d+\.\d+)$/.test(target)) {
  console.error(`✗ 无效的版本参数: ${target}（支持 patch | minor | major 或 x.y.z）`);
  process.exit(1);
}

// 0. 计算新版本
const pkg = JSON.parse(read("package.json"));
const oldVersion = pkg.version;
let version = target;
if (!/^\d+\.\d+\.\d+$/.test(target)) {
  const m = oldVersion.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) {
    console.error(`✗ package.json 当前版本 "${oldVersion}" 不是 x.y.z 格式，请显式指定目标版本`);
    process.exit(1);
  }
  let [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (target === "major") { maj += 1; min = 0; pat = 0; }
  else if (target === "minor") { min += 1; pat = 0; }
  else { pat += 1; }
  version = `${maj}.${min}.${pat}`;
}
if (version === oldVersion) {
  console.error(`✗ 目标版本与当前版本相同: ${version}`);
  process.exit(1);
}

// 1. package.json / admin-web/package.json
pkg.version = version;
write("package.json", JSON.stringify(pkg, null, 2) + "\n");
const aw = JSON.parse(read("admin-web/package.json"));
aw.version = version;
write("admin-web/package.json", JSON.stringify(aw, null, 2) + "\n");

// 2. CHANGELOG.md 顶部插入新版本骨架
const changelogPath = "CHANGELOG.md";
let changelog;
try { changelog = read(changelogPath); } catch { changelog = ""; }
if (changelog.includes(`## v${version}`)) {
  console.log(`- CHANGELOG.md 已存在 v${version} 条目，跳过骨架插入`);
} else {
  const eol = changelog.includes("\r\n") ? "\r\n" : "\n";
  const skeleton = [`## v${version}`, "", "### 功能", "", "- ", "", "### 修复", "", "- ", "", ""].join(eol);
  const idx = changelog.search(/^## /m);
  const updated =
    idx === -1
      ? changelog.trimEnd() + eol + eol + skeleton
      : changelog.slice(0, idx) + skeleton + changelog.slice(idx);
  write(changelogPath, updated);
  console.log(`- CHANGELOG.md 已插入 v${version} 骨架`);
}

console.log(`\n✔ 版本已升级: v${oldVersion} → v${version}`);
console.log("  已同步: package.json / admin-web/package.json / CHANGELOG.md");
console.log("下一步：");
console.log(`  1. 填写 CHANGELOG.md 的 v${version} 条目`);
console.log(`  2. npm publish --access public 发布 @lzm04521/ssh-mcp-server@${version}`);
