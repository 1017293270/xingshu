import type { WritingDraftInput, WritingDraftResult } from "@/types/writing";
import { writingDocuments, writingScenes } from "./mock/writingMock";

export async function listWritingScenes() {
  return writingScenes;
}

export async function listWritingDocuments() {
  return writingDocuments;
}

export async function createWritingDraft(input: WritingDraftInput): Promise<WritingDraftResult> {
  return {
    id: "writing-draft-mock",
    status: "accepted",
    prompt: input.prompt
  };
}
