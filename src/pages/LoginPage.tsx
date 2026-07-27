import { Button, Form, Input } from "antd";
import { ChartLineUp, Database, LockKey, Notebook, ShieldCheck, SquaresFour, User, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import logo from "@/assets/brand/xingshu-logo-transparent.png";
import { XsAskDataDemo } from "@/components/xs";
import { loginToDataHub } from "@/services/dataHubAuthService";
import { DataHubServiceError } from "@/services/dataHubClient";
import { ensureDataHubSpace } from "@/services/dataHubSpaceService";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import { LoginStarConvergence } from "./LoginStarConvergence";
import "./login.css";

type LoginFormValues = {
  username: string;
  password: string;
};

const showcaseCapabilities = [
  { icon: ChartLineUp, title: "问数分析", description: "把经营问题转成可追踪的数据结论" },
  { icon: Notebook, title: "知识写作", description: "连接企业知识库，生成可信文档" },
  { icon: SquaresFour, title: "经营看板", description: "汇聚指标、预警与管理动作" }
];

const loginStepTimeoutMs = 8_000;

function getSafeReturnPath(value: unknown) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u001F\u007F]/.test(value)
  ) {
    return "/";
  }

  try {
    const origin = window.location.origin;
    const target = new URL(value, `${origin}/`);
    if (target.origin !== origin || target.pathname === "/login") {
      return "/";
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/";
  }
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useDataHubAuthStore((state) => state.setSession);
  const clearAuthState = useDataHubAuthStore((state) => state.clearAuthState);
  const sessionExpired = useDataHubAuthStore((state) => state.sessionExpired);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const loginAbortRef = useRef<AbortController | null>(null);
  const locationState = location.state as { from?: unknown; sessionExpired?: boolean } | null;
  const returnPath = getSafeReturnPath(locationState?.from);
  const isSessionExpired = locationState?.sessionExpired === true || sessionExpired;

  useEffect(
    () => () => {
      const activeController = loginAbortRef.current;
      loginAbortRef.current = null;
      activeController?.abort();
    },
    []
  );

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
      setStatusMessage("正在准备平台空间");

      const firstSpace = await ensureDataHubSpace(user.username || values.username, {
        authToken: user.token,
        persistSelection: false,
        signal: controller.signal,
        spaceId: null,
        timeoutMs: loginStepTimeoutMs
      });

      if (controller.signal.aborted || loginAbortRef.current !== controller) {
        return;
      }

      setSession(user, firstSpace.id);
      setStatusMessage(`已进入 ${firstSpace.spaceName}`);
      navigate(returnPath, { replace: true });
    } catch (error) {
      if (loginAbortRef.current !== controller) {
        return;
      }

      clearAuthState();

      if (error instanceof DataHubServiceError && error.code === "REQUEST_CANCELLED") {
        setStatusMessage("已取消登录");
        return;
      }

      const message = error instanceof Error ? error.message : "登录失败，请稍后重试";
      setFormError(message || "用户名或密码错误");
      setStatusMessage("");
    } finally {
      if (loginAbortRef.current === controller) {
        setIsSubmitting(false);
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
      <div className="login-page__atmosphere" aria-hidden="true">
        <span className="login-page__orbit login-page__orbit--faint">
          <i />
        </span>
      </div>

      <section className="login-showcase" aria-labelledby="login-page-title">
        <header className="login-showcase__header login-enter" style={{ animationDelay: "0ms" }}>
          <Link className="login-showcase__brand" to="/welcome" aria-label="返回星数欢迎页">
            <img src={logo} alt="星数 XingShu" />
          </Link>
        </header>

        <div className="login-showcase__body">
          <div className="login-showcase__stack">
            <div className="login-showcase__intro">
              <p className="login-showcase__eyebrow login-enter" style={{ animationDelay: "70ms" }}>
                XINGSHU · 企业智能中枢
              </p>
              <h1 id="login-page-title" className="login-enter" style={{ animationDelay: "140ms" }}>
                让每一次问数，
                <br />
                都有据可依
              </h1>
              <p className="login-showcase__lead login-enter" style={{ animationDelay: "210ms" }}>
                连接企业数据、知识与 Agent 应用，回答可追溯、可验证、可执行。
              </p>
            </div>

            <XsAskDataDemo className="login-enter" style={{ animationDelay: "300ms" }} />
          </div>
        </div>

        <ul className="login-showcase__capabilities login-enter" style={{ animationDelay: "380ms" }} aria-label="星数核心能力">
          {showcaseCapabilities.map((item) => (
            <li key={item.title}>
              <item.icon size={20} />
              <div>
                <strong>{item.title}</strong>
                <span>{item.description}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <LoginStarConvergence />

      <section className="login-access" aria-label="登录星数">
        <div className="login-access__secure login-enter" style={{ animationDelay: "120ms" }}>
          <ShieldCheck size={15} weight="fill" />
          企业级安全防护已启用
        </div>

        <div className="login-access__inner">
          <div className="login-panel login-enter" style={{ animationDelay: "200ms" }}>
            <div className="login-panel__meta">
              <span>SECURE ACCESS</span>
              <span className="login-panel__connection">
                <i aria-hidden="true" />
                安全连接
              </span>
            </div>
            <div className="login-panel__head">
              <h2>登录星数</h2>
              <p>使用企业账号继续</p>
            </div>

            {isSessionExpired ? (
              <div className="login-panel__session-alert" role="alert">
                <WarningCircle size={20} weight="fill" aria-hidden="true" />
                <span>
                  <strong>登录状态已过期，请重新登录</strong>
                  <small>为保护企业数据，当前会话已安全退出。</small>
                </span>
              </div>
            ) : null}

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
                  prefix={<User size={18} />}
                  placeholder="请输入用户名"
                />
              </Form.Item>

              <Form.Item
                label="密码"
                name="password"
                validateStatus={formError ? "error" : undefined}
                help={formError ? <span role="alert">{formError}</span> : undefined}
                rules={[{ required: true, message: "请输入密码" }]}
              >
                <Input.Password
                  autoComplete="current-password"
                  disabled={isSubmitting}
                  prefix={<LockKey size={18} />}
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
              <Database size={15} />
              <span>由 data-hub 权限体系提供认证</span>
            </footer>
          </div>
        </div>

        <p className="login-access__caption login-enter" style={{ animationDelay: "460ms" }}>
          数据可追溯 · 权限可管控 · 结果可验证
        </p>
      </section>
    </main>
  );
}
