import { useEffect, useRef } from "react";
import { create } from "zustand";

/** 报告智写的两页：首页只有输入框，会话页才是写作台的全貌。 */
export const WRITING_HOME_PATH = "/writing";
export const WRITING_SESSION_PATH = "/writing/session";

/** 写作台此刻摆的是哪张脸，也就是它落在哪一页的槽位里。 */
export type WritingComposeFace = "home" | "session";

type WritingComposeHostState = {
  /** 用户第一次进写作台之前不挂管线，省掉一整套模板/草稿请求。 */
  started: boolean;
  /**
   * 写作台此刻是不是真的显示在页面上、显示在哪一页——由槽位自己开合。
   * 不看路由：成稿落地那一下是 store 触发的渲染，宿主读到的 location 可能还停在上一页。
   */
  face: WritingComposeFace | null;
  start: () => void;
  stop: () => void;
  setFace: (face: WritingComposeFace) => void;
  /** 只收回自己那张脸：两页交接时后挂载的槽位已经声明过，别被前一页的清理抹掉。 */
  clearFace: (face: WritingComposeFace) => void;
};

export const useWritingComposeHostStore = create<WritingComposeHostState>((set) => ({
  started: false,
  face: null,
  start: () => set((state) => (state.started ? state : { started: true })),
  stop: () => set((state) => (state.started || state.face ? { started: false, face: null } : state)),
  setFace: (face) => set((state) => (state.face === face ? state : { face })),
  clearFace: (face) => set((state) => (state.face === face ? { face: null } : state))
}));

/**
 * 写作台的真实 DOM 落点。路由一变 `.xs-route-view` 就整块重挂，所以生成过程要活下来，
 * 承载它的节点必须由模块自己拿着，在页面槽位和隐藏容器之间搬来搬去，而不跟着路由生灭。
 */
let composeNode: HTMLDivElement | null = null;
let hiddenParent: HTMLElement | null = null;

export function ensureWritingComposeNode() {
  if (!composeNode) {
    composeNode = document.createElement("div");
    composeNode.className = "official-document-compose-host";
  }
  return composeNode;
}

export function getWritingComposeNode() {
  return composeNode;
}

/** 宿主自己的隐藏停放区；节点没人收养时就停在这里。 */
export function setWritingComposeParking(parking: HTMLElement | null) {
  hiddenParent = parking;
  if (parking && composeNode && !composeNode.parentElement) {
    parking.appendChild(composeNode);
  }
}

/** 宿主卸载时只收回自己那一个停放区。 */
export function releaseWritingComposeParking(parking: HTMLElement | null) {
  if (hiddenParent === parking) hiddenParent = null;
}

/** 把常驻节点搬进页面槽位。重复调用无副作用，StrictMode 里来回挂载也不会出错。 */
export function adoptWritingComposeNode(container: HTMLElement) {
  const node = ensureWritingComposeNode();
  if (node.parentElement !== container) {
    container.appendChild(node);
  }
  return node;
}

/**
 * 离开写作台时把节点收回隐藏容器，React 子树不卸载，SSE 继续跑。
 * 传槽位就只收自己那一次收养：首页与会话页交接时，后一页已经把节点接走了。
 */
export function releaseWritingComposeNode(container?: HTMLElement) {
  const node = composeNode;
  if (!node || !hiddenParent || node.parentElement === hiddenParent) return;
  if (container && node.parentElement !== container) return;
  hiddenParent.appendChild(node);
}

/** 仅供测试重置模块级 DOM。 */
export function resetWritingComposeNodeForTests() {
  composeNode?.remove();
  composeNode = null;
  hiddenParent = null;
}

/**
 * 页面槽位：把常驻写作台借过来，并声明此刻摆的是哪张脸。
 * 槽位随路由生灭，写作台不随，所以 /writing 与 /writing/session 之间来回走不重挂。
 */
export function useWritingComposeSlot(face: WritingComposeFace) {
  const slotRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    const host = useWritingComposeHostStore.getState();
    adoptWritingComposeNode(slot);
    host.start();
    host.setFace(face);
    return () => {
      useWritingComposeHostStore.getState().clearFace(face);
      releaseWritingComposeNode(slot);
    };
  }, [face]);

  return slotRef;
}
