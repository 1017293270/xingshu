import { useParams } from "react-router";
import { DraftDetailView } from "@/features/officialDocument/DraftDetailView";

export function WritingDraftDetailPage() {
  const { draftId = "" } = useParams();
  return <DraftDetailView draftId={draftId} />;
}
