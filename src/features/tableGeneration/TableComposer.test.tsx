import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TableComposer } from "./TableComposer";

const props = { value: "按年度统计合同", placeholder: "继续补充制表要求…", busy: false, streaming: false,
  onChange: vi.fn(), onSubmit: vi.fn(), onStop: vi.fn() };

it("sends on Enter but not while composing Chinese text, on Shift+Enter or with an empty draft", () => {
  const onSubmit = vi.fn();
  const { rerender } = render(<TableComposer {...props} onSubmit={onSubmit} />);
  const input = screen.getByRole("textbox", { name: "继续追问" });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
  expect(onSubmit).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter" });
  expect(onSubmit).toHaveBeenCalledTimes(1);
  rerender(<TableComposer {...props} value="  " onSubmit={onSubmit} />);
  fireEvent.keyDown(input, { key: "Enter" });
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "继续制表" })).toBeDisabled();
});

it("allows drafting during generation and replaces send with stop without submitting a second request", () => {
  const onChange = vi.fn();
  const onSubmit = vi.fn();
  const onStop = vi.fn();
  const { rerender } = render(<TableComposer {...props} busy streaming onChange={onChange} onSubmit={onSubmit} onStop={onStop} />);
  const input = screen.getByRole("textbox", { name: "继续追问" });
  expect(input).toBeEnabled();
  fireEvent.change(input, { target: { value: "再按月份拆分" } });
  expect(onChange).toHaveBeenCalledWith("再按月份拆分");
  fireEvent.keyDown(input, { key: "Enter" });
  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "继续制表" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "停止生成" }));
  expect(onStop).toHaveBeenCalledTimes(1);
  rerender(<TableComposer {...props} value="再按月份拆分" />);
  expect(input).toHaveValue("再按月份拆分");
  expect(screen.getByRole("button", { name: "继续制表" })).toBeEnabled();
});
