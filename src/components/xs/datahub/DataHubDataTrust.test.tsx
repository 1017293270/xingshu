import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DataHubDataTrust } from "./DataHubDataTrust";
import type { DataHubDataTrustView } from "@/services/dataHubDataTrust";

const trusted: DataHubDataTrustView = {
  level: "TRUSTED",
  label: "可信指标",
  explanation: "可信指标是指统计口径、数据来源已经人工确认的指标",
  measures: [{ title: "合同金额", trusted: true }],
  hiddenMeasureCount: 0,
  unstructuredData: false
};

const partial: DataHubDataTrustView = {
  level: "PARTIAL",
  label: "部分可信",
  explanation: "部分指标已人工确认",
  measures: [
    { title: "合同金额", trusted: true },
    { title: "回款金额", trusted: false }
  ],
  hiddenMeasureCount: 2,
  unstructuredData: true
};

function popover() {
  const content = document.querySelector<HTMLElement>(".xs-data-trust-popover__content");
  expect(content).not.toBeNull();
  return within(content!);
}

describe("DataHubDataTrust", () => {
  it("opens the explanation and the measures used from the question-mark button", async () => {
    const user = userEvent.setup();
    render(<DataHubDataTrust trust={trusted} />);

    expect(screen.getByText("可信指标")).toBeInTheDocument();
    const help = screen.getByRole("button", { name: "查看可信说明" });
    expect(help).toHaveAttribute("aria-expanded", "false");

    await user.click(help);
    expect(help).toHaveAttribute("aria-expanded", "true");
    const detail = popover();
    expect(detail.getByText("可信指标是指统计口径、数据来源已经人工确认的指标")).toBeInTheDocument();
    expect(detail.getByText("本次用到的指标")).toBeInTheDocument();
    expect(detail.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["合同金额已确认"]);
    expect(detail.queryByText("另有部分结果没有指标信息，未计入。")).not.toBeInTheDocument();

    await user.click(help);
    expect(help).toHaveAttribute("aria-expanded", "false");
  });

  it("lists confirmed and unconfirmed measures, the overflow and the unstructured note", async () => {
    const user = userEvent.setup();
    render(<DataHubDataTrust trust={partial} />);

    expect(screen.getByText("部分可信")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "查看可信说明" }));
    const detail = popover();
    expect(detail.getByText("部分指标已人工确认")).toBeInTheDocument();
    expect(detail.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "合同金额已确认",
      "回款金额未确认"
    ]);
    expect(detail.getByText("另有 2 项")).toBeInTheDocument();
    expect(detail.getByText("另有部分结果没有指标信息，未计入。")).toBeInTheDocument();
  });

  it("closes on Escape and on a click outside", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <DataHubDataTrust trust={trusted} />
        <p>回答正文</p>
      </div>
    );
    const help = screen.getByRole("button", { name: "查看可信说明" });

    await user.click(help);
    expect(help).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(help).toHaveAttribute("aria-expanded", "false");
    expect(help).toHaveFocus();

    await user.click(help);
    expect(help).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByText("回答正文"));
    expect(help).toHaveAttribute("aria-expanded", "false");
  });

  it("only warns when the data was extracted by AI, without a question mark", () => {
    render(
      <DataHubDataTrust
        trust={{
          level: "NOT_TRUSTED",
          label: "数据由AI提取，注意辨别",
          measures: [{ title: "回款金额", trusted: false }],
          hiddenMeasureCount: 0,
          unstructuredData: false
        }}
      />
    );

    expect(screen.getByText("数据由AI提取，注意辨别")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
