import { useWritingComposeSlot } from "@/features/officialDocument/writingComposeNode";

/**
 * 报告智写首页：点侧栏进来永远先落在这里，只有标题和输入框。
 * 写作台本体常驻在 AppLayout 里，这里只留一个槽位把它借过来，摆出首页那张脸。
 */
export function WritingPage() {
  const slotRef = useWritingComposeSlot("home");

  return <div className="official-document-compose-slot" ref={slotRef} />;
}
