import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// 移植自 MCP-DB-Tools 的系统控制三件套：登录自启动 / 应用更新 / 应用控制
// 只测纯函数与只读路由；写入注册表（PUT autostart）与真实重启（restart/apply）不进测试。
describe("system control (autostart/update/restart)", () => {
  describe("pure helpers", () => {
    it("compareSemver ordering", async () => {
      const { compareSemver } = await import("../build/services/update-service.js");
      assert.equal(compareSemver("1.9.0", "1.9.0"), 0);
      assert.equal(compareSemver("1.10.0", "1.9.9"), 1);
      assert.equal(compareSemver("1.9.0", "2.0.0"), -1);
      assert.equal(compareSemver("v1.9.0", "1.9.0"), 0);
      assert.equal(compareSemver("1.9.0-beta.1", "1.9.0"), 0); // 预发布标签忽略
      assert.equal(compareSemver("1.9", "1.9.0"), 0);
    });

    it("buildAutostartCommand launches wscript with the VBS launcher", async () => {
      const { buildAutostartCommand, getAutostartVbsPath } = await import("../build/services/autostart-service.js");
      const cmd = buildAutostartCommand();
      // 新形态：注册表只写 wscript 隐藏启动器，node 路径由 VBS 运行时解析（升级不失效）
      assert.match(cmd, /^wscript\.exe \/\/B ".*autostart\.vbs"$/);
      assert.ok(cmd.includes(getAutostartVbsPath()));
    });

    it("buildAutostartVbs resolves fnm alias first and hides the daemon", async () => {
      const { buildAutostartVbs } = await import("../build/services/autostart-service.js");
      const vbs = buildAutostartVbs({
        fallbackNodeExe: "C:\\Users\\x\\AppData\\Roaming\\fnm\\node-versions\\v22.22.3\\installation\\node.exe",
        scriptPath: "C:\\Global\\node_modules\\@lzm04521\\ssh-mcp-server\\build\\index.js",
        logPath: "C:\\ProgramData\\SshMcpServer\\daemon.log",
      });
      // fnm 默认别名优先（版本升级后仍有效），注册时实路径仅作兜底
      assert.ok(vbs.includes("\\fnm\\aliases\\default\\node.exe"));
      assert.ok(vbs.includes("If fso.FileExists(fnmAlias) Then nodeExe = fnmAlias"));
      // 隐藏窗口 + 日志重定向 + --admin 常驻参数
      assert.ok(vbs.includes("cmd.exe /d /s /c"));
      assert.ok(vbs.includes("--admin >> "));
      assert.ok(vbs.includes("shell.Run"));
      // 纯 ASCII：wscript 按本地代码页解析无 BOM 脚本
      assert.ok(!/[^\x00-\x7F]/.test(vbs));
    });

    it("isUnstableEntryScript rejects session-scoped and npx cache paths", async () => {
      const { isUnstableEntryScript } = await import("../build/services/autostart-service.js");
      assert.equal(isUnstableEntryScript("C:\\Users\\x\\AppData\\Local\\fnm_multishells\\24896_1\\node_modules\\@lzm04521\\ssh-mcp-server\\build\\index.js"), true);
      assert.equal(isUnstableEntryScript("C:\\Users\\x\\AppData\\Local\\npm-cache\\_npx\\abc\\node_modules\\@lzm04521\\ssh-mcp-server\\build\\index.js"), true);
      assert.equal(isUnstableEntryScript("C:/Users/x/AppData/Local/FNM_MULTISHELLS/1/node_modules/pkg/index.js"), true, "大小写与斜杠方向不敏感");
      // npm 全局安装与本地构建目录是稳定路径
      assert.equal(isUnstableEntryScript("C:\\Global\\node_modules\\@lzm04521\\ssh-mcp-server\\build\\index.js"), false);
      assert.equal(isUnstableEntryScript("D:\\GitHub\\ssh-mcp-server\\build\\index.js"), false);
    });

    it("isNpmInstalled matches @lzm04521 global install path only", async () => {
      const { isNpmInstalled } = await import("../build/services/update-service.js");
      const orig = process.argv[1];
      try {
        // 包名 v1.1.5 迁移 @keysqiu → @lzm04521，锁定新包名可识别、旧包名不再误判
        const globalPath = path.join("C:", "Users", "x", "AppData", "Roaming", "npm", "node_modules", "@lzm04521", "ssh-mcp-server", "build", "index.js");
        process.argv[1] = globalPath;
        assert.equal(isNpmInstalled(), true);
        const legacyPath = globalPath.replace("@lzm04521", "@keysqiu");
        process.argv[1] = legacyPath;
        assert.equal(isNpmInstalled(), false, "旧包名 @keysqiu 不应再被识别为 npm 安装");
        process.argv[1] = path.join(os.tmpdir(), "local-build", "index.js");
        assert.equal(isNpmInstalled(), false);
      } finally {
        process.argv[1] = orig;
      }
    });
  });

  describe("read-only routes", () => {
    let srv;
    let cfgPath;
    before(async () => {
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ssh-mcp-sys-"));
      cfgPath = path.join(tmp, "config.json");
      const { startAdminServer } = await import("../build/server/index.js");
      srv = await startAdminServer({ port: 0, configPath: cfgPath });
    });
    after(async () => { await srv?.close(); try { await fs.unlink(cfgPath); } catch {} });

    it("GET /admin/api/autostart returns shape", async () => {
      const r = await (await fetch(`http://127.0.0.1:${srv.port}/admin/api/autostart`)).json();
      assert.equal(typeof r.enabled, "boolean");
      assert.equal(typeof r.supported, "boolean");
      assert.equal(r.supported, process.platform === "win32");
      // command 字段：Windows 上为实际将写入注册表的 wscript 启动命令，其他平台为空串
      assert.equal(typeof r.command, "string");
      if (process.platform === "win32") {
        assert.match(r.command, /^wscript\.exe \/\/B ".*autostart\.vbs"$/);
      } else {
        assert.equal(r.command, "");
      }
    });

    it("GET /admin/api/defaults exposes single-source defaults", async () => {
      const r = await (await fetch(`http://127.0.0.1:${srv.port}/admin/api/defaults`)).json();
      assert.ok(Array.isArray(r.defaultEnvironments) && r.defaultEnvironments.includes("测试环境"));
      assert.ok(Array.isArray(r.defaultCommandBlacklist) && r.defaultCommandBlacklist.length >= 7);
      // 与 security 默认值同源：未配置时 GET /security 的黑名单应等于 defaults 提供的
      const sec = await (await fetch(`http://127.0.0.1:${srv.port}/admin/api/security`)).json();
      assert.deepEqual(sec.commandBlacklist, r.defaultCommandBlacklist);
    });

    it("GET /admin/api/update/status returns shape with currentVersion", async () => {
      const r = await (await fetch(`http://127.0.0.1:${srv.port}/admin/api/update/status`)).json();
      assert.match(r.currentVersion, /^\d+\.\d+\.\d+/);
      assert.equal(r.configured, true);
      assert.equal(typeof r.installed, "boolean");
      assert.equal(r.checked, false); // 从未检查
      // 本地 build 目录运行应为开发模式
      assert.equal(r.installed, false);
    });

    // Windows 上跳过真实 PUT：写入 HKCU Run 键会把指向测试构建路径的死命令留在用户注册表里（污染），
    // 与本文件头“写入注册表不进测试”的约定保持一致；平台校验逻辑由非 Windows 分支覆盖。
    (process.platform === "win32" ? it.skip : it)(
      "PUT autostart rejects on unsupported platform without touching real registry",
      async () => {
        const res = await fetch(`http://127.0.0.1:${srv.port}/admin/api/autostart`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enabled: true }),
        });
        assert.equal(res.status, 400);
        assert.match((await res.json()).code, /UNSUPPORTED_PLATFORM/);
      },
    );

    it("POST /admin/api/restart soft-restarts in-process and comes back", async () => {
      const before = await (await fetch(`http://127.0.0.1:${srv.port}/admin/api/system/info`)).json();
      const r = await fetch(`http://127.0.0.1:${srv.port}/admin/api/restart`, { method: "POST" });
      assert.equal((await r.json()).restarting, true);
      // 软重启窗口：轮询等服务回来（同进程重建，通常 <1s）
      let info = null;
      for (let i = 0; i < 30 && !info; i++) {
        await new Promise((res) => setTimeout(res, 200));
        try {
          const resp = await fetch(`http://127.0.0.1:${srv.port}/admin/api/system/info`);
          if (resp.ok) info = await resp.json();
        } catch {}
      }
      assert.ok(info, "restart 后服务未恢复");
      assert.equal(info.version, before.version);
    });
  });
});
