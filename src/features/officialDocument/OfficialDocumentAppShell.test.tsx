import { render, screen, waitFor, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import {
  OfficialDocumentAppActions,
  OfficialDocumentAppShell,
  useOfficialDocumentAppChrome,
  type OfficialDocumentAppChrome
} from "./OfficialDocumentAppShell";

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

  it("gives the writing stage no navigation rail and no page header", () => {
    render(
      <MemoryRouter initialEntries={["/writing"]}>
        <OfficialDocumentAppShell>
          <ChromeProbe stage="compose" context="公文写作" />
        </OfficialDocumentAppShell>
      </MemoryRouter>
    );

    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "报告智写" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "返回星数" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("报告智写工作台")).toBeInTheDocument();
  });

  it("gives list and detail stages a slim header that leads back to writing", async () => {
    renderShell("/writing/templates");

    const banner = screen.getByRole("banner");
    expect(within(banner).getByRole("link", { name: "返回公文写作" })).toHaveAttribute("href", "/writing");
    expect(screen.queryByRole("link", { name: "返回星数" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(document.querySelector(".official-document-app__context-title")).toHaveTextContent("模板库");
    });
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
    expect(within(screen.getByRole("banner")).getByRole("link", { name: "返回公文写作" })).toBeInTheDocument();
    expect(screen.getByText("通知模板 · 文件版本 v1")).toBeInTheDocument();
  });

});
