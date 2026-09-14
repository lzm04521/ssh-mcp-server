import React, { useEffect, useRef, useState } from "react";
import {
  Typography, Card, Descriptions, Tag, Button, Space, message, Popconfirm, Collapse, Alert, Tooltip,
} from "antd";
import {
  InfoCircleOutlined, SyncOutlined, CheckCircleOutlined, HistoryOutlined,
  GithubOutlined, LinkOutlined, BugOutlined, ReloadOutlined,
} from "@ant-design/icons";
import { api } from "../api/client";

const REPO_URL = "https://github.com/lzm04521/ssh-mcp-server";
const NPM_URL = "https://www.npmjs.com/package/@lzm04521/ssh-mcp-server";

/** 渲染条目中的 **加粗** 片段（CHANGELOG 条目固定用 **主题**：描述 格式） */
function renderBold(text: string): React.ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") && p.length > 4 ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>
  );
}

type ChangeLogVersion = {
  version: string;
  compareUrl?: string;
  sections: { title: string; items: string[] }[];
};

export default function About() {
  const [info, setInfo] = useState<any>({});
  const [upd, setUpd] = useState<any>(null);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [changelog, setChangelog] = useState<ChangeLogVersion[] | null>(null);
  const [changelogUnavailable, setChangelogUnavailable] = useState(false);
  const applyTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    try {
      setInfo(await api.systemInfo());
    } catch (e: any) {
      message.error("加载系统信息失败：" + String(e?.message || e));
    }
    try {
      setUpd(await api.updateStatus());
    } catch {
      setUpd({ configured: false, installed: false, checked: false, hasUpdate: false });
    }
    try {
      const c: any = await api.changelog();
      if (c?.ok && Array.isArray(c.versions)) setChangelog(c.versions);
      else setChangelogUnavailable(true);
    } catch {
      setChangelogUnavailable(true);
    }
  };

  useEffect(() => {
    load();
    return () => {
      if (applyTimer.current) clearInterval(applyTimer.current);
    };
  }, []);

  const doCheck = async () => {
    setChecking(true);
    try {
      const s: any = await api.updateCheck();
      setUpd((prev: any) => ({ ...prev, ...s }));
      if (s.error) message.error(`检查失败：${s.error}`);
      else if (s.hasUpdate) message.info(`发现新版本 ${s.targetVersion}`);
      else message.success("已是最新版本");
    } catch (e: any) {
      message.error(e?.message || "检查更新失败");
    } finally {
      setChecking(false);
    }
  };

  /** 更新安装后服务会自动重启：轮询 system/info，版本到达目标版本后刷新页面加载新版前端资源 */
  const waitRestart = (targetVersion: string) => {
    setApplying(true);
    let tries = 0;
    applyTimer.current = setInterval(async () => {
      tries++;
      try {
        const d: any = await api.systemInfo();
        if (d?.version === targetVersion) {
          if (applyTimer.current) clearInterval(applyTimer.current);
          message.success(`已更新至 v${targetVersion}，正在刷新页面…`);
          setTimeout(() => window.location.reload(), 800);
        }
      } catch {
        // 重启窗口期连接失败属预期，继续轮询
      }
      if (tries >= 90) {
        if (applyTimer.current) clearInterval(applyTimer.current);
        setApplying(false);
        message.warning("更新耗时较长，请稍后手动刷新页面查看结果");
      }
    }, 2000);
  };

  const doApply = async () => {
    const target = upd?.targetVersion;
    try {
      await api.updateApply();
      message.info("正在下载并安装更新，完成后服务自动重启…");
      if (target) waitRestart(String(target));
    } catch (e: any) {
      message.error(e?.message || "应用更新失败");
    }
  };

  // 更新提示语状态机（语义对齐 v1.1.0 前旧系统页）
  const updateHint = !upd
    ? "加载中…"
    : !upd.configured
      ? "未配置更新源。需运维设置后才能检查更新。"
      : !upd.installed
        ? "当前为本地开发模式运行（非 npm 安装包），无法在线更新。安装正式版后可用。"
        : upd.error
          ? `检查失败：${upd.error}`
          : !upd.checked
            ? "尚未检查更新，点“检查更新”。"
            : upd.hasUpdate
              ? `发现新版本 ${upd.targetVersion}（当前 ${upd.currentVersion}），点“安装并重启”应用。`
              : "已是最新版本。";
  const canCheck = !!upd?.configured && !!upd?.installed;
  const canApply = canCheck && !!upd?.hasUpdate && !upd?.error && !applying;

  const currentVersion = String(upd?.currentVersion || info?.version || "");
  const collapseItems = (changelog || []).map((v) => ({
    key: v.version,
    label: (
      <Space>
        <Tag color={v.version === `v${currentVersion}` ? "blue" : "default"} style={{ margin: 0 }}>{v.version}</Tag>
        {v.version === `v${currentVersion}` && <Typography.Text type="secondary" style={{ fontSize: 12 }}>当前版本</Typography.Text>}
        {v.compareUrl && (
          <a href={v.compareUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="查看版本对比">
            <LinkOutlined style={{ fontSize: 12 }} />
          </a>
        )}
      </Space>
    ),
    children: (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {v.sections.map((s) => (
          <div key={s.title}>
            <Typography.Text strong style={{ fontSize: 13, color: "#1677ff" }}>{s.title}</Typography.Text>
            <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
              {s.items.map((item, i) => (
                <li key={i} style={{ marginBottom: 4, lineHeight: 1.7 }}>
                  <Typography.Text style={{ fontSize: 13 }}>{renderBold(item)}</Typography.Text>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {v.sections.length === 0 && <Typography.Text type="secondary">（无条目）</Typography.Text>}
      </div>
    ),
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Typography.Title level={4} style={{ margin: 0, fontWeight: 700 }}>
        <InfoCircleOutlined style={{ color: "#1677ff", marginRight: 8 }} />
        关于
      </Typography.Title>
      <Typography.Text type="secondary">SSH MCP Server 管理控制台 · 版本信息、在线更新与更新日志</Typography.Text>

      <Card style={{ borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
        <Space style={{ marginBottom: 12 }}>
          <Tag color="blue" icon={<CheckCircleOutlined />}>运行中</Tag>
          {currentVersion && <Tag color="geekblue" style={{ fontSize: 13, lineHeight: "22px", padding: "0 10px" }}>v{currentVersion}</Tag>}
        </Space>
        <Descriptions column={1} labelStyle={{ width: 120 }} contentStyle={{ fontWeight: 600 }}>
          <Descriptions.Item label="管理端口">{info.port || "-"}</Descriptions.Item>
          <Descriptions.Item label="运行平台">{info.platform || "-"}</Descriptions.Item>
          <Descriptions.Item label="配置文件">
            {info.configPath ? (
              <Typography.Text code copyable={{ text: info.configPath }} style={{ wordBreak: "break-all" }}>{info.configPath}</Typography.Text>
            ) : "-"}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card
        title={<span><SyncOutlined style={{ color: "#1677ff", marginRight: 8 }} />版本更新</span>}
        style={{ borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}
      >
        <Space direction="vertical" size={12}>
          <Typography.Text>
            当前版本 <Typography.Text code>v{currentVersion || "?"}</Typography.Text>。通过 npm registry（唯一分发渠道）检查并安装新版本。
          </Typography.Text>
          <Space>
            <Button type="primary" icon={<ReloadOutlined />} loading={checking} disabled={!canCheck || applying} onClick={doCheck} style={{ borderRadius: 10 }}>
              检查更新
            </Button>
            <Popconfirm
              title="安装并重启"
              description="将下载并安装新版本，随后自动重启服务，页面会在完成后自动刷新。"
              okText="安装"
              cancelText="取消"
              onConfirm={doApply}
              disabled={!canApply}
            >
              <Button danger ghost disabled={!canApply} loading={applying}>安装并重启</Button>
            </Popconfirm>
          </Space>
          <Typography.Text type={upd?.error ? "danger" : "secondary"} style={{ fontSize: 12 }}>{updateHint}</Typography.Text>
        </Space>
      </Card>

      <Card
        title={<span><HistoryOutlined style={{ color: "#1677ff", marginRight: 8 }} />更新日志</span>}
        style={{ borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}
      >
        {changelogUnavailable ? (
          <Space direction="vertical" size={8}>
            <Alert type="info" showIcon message="当前安装包未包含更新日志" description="v1.1.7 起更新日志随 npm 包分发，升级后可在此查看；也可先到 GitHub 查看。" />
            <a href={`${REPO_URL}/blob/main/CHANGELOG.md`} target="_blank" rel="noreferrer">在 GitHub 查看完整更新日志</a>
          </Space>
        ) : changelog && changelog.length > 0 ? (
          <Collapse
            defaultActiveKey={[`v${currentVersion}`]}
            items={collapseItems}
            style={{ background: "transparent" }}
          />
        ) : (
          <Typography.Text type="secondary">暂无更新日志</Typography.Text>
        )}
      </Card>

      <Card style={{ borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
        <Space size={16} wrap>
          <Tooltip title="GitHub 仓库">
            <Button type="text" icon={<GithubOutlined />} href={REPO_URL} target="_blank">GitHub 仓库</Button>
          </Tooltip>
          <Tooltip title="问题反馈">
            <Button type="text" icon={<BugOutlined />} href={`${REPO_URL}/issues`} target="_blank">问题反馈</Button>
          </Tooltip>
          <Tooltip title="npm 包页面">
            <Button type="text" icon={<LinkOutlined />} href={NPM_URL} target="_blank">npm 包</Button>
          </Tooltip>
        </Space>
      </Card>
    </div>
  );
}
