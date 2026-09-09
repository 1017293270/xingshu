import { useEffect, useRef } from "react";
import {
  adoptWritingComposeNode,
  releaseWritingComposeNode,
  useWritingComposeHostStore
} from "@/features/officialDocument/WritingComposeHost";

/**
 * 写作台本体常驻在 AppLayout 里，这里只留一个槽位把它借过来。
 * 槽位随路由生灭，写作台不随，所以切走再回来生成过程不断。
 */
export function WritingPage() {
  const slotRef = useRef<HTMLDivElement | null>(null);
  const start = useWritingComposeHostStore((state) => state.start);
  const setVisible = useWritingComposeHostStore((state) => state.setVisible);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    adoptWritingComposeNode(slot);
    start();
    setVisible(true);
    return () => {
      setVisible(false);
      releaseWritingComposeNode();
    };
  }, [setVisible, start]);

  return <div className="official-document-compose-slot" ref={slotRef} />;
}
