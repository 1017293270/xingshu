import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { XsKnowledgeCard } from "./XsKnowledgeCard";

function renderCard(props: Partial<Parameters<typeof XsKnowledgeCard>[0]> = {}) {
  return render(
    <MemoryRouter>
      <XsKnowledgeCard
        id="kb-policy"
        title="企业制度知识库"
        description="合同、制度、报告统一入库"
        documentCount={48}
        {...props}
      />
    </MemoryRouter>
  );
}

describe("XsKnowledgeCard", () => {
  it("keeps the space wording when no scope label is given", () => {
    // 缺省口径仍是「空间」，未显式传 scopeLabel 的历史调用点不回归
    renderCard({ share: 54 });

    expect(screen.getByText("占空间文档 54%")).toBeInTheDocument();
  });

  it("follows the caller's scope label on the share bar", () => {
    const { rerender } = renderCard({ share: 54, scopeLabel: "个人" });

    expect(screen.getByText("占个人文档 54%")).toBeInTheDocument();
    expect(screen.queryByText("占空间文档 54%")).not.toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <XsKnowledgeCard
          id="kb-policy"
          title="企业制度知识库"
          description="合同、制度、报告统一入库"
          documentCount={48}
          share={54}
          scopeLabel="空间"
        />
      </MemoryRouter>
    );

    expect(screen.getByText("占空间文档 54%")).toBeInTheDocument();
    expect(screen.queryByText("占个人文档 54%")).not.toBeInTheDocument();
  });

  it("hides the share bar entirely when the share is unknown", () => {
    // 数据资产管理页不传 share，卡片不该出现任何口径措辞
    const { container } = renderCard({ scopeLabel: "空间" });

    expect(container.querySelector(".xs-kb-card__share")).not.toBeInTheDocument();
    expect(screen.queryByText(/占.*文档/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "知识库：企业制度知识库" })).toHaveAttribute(
      "href",
      "/cloud/kb-policy"
    );
  });
});
