import { render, screen, waitFor, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import {
  OfficialDocumentAppActions,
  OfficialDocumentAppShell,
  useOfficialDocumentAppChrome,
  type OfficialDocumentAppChrome
} from "./OfficialDocumentAppShell";
import { useOfficialDocumentShellStore } from "./officialDocumentShellStore";

function ChromeProbe({ stage, context, contextDetail, actionLabel }: OfficialDocumentAppChrome & { actionLabel?: string }) {
  useOfficialDocumentAppChrome({ stage, context, contextDetail });
  return (
    <OfficialDocumentAppActions>
      {actionLabel ? <button type="button">{actionLabel}</button> : null}
    </OfficialDocumentAppActions>
  );
}

function renderShell(
  path: string,
  chrome: OfficialDocumentAppChrome & { actionLabel?: string },
  state?: unknown
) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: path, state }]}>
      <OfficialDocumentAppShell>
        <ChromeProbe {...chrome} />
      </OfficialDocumentAppShell>
    </MemoryRouter>
  );
}

describe("OfficialDocumentAppShell", () => {
  beforeEach(() => {
    useOfficialDocumentShellStore.setState({ chrome: null, actionsHost: null });
  });

  it("does not flash top-bar actions in the workspace before the portal host mounts", () => {
    const html = renderToString(
      <MemoryRouter initialEntries={["/writing/drafts/draft-1"]}>
        <OfficialDocumentAppShell>
          <ChromeProbe stage="draft" context="结构化起草" actionLabel="导出 PDF" />
        </OfficialDocumentAppShell>
      </MemoryRouter>
    );

    expect(html).not.toContain("导出 PDF");
    expect(html).not.toContain("official-document-app__actions--inline");
  });

  /* 入口首页和会话页都不要页头：模板和文稿的入口在输入框底下，二级导航已经撤掉。 */
  it.each(["/writing", "/writing/session"])("renders no header or secondary navigation on %s", (path) => {
    renderShell(path, { stage: "compose", context: "公文写作" });

    expect(document.querySelector(".official-document-app")).toHaveAttribute("data-stage", "compose");
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "格式模板" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("报告智写工作台")).toBeInTheDocument();
  });

  it("gives list pages a thin header that returns to the writing home", async () => {
    renderShell("/writing/drafts", { stage: "drafts", context: "我的文稿", actionLabel: "新建文稿" });

    const header = screen.getByRole("banner");
    const back = within(header).getByRole("link", { name: "返回公文写作" });
    expect(back).toHaveAttribute("href", "/writing");
    expect(back).toHaveClass("xs-action-link");
    expect(within(header).getByRole("heading", { level: 1, name: "我的文稿" })).toBeInTheDocument();
    await waitFor(() => {
      expect(document.querySelector(".official-document-app__actions")).toContainElement(
        screen.getByRole("button", { name: "新建文稿" })
      );
    });
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("returns detail pages to their own list, and carries the page actions", async () => {
    const { rerender } = renderShell("/writing/templates/template-1", {
      stage: "template",
      context: "季度工作通知",
      contextDetail: "版本 v2",
      actionLabel: "按此结构新建文稿"
    });

    await waitFor(() => {
      expect(document.querySelector(".official-document-app__context-title")).toHaveTextContent("季度工作通知");
    });
    expect(screen.getByText("版本 v2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回模板库" })).toHaveAttribute("href", "/writing/templates");
    await waitFor(() => {
      expect(document.querySelector(".official-document-app__actions")).toContainElement(
        screen.getByRole("button", { name: "按此结构新建文稿" })
      );
    });

    rerender(
      <MemoryRouter initialEntries={["/writing/drafts/draft-1"]}>
        <OfficialDocumentAppShell>
          <ChromeProbe stage="draft" context="关于联调进展的通报" contextDetail="通知模板 · 文件版本 v1" actionLabel="导出 PDF" />
        </OfficialDocumentAppShell>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(document.querySelector(".official-document-app__context-title")).toHaveTextContent("关于联调进展的通报");
    });
    expect(within(screen.getByRole("banner")).getByRole("link", { name: "返回我的文稿" })).toHaveAttribute("href", "/writing/drafts");
    expect(screen.getByText("通知模板 · 文件版本 v1")).toBeInTheDocument();
  });

  /* 从写作台的模板弹窗点进详情，细头部原路回写作台，而不是绕去模板库。 */
  it("sends detail pages opened from the composer back to the composer", () => {
    renderShell(
      "/writing/templates/template-1",
      { stage: "template", context: "季度工作通知" },
      { returnTo: "/writing/session" }
    );

    expect(screen.getByRole("link", { name: "返回公文写作" })).toHaveAttribute("href", "/writing/session");
  });

  it("ignores a return path that is not a writing page", () => {
    renderShell(
      "/writing/drafts/draft-1",
      { stage: "draft", context: "关于联调进展的通报" },
      { returnTo: "https://example.com" }
    );

    expect(screen.getByRole("link", { name: "返回我的文稿" })).toHaveAttribute("href", "/writing/drafts");
  });

  /*
   * 写作台常驻后不再随路由重挂，它那次声明不会因为回到 /writing 就重放。
   * 壳层认声明时的路径，才不会把别的页面的标题留在页头上。
   */
  it("ignores a header declared for another path", () => {
    useOfficialDocumentShellStore.getState().setChrome({
      stage: "compose",
      context: "公文写作",
      path: "/writing"
    });

    render(
      <MemoryRouter initialEntries={["/writing/templates"]}>
        <OfficialDocumentAppShell>
          <div />
        </OfficialDocumentAppShell>
      </MemoryRouter>
    );

    expect(document.querySelector(".official-document-app")).toHaveAttribute("data-stage", "library");
    expect(screen.getByRole("heading", { level: 1, name: "模板库" })).toBeInTheDocument();
  });

  it("uses the header the current path declared", () => {
    useOfficialDocumentShellStore.getState().setChrome({
      stage: "compose",
      context: "公文写作",
      path: "/writing"
    });

    render(
      <MemoryRouter initialEntries={["/writing"]}>
        <OfficialDocumentAppShell>
          <div />
        </OfficialDocumentAppShell>
      </MemoryRouter>
    );

    expect(document.querySelector(".official-document-app")).toHaveAttribute("data-stage", "compose");
  });

  it("renders actions inline when no shell is around them", () => {
    render(
      <MemoryRouter initialEntries={["/writing/templates"]}>
        <ChromeProbe stage="library" context="模板库" actionLabel="新建模板" />
      </MemoryRouter>
    );

    const action = screen.getByRole("button", { name: "新建模板" });
    expect(action.closest(".official-document-app__actions--inline")).not.toBeNull();
  });
});
