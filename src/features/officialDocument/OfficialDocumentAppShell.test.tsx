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
  path = "/writing/templates",
  options: { state?: { from?: unknown }; chrome?: OfficialDocumentAppChrome & { actionLabel?: string } } = {}
) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: path, state: options.state }]}>
      <OfficialDocumentAppShell>
        <ChromeProbe
          stage={options.chrome?.stage ?? "library"}
          context={options.chrome?.context ?? "模板库"}
          contextDetail={options.chrome?.contextDetail}
          actionLabel={options.chrome?.actionLabel}
        />
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

  it("exposes templates and draft management from the writing stage", () => {
    render(
      <MemoryRouter initialEntries={["/writing"]}>
        <OfficialDocumentAppShell>
          <ChromeProbe stage="compose" context="公文写作" />
        </OfficialDocumentAppShell>
      </MemoryRouter>
    );

    const navigation = screen.getByRole("navigation", { name: "公文导航" });
    expect(within(navigation).getByRole("link", { name: "公文写作" })).toHaveAttribute("aria-current", "page");
    expect(within(navigation).getByRole("link", { name: "格式模板" })).toHaveAttribute("href", "/writing/templates");
    expect(within(navigation).getByRole("link", { name: "草稿管理" })).toHaveAttribute("href", "/writing/drafts");
    expect(screen.queryByRole("heading", { name: "报告智写" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "返回星数" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("报告智写工作台")).toBeInTheDocument();
  });

  it("keeps the active list discoverable in the shared writing navigation", () => {
    renderShell("/writing/templates");

    const navigation = screen.getByRole("navigation", { name: "公文导航" });
    expect(within(navigation).getByRole("link", { name: "公文写作" })).toHaveAttribute("href", "/writing");
    expect(within(navigation).getByRole("link", { name: "格式模板" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "返回星数" })).not.toBeInTheDocument();
  });

  it("updates the slim header context for template structure and draft canvas", async () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={["/writing/templates/template-1"]}>
        <OfficialDocumentAppShell>
          <ChromeProbe stage="template" context="季度工作通知" contextDetail="版本 v2" actionLabel="按模板新建草稿" />
        </OfficialDocumentAppShell>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(document.querySelector(".official-document-app__context-title")).toHaveTextContent("季度工作通知");
    });
    expect(screen.getByText("版本 v2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回格式模板" })).toHaveAttribute("href", "/writing/templates");
    await waitFor(() => {
      expect(document.querySelector(".official-document-app__actions")).toContainElement(
        screen.getByRole("button", { name: "按模板新建草稿" })
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
    expect(within(screen.getByRole("banner")).getByRole("link", { name: "返回草稿管理" })).toHaveAttribute("href", "/writing/drafts");
    expect(screen.getByText("通知模板 · 文件版本 v1")).toBeInTheDocument();
  });

  /*
   * 写作台常驻后不再随路由重挂，它那次声明不会因为回到 /writing 就重放。
   * 壳层认声明时的路径，才不会把别的页面的标题留在页头上。
   */
  it("ignores a header declared for another path", async () => {
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
    const navigation = screen.getByRole("navigation", { name: "公文导航" });
    expect(within(navigation).getByRole("link", { name: "格式模板" })).toHaveAttribute("aria-current", "page");
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
        <ChromeProbe stage="library" context="模板库" actionLabel="上传模板" />
      </MemoryRouter>
    );

    const action = screen.getByRole("button", { name: "上传模板" });
    expect(action.closest(".official-document-app__actions--inline")).not.toBeNull();
  });

});
