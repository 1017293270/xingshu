import { Button, notification } from "antd";
import { lazy, Suspense, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import {
  ensureWritingComposeNode,
  releaseWritingComposeParking,
  setWritingComposeParking,
  useWritingComposeHostStore,
  WRITING_SESSION_PATH
} from "./writingComposeNode";
import { useWritingJobStore } from "./writingJobStore";
import "./writing-compose-host.css";

/*
 * 写作台按需加载：没进过报告智写的人不该在首屏背上整套写作台代码，
 * 而常驻宿主本身又必须随 AppLayout 一起在场，否则没人替生成过程守着。
 */
const OfficialDocumentComposeView = lazy(() => import("./OfficialDocumentComposeView")
  .then((module) => ({ default: module.OfficialDocumentComposeView })));

/** 等路由切换这一拍落定再判断写作台还在不在眼前。 */
const NOTIFY_SETTLE_MS = 400;

export function WritingComposeHost() {
  const started = useWritingComposeHostStore((state) => state.started);
  const face = useWritingComposeHostStore((state) => state.face);
  const lastResult = useWritingJobStore((state) => state.lastResult);
  const navigate = useNavigate();
  const [api, contextHolder] = notification.useNotification();
  const hiddenRef = useRef<HTMLDivElement | null>(null);
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const node = started ? ensureWritingComposeNode() : null;

  useEffect(() => {
    const parking = hiddenRef.current;
    /* 还没被页面收养的节点先停在隐藏容器里，别飘在 document 之外。 */
    setWritingComposeParking(parking);
    return () => releaseWritingComposeParking(parking);
  }, [started]);

  /* 宿主随 AppLayout 卸载只发生在退出登录：别把上一个人的未读提示留给下一个人。 */
  useEffect(() => () => useWritingJobStore.getState().reset(), []);

  /*
   * 人回到会话页就当看过了，未读圆点跟着消失。首页只有一条提示条，看不到成稿，不算看过。
   * 只管已经决定过的那一份：还没决定的交给下面那一拍，别在路由切换途中提前判成「看过」。
   */
  useEffect(() => {
    if (face === "session" && lastResult?.notified) useWritingJobStore.getState().markSeen();
  }, [face, lastResult]);

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
      const settledFace = useWritingComposeHostStore.getState().face;
      /* 成稿就摆在眼前，不用再说一遍。 */
      if (settledFace === "session") {
        job.markSeen();
        return;
      }
      /* 首页那条提示条自己会变成「已生成」，不额外弹窗；但没看过就还是没看过。 */
      if (settledFace === "home") return;
      const key = `writing-result-${result.turnId}`;
      api.open({
        key,
        message: "公文已生成",
        description: `《${result.title}》已经写好，回写作台查看或保存到草稿箱。`,
        placement: "bottomRight",
        duration: 8,
        actions: (
          <Button
            type="primary"
            size="small"
            onClick={() => {
              api.destroy(key);
              navigateRef.current(WRITING_SESSION_PATH);
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
      {node ? createPortal(
        <Suspense fallback={null}><OfficialDocumentComposeView /></Suspense>,
        node
      ) : null}
    </>
  );
}
