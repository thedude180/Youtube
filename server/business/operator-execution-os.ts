import { appendEvent } from "../kernel/creator-intelligence-graph";
import { getConfidenceForDomain } from "../kernel/learning-maturity-system";

export type OperatorRole = "content_ops" | "revenue_ops" | "distribution_ops" | "community_ops" | "tech_ops";

export interface OperatorPlaybook {
  role: OperatorRole;
  tasks: { name: string; frequency: string; automatable: boolean; automationScore: number }[];
  delegationReadiness: number;
  hiringPriority: number;
}

export interface OperatorExecutionReport {
  playbooks: OperatorPlaybook[];
  overallDelegationReadiness: number;
  recommendedHires: OperatorRole[];
  automationCoverage: number;
  assessedAt: Date;
}

export function buildOperatorPlaybooks(): OperatorPlaybook[] {
  const roles: { role: OperatorRole; domain: string; tasks: { name: string; frequency: string; automatable: boolean }[] }[] = [
    {
      role: "content_ops",
      domain: "content",
      tasks: [
        { name: "Schedule content calendar", frequency: "weekly", automatable: true },
        { name: "Review AI-generated thumbnails", frequency: "per-video", automatable: false },
        { name: "Monitor content performance", frequency: "daily", automatable: true },
        { name: "Manage SEO optimization", frequency: "per-video", automatable: true },
      ],
    },
    {
      role: "revenue_ops",
      domain: "revenue",
      tasks: [
        { name: "Track revenue reconciliation", frequency: "weekly", automatable: true },
        { name: "Manage sponsor communications", frequency: "per-deal", automatable: false },
        { name: "Monitor monetization metrics", frequency: "daily", automatable: true },
        { name: "Process invoices and payments", frequency: "monthly", automatable: false },
      ],
    },
    {
      role: "distribution_ops",
      domain: "distribution",
      tasks: [
        { name: "Cross-platform publishing", frequency: "per-video", automatable: true },
        { name: "Monitor platform health", frequency: "daily", automatable: true },
        { name: "Manage platform relationships", frequency: "monthly", automatable: false },
      ],
    },
    {
      role: "community_ops",
      domain: "audience",
      tasks: [
        { name: "Community engagement moderation", frequency: "daily", automatable: true },
        { name: "Respond to high-priority comments", frequency: "daily", automatable: false },
        { name: "Manage Discord community", frequency: "daily", automatable: false },
      ],
    },
    {
      role: "tech_ops",
      domain: "system",
      tasks: [
        { name: "Monitor system health", frequency: "continuous", automatable: true },
        { name: "Manage API integrations", frequency: "weekly", automatable: false },
        { name: "Review security alerts", frequency: "daily", automatable: true },
      ],
    },
  ];

  return roles.map((r) => {
    const domainConfidence = getConfidenceForDomain(r.domain);
    const tasks = r.tasks.map((t) => ({
      ...t,
      automationScore: t.automatable ? Math.min(1, domainConfidence * 1.2) : 0.1,
    }));
    const autoTasks = tasks.filter((t) => t.automationScore > 0.5);
    const delegationReadiness = tasks.length > 0 ? autoTasks.length / tasks.length : 0;
    const hiringPriority = 1 - delegationReadiness;

    return { role: r.role, tasks, delegationReadiness, hiringPriority };
  });
}

export function getOperatorExecutionReport(): OperatorExecutionReport {
  const playbooks = buildOperatorPlaybooks();
  const overallDelegation = playbooks.length > 0
    ? playbooks.reduce((sum, p) => sum + p.delegationReadiness, 0) / playbooks.length
    : 0;

  const recommendedHires = playbooks
    .filter((p) => p.hiringPriority > 0.6)
    .sort((a, b) => b.hiringPriority - a.hiringPriority)
    .map((p) => p.role);

  const allTasks = playbooks.flatMap((p) => p.tasks);
  const automationCoverage = allTasks.length > 0
    ? allTasks.filter((t) => t.automationScore > 0.5).length / allTasks.length
    : 0;

  return {
    playbooks,
    overallDelegationReadiness: overallDelegation,
    recommendedHires,
    automationCoverage,
    assessedAt: new Date(),
  };
}
