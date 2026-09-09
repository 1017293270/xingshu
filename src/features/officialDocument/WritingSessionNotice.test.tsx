import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setReducedMotion } from "@/test/setup";
import { WritingSessionNotice } from "./WritingSessionNotice";
import { useWritingJobStore } from "./writingJobStore";

function renderNotice(onOpen = vi.fn()) {
  render(<WritingSessionNotice onOpen={onOpen} />);
  return onOpen;
}

describe("WritingSessionNotice", () => {
  beforeEach(() => {
    useWritingJobStore.getState().reset();
  });

  afterEach(() => {
    setReducedMotion(false);
  });

  it("renders nothing when there is no session to go back to", () => {
    const { container } = render(<WritingSessionNotice onOpen={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows what is being written, which stage it is in and how long it has taken", () => {
    useWritingJobStore.setState({
      phase: "researching",
      progressText: "正在补充第 2 条资料",
      startedAt: Date.now() - 3 * 60_000,
      requirement: "撰写2026年安全检查通知，突出自查与复核安排"
    });
    renderNotice();

    /* 摘录收在 30 字以内，长要求不许把提示条撑成两行 */
    expect(screen.getByText("正在生成：撰写2026年安全检查通知，突出自查与复核安排")).toBeInTheDocument();
    expect(screen.getByText("正在补充第 2 条资料 · 已用 3 分钟")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /点击查看生成过程/ })).toBeInTheDocument();
  });

  it("falls back to the phase name and 刚开始 in the first minute", () => {
    useWritingJobStore.setState({ phase: "analyzing", startedAt: Date.now() - 5_000, requirement: "写一份通知" });
    renderNotice();

    expect(screen.getByText("正在生成：写一份通知")).toBeInTheDocument();
    expect(screen.getByText("分析结构 · 刚开始")).toBeInTheDocument();
  });

  it("trims a long requirement down to one line", () => {
    useWritingJobStore.setState({
      phase: "writing",
      startedAt: Date.now(),
      requirement: "一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十一二三四五"
    });
    renderNotice();

    expect(screen.getByText("正在生成：一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十…")).toBeInTheDocument();
  });

  it("marks a finished document that the user has not opened yet", () => {
    useWritingJobStore.getState().reportResult("turn-1", "关于开展安全检查的通知");
    renderNotice();

    expect(screen.getByText("《关于开展安全检查的通知》已生成")).toBeInTheDocument();
    expect(screen.getByText("尚未查看")).toBeInTheDocument();
  });

  it("invites the user to continue the last document once it has been seen", () => {
    useWritingJobStore.getState().reportResult("turn-1", "关于开展安全检查的通知");
    useWritingJobStore.getState().markSeen();
    renderNotice();

    expect(screen.getByText("上次成稿《关于开展安全检查的通知》")).toBeInTheDocument();
    expect(screen.getByText("点击继续这次写作")).toBeInTheDocument();
  });

  it("opens the session with a click and with the keyboard", async () => {
    const user = userEvent.setup();
    useWritingJobStore.getState().reportResult("turn-1", "关于开展安全检查的通知");
    const onOpen = renderNotice();

    const notice = screen.getByRole("button", { name: /已生成/ });
    await user.click(notice);
    expect(onOpen).toHaveBeenCalledTimes(1);

    notice.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onOpen).toHaveBeenCalledTimes(3);
  });

  it("still renders the running state when the user asked for reduced motion", () => {
    setReducedMotion(true);
    useWritingJobStore.setState({ phase: "writing", startedAt: Date.now(), requirement: "写一份通知" });
    renderNotice();

    expect(screen.getByRole("button", { name: /正在生成/ })).toBeInTheDocument();
    expect(document.querySelector(".writing-session-notice__dot")).not.toBeNull();
  });
});
