export type BrandAssetRecord = {
  semantic: string;
  assetPath: string;
  sourcePath: string;
  allowedWidthsPx: readonly number[];
  pages: readonly string[];
};

/**
 * Audit trail for the small set of raster assets that carry brand or identity
 * meaning. Ordinary navigation and application icons stay in Phosphor and do
 * not belong in this registry.
 */
export const brandAssetRegistry = {
  "xingshu-logo": {
    semantic: "星数品牌标识",
    assetPath: "src/assets/brand/xingshu-logo-transparent.png",
    sourcePath: "src/assets/brand/xingshu-logo-source.png",
    allowedWidthsPx: [96, 132, 160],
    pages: ["welcome", "login", "app-shell"]
  },
  "zhangsan-avatar": {
    semantic: "当前用户张三头像",
    assetPath: "src/assets/brand/zhangsan-avatar-source.png",
    sourcePath: "src/assets/brand/zhangsan-avatar-data-source.png",
    allowedWidthsPx: [32, 40, 48],
    pages: ["app-shell"]
  },
  "analysis-user-avatar": {
    semantic: "问数会话中的用户头像",
    assetPath: "src/assets/brand/analysis-user-avatar-source.png",
    sourcePath: "outputs/xingshu-homepage-system/references/04-source-analysis.png",
    allowedWidthsPx: [32, 40],
    pages: ["analysis"]
  },
  "assistant-mark": {
    semantic: "星数 Agent 助手标识",
    assetPath: "src/assets/brand/xingshu-assistant-mark-image2-transparent.png",
    sourcePath: "src/assets/brand/xingshu-assistant-mark-source.png",
    allowedWidthsPx: [28, 36, 48],
    pages: ["analysis"]
  }
} as const satisfies Record<string, BrandAssetRecord>;
