import { appendEvent } from "./creator-intelligence-graph";

export type ResearchTaskStatus = "queued" | "in_progress" | "completed" | "failed" | "aggregated";

export interface ResearchTask {
  id: string;
  question: string;
  domain: string;
  priority: number;
  status: ResearchTaskStatus;
  assignedAgent?: string;
  findings: ResearchFinding[];
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  parentTaskId?: string;
  childTaskIds: string[];
}

export interface ResearchFinding {
  id: string;
  taskId: string;
  finding: string;
  confidence: number;
  evidence: string[];
  source: string;
  timestamp: Date;
  actionable: boolean;
  suggestedAction?: string;
}

export interface SwarmReport {
  activeTasks: number;
  completedTasks: number;
  totalFindings: number;
  actionableFindings: number;
  avgConfidence: number;
  domainCoverage: string[];
  recommendations: string[];
}

const taskStore = new Map<string, ResearchTask>();
const AVAILABLE_AGENTS = ["analyst", "trend-scout", "competitor-watch", "audience-researcher", "revenue-optimizer", "policy-monitor"];

export function spawnResearchTask(
  question: string,
  domain: string,
  priority: number = 0.5,
  parentTaskId?: string
): ResearchTask {
  const id = `research_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const task: ResearchTask = {
    id,
    question,
    domain,
    priority: Math.max(0, Math.min(1, priority)),
    status: "queued",
    findings: [],
    createdAt: new Date(),
    parentTaskId,
    childTaskIds: [],
  };

  if (parentTaskId) {
    const parent = taskStore.get(parentTaskId);
    if (parent) parent.childTaskIds.push(id);
  }

  taskStore.set(id, task);
  return task;
}

export function startTask(taskId: string): boolean {
  const task = taskStore.get(taskId);
  if (!task || task.status !== "queued") return false;

  const availableAgent = AVAILABLE_AGENTS[Math.floor(Math.random() * AVAILABLE_AGENTS.length)];
  task.status = "in_progress";
  task.assignedAgent = availableAgent;
  task.startedAt = new Date();
  return true;
}

export function addFinding(
  taskId: string,
  finding: string,
  confidence: number,
  evidence: string[],
  source: string,
  actionable: boolean = false,
  suggestedAction?: string
): ResearchFinding | null {
  const task = taskStore.get(taskId);
  if (!task || task.status !== "in_progress") return null;

  const findingRecord: ResearchFinding = {
    id: `finding_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    taskId,
    finding,
    confidence: Math.max(0, Math.min(1, confidence)),
    evidence,
    source,
    timestamp: new Date(),
    actionable,
    suggestedAction,
  };

  task.findings.push(findingRecord);
  return findingRecord;
}

export function completeTask(taskId: string): boolean {
  const task = taskStore.get(taskId);
  if (!task || task.status !== "in_progress") return false;

  task.status = "completed";
  task.completedAt = new Date();

  appendEvent("learning.signal_emitted", "research", task.domain, {
    question: task.question,
    findingsCount: task.findings.length,
    avgConfidence: task.findings.length > 0
      ? task.findings.reduce((sum, f) => sum + f.confidence, 0) / task.findings.length
      : 0,
    actionableCount: task.findings.filter((f) => f.actionable).length,
  }, "research-swarm");

  return true;
}

export function aggregateFindings(taskIds: string[]): ResearchFinding[] {
  const allFindings: ResearchFinding[] = [];
  for (const id of taskIds) {
    const task = taskStore.get(id);
    if (task) {
      allFindings.push(...task.findings);
      if (task.status === "completed") task.status = "aggregated";
    }
  }
  return allFindings.sort((a, b) => b.confidence - a.confidence);
}

export function spawnParallelResearch(
  questions: { question: string; domain: string; priority?: number }[]
): ResearchTask[] {
  const tasks = questions.map((q) => spawnResearchTask(q.question, q.domain, q.priority));
  for (const task of tasks) startTask(task.id);
  return tasks;
}

export function getSwarmReport(): SwarmReport {
  const tasks = Array.from(taskStore.values());
  const active = tasks.filter((t) => t.status === "in_progress");
  const completed = tasks.filter((t) => t.status === "completed" || t.status === "aggregated");
  const allFindings = tasks.flatMap((t) => t.findings);
  const actionable = allFindings.filter((f) => f.actionable);
  const domains = [...new Set(tasks.map((t) => t.domain))];

  const avgConfidence = allFindings.length > 0
    ? allFindings.reduce((sum, f) => sum + f.confidence, 0) / allFindings.length
    : 0;

  const recommendations: string[] = [];
  if (active.length === 0 && completed.length === 0) {
    recommendations.push("No research tasks — consider spawning research on key business questions");
  }
  if (actionable.length > 0) {
    recommendations.push(`${actionable.length} actionable finding(s) awaiting review`);
  }

  return {
    activeTasks: active.length,
    completedTasks: completed.length,
    totalFindings: allFindings.length,
    actionableFindings: actionable.length,
    avgConfidence,
    domainCoverage: domains,
    recommendations,
  };
}

export function getTask(id: string): ResearchTask | undefined {
  return taskStore.get(id);
}

export function getTasksByDomain(domain: string): ResearchTask[] {
  return Array.from(taskStore.values()).filter((t) => t.domain === domain);
}
