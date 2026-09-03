import { MagicWand, MagnifyingGlass, WarningCircle } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Segmented } from "antd";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { sessionQueryKey, useSessionQueryScope } from "@/app/sessionQuery";
import { XsEmptyState } from "@/components/xs/XsEmptyState";
import { xsEnterStep } from "@/components/xs/motion";
import { createDashboard } from "@/services/dashboardAnalyticsService";
import { writeDashboardSmartHandoff } from "@/services/dashboardDesignHandoffService";
import { createBlankDashboard } from "@/services/dashboardGenerationService";
import { listQueryAssets } from "@/services/queryAssetService";
import type { QueryAsset } from "@/types/analytics";
import { PageFrame } from "./PageFrame";
import "./styles/page-shell.css";
import "./styles/smart-dashboard-entry.css";

type AssetScope = "ALL" | "PRIVATE" | "SPACE";

const scopeOptions: Array<{ label: string; value: AssetScope }> = [
  { label: "全部", value: "ALL" },
  { label: "我的", value: "PRIVATE" },
  { label: "空间共享", value: "SPACE" }
];

/* 示例只给「给谁看 + 看什么 + 什么调性」这三件事，不示范图表种类——图种由本地引擎决定。 */
const briefExamples = [
  "面向经营例会的营收总览，突出趋势",
  "给领导看的区域销售对比，深色主题",
  "渠道订单排行明细，标题精简"
];

/** 草稿名先用需求前 24 字兜底，进编辑器后模型还会按设计稿改回来。 */
function draftTitleFromBrief(brief: string) {
  const normalized = brief.trim().replace(/\s+/g, " ");
  if (!normalized) return "未命名大屏";
  return normalized.length > 24 ? normalized.slice(0, 24) : normalized;
}

/** 一份资产的结果表摘要：只报表数、行数与列数，让人判断够不够画一块屏。 */
function assetShape(asset: QueryAsset) {
  const outputs = asset.stableVersion?.outputs ?? [];
  if (outputs.length === 0) return "暂无结果表";
  const parts = outputs.slice(0, 2).map((output) => {
    const rows = typeof output.rowCount === "number" ? `${output.rowCount} 行` : "行数未知";
    return `${output.label || output.outputKey} ${rows} × ${output.columns.length} 列`;
  });
  return outputs.length > 2 ? `${parts.join("，")} 等 ${outputs.length} 张表` : parts.join("，");
}

