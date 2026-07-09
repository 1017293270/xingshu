import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { XsCommandBox } from "./XsCommandBox";

describe("XsCommandBox", () => {
  it("renders voice and send actions without the removed upload affordance", async () => {
    const user = userEvent.setup();
    const onVoice = vi.fn();
    const onSubmit = vi.fn();

    render(
      <XsCommandBox
        value=""
        onChange={() => undefined}
        onSubmit={onSubmit}
        onVoice={onVoice}
      />
    );

    await user.click(screen.getByRole("button", { name: "语音" }));
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(screen.queryByRole("button", { name: "附件" })).not.toBeInTheDocument();
    expect(screen.queryByText("企业数据、文档、看板与 Agent 应用统一入口")).not.toBeInTheDocument();
    expect(onVoice).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
