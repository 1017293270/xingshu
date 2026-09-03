import { ArrowsClockwise, MagicWand, PaperPlaneRight, Stop, WarningCircle, X } from "@phosphor-icons/react";
import { Button, Input, Select } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { XsChatAssistant, XsChatTurn, XsChatUserBubble } from "@/components/xs/conversation";
import { critiqueDashboard } from "@/features/dashboardStudio/core/dashboardDesignCritique";
import type { QueryAsset, QueryExecution } from "@/types/analytics";
import type { DashboardSchema } from "@/types/dashboardStudio";
import { SmartDesignCritiqueCard } from "./SmartDesignCritiqueCard";
import { SmartDesignPreviewCard } from "./SmartDesignPreviewCard";
import { useSmartDashboardChat, type SmartDashboardTurn } from "./useSmartDashboardChat";
import "./smart-dashboard.css";

export type SmartDashboardPanelProps = {
  getSchema: () => DashboardSchema;
  applySchema: (schema: DashboardSchema, notice?: string) => Promise<void>;
  listAssets: (input?: { keyword?: string; scope?: "PRIVATE" | "SPACE" }) => Promise<QueryAsset[]>;
  previewAsset: (assetId: string) => Promise<QueryExecution>;
  /** 画布当前 schema 的快照，每次变更都会换新引用；本地诊断与空板判断据此重算。 */
  schema: DashboardSchema;
  /** 入口页交接过来的需求与资产：面板一挂上就自动发起首轮设计。 */
  initialBrief?: string;
  initialAssetIds?: string[];
  onClose: () => void;
};

const kindLabels: Record<SmartDashboardTurn["kind"], string> = {
  generate: "生成",
  edit: "修改",
  fix: "诊断修复"
};

const examplePrompts = [
  "做一块面向经营例会的营收总览，突出趋势",
  "换成深色主题，把排行图放大当主图",
  "把占比图换成横向排行，标题精简到八个字以内"
];

