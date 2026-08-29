import { requestDataHub } from "@/services/dataHubClient";
import type {
  OfficialDocumentContentSourceBlock,
  OfficialDocumentStructureNode,
  OfficialDocumentWritingLogicPlan
} from "@/types/officialDocument";
import { summarizeOfficialDocumentTemplate } from "@/services/officialDocumentFullDraft";

export function analyzeOfficialDocumentContent(input: {
  structureNodes: OfficialDocumentStructureNode[];
  sourceBlocks: OfficialDocumentContentSourceBlock[];
}) {
  return requestDataHub<OfficialDocumentWritingLogicPlan>(
    "/api/v1/chat/writing-content-analysis",
    {
      method: "POST",
      body: JSON.stringify({
        structureRoles: summarizeOfficialDocumentTemplate(input.structureNodes),
        sourceBlocks: input.sourceBlocks
      }),
      timeoutMs: 195_000
    }
  );
}
