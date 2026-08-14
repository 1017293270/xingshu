import { useParams } from "react-router";
import { TemplateDetailView } from "@/features/officialDocument/TemplateDetailView";
import { PageFrame } from "./PageFrame";

export function WritingTemplateDetailPage() {
  const { templateId = "" } = useParams();

  return (
    <PageFrame title="公文模板" hideHeader className="official-document-page">
      <TemplateDetailView templateId={templateId} />
    </PageFrame>
  );
}
