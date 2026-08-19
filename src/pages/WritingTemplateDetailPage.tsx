import { useParams } from "react-router";
import { TemplateDetailView } from "@/features/officialDocument/TemplateDetailView";

export function WritingTemplateDetailPage() {
  const { templateId = "" } = useParams();
  return <TemplateDetailView templateId={templateId} />;
}
