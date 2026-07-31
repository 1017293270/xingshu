import {
  CheckCircle,
  CircleNotch,
  WarningCircle
} from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import type {
  DataHubExecutionSession,
  DataHubSubagentTreeNode
} from "@/types/dataHub";
import { agentAvatarTone, DataHubAgentAvatar } from "./DataHubAgentAvatar";
import {
  assignSubagentTones,
  executionStatusLabel,
  formatExecutionDuration,
  sessionActivitySummary,
  sessionDisplayName,
  sessionElapsedMs
} from "./display";
import type { DataHubSubagentDagProps } from "./types";
import { useNow } from "./useNow";

/**
 * 派发编排图：主编排智能体 → 子智能体的 DAG 画布。
 * 布局按父子层级自动分列（根节点 / 一级子智能体 / 更深层级），
 * 边为贝塞尔曲线，运行中的派发边带流动虚线动画。
 * 节点标识色与 DataHubAgentAvatar 的 tone 哈希保持一致，便于跨面板寻路。
 */

const CANVAS_WIDTH = 760;
const COLUMN_X = [24, 280, 536] as const;
/** 节点盒宽度（CSS 中 .xs-datahub-subagent-dag__node 的 width），连线端点用 */
const NODE_WIDTH = 190;
/** 思考态根节点宽度，用于在等待画布中精确居中 */
const THINKING_NODE_WIDTH = 210;
const ROW_HEIGHT = 64;
const PAD_Y = 16;

/** 与 datahub-execution.css 中 --tone-1~6 的头像标识色对齐 */
const TONE_COLORS = [
  "",
  "#245fa9",
  "#0e7d94",
  "#5e4fbb",
  "#1d7a55",
  "#a8620a",
  "#a63c7e"
] as const;

type DagEntry = {
  id: string;
  parentId?: string;
  column: 1 | 2;
  session: DataHubExecutionSession;
  name: string;
  tone: number;
};

type DagPoint = { x: number; cy: number };

function collectEntries(
  nodes: readonly DataHubSubagentTreeNode[],
  parentId: string | undefined,
  toneMap: Map<string, number>,
  target: DagEntry[]
) {
  for (const node of nodes) {
    const { session } = node;
    const id =
      session.sessionId ??
      session.subagentId ??
      `dag-${node.level}-${target.length}`;
    const name = sessionDisplayName(session);
    target.push({
      id,
      parentId,
      column: node.level > 0 ? 2 : 1,
      session,
      name,
      tone: toneMap.get(id) ?? agentAvatarTone(id, name)
    });
    collectEntries(node.children, id, toneMap, target);
  }
}

