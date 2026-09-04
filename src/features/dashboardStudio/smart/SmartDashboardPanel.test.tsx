import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBlankDashboard } from "@/services/dashboardGenerationService";
import { streamDashboardDesign } from "@/services/dashboardDesignService";
import { standardDesignData } from "@/test/dashboardDesignFixtures";
import type { DashboardDesignSpec } from "@/types/dashboardDesign";
import { SmartDashboardPanel } from "./SmartDashboardPanel";

vi.mock("@/services/dashboardDesignService", () => ({
  streamDashboardDesign: vi.fn()
}));

const streamMock = vi.mocked(streamDashboardDesign);
const data = standardDesignData();
const assets = Object.values(data).map((entry) => entry.asset);
const spec: DashboardDesignSpec = {
  narrative: "",
  title: "营收驾驶舱",
  themeId: "xingshu-ice",
  archetype: "kpi-led",
  widgets: [
    { ref: "total", role: "kpi", assetId: "asset-total", outputKey: "total", metricKey: "total", valueMode: "first", title: "订单总数" },
    {
      ref: "trend",
      role: "trend",
      assetId: "asset-revenue",
      outputKey: "monthly",
      variant: "line-smooth",
      dimensionKey: "month",
      metricKeys: ["revenue"],
      title: "月度营收趋势"
    }
  ]
};

function renderPanel(overrides: Partial<Parameters<typeof SmartDashboardPanel>[0]> = {}) {
  const schema = createBlankDashboard({ title: "空板" });
  const applySchema = vi.fn(async () => undefined);
  const onClose = vi.fn();
  const view = render(
    <SmartDashboardPanel
      schema={schema}
      getSchema={() => schema}
      applySchema={applySchema}
      listAssets={async () => assets}
      previewAsset={async (assetId) => data[assetId]!.execution}
      initialAssetIds={["asset-total", "asset-revenue"]}
      onClose={onClose}
      {...overrides}
    />
  );
  return { ...view, applySchema, onClose };
}

describe("SmartDashboardPanel", () => {
  beforeEach(() => {
    streamMock.mockReset();
    streamMock.mockImplementation((_kind, _request, handlers) => {
      queueMicrotask(() => {
        handlers.onEvent({ type: "message", delta: "先给合计，再放趋势。" });
        handlers.onEvent({ type: "spec", spec });
        handlers.onDone?.();
      });
      return new AbortController();
    });
  });

  it("sends a brief, renders the narrative and candidate card, and applies it", async () => {
    const user = userEvent.setup();
    const { applySchema } = renderPanel();

    expect(screen.getByRole("complementary", { name: "智享大屏" })).toBeInTheDocument();
    await screen.findByText("已选 2 份");

    await user.type(screen.getByLabelText("设计需求"), "做一块营收驾驶舱");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("先给合计，再放趋势。")).toBeInTheDocument();
    const card = await screen.findByRole("article", { name: "智享候选方案" });
    expect(card).toHaveTextContent("营收驾驶舱");
    expect(card).toHaveTextContent("指标总览");

    await user.click(screen.getByRole("button", { name: "应用" }));
    await waitFor(() => expect(applySchema).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("已应用到画布")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "换个方向" })).toBeInTheDocument();
  });

  it("auto-starts the first design turn from an entry-page handoff", async () => {
    renderPanel({ initialBrief: "面向经营例会的营收总览", initialAssetIds: ["asset-total"] });

    expect(await screen.findByText("面向经营例会的营收总览")).toBeInTheDocument();
    await waitFor(() => expect(streamMock).toHaveBeenCalledWith("generate", expect.objectContaining({
      brief: "面向经营例会的营收总览"
    }), expect.anything()));
    expect(await screen.findByRole("article", { name: "智享候选方案" })).toBeInTheDocument();
  });

  it("模型没参与时在候选卡顶部说明这是本地兜底版并给出排查方向", async () => {
    const user = userEvent.setup();
    streamMock.mockImplementation((_kind, _request, handlers) => {
      queueMicrotask(() => handlers.onError?.(new Error("Not Found")));
      return new AbortController();
    });
    renderPanel();

    await screen.findByText("已选 2 份");
    await user.type(screen.getByLabelText("设计需求"), "帮我设计个企业级的大屏");
    await user.click(screen.getByRole("button", { name: "发送" }));

    const card = await screen.findByRole("article", { name: "智享候选方案" });
    expect(card).toHaveTextContent("模型未参与本次设计：Not Found");
    expect(card).toHaveTextContent("/api/v1/dashboard-design");
    // 指令式需求不当标题条，走资产主题
    expect(card).toHaveTextContent("订单合计总览");
    expect(card.querySelector(".smart-design-card__head")).not.toHaveTextContent("帮我设计个企业级的大屏");
  });

  it("closes through the header button", async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel();

    await user.click(screen.getByRole("button", { name: "关闭智享面板" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
