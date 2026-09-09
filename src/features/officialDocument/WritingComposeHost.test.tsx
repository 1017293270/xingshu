import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import { WritingPage } from "@/pages/WritingPage";
import { WritingSessionPage } from "@/pages/WritingSessionPage";
import { WritingComposeHost } from "./WritingComposeHost";
import {
  adoptWritingComposeNode,
  getWritingComposeNode,
  releaseWritingComposeNode,
  resetWritingComposeNodeForTests,
  useWritingComposeHostStore
} from "./writingComposeNode";
import { useWritingJobStore } from "./writingJobStore";

/* 常驻宿主本身才是被测对象，写作台内容换成能数挂载次数的替身。 */
const mounts = vi.hoisted(() => ({ count: 0 }));

vi.mock("./OfficialDocumentComposeView", async () => {
  const { useEffect } = await import("react");
  return {
    OfficialDocumentComposeView: () => {
      useEffect(() => {
        mounts.count += 1;
      }, []);
      return <div data-testid="compose-view">写作台</div>;
    }
  };
});

function PathProbe() {
  const location = useLocation();
  return <span data-testid="path">{location.pathname}</span>;
}

function renderApp(initialPath = "/writing") {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[initialPath]}>
        <PathProbe />
        <Link to="/writing">去写作首页</Link>
        <Link to="/writing/session">去会话页</Link>
        <Link to="/table">去制表</Link>
        {/* 真实结构里路由视图按路径整块重挂，槽位跟着生灭 */}
        <Routes>
          <Route path="/writing" element={<WritingPage />} />
          <Route path="/writing/session" element={<WritingSessionPage />} />
          <Route path="/table" element={<div>制表</div>} />
        </Routes>
        <WritingComposeHost />
      </MemoryRouter>
    </AppProviders>
  );
}