function edgePath(from: DagPoint, to: DagPoint, scale: number): string {
  // 端点固定在节点盒的垂直中点（cy）；起点取父盒右缘——盒宽是 px，
  // 需按画布实际宽度换算成 viewBox 单位，并回退 2px 保证与盒缘重叠无缝隙
  const x1 = from.x + (NODE_WIDTH - 2) * scale;
  const x2 = to.x;
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${from.cy} C ${midX} ${from.cy}, ${midX} ${to.cy}, ${x2} ${to.cy}`;
}

/** 画布 px 宽 → viewBox 单位的换算系数（svg 横向拉伸、HTML 节点盒为固定 px） */
function useCanvasScale() {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return undefined;
    }
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) {
        setScale(CANVAS_WIDTH / width);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { canvasRef, scale };
}

function nodeStyle(
  point: DagPoint,
  canvasHeight: number,
  stagger: number
): CSSProperties {
  return {
    left: `${(point.x / CANVAS_WIDTH) * 100}%`,
    top: `${(point.cy / canvasHeight) * 100}%`,
    "--xs-datahub-stagger": stagger
  } as CSSProperties;
}

/**
 * 「等待任务分派」幽灵态可见条件：还没有子智能体，且本轮编排刚开始。
 * idle + 未结束 也纳入——提问后到首个 SSE 事件到达前的空窗期
 * 用幽灵画布填充，避免面板只剩空白空状态框。
 */
export function dataHubDagGhostVisible(
  mainSession: DataHubExecutionSession,
  hasSubagents: boolean
): boolean {
  if (hasSubagents) {
    return false;
  }
  if (mainSession.status === "running") {
    return true;
  }
  return mainSession.status === "idle" && !mainSession.finished;
}

export function DataHubSubagentDag({
  mainSession,
  nodes,
  onSelect
}: DataHubSubagentDagProps) {
  const titleId = useId();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { canvasRef, scale } = useCanvasScale();
  const toneMap = assignSubagentTones(nodes);
  const entries: DagEntry[] = [];
  collectEntries(nodes, undefined, toneMap, entries);

  const anyRunning =
    mainSession.status === "running" ||
    entries.some((entry) => entry.session.status === "running");
  const now = useNow(1000, anyRunning);

  // 尚无子智能体时：编排刚起步展示「等待任务分派」幽灵节点，其余情况不渲染画布
  const showGhost = dataHubDagGhostVisible(mainSession, entries.length > 0);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) {
      return;
    }
    scroller.scrollLeft = showGhost
      ? Math.max(0, (scroller.scrollWidth - scroller.clientWidth) / 2)
      : 0;
  }, [scale, showGhost]);

  if (!entries.length && !showGhost) {
    return null;
  }

  // 每列内部按展开顺序分配行，根节点整体垂直居中
  const columnRows = [0, 0, 0];
  const rowOf = entries.map((entry) => {
    const row = columnRows[entry.column];
    columnRows[entry.column] += 1;
    return row;
  });
  const maxRows = Math.max(1, columnRows[1], columnRows[2]);
  const canvasHeight = showGhost
    ? PAD_Y * 2 + ROW_HEIGHT * 3
    : PAD_Y * 2 + maxRows * ROW_HEIGHT;

  const rootName =
    mainSession.label?.trim() || mainSession.agentName?.trim() || "主编排智能体";
  const rootIdentity = mainSession.sessionId ?? "main-session";
  const rootPoint: DagPoint = showGhost
    ? {
        x: (CANVAS_WIDTH - THINKING_NODE_WIDTH * scale) / 2,
        cy: canvasHeight / 2
      }
    : { x: COLUMN_X[0], cy: canvasHeight / 2 };
  const rootElapsed = sessionElapsedMs(mainSession, now);

  const pointOf = entries.map((entry, index): DagPoint => {
    return {
      x: COLUMN_X[entry.column],
      cy: PAD_Y + ROW_HEIGHT / 2 + rowOf[index] * ROW_HEIGHT
    };
  });
  const pointById = new Map<string, DagPoint>([
    [rootIdentity, rootPoint],
    ...entries.map((entry, index): [string, DagPoint] => [entry.id, pointOf[index]])
  ]);

  const edges = entries.map((entry, index) => {
    const from = pointById.get(entry.parentId ?? rootIdentity) ?? rootPoint;
    const status = entry.session.status;
    const toneColor = TONE_COLORS[entry.tone] ?? TONE_COLORS[1];
    return {
      key: entry.id,
      d: edgePath(from, pointOf[index], scale),
      status,
      stroke: status === "running" ? toneColor : undefined,
      stagger: index
    };
  });

  return (
    <section className="xs-datahub-subagent-dag" aria-labelledby={titleId}>
      <header className="xs-datahub-section-title">
        <div>
          <span>ORCHESTRATION</span>
          <h3 id={titleId}>编排流程</h3>
        </div>
        {showGhost ? (
          <small
            className="xs-datahub-subagent-dag__waiting"
            role="status"
            aria-label="编排智能体思考中"
          >
            <span aria-hidden="true" />
            编排智能体思考中…
          </small>
        ) : (
          <small>{entries.length} 个子智能体</small>
        )}
      </header>

      <div ref={scrollRef} className="xs-datahub-subagent-dag__scroll">
        <div
          ref={canvasRef}
          className={`xs-datahub-subagent-dag__canvas${
            showGhost ? " xs-datahub-subagent-dag__canvas--ghost" : ""
          }`}
          style={{ aspectRatio: `${CANVAS_WIDTH} / ${canvasHeight}` }}
        >
          <svg
            viewBox={`0 0 ${CANVAS_WIDTH} ${canvasHeight}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {edges.map((edge) => (
              <g key={edge.key}>
                <path
                  className={`xs-datahub-subagent-dag__edge xs-datahub-subagent-dag__edge--${edge.status}`}
                  style={{ "--xs-datahub-stagger": edge.stagger } as CSSProperties}
                  d={edge.d}
                  stroke={edge.stroke}
                />
                {edge.status === "running" ? (
                  <circle
                    className="xs-datahub-subagent-dag__packet"
                    r="3"
                    fill={edge.stroke}
                  >
                    <animateMotion
                      dur="1.7s"
                      repeatCount="indefinite"
                      begin={`${-(edge.stagger * 0.45)}s`}
                      path={edge.d}
                    />
                  </circle>
                ) : null}
              </g>
            ))}
          </svg>

          <div
            className={`xs-datahub-subagent-dag__node xs-datahub-subagent-dag__node--root${
              showGhost ? " xs-datahub-subagent-dag__node--thinking" : ""
            }`}
            data-status={mainSession.status}
            style={nodeStyle(rootPoint, canvasHeight, 0)}
          >
            <DataHubAgentAvatar
              name={rootName}
              identity={rootIdentity}
              size="large"
            />
            <span className="xs-datahub-subagent-dag__node-copy">
              <strong>{rootName}</strong>
              {showGhost ? (
                <small className="xs-datahub-subagent-dag__thinking">
                  <CircleNotch size={12} weight="bold" aria-hidden="true" />
                  正在规划执行步骤
                </small>
              ) : (
                <small>
                  {executionStatusLabel[mainSession.status]}
                  {rootElapsed !== undefined && mainSession.status !== "idle"
                    ? ` · ${formatExecutionDuration(rootElapsed)}`
                    : ""}
                </small>
              )}
            </span>
          </div>

          {entries.map((entry, index) => {
            const { session } = entry;
            const status = session.status;
            const elapsed = sessionElapsedMs(session, now);
            const activity =
              status === "running" ? sessionActivitySummary(session) : "";
            return (
              <button
                key={entry.id}
                type="button"
                className="xs-datahub-subagent-dag__node"
                data-status={status}
                data-tone={entry.tone}
                style={nodeStyle(pointOf[index], canvasHeight, index + 1)}
                aria-label={`打开 ${entry.name}执行详情`}
                onClick={(event) => onSelect(entry.id, event.currentTarget)}
              >
                <DataHubAgentAvatar
                  name={entry.name}
                  identity={entry.id}
                  size="large"
                  tone={entry.tone}
                />
                {status === "running" ? (
                  <span
                    className="xs-datahub-subagent-dag__node-badge"
                    data-status="running"
                    aria-hidden="true"
                  >
                    <CircleNotch size={9} weight="bold" />
                  </span>
                ) : null}
                {status === "done" ? (
                  <span
                    className="xs-datahub-subagent-dag__node-badge"
                    data-status="done"
                    aria-hidden="true"
                  >
                    <CheckCircle size={9} weight="fill" />
                  </span>
                ) : null}
                {status === "error" ? (
                  <span
                    className="xs-datahub-subagent-dag__node-badge"
                    data-status="error"
                    aria-hidden="true"
                  >
                    <WarningCircle size={9} weight="fill" />
                  </span>
                ) : null}
                <span className="xs-datahub-subagent-dag__node-copy">
                  <strong>{entry.name}</strong>
                  <small
                    title={activity || undefined}
                    aria-live={status === "running" ? "polite" : undefined}
                  >
                    {activity || executionStatusLabel[status]}
                    {!activity && elapsed !== undefined && status !== "idle"
                      ? ` · ${formatExecutionDuration(elapsed)}`
                      : ""}
                  </small>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
