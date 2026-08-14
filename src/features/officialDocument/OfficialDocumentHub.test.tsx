import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useParams } from "react-router";
import { describe, expect, it } from "vitest";
import { AppProviders } from "@/app/providers";
import { OfficialDocumentHub } from "./OfficialDocumentHub";
import { TemplateDetailView } from "./TemplateDetailView";

function TemplateDetailRoute() {
  const { templateId = "" } = useParams();
  return <TemplateDetailView templateId={templateId} />;
}

function renderHub(initialPath = "/writing") {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/writing" element={<OfficialDocumentHub />} />
          <Route path="/writing/templates/:templateId" element={<TemplateDetailRoute />} />
        </Routes>
      </MemoryRouter>
    </AppProviders>
  );
}

describe("OfficialDocumentHub", () => {
  it("shows an honest unavailable state and lists demo templates and drafts as preview entries", async () => {
    renderHub();

    expect(screen.getByLabelText("公文写作工作台")).toBeInTheDocument();
    expect(screen.getByText("线上公文服务未接入")).toBeInTheDocument();
    expect(screen.getByText("当前只展示功能预演，不会上传、解析、保存或生成真实公文。")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "打开模板 工作情况报告（功能示例）" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /打开草稿 推进数据治理工作情况报告/ })).toBeInTheDocument();
    expect(screen.getByText("不可用")).toBeInTheDocument();
  });

  it("accepts a DOCX as a local preview entry and opens its detail page with an honest notice", async () => {
    const user = userEvent.setup();
    renderHub();
    await screen.findByRole("button", { name: "打开模板 工作情况报告（功能示例）" });

    const file = new File(["PK\u0003\u0004demo"], "专项工作通知.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      lastModified: 1_800_000_000_000
    });
    await user.upload(screen.getByTestId("official-document-template-file"), file);

    expect(await screen.findByRole("heading", { name: "专项工作通知", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("已建立本地预演条目；文件内容未读取、未上传，也未执行格式提取。")).toBeInTheDocument();
    expect(await screen.findByText("上传文件的正文不会在未配置状态下读取")).toBeInTheDocument();
  });

  it("navigates from a template card to the template detail page", async () => {
    const user = userEvent.setup();
    renderHub();

    await user.click(await screen.findByRole("button", { name: "打开模板 工作情况报告（功能示例）" }));

    expect(await screen.findByRole("heading", { name: "工作情况报告（功能示例）", level: 1 })).toBeInTheDocument();
  });
});
