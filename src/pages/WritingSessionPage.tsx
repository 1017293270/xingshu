import { useWritingComposeSlot } from "@/features/officialDocument/writingComposeNode";

/**
 * 报告智写会话页：进度、追问和成稿都在这里。
 * 和首页共用同一个常驻写作台节点，两页之间来回走不重挂，生成过程不断。
 */
export function WritingSessionPage() {
  const slotRef = useWritingComposeSlot("session");

  return <div className="official-document-compose-slot" ref={slotRef} />;
}
