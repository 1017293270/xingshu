import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import {
  OfficialDocumentAppActions,
  OfficialDocumentAppShell,
  resolveOfficialDocumentExitPath,
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
  it("only allows safe in-app exit paths", () => {
    expect(resolveOfficialDocumentExitPath(undefined)).toBe("/");
    expect(resolveOfficialDocumentExitPath("/dashboard")).toBe("/dashboard");
    expect(resolveOfficialDocumentExitPath("/ask-data?q=1#hit")).toBe("/ask-data?q=1#hit");
    expect(resolveOfficialDocumentExitPath("/login")).toBe("/");
    expect(resolveOfficialDocumentExitPath("/welcome")).toBe("/");
    expect(resolveOfficialDocumentExitPath("/writing")).toBe("/");
    expect(resolveOfficialDocumentExitPath("/writing/drafts/1")).toBe("/");
    expect(resolveOfficialDocumentExitPath("//evil.example")).toBe("/");
    expect(resolveOfficialDocumentExitPath("https://evil.example/")).toBe("/");
  });

  it("separates the template library and draft box in the side navigation", () => {
    renderShell("/writing/templates");

    const navigation = screen.getByRole("navigation", { name: "公文写作导航" });
    const templateLink = within(navigation).getByRole("link", { name: /模板库/ });
    const draftLink = within(navigation).getByRole("link", { name: /草稿箱/ });

    expect(templateLink).toHaveAttribute("href", "/writing/templates");
    expect(templateLink).toHaveAttribute("aria-current", "page");
    expect(draftLink).toHaveAttribute("href", "/writing/drafts");
    expect(draftLink).not.toHaveAttribute("aria-current");
  });

  it("marks the draft box as current on draft routes", () => {
    renderShell("/writing/drafts", { chrome: { stage: "drafts", context: "草稿箱" } });

    const navigation = screen.getByRole("navigation", { name: "公文写作导航" });
    expect(within(navigation).getByRole("link", { name: /草稿箱/ })).toHaveAttribute("aria-current", "page");
    expect(within(navigation).getByRole("link", { name: /模板库/ })).not.toHaveAttribute("aria-current");
  });

  it("shows the library context without a redundant page-header shortcut", async () => {
    renderShell("/writing/templates");

    expect(screen.getByRole("heading", { name: "公文写作" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回星数" })).toHaveAttribute("href", "/");
    expect(screen.getByLabelText("公文写作工作台")).toBeInTheDocument();
    expect(within(screen.getByRole("banner")).queryByRole("link", { name: "模板库" })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(document.querySelector(".official-document-app__context-title")).toHaveTextContent("模板库");
    });
    expect(screen.getByText("Agent 应用")).toBeInTheDocument();
  });

  it("updates the top-bar context for template calibration and draft canvas", async () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={["/writing/templates/template-1"]}>
        <OfficialDocumentAppShell>
          <ChromeProbe stage="template" context="季度工作通知" contextDetail="版本 v2" actionLabel="发布模板" />
        </OfficialDocumentAppShell>
      </MemoryRouter>
    );

    expect(within(screen.getByRole("banner")).getByRole("link", { name: "模板库" })).toHaveAttribute(
      "href",
      "/writing/templates"
    );
    await waitFor(() => {
      expect(document.querySelector(".official-document-app__context-title")).toHaveTextContent("季度工作通知");
    });
    expect(screen.getByText("模板校准")).toBeInTheDocument();
    expect(screen.getByText("版本 v2")).toBeInTheDocument();
    await waitFor(() => {
      expect(document.querySelector(".official-document-app__actions")).toContainElement(
        screen.getByRole("button", { name: "发布模板" })
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
    expect(within(screen.getByRole("banner")).getByRole("link", { name: "草稿箱" })).toHaveAttribute(
      "href",
      "/writing/drafts"
    );
    expect(screen.getByText("结构化起草")).toBeInTheDocument();
    expect(screen.getByText("通知模板 · 文件版本 v1")).toBeInTheDocument();
  });

  it("returns to the safe origin page recorded in location state", () => {
    renderShell("/writing/templates", { state: { from: "/dashboard" } });
    expect(screen.getByRole("link", { name: "返回星数" })).toHaveAttribute("href", "/dashboard");
  });
});
