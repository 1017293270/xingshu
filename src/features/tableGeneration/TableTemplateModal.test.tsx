import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { TableTemplateModal } from "./TableTemplateModal";

type ModalProps = ComponentProps<typeof TableTemplateModal>;

const structureJson = '{"columns":[{"title":"客户"},{"title":"合同金额"}]}';

function props(overrides: Partial<ModalProps> = {}): ModalProps {
  return {
    open: true,
    title: "存为模板",
    initial: { name: "", prompt: "", structureJson },
    suggestion: "pending",
    onSave: vi.fn(),
    onClose: vi.fn(),
    ...overrides
  };
}

describe("TableTemplateModal 建议值", () => {
  it("生成中给出提示，建议值到了只填用户还没动过的那一栏", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<TableTemplateModal {...props()} />);

    const modal = screen.getByRole("dialog", { name: "存为模板" });
    const name = within(modal).getByLabelText("模板名称");
    const prompt = within(modal).getByLabelText("制表提示词");
    expect(within(modal).getByText("正在根据本次会话生成名称与提示词…")).toBeInTheDocument();
    expect(name).toHaveAttribute("placeholder", "正在生成模板名称…");
    // 两栏都还空着，保存按钮不可点
    expect(within(modal).getByRole("button", { name: "保存模板" })).toBeDisabled();

    await user.type(name, "我自己起的名字");
    rerender(
      <TableTemplateModal
        {...props({
          initial: { name: "客户合同金额表", prompt: "帮我做一张客户合同金额表", structureJson },
          suggestion: "ready"
        })}
      />
    );

    expect(name).toHaveValue("我自己起的名字");
    expect(prompt).toHaveValue("帮我做一张客户合同金额表");
    expect(within(modal).getByText("已根据本次会话的提问与确认项生成，可直接修改")).toBeInTheDocument();
    expect(prompt).toHaveAccessibleDescription("已根据本次会话的提问与确认项生成，可直接修改");
  });

  it("重新打开时不带上一回的改动，建议值照常填入", async () => {
    const user = userEvent.setup();
    const ready = props({
      initial: { name: "客户合同金额表", prompt: "帮我做一张客户合同金额表", structureJson },
      suggestion: "ready"
    });
    const { rerender } = render(<TableTemplateModal {...ready} />);

    await user.clear(screen.getByLabelText("模板名称"));
    await user.type(screen.getByLabelText("模板名称"), "临时改的名字");
    rerender(<TableTemplateModal {...ready} open={false} />);
    rerender(
      <TableTemplateModal
        {...ready}
        initial={{ name: "各部门人数", prompt: "统计各部门人数", structureJson }}
      />
    );

    expect(screen.getByLabelText("模板名称")).toHaveValue("各部门人数");
    expect(screen.getByLabelText("制表提示词")).toHaveValue("统计各部门人数");
  });

  it("新建与编辑模板不挂建议提示，沿用原来的占位文案", () => {
    render(<TableTemplateModal {...props({ title: "新建模板", initial: undefined, suggestion: undefined })} />);

    expect(screen.getByPlaceholderText("如：季度合同台账")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("描述这张表要统计什么、按什么口径…")).toBeInTheDocument();
    expect(screen.queryByText(/根据本次会话/)).not.toBeInTheDocument();
  });
});