export function SmartDashboardPanel({
  getSchema,
  applySchema,
  listAssets,
  previewAsset,
  schema,
  initialBrief,
  initialAssetIds,
  onClose
}: SmartDashboardPanelProps) {
  const chat = useSmartDashboardChat({ getSchema, applySchema, listAssets, previewAsset, initialAssetIds });
  const [draft, setDraft] = useState("");
  const streamRef = useRef<HTMLDivElement | null>(null);
  const autoStarted = useRef(false);
  const { send } = chat;

  const issues = useMemo(() => critiqueDashboard(schema), [schema]);
  const boardEmpty = useMemo(() => !schema.widgets.some((widget) => !widget.style.locked), [schema]);
  const hasGenerated = chat.turns.some((turn) => turn.kind === "generate" && turn.candidate);

  /* 交接过来的首轮：资产已经选好，直接把需求发出去。 */
  useEffect(() => {
    if (autoStarted.current || !initialBrief?.trim() || !initialAssetIds?.length) return;
    autoStarted.current = true;
    send(initialBrief, { mode: "generate" });
  }, [initialAssetIds, initialBrief, send]);

  useEffect(() => {
    const element = streamRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [chat.turns]);

  function submit() {
    const value = draft.trim();
    if (!value || chat.busy) return;
    send(value);
    setDraft("");
  }

  return (
    <aside className="smart-dashboard" aria-label="智享大屏">
      <header className="smart-dashboard__head">
        <MagicWand size={18} weight="bold" aria-hidden="true" />
        <div>
          <strong>智享大屏</strong>
          <span>对话生成与修改，应用后一步可撤销</span>
        </div>
        <Button type="text" size="small" aria-label="关闭智享面板" icon={<X size={16} />} onClick={onClose} />
      </header>

      <section className="smart-dashboard__assets" aria-label="设计用数据">
        <label htmlFor="smart-dashboard-assets">设计用数据</label>
        <Select
          id="smart-dashboard-assets"
          mode="multiple"
          placeholder={chat.assetsLoading ? "正在读取收藏问数…" : "选择收藏问数"}
          loading={chat.assetsLoading}
          value={chat.selectedAssetIds}
          options={chat.assets.map((asset) => ({ value: asset.id, label: asset.name }))}
          optionFilterProp="label"
          maxTagCount="responsive"
          onChange={(value) => chat.setSelectedAssetIds(value)}
          notFoundContent={chat.assetsError ? "读取失败" : "还没有收藏问数"}
        />
        {chat.assetsError ? (
          <p className="smart-dashboard__error" role="alert">
            <WarningCircle size={14} weight="bold" aria-hidden="true" />
            {chat.assetsError}
            <button type="button" className="xs-action-link" onClick={() => void chat.refreshAssets()}>重试</button>
          </p>
        ) : (
          <small>{chat.selectedAssetIds.length > 0 ? `已选 ${chat.selectedAssetIds.length} 份` : "空板生成至少选一份；改版可不选"}</small>
        )}
      </section>

      <div className="smart-dashboard__stream" ref={streamRef}>
        {chat.turns.length === 0 ? (
          <div className="smart-dashboard__empty">
            <p>{boardEmpty ? "选好数据，用一句话说清这块屏给谁看、看什么。" : "板上已有内容，直接说要改什么。"}</p>
            <ul>
              {examplePrompts.map((prompt) => (
                <li key={prompt}>
                  <button type="button" onClick={() => setDraft(prompt)}>{prompt}</button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {chat.turns.map((turn) => (
          <XsChatTurn key={turn.id}>
            <XsChatUserBubble meta={kindLabels[turn.kind]}>{turn.brief}</XsChatUserBubble>
            <XsChatAssistant error={turn.status === "error"}>
              {turn.status === "streaming" && !turn.narrative ? (
                <p className="smart-dashboard__thinking" role="status">
                  <span className="xs-status-bar__pulse" aria-hidden="true"><i /><i /><i /></span>
                  正在设计
                </p>
              ) : null}
              {turn.narrative ? <p className="smart-dashboard__narrative">{turn.narrative}</p> : null}
              {turn.candidate && turn.status !== "error" && turn.status !== "streaming" && turn.status !== "cancelled" ? (
                <SmartDesignPreviewCard
                  schema={turn.candidate.schema}
                  changes={turn.candidate.changes}
                  rejected={turn.candidate.rejected}
                  status={turn.status === "applied" ? "applied" : turn.status === "discarded" ? "discarded" : "ready"}
                  fallback={turn.fallback}
                  onApply={() => void chat.apply(turn.id)}
                  onDiscard={() => chat.discard(turn.id)}
                />
              ) : null}
              {turn.status === "discarded" && !turn.candidate ? (
                <p className="smart-dashboard__muted">已放弃这一版。</p>
              ) : null}
              {turn.status === "cancelled" ? <p className="smart-dashboard__muted">已停止生成。</p> : null}
              {turn.error ? (
                <p className="smart-dashboard__error" role="alert">
                  <WarningCircle size={14} weight="bold" aria-hidden="true" />
                  {turn.error}
                </p>
              ) : null}
            </XsChatAssistant>
          </XsChatTurn>
        ))}

        {!boardEmpty ? <SmartDesignCritiqueCard issues={issues} busy={chat.busy} onFix={(issue) => void chat.applyFix(issue)} /> : null}
      </div>

      <div className="smart-dashboard__composer">
        <Input.TextArea
          aria-label="设计需求"
          autoSize={{ minRows: 2, maxRows: 5 }}
          placeholder={boardEmpty ? "例如：面向经营例会的营收总览，突出趋势" : "例如：换成深色主题，把趋势图放大"}
          value={draft}
          disabled={chat.busy}
          onChange={(event) => setDraft(event.target.value)}
          onPressEnter={(event) => {
            if (event.shiftKey) return;
            event.preventDefault();
            submit();
          }}
        />
        <div className="smart-dashboard__composer-bar">
          <span>{boardEmpty ? "将生成整块大屏" : "将修改当前大屏"}</span>
          <span className="smart-dashboard__composer-actions">
            {hasGenerated ? (
              <Button
                size="small"
                icon={<ArrowsClockwise size={14} />}
                disabled={chat.busy}
                onClick={() => chat.regenerate()}
              >
                换个方向
              </Button>
            ) : null}
            {chat.busy ? (
              <Button size="small" icon={<Stop size={14} />} onClick={chat.stop}>停止</Button>
            ) : (
              <Button
                type="primary"
                size="small"
                icon={<PaperPlaneRight size={14} />}
                disabled={!draft.trim()}
                onClick={submit}
              >
                发送
              </Button>
            )}
          </span>
        </div>
      </div>
    </aside>
  );
}
