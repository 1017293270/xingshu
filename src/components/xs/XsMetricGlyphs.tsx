import type { ReactNode } from "react";

/**
 * 星数功能图标 v1——指标卡专用的手绘矢量图标集。
 *
 * 规范由下面的 `Glyph` 外壳强制，不靠文档约束：
 * - 画布 32×32，渲染 32px（1:1，2× 屏正好 64 设备像素，笔画不落在半像素上）
 * - 笔画恒为 2px。2/32 = 6.25%，与 Phosphor regular 的 1.5/24 完全同比，
 *   所以这套图标和全站导航用的 Phosphor 是同一视觉重量
 * - 端点与拐角一律 round，图形落在内缩 2px 的 28×28 安全区内
 * - 只用 currentColor，次要部件靠 ACCENT_OPACITY 降调，绝不引入第二个颜色
 * - 每个图标最多「主体 + 一组次要部件」，因为 32px 下可分辨特征只有 4~5 个
 *
 * 单个图标只提供几何，不允许自带 strokeWidth / fill / 渐变 / 滤镜，
 * `XsMetricGlyphs.test.tsx` 会校验这一点。
 */

type XsMetricGlyphProps = {
  size?: number;
  weight?: "regular" | "duotone";
  className?: string;
};

const GLYPH_VIEW_BOX = "0 0 32 32";
const GLYPH_STROKE_WIDTH = 2;
const ACCENT_OPACITY = 0.45;

function Glyph({ size = 32, className, children }: XsMetricGlyphProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={GLYPH_VIEW_BOX}
      fill="none"
      stroke="currentColor"
      strokeWidth={GLYPH_STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** 数据资产总量：正视数据库柱体。 */
export function XsGlyphDataAssets(props: XsMetricGlyphProps) {
  return (
    <Glyph {...props}>
      <ellipse cx="16" cy="8.5" rx="9" ry="3.5" />
      <path d="M7 8.5v15c0 1.9 4 3.5 9 3.5s9-1.6 9-3.5v-15" />
      <path d="M7 16c0 1.9 4 3.5 9 3.5s9-1.6 9-3.5" opacity={ACCENT_OPACITY} />
    </Glyph>
  );
}

/** 数据总量：正视存储层，不用轴测。 */
export function XsGlyphDataVolume(props: XsMetricGlyphProps) {
  return (
    <Glyph {...props}>
      <rect x="6" y="6.5" width="20" height="7" rx="2.5" />
      <rect x="6" y="18.5" width="20" height="7" rx="2.5" />
      <g opacity={ACCENT_OPACITY}>
        <path d="M10 10h5" />
        <path d="M10 22h5" />
      </g>
    </Glyph>
  );
}

/** 非结构化数据资产：文档 + 图片角标。 */
export function XsGlyphMediaDocuments(props: XsMetricGlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M8 3h9l7 7v17a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M17 3v7h7" />
      <path d="M10 24l3.5-3.5 2.5 2.5 3-3 3 3" opacity={ACCENT_OPACITY} />
    </Glyph>
  );
}

/** 数据表数量：表格网格。 */
export function XsGlyphDataTables(props: XsMetricGlyphProps) {
  return (
    <Glyph {...props}>
      <rect x="5" y="6.5" width="22" height="19" rx="3" />
      <path d="M5 12.5h22" />
      <g opacity={ACCENT_OPACITY}>
        <path d="M12.5 12.5v13" />
        <path d="M19.5 12.5v13" />
      </g>
    </Glyph>
  );
}

/** 数据源数量：节点分支。 */
export function XsGlyphDataApis(props: XsMetricGlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="7" cy="16" r="4" />
      <circle cx="23" cy="7.5" r="3.5" />
      <circle cx="23" cy="24.5" r="3.5" />
      <g opacity={ACCENT_OPACITY}>
        <path d="M11 16h1.5a2 2 0 0 0 2-2V9.5a2 2 0 0 1 2-2h3" />
        <path d="M11 16h1.5a2 2 0 0 1 2 2v4.5a2 2 0 0 0 2 2h3" />
      </g>
    </Glyph>
  );
}

/** 数据服务调用量：双向调用。 */
export function XsGlyphServiceCalls(props: XsMetricGlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M4 11.5h24" />
      <path d="M23 6.5l5 5-5 5" />
      <path d="M28 20.5H4" />
      <path d="M9 15.5l-5 5 5 5" />
    </Glyph>
  );
}

/** 知识库总数：摊开的书。合起来的书在 32px 下只剩一个方块，认不出来。 */
export function XsGlyphKnowledgeTotal(props: XsMetricGlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M16 9C13.6 6.8 10.4 5.6 6.5 5.6A2 2 0 0 0 4.5 7.6v14.6a2 2 0 0 0 2 2c3.9 0 7.1 1.2 9.5 3.4" />
      <path d="M16 9v18.6" />
      <path d="M16 9c2.4-2.2 5.6-3.4 9.5-3.4a2 2 0 0 1 2 2v14.6a2 2 0 0 1-2 2c-3.9 0-7.1 1.2-9.5 3.4" opacity={ACCENT_OPACITY} />
    </Glyph>
  );
}

/** 文档总数：文档叠层。 */
export function XsGlyphDocumentTotal(props: XsMetricGlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M8 9h7l6 6v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2z" />
      <path d="M15 9v6h6" />
      <path d="M11 7V5a2 2 0 0 1 2-2h6l6 6v12a2 2 0 0 1-2 2h-2" opacity={ACCENT_OPACITY} />
    </Glyph>
  );
}

/** 最近更新：时钟。 */
export function XsGlyphRecentUpdate(props: XsMetricGlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="16" cy="16" r="12" />
      <path d="M16 9.5V16l4.5 2.5" />
      <g opacity={ACCENT_OPACITY}>
        <path d="M16 4v2" />
        <path d="M28 16h-2" />
        <path d="M16 28v-2" />
        <path d="M4 16h2" />
      </g>
    </Glyph>
  );
}

/** 云盘：云。 */
export function XsGlyphCloudDrive(props: XsMetricGlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M22.7 14.7h-1.4A8.9 8.9 0 1 0 12.7 25.8h10a5.55 5.55 0 0 0 0-11.1z" />
    </Glyph>
  );
}

export type XsMetricGlyphId =
  | "data-assets"
  | "data-volume"
  | "media-documents"
  | "data-tables"
  | "data-apis"
  | "service-calls"
  | "knowledge-total"
  | "document-total"
  | "recent-update"
  | "cloud-drive";

export const xsMetricGlyphById: Record<XsMetricGlyphId, (props: XsMetricGlyphProps) => ReactNode> = {
  "data-assets": XsGlyphDataAssets,
  "data-volume": XsGlyphDataVolume,
  "media-documents": XsGlyphMediaDocuments,
  "data-tables": XsGlyphDataTables,
  "data-apis": XsGlyphDataApis,
  "service-calls": XsGlyphServiceCalls,
  "knowledge-total": XsGlyphKnowledgeTotal,
  "document-total": XsGlyphDocumentTotal,
  "recent-update": XsGlyphRecentUpdate,
  "cloud-drive": XsGlyphCloudDrive
};
