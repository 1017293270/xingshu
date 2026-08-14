import { OfficialDocumentHub } from "@/features/officialDocument/OfficialDocumentHub";
import { PageFrame } from "./PageFrame";

export function WritingPage() {
  return (
    <PageFrame
      title="公文写作"
      subtitle="选择已发布模板，填写内容并绑定问数结果，按原格式导出 DOCX"
      className="official-document-page"
    >
      <OfficialDocumentHub />
    </PageFrame>
  );
}
