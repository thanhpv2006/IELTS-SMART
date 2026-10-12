// Input shape shared by both preview sources: an unsaved AI-import draft and a saved catalog set.
// `id` is optional because a draft has none yet — see toEngineQuestions for the fallback.
export type PreviewQuestion = {
  id?: string;
  skill: string;
  part: number;
  prompt: string;
  metadata: unknown;
};
