import { Alert, Button, Checkbox, Form, Input, InputNumber, Select, Tag } from "antd";
import { CheckCircle, FloppyDisk, Lightning, Plugs, ShieldWarning } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import {
  getDefaultAiProviderConfig,
  loadAiProviderConfig,
  saveAiProviderConfig,
  testAiProviderConnection
} from "@/services/aiProviderConfigService";
import type { AiProviderConfig, AiProviderKind } from "@/types/aiChart";
import { PageFrame } from "./PageFrame";

const providerOptions: Array<{ value: AiProviderKind; label: string; description: string }> = [
  { value: "minimax", label: "MiniMax", description: "默认使用 MiniMax-M3 与 OpenAI-compatible 接口。" },
  { value: "openai-compatible", label: "OpenAI 兼容", description: "适配支持 /chat/completions 的模型服务。" },
  { value: "custom", label: "自定义供应商", description: "用于内网网关、代理或私有模型服务。" }
];

function providerDefaults(provider: AiProviderKind): Partial<AiProviderConfig> {
  if (provider === "minimax") {
    return {
      baseUrl: "https://api.minimaxi.com/v1",
      model: "MiniMax-M3",
      temperature: 0.2
    };
  }

  return {
    baseUrl: "",
    model: "",
    temperature: 0.2
  };
}

export function AiSettingsPage() {
  const [form] = Form.useForm<AiProviderConfig>();
  const [status, setStatus] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const provider = Form.useWatch("provider", form) ?? "minimax";
  const selectedProvider = providerOptions.find((item) => item.value === provider) ?? providerOptions[0];

  useEffect(() => {
    form.setFieldsValue(loadAiProviderConfig() ?? getDefaultAiProviderConfig());
  }, [form]);

  const handleProviderChange = (value: AiProviderKind) => {
    form.setFieldsValue({
      provider: value,
      ...providerDefaults(value)
    });
    setStatus("");
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    saveAiProviderConfig(values, Boolean(values.rememberApiKey));
    setStatus("AI 配置已保存");
  };

  const handleTest = async () => {
    const values = await form.validateFields();
    setIsTesting(true);
    setStatus("正在测试 AI 连接");

    try {
      const result = await testAiProviderConnection(values);
      setStatus(result.message);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <PageFrame
      title="AI 配置"
      subtitle="配置用于问数结果图表判断的模型供应商。"
      className="ai-settings-page"
    >
      <div className="ai-settings-layout">
        <aside className="ai-provider-panel" aria-label="AI 供应商">
          {providerOptions.map((item) => (
            <button
              type="button"
              className={`ai-provider-card${item.value === provider ? " is-active" : ""}`}
              key={item.value}
              onClick={() => handleProviderChange(item.value)}
            >
              <span className="ai-provider-card__icon" aria-hidden="true">
                {item.value === "minimax" ? <Lightning size={22} weight="bold" /> : <Plugs size={22} weight="bold" />}
              </span>
              <strong>{item.label}</strong>
              <small>{item.description}</small>
              {item.value === provider ? <Tag color="blue">当前</Tag> : null}
            </button>
          ))}
        </aside>

        <section className="xs-card ai-settings-card" aria-label="AI 配置表单">
          <div className="ai-settings-card__head">
            <div>
              <h2>{selectedProvider.label}</h2>
              <p>{selectedProvider.description}</p>
            </div>
            <span className="ai-settings-card__badge">
              <CheckCircle size={17} weight="bold" />
              OpenAI-compatible
            </span>
          </div>

          <Alert
            className="ai-settings-warning"
            type="warning"
            showIcon
            icon={<ShieldWarning size={18} weight="bold" />}
            message="浏览器保存 API Key 只适合本地或受控演示环境；生产环境建议改为服务端代理。"
          />

          <Form form={form} layout="vertical" className="ai-settings-form">
            <Form.Item name="provider" label="供应商" rules={[{ required: true }]}>
              <Select
                options={providerOptions.map((item) => ({ value: item.value, label: item.label }))}
                onChange={handleProviderChange}
              />
            </Form.Item>

            <Form.Item name="baseUrl" label="API Base URL" rules={[{ required: true, message: "请填写 API Base URL" }]}>
              <Input placeholder="https://api.minimaxi.com/v1" />
            </Form.Item>

            <Form.Item name="apiKey" label="API Key" rules={[{ required: true, message: "请填写 API Key" }]}>
              <Input.Password id="ai-api-key" aria-label="API Key" placeholder="请输入 API Key" autoComplete="off" />
            </Form.Item>

            <div className="ai-settings-form__row">
              <Form.Item name="model" label="模型" rules={[{ required: true, message: "请填写模型名" }]}>
                <Input placeholder="MiniMax-M3" />
              </Form.Item>

              <Form.Item name="temperature" label="温度" rules={[{ required: true }]}>
                <InputNumber min={0} max={2} step={0.1} />
              </Form.Item>
            </div>

            <Form.Item name="rememberApiKey" valuePropName="checked">
              <Checkbox>记住密钥</Checkbox>
            </Form.Item>

            <div className="ai-settings-actions">
              <Button icon={<Plugs size={18} />} loading={isTesting} onClick={handleTest}>
                测试连接
              </Button>
              <Button type="primary" icon={<FloppyDisk size={18} />} onClick={handleSave}>
                保存配置
              </Button>
            </div>
          </Form>

          {status ? (
            <div className="ai-settings-status" role="status">
              {status}
            </div>
          ) : null}
        </section>
      </div>
    </PageFrame>
  );
}
