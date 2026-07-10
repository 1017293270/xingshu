import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppProviders } from "@/app/providers";
import {
  createMockCloudService,
  type CloudOperationObserver,
  type CloudOperationResult,
  type CloudService
} from "@/services/cloudService";
import { CloudPage } from "./CloudPage";
import { DashboardPage } from "./DashboardPage";

function renderPage(page: React.ReactElement) {
  return render(
    <AppProviders>
      <MemoryRouter>{page}</MemoryRouter>
    </AppProviders>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

describe("dashboard and cloud page actions", () => {
  it("renders the restored dashboard header and eight compact widgets", () => {
    renderPage(<DashboardPage />);

    expect(screen.getByText("经营分析全景看板")).toBeInTheDocument();
    expect(screen.getByText(/近 12 个月 · 12 个指标 · 8 个组件 · 更新于今日 14:30/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "看板市场" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "新建看板" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "编辑" })).toBeInTheDocument();
    expect(screen.getAllByText("即将开放")).toHaveLength(2);
    expect(screen.getAllByRole("article", { name: /看板组件：/ })).toHaveLength(8);
    expect(screen.getByText("在线用户")).toBeInTheDocument();
    expect(screen.queryByLabelText("实时运营柱状图")).not.toBeInTheDocument();
  });

  it("marks dashboard switching as unavailable without reporting false success", () => {
    renderPage(<DashboardPage />);

    expect(screen.getByText("经营分析看板")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "切换看板" })).toBeDisabled();
    expect(screen.queryByText("风险监控看板")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("exposes a chart conclusion and its source data", async () => {
    const user = userEvent.setup();
    renderPage(<DashboardPage />);
    const revenueCard = screen.getByRole("article", { name: "看板组件：月度营收趋势" });

    expect(within(revenueCard).getByText(/12 月营收指数回升至 94/)).toBeInTheDocument();
    expect(within(revenueCard).getByRole("img", { name: /月度营收趋势.*12 月营收指数/ })).toBeInTheDocument();
    await user.click(within(revenueCard).getByText("查看数据"));

    const sourceTable = within(revenueCard).getByRole("table", { name: "月度营收趋势数据" });
    expect(within(sourceTable).getByRole("columnheader", { name: "月份" })).toHaveAttribute("scope", "col");
    expect(within(sourceTable).getByRole("cell", { name: "12月" })).toBeInTheDocument();
  });

  it("does not create a dashboard task while the feature is unavailable", () => {
    renderPage(<DashboardPage />);

    expect(screen.getByRole("button", { name: "新建看板" })).toBeDisabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("marks unavailable dashboard card details without reporting false success", () => {
    renderPage(<DashboardPage />);

    expect(screen.getByRole("button", { name: "查看 月度营收趋势" })).toBeDisabled();
    expect(screen.getByText(/组件详情即将开放/)).toBeInTheDocument();
    expect(screen.queryByText(/已打开看板组件/)).not.toBeInTheDocument();
  });

  it("handles warning alerts without treating completed records as pending", async () => {
    const user = userEvent.setup();
    renderPage(<DashboardPage />);

    expect(screen.getByText("2条未处理")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /数据同步已完成/ })).not.toBeInTheDocument();
    expect(screen.getByText("1小时前 · 已完成")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "处理 销售额环比下降 12.3%" }));
    expect(screen.getByRole("status")).toHaveTextContent("已处理预警：销售额环比下降 12.3%");
    expect(screen.getByRole("button", { name: "已处理 销售额环比下降 12.3%" })).toBeDisabled();
    expect(screen.getByText("1条未处理")).toBeInTheDocument();
  });

  it("uploads a validated file and syncs its visible material state", async () => {
    const user = userEvent.setup();
    const service = createMockCloudService({
      wait: async () => undefined,
      now: () => "2026-07-10 23:36"
    });
    renderPage(<CloudPage service={service} />);

    expect(screen.getByText("企业资料工作台")).toBeInTheDocument();
    expect(screen.queryByText(/adapter|内部实现|数据适配层|尚未上传|正式后端接入前/)).not.toBeInTheDocument();
    expect(screen.getByText("6 GB")).toBeInTheDocument();
    expect(screen.getAllByRole("article", { name: /云盘资料：/ })).toHaveLength(3);

    const file = new File(["region,revenue"], "七月经营数据.csv", { type: "text/csv" });
    await user.upload(screen.getByLabelText("选择上传文件"), file);

    expect(await screen.findByRole("status")).toHaveTextContent("七月经营数据.csv 已上传");
    expect(within(screen.getByLabelText("云盘概览指标")).getByText("87")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "云盘资料：企业文件" })).getByText("2,347 份资料")).toBeInTheDocument();
    const uploadedRow = screen.getByText("七月经营数据.csv").closest(".cloud-recent__row");
    expect(uploadedRow).not.toBeNull();
    expect(within(uploadedRow as HTMLElement).getByText("待同步")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "同步知识库" }));

    expect(await screen.findByRole("status")).toHaveTextContent("知识库已同步");
    expect(screen.getByText("最近同步：2026-07-10 23:36")).toBeInTheDocument();
    expect(screen.getAllByText("已入库", { selector: ".ant-tag" }).length).toBeGreaterThanOrEqual(2);
  });

  it("shows an upload error without adding a failed file", async () => {
    const user = userEvent.setup();
    const service = createMockCloudService({
      wait: async () => undefined,
      shouldFail: (operation) => operation === "upload"
    });
    renderPage(<CloudPage service={service} />);

    const file = new File(["region,revenue"], "失败样例.csv", { type: "text/csv" });
    await user.upload(screen.getByLabelText("选择上传文件"), file);

    expect(await screen.findByRole("alert")).toHaveTextContent("失败样例.csv 上传失败，请重试");
    expect(screen.queryByText("失败样例.csv", { selector: ".cloud-recent__row strong" })).not.toBeInTheDocument();
  });

  it("keeps every cloud action locked while an upload is pending", async () => {
    const user = userEvent.setup();
    const seedService = createMockCloudService({ wait: async () => undefined });
    const request = deferred<CloudOperationResult>();
    let uploadObserver: CloudOperationObserver | undefined;
    const service: CloudService = {
      getSnapshot: seedService.getSnapshot,
      uploadFile: (_file, observer) => {
        uploadObserver = observer;
        observer?.({ operation: "upload", phase: "pending", progress: 0, message: "正在上传" });
        return request.promise;
      },
      syncKnowledgeBase: seedService.syncKnowledgeBase
    };
    renderPage(<CloudPage service={service} />);

    await user.upload(
      screen.getByLabelText("选择上传文件"),
      new File(["region,revenue"], "待上传.csv", { type: "text/csv" })
    );

    expect(screen.getByRole("button", { name: /上传文件/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "同步知识库" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "查看同步状态" })).toBeDisabled();

    await act(async () => {
      uploadObserver?.({ operation: "upload", phase: "success", progress: 100, message: "上传完成" });
      request.resolve({ ok: true, snapshot: seedService.getSnapshot() });
      await request.promise;
    });
    expect(screen.getByRole("button", { name: "上传文件" })).toBeEnabled();
  });

  it("maps a rejected cloud adapter request to a recoverable error", async () => {
    const user = userEvent.setup();
    const seedService = createMockCloudService({ wait: async () => undefined });
    const service: CloudService = {
      getSnapshot: seedService.getSnapshot,
      uploadFile: seedService.uploadFile,
      syncKnowledgeBase: async (observer) => {
        observer?.({ operation: "sync", phase: "pending", progress: 0, message: "正在同步" });
        throw new Error("network unavailable");
      }
    };
    renderPage(<CloudPage service={service} />);

    await user.click(screen.getByRole("button", { name: "同步知识库" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("知识库同步失败，请重试");
    expect(screen.getByRole("button", { name: "同步知识库" })).toBeEnabled();
  });

  it("maps an unsuccessful cloud result without a terminal observer update to an error", async () => {
    const user = userEvent.setup();
    const seedService = createMockCloudService({ wait: async () => undefined });
    const service: CloudService = {
      getSnapshot: seedService.getSnapshot,
      uploadFile: seedService.uploadFile,
      syncKnowledgeBase: async () => ({ ok: false, snapshot: seedService.getSnapshot() })
    };
    renderPage(<CloudPage service={service} />);

    await user.click(screen.getByRole("button", { name: "同步知识库" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("知识库同步失败，请重试");
    expect(screen.getByRole("button", { name: "同步知识库" })).toBeEnabled();
  });

  it("synthesizes a successful cloud terminal state when the observer is omitted", async () => {
    const user = userEvent.setup();
    const seedService = createMockCloudService({ wait: async () => undefined });
    const service: CloudService = {
      getSnapshot: seedService.getSnapshot,
      uploadFile: seedService.uploadFile,
      syncKnowledgeBase: async () => ({
        ok: true,
        snapshot: {
          ...seedService.getSnapshot(),
          lastSyncedAt: "2026-07-10 08:58",
          syncStatus: "已同步"
        }
      })
    };
    renderPage(<CloudPage service={service} />);

    await user.click(screen.getByRole("button", { name: "同步知识库" }));

    expect(await screen.findByRole("status")).toHaveTextContent("知识库已同步，更新时间 2026-07-10 08:58");
    expect(screen.getByRole("button", { name: "同步知识库" })).toBeEnabled();
  });

  it("ignores late observer updates from a completed cloud request", async () => {
    const user = userEvent.setup();
    const seedService = createMockCloudService({ wait: async () => undefined });
    const syncRequest = deferred<CloudOperationResult>();
    let uploadObserver: CloudOperationObserver | undefined;
    let syncObserver: CloudOperationObserver | undefined;
    const service: CloudService = {
      getSnapshot: seedService.getSnapshot,
      uploadFile: async (_file, observer) => {
        uploadObserver = observer;
        observer?.({ operation: "upload", phase: "success", progress: 100, message: "上传完成" });
        return { ok: true, snapshot: seedService.getSnapshot() };
      },
      syncKnowledgeBase: (observer) => {
        syncObserver = observer;
        observer?.({ operation: "sync", phase: "pending", progress: 0, message: "正在同步" });
        return syncRequest.promise;
      }
    };
    renderPage(<CloudPage service={service} />);

    await user.upload(
      screen.getByLabelText("选择上传文件"),
      new File(["region,revenue"], "已上传.csv", { type: "text/csv" })
    );
    await user.click(screen.getByRole("button", { name: "同步知识库" }));
    expect(screen.getByRole("status")).toHaveTextContent("正在同步");

    act(() => {
      uploadObserver?.({ operation: "upload", phase: "error", progress: 0, message: "过期上传错误" });
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("正在同步");

    await act(async () => {
      syncObserver?.({ operation: "sync", phase: "success", progress: 100, message: "同步完成" });
      syncRequest.resolve({ ok: true, snapshot: seedService.getSnapshot() });
      await syncRequest.promise;
    });
  });
});