export function SmartDashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessionScope = useSessionQueryScope();
  const [keyword, setKeyword] = useState("");
  const [scope, setScope] = useState<AssetScope>("ALL");
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [brief, setBrief] = useState("");

  const assetsQuery = useQuery({
    queryKey: sessionQueryKey(sessionScope, "query-assets", scope, keyword.trim()),
    queryFn: () => listQueryAssets({
      ...(keyword.trim() ? { keyword: keyword.trim() } : {}),
      ...(scope === "ALL" ? {} : { scope })
    })
  });

  const assets = assetsQuery.data ?? [];
  const trimmedBrief = brief.trim();

  const startMutation = useMutation({
    mutationFn: async () => {
      const record = await createDashboard(createBlankDashboard({ title: draftTitleFromBrief(trimmedBrief) }));
      writeDashboardSmartHandoff({
        version: 1,
        draftId: record.id,
        brief: trimmedBrief,
        assetIds: selectedAssetIds,
        createdAt: new Date().toISOString()
      });
      return record;
    },
    onSuccess: (record) => {
      queryClient.setQueryData(sessionQueryKey(sessionScope, "analytics-dashboard-editor", record.id), record);
      navigate(`/dashboard-editor?draft=${encodeURIComponent(record.id)}&smart=1`);
    }
  });

  function toggleAsset(assetId: string) {
    setSelectedAssetIds((current) => (
      current.includes(assetId)
        ? current.filter((id) => id !== assetId)
        : [...current, assetId]
    ));
  }

  const canStart = selectedAssetIds.length > 0 && trimmedBrief.length > 0 && !startMutation.isPending;
  const startError = startMutation.error instanceof Error
    ? startMutation.error.message
    : startMutation.isError ? "创建大屏草稿失败，请稍后重试" : "";

  return (
    <PageFrame
      className="smart-entry"
      title="智享大屏"
      subtitle="选数据、说需求，AI 生成可继续对话修改的大屏。"
      actions={(
        <Link className="xs-action-link" to="/dashboard">返回我的看板</Link>
      )}
    >
      <div className="smart-entry__layout">
        <section
          className="smart-entry__panel smart-entry__data xs-page-enter"
          style={xsEnterStep(1)}
          aria-label="选择设计用数据"
        >
          <header className="smart-entry__panel-head">
            <h2>设计用数据</h2>
            <span className="smart-entry__count" aria-live="polite">
              {selectedAssetIds.length > 0 ? `已选 ${selectedAssetIds.length} 份` : "至少选 1 份"}
            </span>
          </header>

          <div className="smart-entry__filters">
            <Input
              allowClear
              aria-label="搜索收藏问数"
              prefix={<MagnifyingGlass size={16} aria-hidden="true" />}
              placeholder="搜索收藏问数名称"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
            <Segmented
              aria-label="按可见范围筛选收藏问数"
              value={scope}
              options={scopeOptions}
              onChange={(value) => setScope(value as AssetScope)}
            />
          </div>

          {assetsQuery.isLoading ? (
            <div className="smart-entry__list" aria-busy="true" aria-label="正在加载收藏问数">
              {[1, 2, 3].map((item) => (
                <span key={item} className="smart-entry__skeleton" aria-hidden="true" />
              ))}
            </div>
          ) : assetsQuery.isError ? (
            <XsEmptyState
              tone="error"
              title="收藏问数暂不可用"
              description={assetsQuery.error instanceof Error ? assetsQuery.error.message : "请稍后重试"}
              actionLabel="重试"
              onAction={() => void assetsQuery.refetch()}
            />
          ) : assets.length === 0 ? (
            <XsEmptyState
              ariaLabel="收藏问数空状态"
              eyebrow={keyword.trim() ? "无匹配结果" : "暂无收藏问数"}
              title={keyword.trim() ? "没有找到匹配的收藏问数" : "先去问数里收藏一份结果"}
              description={
                keyword.trim()
                  ? "换个关键词，或切换可见范围后重试。"
                  : "智享大屏基于收藏问数的固定版本作图，先在问数结果里收藏一份再回来。"
              }
              actionLabel={keyword.trim() ? "清除关键词" : "去问数收藏"}
              onAction={() => (keyword.trim() ? setKeyword("") : navigate("/analysis"))}
            />
          ) : (
            <ul className="smart-entry__list" aria-label="收藏问数列表">
              {assets.map((asset) => {
                const selected = selectedAssetIds.includes(asset.id);
                return (
                  <li key={asset.id}>
                    <button
                      type="button"
                      className={`smart-entry__asset${selected ? " is-selected" : ""}`}
                      aria-pressed={selected}
                      onClick={() => toggleAsset(asset.id)}
                    >
                      <span className="smart-entry__asset-name">{asset.name}</span>
                      <span className="smart-entry__asset-shape">{assetShape(asset)}</span>
                      <span className="smart-entry__asset-question">{asset.resolvedQuestion}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section
          className="smart-entry__panel smart-entry__brief xs-page-enter"
          style={xsEnterStep(2)}
          aria-label="描述大屏需求"
        >
          <header className="smart-entry__panel-head">
            <h2>大屏需求</h2>
            <span className="smart-entry__count">一句话说清给谁看、看什么</span>
          </header>

          <Input.TextArea
            aria-label="大屏需求"
            className="smart-entry__textarea"
            autoSize={{ minRows: 5, maxRows: 10 }}
            maxLength={400}
            placeholder="例如：面向经营例会的营收总览，突出趋势与同比。"
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
          />

          <div className="smart-entry__examples" role="group" aria-label="示例需求">
            {briefExamples.map((example) => (
              <button
                type="button"
                key={example}
                className="smart-entry__example"
                onClick={() => setBrief(example)}
              >
                {example}
              </button>
            ))}
          </div>

          {startError ? (
            <p className="smart-entry__error" role="alert">
              <WarningCircle size={14} weight="bold" aria-hidden="true" />
              {startError}
            </p>
          ) : null}

          <div className="smart-entry__submit">
            <Button
              type="primary"
              icon={<MagicWand size={16} weight="bold" aria-hidden="true" />}
              disabled={!canStart}
              loading={startMutation.isPending}
              onClick={() => startMutation.mutate()}
            >
              开始设计
            </Button>
            <span className="smart-entry__count">生成结果先预览，应用后一步可撤销</span>
          </div>
        </section>
      </div>
    </PageFrame>
  );
}