describe("WritingComposeHost", () => {
  beforeEach(() => {
    mounts.count = 0;
    useWritingJobStore.getState().reset();
    useWritingComposeHostStore.getState().stop();
    resetWritingComposeNodeForTests();
  });

  afterEach(() => {
    resetWritingComposeNodeForTests();
  });

  it("does not start the writing pipeline before the user opens the compose page", async () => {
    render(
      <AppProviders>
        <MemoryRouter initialEntries={["/table"]}>
          <Routes>
            <Route path="/table" element={<div>制表</div>} />
          </Routes>
          <WritingComposeHost />
        </MemoryRouter>
      </AppProviders>
    );

    expect(screen.queryByTestId("compose-view")).not.toBeInTheDocument();
    expect(mounts.count).toBe(0);
  });

  it("keeps the compose view mounted across leaving and coming back", async () => {
    const user = userEvent.setup();
    renderApp();

    await waitFor(() => expect(screen.getByTestId("compose-view")).toBeInTheDocument());
    expect(mounts.count).toBe(1);
    const node = getWritingComposeNode();
    expect(node).not.toBeNull();
    expect(document.querySelector(".official-document-compose-slot")).toContainElement(node);

    /* 离开写作台：节点收回停放区，React 子树不卸载，生成过程不断 */
    await user.click(screen.getByRole("link", { name: "去制表" }));
    await waitFor(() => expect(screen.getByText("制表")).toBeInTheDocument());
    expect(document.querySelector(".official-document-compose-slot")).toBeNull();
    expect(getWritingComposeNode()).toBe(node);
    expect(screen.getByTestId("compose-view")).toBeInTheDocument();
    expect(mounts.count).toBe(1);

    /* 回来：还是同一个节点被搬回槽位，没有第二次挂载 */
    await user.click(screen.getByRole("link", { name: "去写作首页" }));
    await waitFor(() => {
      expect(document.querySelector(".official-document-compose-slot")).toContainElement(node);
    });
    expect(mounts.count).toBe(1);
  });

  /* 入口分层之后首页和会话页是两条路由，写作台却只能有一份。 */
  it("hands the same node between the entry page and the session page", async () => {
    const user = userEvent.setup();
    renderApp("/writing");

    await waitFor(() => expect(screen.getByTestId("compose-view")).toBeInTheDocument());
    const node = getWritingComposeNode();
    expect(useWritingComposeHostStore.getState().face).toBe("home");

    await user.click(screen.getByRole("link", { name: "去会话页" }));
    await waitFor(() => expect(screen.getByTestId("path")).toHaveTextContent("/writing/session"));
    expect(document.querySelector(".official-document-compose-slot")).toContainElement(node);
    expect(useWritingComposeHostStore.getState().face).toBe("session");

    await user.click(screen.getByRole("link", { name: "去制表" }));
    await waitFor(() => expect(screen.getByText("制表")).toBeInTheDocument());
    expect(useWritingComposeHostStore.getState().face).toBeNull();

    await user.click(screen.getByRole("link", { name: "去写作首页" }));
    await waitFor(() => expect(useWritingComposeHostStore.getState().face).toBe("home"));
    expect(document.querySelector(".official-document-compose-slot")).toContainElement(node);
    /* 全程只挂载过一次：两页只是槽位，写作台没被拆过 */
    expect(mounts.count).toBe(1);
  });

  it("adopts and releases the node idempotently", () => {
    const first = document.createElement("div");
    const second = document.createElement("div");
    document.body.append(first, second);

    const node = adoptWritingComposeNode(first);
    expect(adoptWritingComposeNode(first)).toBe(node);
    expect(first.contains(node)).toBe(true);

    adoptWritingComposeNode(second);
    expect(second.contains(node)).toBe(true);
    expect(first.contains(node)).toBe(false);

    /* 还没有停放区时释放不该抛错，也不该把节点丢掉 */
    releaseWritingComposeNode();
    releaseWritingComposeNode();
    expect(getWritingComposeNode()).toBe(node);

    first.remove();
    second.remove();
  });

  it("announces a finished document with a link into the session page when the user is elsewhere", async () => {
    const user = userEvent.setup();
    renderApp("/table");

    useWritingJobStore.getState().reportResult("turn-1", "关于开展安全检查的通知");

    const alert = await screen.findByText("公文已生成");
    expect(alert).toBeInTheDocument();
    expect(screen.getByText(/关于开展安全检查的通知/)).toBeInTheDocument();
    expect(useWritingJobStore.getState().lastResult).toMatchObject({ notified: true, seen: false });

    await user.click(screen.getByRole("button", { name: "查看" }));
    await waitFor(() => expect(screen.getByTestId("path")).toHaveTextContent("/writing/session"));
  });

  it("stays quiet and leaves no unread mark when the document lands in front of the user", async () => {
    renderApp("/writing/session");
    await waitFor(() => expect(screen.getByTestId("compose-view")).toBeInTheDocument());

    useWritingJobStore.getState().reportResult("turn-1", "关于开展安全检查的通知");

    await waitFor(() => {
      expect(useWritingJobStore.getState().lastResult).toMatchObject({ seen: true, notified: true });
    });
    expect(screen.queryByText("公文已生成")).not.toBeInTheDocument();
  });

  /* 首页看不到成稿，只有一条提示条：不打扰，但也不能算看过。 */
  it("leaves the entry page to its own notice instead of a toast", async () => {
    renderApp("/writing");
    await waitFor(() => expect(screen.getByTestId("compose-view")).toBeInTheDocument());

    useWritingJobStore.getState().reportResult("turn-1", "关于开展安全检查的通知");

    await waitFor(() => {
      expect(useWritingJobStore.getState().lastResult).toMatchObject({ notified: true });
    });
    expect(screen.queryByText("公文已生成")).not.toBeInTheDocument();
    expect(useWritingJobStore.getState().lastResult).toMatchObject({ seen: false });
  });

  /*
   * 路由是用 transition 提交的，旧路由要等新路由准备好才卸载。成稿正好落在这个窗口里时，
   * 「写作台还在眼前吗」会答出过期的 true —— 提醒不能因此被吞掉。
   */
  it("still announces when the compose page is on its way out as the document lands", async () => {
    const user = userEvent.setup();
    renderApp("/writing/session");
    await waitFor(() => expect(screen.getByTestId("compose-view")).toBeInTheDocument());

    useWritingJobStore.getState().reportResult("turn-1", "关于开展安全检查的通知");
    await user.click(screen.getByRole("link", { name: "去制表" }));
    await waitFor(() => expect(screen.getByText("制表")).toBeInTheDocument());

    await screen.findByText("公文已生成");
    expect(useWritingJobStore.getState().lastResult).toMatchObject({ seen: false, notified: true });
  });

  it("only announces a given result once", async () => {
    renderApp("/table");

    useWritingJobStore.getState().reportResult("turn-1", "第一稿");
    await screen.findByText("公文已生成");
    /* 标题晚到时会重报同一轮：不能再弹第二条 */
    useWritingJobStore.getState().reportResult("turn-1", "关于开展安全检查的通知");

    await waitFor(() => expect(screen.getAllByText("公文已生成")).toHaveLength(1));
  });
});
