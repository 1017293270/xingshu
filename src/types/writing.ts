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

export type WritingDraftInput = {
  prompt: string;
  sceneId?: string;
};

export type WritingDraftResult = {
  id: string;
  status: "accepted";
  prompt: string;
};
