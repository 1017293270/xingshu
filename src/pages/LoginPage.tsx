import { Button, Form, Input } from "antd";
import { LockKey, User } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import logo from "@/assets/brand/xingshu-logo-transparent.png";
import askDataIcon from "@/assets/login-icons/login-askdata-dashboard-image2.png";
import dataHubIcon from "@/assets/login-icons/login-datahub-connection-image2.png";
import knowledgeIcon from "@/assets/login-icons/login-knowledge-docs-image2.png";
import permissionIcon from "@/assets/login-icons/login-permission-image2.png";
import secureAuthIcon from "@/assets/login-icons/login-secure-auth-image2.png";
import traceAgentIcon from "@/assets/login-icons/login-agent-trace-image2.png";
import { loginToDataHub } from "@/services/dataHubAuthService";
import { DataHubServiceError } from "@/services/dataHubClient";
import { ensureDataHubSpace } from "@/services/dataHubSpaceService";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import "./login.css";

type LoginFormValues = {
  username: string;
  password: string;
};

const capabilityItems = [
  {
    title: "统一数据权限",
    description: "细粒度权限管控，保障数据安全合规可控。",
    iconSrc: permissionIcon
  },
  {
    title: "问数与看板",
    description: "自然语言问数，实时洞察业务指标与趋势。",
    iconSrc: askDataIcon
  },
  {
    title: "知识与文档",
    description: "沉淀企业知识资产，驱动高效协同与复用。",
    iconSrc: knowledgeIcon
  }
];

const loginStepTimeoutMs = 8_000;

export function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useDataHubAuthStore((state) => state.setAuth);
  const setCurrentSpaceId = useDataHubAuthStore((state) => state.setCurrentSpaceId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const loginAbortRef = useRef<AbortController | null>(null);

  async function handleLogin(values: LoginFormValues) {
    loginAbortRef.current?.abort();
    const controller = new AbortController();
    loginAbortRef.current = controller;
    setIsSubmitting(true);
    setFormError("");
    setStatusMessage("正在校验企业账号");

    try {
      const user = await loginToDataHub(values, {
        signal: controller.signal,
        timeoutMs: loginStepTimeoutMs
      });
      setAuth(user);
      setStatusMessage("正在准备平台空间");

      const firstSpace = await ensureDataHubSpace(user.username || values.username, {
        signal: controller.signal,
        timeoutMs: loginStepTimeoutMs
      });

      setCurrentSpaceId(firstSpace.id);
      setStatusMessage(`已进入 ${firstSpace.spaceName}`);
      navigate("/", { replace: true });
    } catch (error) {
      if (error instanceof DataHubServiceError && error.code === "REQUEST_CANCELLED") {
        setStatusMessage("已取消登录");
        return;
      }

      const message = error instanceof Error ? error.message : "登录失败，请稍后重试";
      setFormError(message || "用户名或密码错误");
      setStatusMessage("");
    } finally {
      setIsSubmitting(false);
      if (loginAbortRef.current === controller) {
        loginAbortRef.current = null;
      }
    }
  }

  function handleCancelLogin() {
    loginAbortRef.current?.abort();
  }

  function handleForgotPassword() {
    setStatusMessage("请联系企业管理员重置密码");
  }

  return (
    <main className="login-page" aria-label="星数登录页">
      <div className="login-page__shell">
        <header className="login-page__header" aria-label="星数登录页顶部">
          <Link className="login-page__brand" to="/welcome" aria-label="返回星数欢迎页">
            <img src={logo} alt="星数 XingShu" />
          </Link>
          <div className="login-page__trust">
            <img src={secureAuthIcon} alt="" data-icon-source="login-image2" />
            <span>企业级安全防护已启用</span>
          </div>
        </header>

        <section className="login-page__content" aria-labelledby="login-page-title">
          <div className="login-page__copy">
            <p className="login-page__eyebrow">XINGSHU AGENT HUB</p>
            <h1 id="login-page-title">可信数据智能入口</h1>
            <p className="login-page__lead">连接数据、知识与 Agent 应用，让企业问题可追溯、可验证、可执行。</p>

            <div className="login-page__capabilities" aria-label="登录页可信能力">
              {capabilityItems.map((item) => (
                <article className="login-page__capability" key={item.title}>
                  <img src={item.iconSrc} alt="" data-icon-source="login-image2" />
                  <span>
                    <strong>{item.title}</strong>
                    <em>{item.description}</em>
                  </span>
                </article>
              ))}
            </div>

            <div className="login-page__signals" aria-label="接入能力">
              <span>
                <img src={traceAgentIcon} alt="" data-icon-source="login-image2" />
                可追溯 Agent 流程
              </span>
              <span>
                <img src={dataHubIcon} alt="" data-icon-source="login-image2" />
                data-hub 权限体系
              </span>
            </div>
          </div>

          <section className="login-panel" aria-label="登录星数">
            <div className="login-panel__head">
              <h2>登录星数</h2>
              <p>使用企业账号继续</p>
            </div>

            <Form<LoginFormValues>
              className="login-panel__form"
              layout="vertical"
              requiredMark={false}
              onFinish={handleLogin}
              initialValues={{ username: "", password: "" }}
            >
              <Form.Item
                label="用户名"
                name="username"
                validateStatus={formError ? "error" : undefined}
                rules={[{ required: true, message: "请输入用户名" }]}
              >
                <Input
                  autoComplete="username"
                  disabled={isSubmitting}
                  prefix={<User size={19} />}
                  placeholder="请输入用户名"
                />
              </Form.Item>

              <Form.Item
                label="密码"
                name="password"
                validateStatus={formError ? "error" : undefined}
                help={formError || undefined}
                rules={[{ required: true, message: "请输入密码" }]}
              >
                <Input.Password
                  autoComplete="current-password"
                  disabled={isSubmitting}
                  prefix={<LockKey size={19} />}
                  placeholder="请输入密码"
                />
              </Form.Item>

              <Button
                block
                className="login-panel__submit"
                htmlType="submit"
                loading={isSubmitting}
                type="primary"
              >
                登录
              </Button>

              <button className="login-panel__link" type="button" onClick={handleForgotPassword}>
                忘记密码
              </button>
            </Form>

            {statusMessage ? (
              <div className="login-panel__status" role="status">
                <span>{statusMessage}</span>
                {isSubmitting ? (
                  <button type="button" onClick={handleCancelLogin}>
                    取消
                  </button>
                ) : null}
              </div>
            ) : null}

            <footer className="login-panel__foot">
              <img src={dataHubIcon} alt="" data-icon-source="login-image2" />
              <span>由 data-hub 权限体系提供认证</span>
            </footer>
          </section>
        </section>
      </div>
    </main>
  );
}
