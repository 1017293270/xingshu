import { LockKey, MicrosoftWordLogo, WarningCircle } from "@phosphor-icons/react";
import { Tag } from "antd";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { heartbeatOfficialDocumentEditorSession } from "@/services/officialDocumentService";
import type { OfficialDocumentEditorSession } from "@/types/officialDocument";
import { computeOnlyOfficeHeartbeatDelay } from "./onlyOfficeLease";
import { loadOnlyOfficeApiScript, type OnlyOfficeEditorInstance } from "./onlyOfficeScriptLoader";

type OnlyOfficeEditorProps = {
  draftTitle: string;
  session: OfficialDocumentEditorSession | null;
  onHeartbeat?: (draftId: string, sessionId: string) => Promise<OfficialDocumentEditorSession>;
};

export function OnlyOfficeEditor({
  draftTitle,
  session,
  onHeartbeat = heartbeatOfficialDocumentEditorSession
}: OnlyOfficeEditorProps) {
  const reactId = useId();
  const containerId = useMemo(() => `xs-onlyoffice-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`, [reactId]);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [errorKind, setErrorKind] = useState<"initialization" | "lease">("initialization");
  const editorRef = useRef<OnlyOfficeEditorInstance | undefined>(undefined);
  const canRender = Boolean(
    session &&
    session.mode !== "UNAVAILABLE" &&
    session.documentServerApiUrl &&
    session.editorConfig
  );

  useEffect(() => {
    if (!canRender || !session?.documentServerApiUrl || !session.editorConfig) {
      setState("idle");
      setErrorMessage("");
      setErrorKind("initialization");
      return undefined;
    }

    let cancelled = false;
    let editor: OnlyOfficeEditorInstance | undefined;
    setState("loading");
    setErrorMessage("");
    setErrorKind("initialization");

    void loadOnlyOfficeApiScript(session.documentServerApiUrl)
      .then(() => {
        if (cancelled) return;
        const DocEditor = window.DocsAPI?.DocEditor;
        if (!DocEditor) throw new Error("ONLYOFFICE DocsAPI.DocEditor 不可用");
        const config = {
          ...session.editorConfig,
          ...(session.token ? { token: session.token } : {})
        };
        editor = new DocEditor(containerId, config);
        editorRef.current = editor;
        setState("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState("error");
        setErrorMessage(error instanceof Error ? error.message : "ONLYOFFICE 编辑器初始化失败");
      });

    return () => {
      cancelled = true;
      if (editor && editorRef.current === editor) {
        editor.destroyEditor?.();
        editorRef.current = undefined;
      }
    };
  }, [canRender, containerId, session]);

  useEffect(() => {
    if (!canRender || state !== "ready" || session?.mode !== "EDIT") return undefined;

    let cancelled = false;
    let timerId: number | undefined;
    let heartbeatInFlight = false;
    let leaseExpiresAt = session.leaseExpiresAt;

    const scheduleHeartbeat = () => {
      if (cancelled) return;
      timerId = window.setTimeout(() => void renewLease(), computeOnlyOfficeHeartbeatDelay(leaseExpiresAt));
    };

    const stopEditing = (error: unknown) => {
      const detail = error instanceof Error ? error.message : "编辑会话续期失败";
      editorRef.current?.destroyEditor?.();
      editorRef.current = undefined;
      setErrorKind("lease");
      setErrorMessage(`编辑租约续期失败，已停止编辑：${detail}`);
      setState("error");
    };

    const renewLease = async () => {
      if (cancelled || heartbeatInFlight) return;
      heartbeatInFlight = true;
      if (timerId !== undefined) window.clearTimeout(timerId);
      try {
        const renewed = await onHeartbeat(session.draftId, session.id);
        if (cancelled) return;
        if (renewed.mode !== "EDIT" || !renewed.leaseExpiresAt) {
          throw new Error("服务端未返回有效的编辑租约");
        }
        leaseExpiresAt = renewed.leaseExpiresAt;
        scheduleHeartbeat();
      } catch (error) {
        if (!cancelled) stopEditing(error);
      } finally {
        heartbeatInFlight = false;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void renewLease();
    };

    scheduleHeartbeat();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      if (timerId !== undefined) window.clearTimeout(timerId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [canRender, onHeartbeat, session?.draftId, session?.id, session?.leaseExpiresAt, session?.mode, state]);

  const unavailableMessage = session?.message ?? "创建会话后由后端下发 ONLYOFFICE 配置；JWT 密钥不会进入前端。";

  return (
    <div
      className="official-document-editor-shell"
      data-state={state}
      aria-label="ONLYOFFICE 单人编辑工作区"
      aria-busy={state === "loading"}
    >
      {canRender ? <div id={containerId} className="official-document-editor-shell__host" /> : null}
      {!canRender ? (
        <>
          <div className="official-document-editor-shell__toolbar" aria-hidden="true">
            <span /><span /><span /><i /><i /><i />
          </div>
          <div className="official-document-editor-shell__canvas" aria-hidden="true">
            <div className="official-document-editor-shell__paper">
              <strong>{draftTitle}</strong>
              <span /><span /><span /><span /><span />
            </div>
          </div>
        </>
      ) : null}
      {state !== "ready" ? (
        <div className="official-document-editor-shell__overlay" role={state === "error" ? "alert" : "status"}>
          <span className="official-document-editor-shell__mark" aria-hidden="true">
            {state === "error" ? <WarningCircle size={25} /> : state === "loading" ? <MicrosoftWordLogo size={25} /> : <LockKey size={25} />}
          </span>
          <strong>
            {state === "error"
              ? errorKind === "lease" ? "编辑租约失效，网页编辑已阻断" : "网页 Word 编辑器加载失败"
              : state === "loading" ? "正在加载 ONLYOFFICE" : "网页 Word 编辑器未连接"}
          </strong>
          <p>{state === "error" ? errorMessage : state === "loading" ? "正在校验 api.js 并创建单人编辑实例…" : unavailableMessage}</p>
          <Tag bordered={false} color={state === "error" ? "error" : state === "loading" ? "processing" : "warning"}>
            {state === "error" ? errorKind === "lease" ? "续租失败 / 已停止" : "初始化失败" : state === "loading" ? "连接中" : "不可用 / 占位状态"}
          </Tag>
        </div>
      ) : null}
      {state === "ready" ? <span className="sr-only" role="status">ONLYOFFICE 编辑器已就绪</span> : null}
    </div>
  );
}
