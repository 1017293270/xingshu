import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useParams } from "react-router";
import { describe, expect, it } from "vitest";
import { AppProviders } from "@/app/providers";
import { DraftDetailView } from "./DraftDetailView";
import { TemplateDetailView } from "./TemplateDetailView";

function TemplateDetailRoute() {
  const { templateId = "" } = useParams();
  return <TemplateDetailView templateId={templateId} />;
}

function DraftDetailRoute() {
  const { draftId = "" } = useParams();
  return <DraftDetailView draftId={draftId} />;
}

function renderTemplateDetail(templateId: string) {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[`/writing/templates/${templateId}`]}>
        <Routes>
          <Route path="/writing/templates/:templateId" element={<TemplateDetailRoute />} />
          <Route path="/writing/drafts/:draftId" element={<DraftDetailRoute />} />
        </Routes>
      </MemoryRouter>
    </AppProviders>
  );
}

describe("TemplateDetailView", () => {
  it("keeps demo calibration locked while allowing an explicitly non-persistent draft preview", async () => {
    const user = userEvent.setup();
    renderTemplateDetail("template-demo-work-report");

    expect(await screen.findByRole("heading", { name: "工作情况报告（功能示例）", level: 1 })).toBeInTheDocument();
    const createDraft = screen.getByRole("button", { name: "按模板新建草稿" });
    expect(createDraft).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "段落 1 公文角色" })).toBeDisabled();
    expect(screen.getByLabelText("原稿版式预览")).toBeInTheDocument();
    expect(screen.getByText("格式保真与发布风险")).toBeInTheDocument();
    expect(screen.getByText("Word 引擎未配置")).toBeInTheDocument();
    expect(screen.queryByText(/^slot /)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Word 引擎能力")).not.toBeInTheDocument();
    expect(screen.queryByText("空段落（保留格式）")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "显示 1 个空段落" }));
    expect(screen.getByText("空段落（保留格式）")).toBeInTheDocument();

    await user.click(createDraft);
    expect(screen.getByRole("dialog", { name: "从模板创建公文草稿" })).toBeInTheDocument();
    expect(screen.getByText("当前不会生成或保存真实 DOCX。")).toBeInTheDocument();
  });

  it("creates a local preview draft and navigates to its draft detail page", async () => {
    const user = userEvent.setup();
    renderTemplateDetail("template-demo-work-report");

    await user.click(await screen.findByRole("button", { name: "按模板新建草稿" }));
    await user.click(screen.getByRole("button", { name: "创建本地预演" }));

    expect(await screen.findByRole("heading", { name: /工作情况报告 - 新草稿/, level: 1 })).toBeInTheDocument();
    expect(screen.getByText("已建立本地草稿预演；未保存真实文件。")).toBeInTheDocument();
  });

  it("shows a not-found state with a way back for an unknown template id", async () => {
    renderTemplateDetail("template-missing");

    expect(await screen.findByText("未找到该公文模板")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回智能写作列表" })).toHaveAttribute("href", "/writing");
  });
});
