export type WritingSceneIconId = "report-summary" | "solution-plan" | "work-report" | "copywriting";

export type WritingSceneTone = "purple" | "blue" | "green" | "orange";

export type WritingScene = {
  id: string;
  title: string;
  description: string;
  iconId: WritingSceneIconId;
  tone: WritingSceneTone;
};

export type WritingDocument = {
  id: string;
  name: string;
  type: string;
  words: string;
  updatedAt: string;
};

export type WritingDraftAttachment = {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
};

export type WritingDraftInput = {
  prompt: string;
  sceneId?: string;
  attachments?: WritingDraftAttachment[];
};

export type WritingDraftResult = {
  id: string;
  status: "accepted";
  prompt: string;
  attachmentCount: number;
};
