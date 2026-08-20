import { ArrowRight, ClockCounterClockwise } from "@phosphor-icons/react";
import { Link } from "react-router";
import { XsIconTile } from "./XsIconTile";
import { XsGlyphKnowledgeTotal } from "./XsMetricGlyphs";
import type { XsKnowledgeTone } from "./knowledgeTone";
import { xsEnterStep } from "./motion";

type XsKnowledgeCardProps = {
  id: string;
  title: string;
  description: string;
  documentCount?: number | null;
  /** 已格式化的更新时间文本，未同步时留空。 */
  updatedAt?: string;
  updatedAtValue?: string;
  /** 占空间文档百分比，未知时不显示占比条。 */
  share?: number;
  tone?: XsKnowledgeTone;
  step?: number;
};

/**
 * 知识库卡：我的云盘与数据资产管理渲染的是同一批知识库，共用同一张卡。
 * 差异只在"有没有占比数据"，不再体现为两种视觉语言。
 */
export function XsKnowledgeCard({
  id,
  title,
  description,
  documentCount,
  updatedAt,
  updatedAtValue,
  share,
  tone = "blue",
  step = 5
}: XsKnowledgeCardProps) {
  return (
    <Link
      to={`/cloud/${encodeURIComponent(id)}`}
      className="xs-card xs-card-lift xs-card-link xs-kb-card xs-page-enter"
      style={xsEnterStep(step)}
      aria-label={`知识库：${title}`}
    >
      <div className="xs-kb-card__head">
        <XsIconTile glyph={XsGlyphKnowledgeTotal} label={title} tone={tone} />
        <div className="xs-kb-card__heading">
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="xs-kb-card__stats">
        <span className="xs-kb-card__count">
          {documentCount != null ? (
            <>
              <strong>{documentCount.toLocaleString("zh-CN")}</strong>
              <small>份文档</small>
            </>
          ) : (
            <small>文档数待同步</small>
          )}
        </span>
        {share != null ? (
          <span className="xs-kb-card__share">
            <span className="xs-kb-card__share-track" aria-hidden="true">
              <i style={{ width: `${Math.max(share, 2)}%` }} />
            </span>
            <small>占空间文档 {share}%</small>
          </span>
        ) : null}
      </div>
      <div className="xs-kb-card__foot">
        {updatedAt ? (
          <span className="xs-kb-card__time">
            <ClockCounterClockwise size={14} aria-hidden="true" />
            <time dateTime={updatedAtValue ?? updatedAt}>{updatedAt}</time>
          </span>
        ) : (
          <span className="xs-kb-card__time">更新时间待同步</span>
        )}
        <span className="xs-kb-card__open">
          查看文档
          <ArrowRight size={14} aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}
