import { Button, notification } from "antd";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { create } from "zustand";
import { OfficialDocumentComposeView } from "./OfficialDocumentComposeView";
import { useWritingJobStore } from "./writingJobStore";
import "./writing-compose-host.css";

export const WRITING_COMPOSE_PATH = "/writing";

/** 等路由切换这一拍落定再判断写作台还在不在眼前。 */
const NOTIFY_SETTLE_MS = 400;

type WritingComposeHostState = {
  /** 用户第一次进写作台之前不挂管线，省掉一整套模板/草稿请求。 */
  started: boolean;
  /**
   * 写作台此刻是不是真的显示在页面上——由槽位自己开合。
   * 不看路由：成稿落地那一下是 store 触发的渲染，宿主读到的 location 可能还停在上一页。
   */
  visible: boolean;
  start: () => void;
  stop: () => void;
  setVisible: (visible: boolean) => void;
};

export const useWritingComposeHostStore = create<WritingComposeHostState>((set) => ({
  started: false,
  visible: false,
  start: () => set((state) => (state.started ? state : { started: true })),
  stop: () => set((state) => (state.started || state.visible ? { started: false, visible: false } : state)),
  setVisible: (visible) => set((state) => (state.visible === visible ? state : { visible }))
}));

/**
 * 写作台的真实 DOM 落点。路由一变 `.xs-route-view` 就整块重挂，所以生成过程要活下来，
 * 承载它的节点必须由模块自己拿着，在页面槽位和隐藏容器之间搬来搬去，而不跟着路由生灭。
 */
let composeNode: HTMLDivElement | null = null;
let hiddenParent: HTMLElement | null = null;

function ensureComposeNode() {
  if (!composeNode) {
    composeNode = document.createElement("div");
    composeNode.className = "official-document-compose-host";
  }
  return composeNode;
}

export function getWritingComposeNode() {
  return composeNode;
}

/** 把常驻节点搬进页面槽位。重复调用无副作用，StrictMode 里来回挂载也不会出错。 */
export function adoptWritingComposeNode(container: HTMLElement) {
  const node = ensureComposeNode();
  if (node.parentElement !== container) {
    container.appendChild(node);
  }
  return node;
}

/** 离开写作台时把节点收回隐藏容器，React 子树不卸载，SSE 继续跑。 */
export function releaseWritingComposeNode() {
  const node = composeNode;
  if (!node || !hiddenParent || node.parentElement === hiddenParent) return;
  hiddenParent.appendChild(node);
}

/** 仅供测试重置模块级 DOM。 */
export function resetWritingComposeNodeForTests() {
  composeNode?.remove();
  composeNode = null;
  hiddenParent = null;
}

export function WritingComposeHost() {
  const started = useWritingComposeHostStore((state) => state.started);
  const onComposePage = useWritingComposeHostStore((state) => state.visible);
  const lastResult = useWritingJobStore((state) => state.lastResult);
  const navigate = useNavigate();
  const [api, contextHolder] = notification.useNotification();
  const hiddenRef = useRef<HTMLDivElement | null>(null);
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const node = started ? ensureComposeNode() : null;

  useEffect(() => {
    const parking = hiddenRef.current;
    hiddenParent = parking;
    /* 还没被页面收养的节点先停在隐藏容器里，别飘在 document 之外。 */
    if (composeNode && !composeNode.parentElement && parking) {
      parking.appendChild(composeNode);
    }
    return () => {
      if (hiddenParent === parking) hiddenParent = null;
    };
  }, [started]);

  /* 宿主随 AppLayout 卸载只发生在退出登录：别把上一个人的未读提示留给下一个人。 */
  useEffect(() => () => useWritingJobStore.getState().reset(), []);

  /*
   * 人回到写作台就当看过了，未读圆点跟着消失。
   * 只管已经决定过的那一份：还没决定的交给下面那一拍，别在路由切换途中提前判成「看过」。
   */
  useEffect(() => {
    if (onComposePage && lastResult?.notified) useWritingJobStore.getState().markSeen();
  }, [onComposePage, lastResult]);

  useEffect(() => {
    if (!lastResult || lastResult.notified) return;
    /*
     * 成稿落地那一下可能正赶上路由切换：react-router 用 transition 提交，
     * 旧路由要等新路由准备好才卸载，这时候问「写作台还在眼前吗」会得到过期的答案。
     * 等这一拍过去再决定要不要提醒，宁可多提醒一次，也不能把提醒吞掉。
     */
    const timer = window.setTimeout(() => {
      const job = useWritingJobStore.getState();
      const result = job.lastResult;
      if (!result || result.notified) return;
      job.markNotified();
      if (useWritingComposeHostStore.getState().visible) {
        job.markSeen();
        return;
      }
      const key = `writing-result-${result.turnId}`;
      api.open({
        key,
        message: "公文已生成",
        description: `《${result.title}》已经写好，回写作台查看或保存到草稿箱。`,
        placement: "bottomRight",
        duration: 8,
        btn: (
          <Button
            type="primary"
            size="small"
            onClick={() => {
              api.destroy(key);
              navigateRef.current(WRITING_COMPOSE_PATH);
            }}
          >
            查看
          </Button>
        )
      });
    }, NOTIFY_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [api, lastResult]);

  return (
    <>
      {contextHolder}
      <div className="official-document-compose-parking" ref={hiddenRef} hidden aria-hidden="true" />
      {node ? createPortal(<OfficialDocumentComposeView />, node) : null}
    </>
  );
}
