export interface HandoffChecklist {
  vodProcessed: boolean;
  thumbnailGenerated: boolean;
  seoOptimized: boolean;
  highlightsExtracted: boolean;
  momentsCaptured: number;
  learningRecorded: boolean;
  socialPosted: boolean;
  replayQueued: boolean;
  editCopyCreated: boolean;
}

const handoffStates = new Map<string, {
  streamId: string;
  checklist: HandoffChecklist;
  startedAt: Date;
  completedAt: Date | null;
}>();

export function initiateHandoff(userId: string, streamId: string): HandoffChecklist {
  const checklist: HandoffChecklist = {
    vodProcessed: false,
    thumbnailGenerated: false,
    seoOptimized: false,
    highlightsExtracted: false,
    momentsCaptured: 0,
    learningRecorded: false,
    socialPosted: false,
    replayQueued: false,
    editCopyCreated: false,
  };

  handoffStates.set(`${userId}:${streamId}`, {
    streamId,
    checklist,
    startedAt: new Date(),
    completedAt: null,
  });

  return checklist;
}

export function updateHandoff(userId: string, streamId: string, updates: Partial<HandoffChecklist>): HandoffChecklist | null {
  const key = `${userId}:${streamId}`;
  const state = handoffStates.get(key);
  if (!state) return null;

  Object.assign(state.checklist, updates);

  const cl = state.checklist;
  if (cl.vodProcessed && cl.thumbnailGenerated && cl.seoOptimized && cl.highlightsExtracted && cl.learningRecorded && cl.editCopyCreated) {
    state.completedAt = new Date();
  }

  return state.checklist;
}

export function getHandoffStatus(userId: string, streamId: string): {
  checklist: HandoffChecklist;
  progress: number;
  complete: boolean;
  startedAt: Date;
  completedAt: Date | null;
} | null {
  const state = handoffStates.get(`${userId}:${streamId}`);
  if (!state) return null;

  const cl = state.checklist;
  const items = [cl.vodProcessed, cl.thumbnailGenerated, cl.seoOptimized, cl.highlightsExtracted, cl.learningRecorded, cl.socialPosted, cl.replayQueued, cl.editCopyCreated];
  const done = items.filter(Boolean).length;

  return {
    checklist: cl,
    progress: done / items.length,
    complete: state.completedAt !== null,
    startedAt: state.startedAt,
    completedAt: state.completedAt,
  };
}

export function getHandoffChecklist(): string[] {
  return [
    "VOD processing (upload, transcode)",
    "Thumbnail generation (AI variants + best selection)",
    "SEO optimization (title, description, tags)",
    "Highlight extraction (top moments → clips)",
    "Learning signal recording (performance baseline)",
    "Social media post (stream recap announcement)",
    "Replay queue (VOD → content atom pipeline)",
    "Edit copy created (stream recording → studio for editing)",
  ];
}
