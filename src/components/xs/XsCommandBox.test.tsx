import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { XsCommandBox } from "./XsCommandBox";

describe("XsCommandBox", () => {
  it("runs attachment and voice actions", async () => {
    const user = userEvent.setup();
    const onAttach = vi.fn();
    const onVoice = vi.fn();

    render(
      <XsCommandBox
        value=""
        onChange={() => undefined}
        onSubmit={() => undefined}
        onAttach={onAttach}
        onVoice={onVoice}
      />
    );

    await user.click(screen.getByRole("button", { name: "附件" }));
    await user.click(screen.getByRole("button", { name: "语音" }));

    expect(onAttach).toHaveBeenCalledTimes(1);
    expect(onVoice).toHaveBeenCalledTimes(1);
  });
});
