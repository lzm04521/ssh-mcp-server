import React, { useEffect, useState } from "react";
import { Form, InputNumber, Switch, Button, Card, Typography, Divider, message, Space, Alert, Select } from "antd";
import { SettingOutlined, SaveOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { api } from "../api/client";

export default function Settings() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const backupsAutoEnabled = Form.useWatch("backupsAutoEnabled", form);
  // 开机自启动是注册表级系统设置，不走表单保存，切换即时生效
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [autostartSupported, setAutostartSupported] = useState(false);
  const [autostartCommand, setAutostartCommand] = useState("");
  const [autostartSaving, setAutostartSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const s: any = await api.settingsGet();
      form.setFieldsValue({
        preConnect: s.preConnect,
        auditEnabled: s.audit?.enabled,
        auditRetentionDays: s.audit?.retentionDays,
        auditLogResults: s.audit?.logResults,
        backupsRetentionDays: s.backups?.retentionDays,
        backupsMaxCount: s.backups?.maxCount,
        backupsAutoEnabled: s.backups?.autoEnabled,
        backupsIntervalHours: s.backups?.intervalHours ?? 24,
      });
    } catch (e: any) {
      message.error("加载设置失败：" + String(e?.message || e));
    } finally {
      setLoading(false);
    }
    try {
      const a: any = await api.autostartGet();
      setAutostartEnabled(Boolean(a?.enabled));
      setAutostartSupported(Boolean(a?.supported));
      setAutostartCommand(String(a?.command || ""));
    } catch {
      // 自启状态加载失败不阻塞页面，开关保持默认关闭
    }
  };

  const toggleAutostart = async (checked: boolean) => {
    setAutostartSaving(true);
    try {
      const res: any = await api.autostartSet(checked);
      if (res?.ok === false) throw new Error(res.message || "设置失败");
      setAutostartEnabled(Boolean(res?.enabled));
      message.success(checked ? "已开启开机自启动" : "已关闭开机自启动");
    } catch (e: any) {
      setAutostartEnabled(!checked);
      message.error(e?.message || "设置开机自启动失败");
    } finally {
      setAutostartSaving(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    try {
      await form.validateFields();
    } catch {
      return;
    }
    const v: any = form.getFieldsValue();
    const payload: any = {};
    if (v.preConnect !== undefined) payload.preConnect = Boolean(v.preConnect);
    payload.audit = {
      enabled: v.auditEnabled,
      retentionDays: v.auditRetentionDays,
      logResults: v.auditLogResults,
    };
    payload.backups = {
      retentionDays: v.backupsRetentionDays,
      maxCount: v.backupsMaxCount,
      autoEnabled: Boolean(v.backupsAutoEnabled),
      intervalHours: v.backupsIntervalHours != null && !Number.isNaN(Number(v.backupsIntervalHours)) ? Number(v.backupsIntervalHours) : undefined,
    };
    // 清理 undefined
    if (payload.audit.retentionDays == null) delete payload.audit.retentionDays;
    if (payload.audit.enabled == null) delete payload.audit.enabled;
    if (payload.audit.logResults == null) delete payload.audit.logResults;
    if (payload.backups.retentionDays == null) delete payload.backups.retentionDays;
    if (payload.backups.maxCount == null) delete payload.backups.maxCount;
    if (payload.backups.intervalHours == null) delete payload.backups.intervalHours;
    setSaving(true);
    try {
      const res: any = await api.settingsSave(payload);
      if (res?.ok === false) throw new Error(res.message || "保存失败");
      message.success("设置已保存");
    } catch (e: any) {
      message.error(e?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Typography.Title level={4} style={{ margin: 0, fontWeight: 700 }}>
        <SettingOutlined style={{ color: "#1677ff", marginRight: 8 }} />
        设置
      </Typography.Title>
      <Typography.Text type="secondary">集中配置预连接、审计与备份（管理端口在“系统”页）</Typography.Text>
      <Card style={{ borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }} loading={loading}>
        <Form form={form} layout="vertical">
          <Typography.Text strong style={{ fontSize: 13, color: "#1677ff" }}>
            <ThunderboltOutlined style={{ marginRight: 6 }} />
            服务
          </Typography.Text>
          <Divider style={{ margin: "12px 0" }} />
          <Form.Item name="preConnect" label="启动时预连接" valuePropName="checked" extra="开启后服务启动时自动连接所有已配置节点">
            <Switch />
          </Form.Item>
          <Form.Item
            label="开机自启动"
            extra={
              autostartSupported
                ? "开启后登录 Windows 自动启动常驻服务（写入注册表 HKCU Run 键，即时生效）；MCP 客户端与管理台随开随用"
                : "仅支持 Windows（写入注册表 HKCU Run 键），当前平台不可用"
            }
          >
            <Space direction="vertical" size={4} style={{ width: "100%" }}>
              <Space size={12}>
                <Switch
                  checked={autostartEnabled}
                  loading={autostartSaving}
                  disabled={!autostartSupported}
                  onChange={toggleAutostart}
                />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {autostartCommand ? "启动命令：" : ""}
                  {autostartCommand && (
                    <Typography.Text code copyable={{ text: autostartCommand }} style={{ fontSize: 12, wordBreak: "break-all" }}>
                      {autostartCommand}
                    </Typography.Text>
                  )}
                </Typography.Text>
              </Space>
              {autostartSupported && autostartEnabled && autostartCommand.includes("_npx") && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginTop: 4 }}
                  message="当前常驻服务运行自 npx 缓存目录，npm 清理缓存或版本变更后自启命令可能失效。建议改用 npm install -g 全局安装（路径持久稳定）。"
                />
              )}
            </Space>
          </Form.Item>

          <Typography.Text strong style={{ fontSize: 13, color: "#1677ff", marginTop: 8, display: "block" }}>
            审计
          </Typography.Text>
          <Divider style={{ margin: "12px 0" }} />
          <Form.Item name="auditEnabled" label="启用审计" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="auditLogResults" label="记录成功执行" valuePropName="checked" extra="开启后成功执行的命令/传输也记入审计日志（含命令与路径，可在审计日志页查看详情）；关闭后仅记录失败操作">
            <Switch />
          </Form.Item>
          <Form.Item name="auditRetentionDays" label="审计保留天数">
            <InputNumber min={1} max={365} addonAfter="天" style={{ width: "100%", borderRadius: 10 }} />
          </Form.Item>

          <Typography.Text strong style={{ fontSize: 13, color: "#1677ff", marginTop: 8, display: "block" }}>
            备份
          </Typography.Text>
          <Divider style={{ margin: "12px 0" }} />
          <Form.Item name="backupsRetentionDays" label="备份保留天数">
            <InputNumber min={1} max={365} addonAfter="天" style={{ width: "100%", borderRadius: 10 }} />
          </Form.Item>
          <Form.Item name="backupsMaxCount" label="最大备份数">
            <InputNumber min={1} style={{ width: "100%", borderRadius: 10 }} />
          </Form.Item>
          <Form.Item name="backupsAutoEnabled" label="定时自动备份" valuePropName="checked" extra="开启后按间隔自动快照，无需手动操作">
            <Switch />
          </Form.Item>
          <Form.Item
            name="backupsIntervalHours"
            label="自动备份间隔"
            rules={backupsAutoEnabled ? [{ required: true, message: "请选择间隔" }] : []}
          >
            <Select
              disabled={!backupsAutoEnabled}
              placeholder="请选择间隔"
              style={{ width: "100%" }}
              options={[
                { value: 1, label: "每小时" },
                { value: 6, label: "每 6 小时" },
                { value: 12, label: "每 12 小时" },
                { value: 24, label: "每天" },
                { value: 168, label: "每周" },
                { value: 336, label: "每 2 周" },
                { value: 720, label: "每 30 天" },
              ]}
            />
          </Form.Item>

          <Space>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={save} style={{ borderRadius: 10, marginTop: 8 }}>
              保存设置
            </Button>
            <Button loading={loading} onClick={load} style={{ borderRadius: 10, marginTop: 8 }}>
              刷新
            </Button>
          </Space>
        </Form>
      </Card>
    </div>
  );
}
