/* eslint-disable react-refresh/only-export-components -- 预览壳是入口文件，不参与热更新导出约束 */
import "@ant-design/v5-patch-for-react-19";
import "@/styles/tokens.css";
import "@/components/xs/xs.css";
import { ConfigProvider } from "antd";
import zhCN from "antd/es/locale/zh_CN";
import { StrictMode, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { DashboardDesignerIsland } from "@/features/dashboardStudio/DashboardDesignerIsland";
import { SmartDashboardPanel } from "@/features/dashboardStudio/smart/SmartDashboardPanel";
import type {
  DashboardDesignerDataActions,
  DashboardDesignerHandle
} from "@/features/dashboardStudio/vue/mountDashboardDesigner";
import { createBlankDashboard } from "@/services/dashboardGenerationService";
import { contractDesignData, standardDesignData } from "@/test/dashboardDesignFixtures";
import { antdTheme } from "@/theme/antdTheme";
import type { DashboardRecord, DashboardSchema } from "@/types/dashboardStudio";

/**
 * 智享大屏免登录预览壳：真设计器 + 真智享面板，收藏问数用测试夹具，
 * 模型流由截图脚本（scripts/screenshot-smart-dashboard.mjs）在网络层拦截伪造。
 * ?brief=<需求>&assets=<id,id> 会像入口页交接那样自动发起首轮设计。
 * ?dataset=contract 换成合同主数据那一组（长资产名、带千分位的金额、纯数字年度），
 * 专门用来验兜底方案的标题与数据绑定。
 */
const params = new URLSearchParams(window.location.search);
const data = params.get("dataset") === "contract" ? contractDesignData() : standardDesignData();
const assets = Object.values(data).map((entry) => entry.asset);
const blank = createBlankDashboard({ title: "智享预览" });
const initialRecord: DashboardRecord = {
  id: blank.id,
  schema: blank,
  status: "draft",
  revision: 1,
  createdAt: blank.createdAt,
  updatedAt: blank.updatedAt
};

const unsupported = (name: string) => async () => {
  throw new Error(`预览壳不支持${name}`);
};

const dataActions: DashboardDesignerDataActions = {
  listAssets: async () => assets,
  previewAsset: async (assetId) => {
    const entry = data[assetId];
    if (!entry) throw new Error("预览壳里没有这份收藏问数");
    return entry.execution;
  },
  reaskAsset: unsupported("重新问数"),
  promoteVersion: unsupported("版本提升"),
  changeAssetVisibility: unsupported("可见性变更"),
  refreshModule: unsupported("模块刷新"),
  upgradeModule: unsupported("模块升级"),
  saveSchedule: unsupported("调度保存"),
  planLayout: async () => ({ source: "LOCAL", intents: [], message: "使用本地排版" })
};

function Harness() {
  const [record, setRecord] = useState(initialRecord);
  const [smartOpen, setSmartOpen] = useState(true);
  const [liveSchema, setLiveSchema] = useState<DashboardSchema | null>(null);
  const handleRef = useRef<DashboardDesignerHandle | null>(null);

  const persist = (status: DashboardRecord["status"]) => async (schema: DashboardSchema, expectedRevision: number) => {
    const next: DashboardRecord = { ...record, schema, status, revision: expectedRevision + 1, updatedAt: new Date().toISOString() };
    setRecord(next);
    return next;
  };

  return (
    <section className={`dashboard-studio-page${smartOpen ? " dashboard-studio-page--smart" : ""}`} aria-label="智享大屏预览">
      <div className="dashboard-studio-page__designer">
        <DashboardDesignerIsland
          record={record}
          saveDraft={persist("draft")}
          publishDashboard={persist("published")}
          dataActions={dataActions}
          initialSmartPanelOpen
          onSmartPanelToggle={setSmartOpen}
          onHandle={(handle) => { handleRef.current = handle; }}
          onChange={setLiveSchema}
          onExit={() => undefined}
        />
      </div>
      {smartOpen ? (
        <SmartDashboardPanel
          schema={liveSchema ?? record.schema}
          getSchema={() => handleRef.current?.getSchema() ?? liveSchema ?? record.schema}
          applySchema={async (schema, notice) => {
            const handle = handleRef.current;
            if (!handle) throw new Error("设计器尚未就绪");
            await handle.applySchema(schema, notice);
          }}
          listAssets={dataActions.listAssets}
          previewAsset={(assetId) => dataActions.previewAsset(assetId)}
          initialBrief={params.get("brief") ?? undefined}
          initialAssetIds={params.get("assets")?.split(",").filter(Boolean)}
          onClose={() => {
            setSmartOpen(false);
            handleRef.current?.setSmartPanelOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConfigProvider button={{ autoInsertSpace: false }} locale={zhCN} theme={antdTheme}>
      <Harness />
    </ConfigProvider>
  </StrictMode>
);
