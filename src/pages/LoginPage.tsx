import { Button, Form, Input } from "antd";
import { Checks, Database, LockKey, ShieldCheck, User, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import logo from "@/assets/brand/xingshu-logo-transparent.png";
import assistantMark from "@/assets/brand/xingshu-assistant-mark-image2-transparent.png";
import { loginToDataHub } from "@/services/dataHubAuthService";
import { DataHubServiceError } from "@/services/dataHubClient";
import { ensureDataHubSpace } from "@/services/dataHubSpaceService";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import "./login.css";

type LoginFormValues = {
  username: string;
  password: string;
};

const demoScript = {
  question: "本月华东区销售额同比增长多少？",
  thinking: "正在校验权限并检索数据",
  answer: "同比增长 12.6%，主要由新能源产品线贡献，环比提升 3.2 个百分点。"
};

type DemoPhase = "question" | "thinking" | "answer" | "hold";

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

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window.matchMedia !== "function") {
      return true;
    }
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return undefined;
    }
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => setReduced(media.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  return reduced;
}

function useAskDemo(reducedMotion: boolean) {
  const [state, setState] = useState<{ phase: DemoPhase; questionChars: number; answerChars: number }>(() =>
    reducedMotion
      ? { phase: "hold", questionChars: demoScript.question.length, answerChars: demoScript.answer.length }
      : { phase: "question", questionChars: 0, answerChars: 0 }
  );

  useEffect(() => {
    if (reducedMotion) {
      setState({
        phase: "hold",
        questionChars: demoScript.question.length,
        answerChars: demoScript.answer.length
      });
      return undefined;
    }

    let cancelled = false;
    let timer = 0;
    const schedule = (step: () => void, delay: number) => {
      timer = window.setTimeout(() => {
        if (!cancelled) {
          step();
        }
      }, delay);
    };

    const play = () => {
      setState({ phase: "question", questionChars: 0, answerChars: 0 });

      let typed = 0;
      const typeQuestion = () => {
        typed += 1;
        setState((prev) => ({ ...prev, questionChars: typed }));
        if (typed < demoScript.question.length) {
          schedule(typeQuestion, 48);
          return;
        }
        schedule(() => {
          setState((prev) => ({ ...prev, phase: "thinking" }));
          schedule(playAnswer, 900);
        }, 260);
      };

      const playAnswer = () => {
        setState((prev) => ({ ...prev, phase: "answer" }));
        let answerTyped = 0;
        const typeAnswer = () => {
          answerTyped += 1;
          setState((prev) => ({ ...prev, answerChars: answerTyped }));
          if (answerTyped < demoScript.answer.length) {
            schedule(typeAnswer, 34);
            return;
          }
          schedule(() => {
            setState((prev) => ({ ...prev, phase: "hold" }));
            schedule(play, 3_400);
          }, 280);
        };
        schedule(typeAnswer, 140);
      };

      schedule(typeQuestion, 520);
    };

    play();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [reducedMotion]);

  return state;
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
  const reducedMotion = usePrefersReducedMotion();
  const demo = useAskDemo(reducedMotion);

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

  const isAnswerVisible = demo.phase === "answer" || demo.phase === "hold";

  return (
    <main className="login-page" aria-label="星数登录页">
      <div className="login-page__atmosphere" aria-hidden="true">
        <span className="login-page__orbit login-page__orbit--outer">
          <i />
        </span>
        <span className="login-page__orbit login-page__orbit--inner">
          <i />
        </span>
        <span className="login-page__orbit login-page__orbit--faint">
          <i />
        </span>
        <span className="login-page__stars">
          {Array.from({ length: 7 }, (_, index) => (
            <i key={index} />
          ))}
        </span>
      </div>

      <section className="login-showcase" aria-labelledby="login-page-title">
        <header className="login-showcase__header login-enter" style={{ animationDelay: "0ms" }}>
          <Link className="login-showcase__brand" to="/welcome" aria-label="返回星数欢迎页">
            <img src={logo} alt="星数 XingShu" />
          </Link>
        </header>

        <div className="login-showcase__body">
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

          <div className="login-ask-demo login-enter" style={{ animationDelay: "300ms" }} aria-hidden="true">
            <div className="login-ask-demo__header">
              <span className="login-ask-demo__live">
                <i />
                问数 · 实时演示
              </span>
              <span className="login-ask-demo__badge">
                <Checks size={13} weight="bold" />
                全程可追溯
              </span>
            </div>

            <div className="login-ask-demo__thread">
              {demo.questionChars > 0 || demo.phase !== "question" ? (
                <p className="login-ask-demo__question">
                  {demoScript.question.slice(0, demo.questionChars)}
                  {demo.phase === "question" ? <span className="login-ask-demo__caret" /> : null}
                </p>
              ) : null}

              {demo.phase === "thinking" ? (
                <p className="login-ask-demo__thinking">
                  <span className="login-ask-demo__dots">
                    <i />
                    <i />
                    <i />
                  </span>
                  {demoScript.thinking}
                </p>
              ) : null}

              {isAnswerVisible ? (
                <div className="login-ask-demo__answer">
                  <img src={assistantMark} alt="" />
                  <p>
                    {demoScript.answer.slice(0, demo.answerChars)}
                    {demo.phase === "answer" ? <span className="login-ask-demo__caret" /> : null}
                  </p>
                </div>
              ) : null}
            </div>

          </div>
        </div>
      </section>

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
