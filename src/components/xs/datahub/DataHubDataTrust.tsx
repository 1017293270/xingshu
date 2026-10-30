import {
  CheckCircle,
  Circle,
  Question,
  ShieldCheck,
  ShieldWarning,
  WarningCircle,
  type Icon
} from "@phosphor-icons/react";
import { Popover } from "antd";
import { useEffect, useId, useRef, useState } from "react";
import type { DataHubDataTrustView } from "@/services/dataHubDataTrust";
import type { DataHubDataTrustLevel } from "@/types/dataHub";

const levelIcons: Record<DataHubDataTrustLevel, Icon> = {
  TRUSTED: ShieldCheck,
  PARTIAL: ShieldWarning,
  NOT_TRUSTED: WarningCircle
};

function DataTrustDetail({ trust, id }: { trust: DataHubDataTrustView; id: string }) {
  const LevelIcon = levelIcons[trust.level];

  return (
    <div className="xs-data-trust-popover__content" id={id} data-level={trust.level}>
      <p className="xs-data-trust-popover__title">
        <LevelIcon className="xs-data-trust-popover__level-icon" size={16} weight="fill" aria-hidden="true" />
        {trust.label}
      </p>
      <p className="xs-data-trust-popover__explanation">{trust.explanation}</p>
      {trust.measures.length > 0 ? (
        <div className="xs-data-trust-popover__measures">
          <p className="xs-data-trust-popover__caption">本次用到的指标</p>
          <ul className="xs-data-trust-popover__list">
            {trust.measures.map((measure) => (
              <li key={`${measure.trusted ? 1 : 0}|${measure.title}`} data-trusted={measure.trusted}>
                {measure.trusted ? (
                  <CheckCircle className="xs-data-trust-popover__mark" size={14} weight="fill" aria-hidden="true" />
                ) : (
                  <Circle className="xs-data-trust-popover__mark" size={14} aria-hidden="true" />
                )}
                <span className="xs-data-trust-popover__name" title={measure.title}>{measure.title}</span>
                <span className="xs-data-trust-popover__state">{measure.trusted ? "已确认" : "未确认"}</span>
              </li>
            ))}
          </ul>
          {trust.hiddenMeasureCount > 0 ? (
            <p className="xs-data-trust-popover__note">另有 {trust.hiddenMeasureCount} 项</p>
          ) : null}
        </div>
      ) : null}
      {trust.unstructuredData ? (
        <p className="xs-data-trust-popover__note">另有部分结果没有指标信息，未计入。</p>
      ) : null}
    </div>
  );
}

/**
 * 回答出处脚注区的第一行：本次回答用到的指标是否经人工确认。
 * 只是一行图标加文字，不做徽章；可信、部分可信带「?」，点开看说明和用到的指标。
 */
export function DataHubDataTrust({ trust }: { trust: DataHubDataTrustView }) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const helpRef = useRef<HTMLButtonElement>(null);
  const LevelIcon = levelIcons[trust.level];

  // antd 只在焦点停在「?」上时响应 Esc；鼠标点开（Safari 点击不聚焦按钮）后同样要能按 Esc 关掉。
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        helpRef.current?.focus();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <div className="analysis-answer-trust" data-level={trust.level}>
      <LevelIcon className="analysis-answer-trust__icon" size={16} weight="fill" aria-hidden="true" />
      <span className="analysis-answer-trust__label">{trust.label}</span>
      {trust.explanation ? (
        <Popover
          trigger="click"
          open={open}
          onOpenChange={setOpen}
          placement="bottomLeft"
          // 窄屏上「?」右边放不下 300px 的浮层时整体左移，不翻转、不出屏；下方放不下才翻到上方。
          align={{ overflow: { adjustY: 1, shiftX: true } }}
          arrow={false}
          classNames={{ root: "xs-data-trust-popover" }}
          content={<DataTrustDetail trust={trust} id={detailId} />}
        >
          <button
            ref={helpRef}
            type="button"
            className="analysis-answer-trust__help"
            aria-label="查看可信说明"
            aria-expanded={open}
            aria-controls={open ? detailId : undefined}
          >
            <Question size={16} aria-hidden="true" />
          </button>
        </Popover>
      ) : null}
    </div>
  );
}
