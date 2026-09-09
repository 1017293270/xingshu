import { beforeEach, describe, expect, it } from "vitest";
import { selectWritingJobIndicator, useWritingJobStore } from "./writingJobStore";

function job() {
  return useWritingJobStore.getState();
}

describe("writingJobStore", () => {
  beforeEach(() => {
    job().reset();
  });

  it("keeps the start time across phase changes inside one generation", () => {
    job().setPhase("analyzing");
    const startedAt = job().startedAt;
    expect(startedAt).toBeTypeOf("number");

    job().setPhase("researching", "正在补充资料…");
    expect(job().startedAt).toBe(startedAt);
    expect(job().progressText).toBe("正在补充资料…");

    job().setPhase("writing");
    expect(job().startedAt).toBe(startedAt);
    expect(job().progressText).toBeUndefined();

    job().setPhase("idle");
    expect(job().startedAt).toBeUndefined();
  });

  it("does not wake subscribers when the same phase is reported again", () => {
    job().setPhase("writing");
    let notifications = 0;
    const unsubscribe = useWritingJobStore.subscribe(() => {
      notifications += 1;
    });

    /* 写作台每次流式渲染都会重报进度，重复的一路不能把整个侧栏拖着重渲染 */
    job().setPhase("writing");
    job().setPhase("writing");
    expect(notifications).toBe(0);

    job().setPhase("researching", "正在补充资料…");
    expect(notifications).toBe(1);
    unsubscribe();
  });

  it("treats a repeat report of the same turn as a title refresh, not a second result", () => {
    job().reportResult("turn-1", "关于开展安全检查的通知");
    const first = job().lastResult;
    expect(first).toMatchObject({ turnId: "turn-1", seen: false, notified: false });

    job().markNotified();
    /* 标题要等正文解析完才拿得到，补上时不能把已提醒过的成稿重置成新的一份 */
    job().reportResult("turn-1", "关于开展2026年安全检查的通知");
    expect(job().lastResult).toMatchObject({
      turnId: "turn-1",
      title: "关于开展2026年安全检查的通知",
      notified: true,
      finishedAt: first?.finishedAt
    });
  });

  it("starts a fresh unread result for a new turn", () => {
    job().reportResult("turn-1", "第一篇");
    job().markSeen();
    job().markNotified();

    job().reportResult("turn-2", "第二篇");
    expect(job().lastResult).toMatchObject({ turnId: "turn-2", seen: false, notified: false });
  });

  it("shows running while generating and an unread dot only for an unseen result", () => {
    expect(selectWritingJobIndicator(useWritingJobStore.getState())).toBeNull();

    job().setPhase("analyzing");
    expect(selectWritingJobIndicator(useWritingJobStore.getState())).toBe("running");

    job().setPhase("idle");
    job().reportResult("turn-1", "第一篇");
    expect(selectWritingJobIndicator(useWritingJobStore.getState())).toBe("unseen");

    job().markSeen();
    expect(selectWritingJobIndicator(useWritingJobStore.getState())).toBeNull();
  });

  it("keeps reporting running while a second generation covers an unseen result", () => {
    job().reportResult("turn-1", "第一篇");
    job().setPhase("writing");
    expect(selectWritingJobIndicator(useWritingJobStore.getState())).toBe("running");
  });

  it("carries the requirement of the running turn and drops it when the run ends", () => {
    job().setPhase("analyzing", undefined, "撰写2026年安全检查通知");
    expect(job().requirement).toBe("撰写2026年安全检查通知");

    /* 同一轮里换阶段，需求还是那一句，首页提示条不该闪 */
    job().setPhase("writing", undefined, "撰写2026年安全检查通知");
    expect(job().requirement).toBe("撰写2026年安全检查通知");

    job().setPhase("idle");
    expect(job().requirement).toBeUndefined();
  });

  it("does not wake subscribers when only the same requirement is reported again", () => {
    job().setPhase("writing", undefined, "撰写2026年安全检查通知");
    let notifications = 0;
    const unsubscribe = useWritingJobStore.subscribe(() => {
      notifications += 1;
    });

    job().setPhase("writing", undefined, "撰写2026年安全检查通知");
    expect(notifications).toBe(0);
    unsubscribe();
  });

  /* 刷新后认回来的成稿只为让首页提示条有东西可点：不提醒、不亮未读圆点。 */
  it("restores a recovered result as already seen and already announced", () => {
    job().restoreResult("turn-1", "关于开展安全检查的通知");

    expect(job().lastResult).toMatchObject({
      turnId: "turn-1",
      title: "关于开展安全检查的通知",
      seen: true,
      notified: true
    });
    expect(selectWritingJobIndicator(useWritingJobStore.getState())).toBeNull();
  });

  it("never lets a restore overwrite the result of the turn it already holds", () => {
    job().reportResult("turn-1", "刚写完的一份");
    job().restoreResult("turn-1", "sessionStorage 里的旧标题");

    expect(job().lastResult).toMatchObject({ title: "刚写完的一份", seen: false, notified: false });
  });
});
