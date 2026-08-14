import { useParams } from "react-router";
import { DraftDetailView } from "@/features/officialDocument/DraftDetailView";
import { PageFrame } from "./PageFrame";

export function WritingDraftDetailPage() {
  const { draftId = "" } = useParams();

  return (
    <PageFrame title="公文草稿" hideHeader className="official-document-page">
      <DraftDetailView draftId={draftId} />
    </PageFrame>
  );
}
