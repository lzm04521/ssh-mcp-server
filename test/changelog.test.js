import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// 「关于」页更新日志：parseChangelog 纯函数 + GET /admin/api/system/changelog 只读路由。
// CHANGELOG 由人工维护、格式固定（## vX.Y.Z → ### 分类 → - 条目 → **对比**：链接），
// 解析必须容忍噪声（标题、空行、游离文本），且不能让格式噪声污染条目内容。
describe("changelog service", () => {
  describe("parseChangelog", () => {
    it("parses versions, sections, items and compareUrl from real-world layout", async () => {
      const { parseChangelog } = await import("../build/services/changelog-service.js");
      const md = [
        "# Changelog",
        "",
        "## v1.2.0",
        "",
        "### 功能",
        "",
        "- **新增关于页**：包含系统信息与在线更新",
        "- 普通条目无加粗前缀",
        "",
        "### 修复",
        "",
        "- **修复链接**：http://example.com/a",
        "",
        "**对比 v1.1.9**：https://github.com/lzm04521/ssh-mcp-server/compare/v1.1.9...v1.2.0",
        "",
        "## v1.1.9",
        "",
        "### 修复",
        "",
        "- **热修**：内容",
        "",
      ].join("\n");
      const versions = parseChangelog(md);
      assert.equal(versions.length, 2);
      const [v120, v119] = versions;
      assert.equal(v120.version, "v1.2.0");
      assert.equal(v120.compareUrl, "https://github.com/lzm04521/ssh-mcp-server/compare/v1.1.9...v1.2.0");
      assert.deepEqual(v120.sections.map((s) => s.title), ["功能", "修复"]);
      assert.equal(v120.sections[0].items.length, 2);
      assert.equal(v120.sections[0].items[0], "**新增关于页**：包含系统信息与在线更新");
      assert.equal(v120.sections[0].items[1], "普通条目无加粗前缀");
      assert.equal(v119.version, "v1.1.9");
      assert.equal(v119.sections[0].items[0], "**热修**：内容");
      assert.equal(v119.compareUrl, undefined);
    });

    it("tolerates noise: preface text, stray lines, empty sections and CRLF", async () => {
      const { parseChangelog } = await import("../build/services/changelog-service.js");
      const md = [
        "# Changelog",
        "本文件由人工维护。",
        "",
        "## v0.9.0\r",
        "游离文本不归入任何小节",
        "### 变更",
        "（小节无条目）",
        "## v0.8.0",
        "- 顶级条目出现在任何 ### 之前，应被丢弃",
        "### 功能",
        "- **首版**：发布",
      ].join("\n");
      const versions = parseChangelog(md);
      assert.equal(versions.length, 2);
      assert.equal(versions[0].version, "v0.9.0");
      assert.deepEqual(versions[0].sections, [{ title: "变更", items: [] }], "CRLF 与游离文本不产生条目");
      assert.deepEqual(versions[1].sections, [{ title: "功能", items: ["**首版**：发布"] }], "前版本的无主条目被丢弃");
    });

    it("returns empty array for empty or version-less input", async () => {
      const { parseChangelog } = await import("../build/services/changelog-service.js");
      assert.deepEqual(parseChangelog(""), []);
      assert.deepEqual(parseChangelog("# Changelog\n\n只有标题没有版本\n"), []);
    });

    it("parses the repo's real CHANGELOG.md and keeps it in sync with package.json version", async () => {
      const { parseChangelog } = await import("../build/services/changelog-service.js");
      const { readFileSync } = await import("node:fs");
      const { fileURLToPath } = await import("node:url");
      const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
      const md = readFileSync(path.join(root, "CHANGELOG.md"), "utf-8");
      const versions = parseChangelog(md);
      assert.ok(versions.length >= 1, "真实 CHANGELOG 至少一个版本");
      assert.match(versions[0].version, /^v\d+\.\d+\.\d+$/, "首个版本号格式合法");
      const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf-8"));
      assert.ok(
        versions.some((v) => v.version === `v${pkg.version}`),
        `CHANGELOG 应包含当前 package.json 版本 v${pkg.version}（发版时同批更新）`,
      );
      for (const v of versions) {
        for (const s of v.sections) {
          for (const item of s.items) {
            assert.ok(item.length > 0, "条目非空");
            assert.ok(!item.startsWith("#"), "条目不应混入标题行");
          }
        }
      }
    });
  });

  describe("read-only route", () => {
    let srv;
    let cfgPath;
    before(async () => {
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ssh-mcp-cl-"));
      cfgPath = path.join(tmp, "config.json");
      const { startAdminServer } = await import("../build/server/index.js");
      srv = await startAdminServer({ port: 0, configPath: cfgPath });
    });
    after(async () => { await srv?.close(); try { await fs.unlink(cfgPath); } catch {} });

    it("GET /admin/api/system/changelog returns structured versions", async () => {
      const r = await (await fetch(`http://127.0.0.1:${srv.port}/admin/api/system/changelog`)).json();
      // 仓库内 CHANGELOG.md 存在（v1.1.7 起也随 npm 包分发）；存量旧包才会走 NOT_PACKAGED 分支
      assert.equal(r.ok, true);
      assert.ok(Array.isArray(r.versions) && r.versions.length >= 1);
      const first = r.versions[0];
      assert.match(first.version, /^v\d+\.\d+\.\d+$/);
      assert.ok(Array.isArray(first.sections));
      assert.ok(first.sections.every((s) => typeof s.title === "string" && Array.isArray(s.items)));
    });

    it("GET /admin/api/update/status still returns shape (About 页数据源)", async () => {
      const r = await (await fetch(`http://127.0.0.1:${srv.port}/admin/api/update/status`)).json();
      assert.match(r.currentVersion, /^\d+\.\d+\.\d+/);
      assert.equal(typeof r.hasUpdate, "boolean");
      assert.equal(typeof r.checked, "boolean");
    });
  });
});
