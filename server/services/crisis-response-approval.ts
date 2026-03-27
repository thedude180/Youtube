import { emitDomainEvent } from "../kernel/index";

export type CrisisApprovalStatus = "pending" | "approved" | "rejected" | "auto_approved" | "expired";

export interface CrisisResponseAction {
  id: string;
  crisisType: string;
  severity: "low" | "medium" | "high" | "critical";
  proposedAction: string;
  requiresApproval: boolean;
  approvalStatus: CrisisApprovalStatus;
  approvedBy?: string;
  approvedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
  executedAt?: Date;
}

const approvalStore = new Map<string, CrisisResponseAction[]>();

function getUserApprovals(userId: string): CrisisResponseAction[] {
  if (!approvalStore.has(userId)) approvalStore.set(userId, []);
  return approvalStore.get(userId)!;
}

export function requestCrisisApproval(
  userId: string,
  crisisType: string,
  severity: CrisisResponseAction["severity"],
  proposedAction: string
): CrisisResponseAction {
  const approvals = getUserApprovals(userId);

  const requiresApproval = severity === "high" || severity === "critical";

  const action: CrisisResponseAction = {
    id: `crisis_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    crisisType,
    severity,
    proposedAction,
    requiresApproval,
    approvalStatus: requiresApproval ? "pending" : "auto_approved",
    expiresAt: new Date(Date.now() + (severity === "critical" ? 30 * 60 * 1000 : 4 * 60 * 60 * 1000)),
    createdAt: new Date(),
  };

  if (!requiresApproval) {
    action.approvedAt = new Date();
    action.approvedBy = "system_auto";
  }

  approvals.push(action);
  return action;
}

export function approveCrisisAction(userId: string, actionId: string, approvedBy: string): { approved: boolean; reason?: string } {
  const approvals = getUserApprovals(userId);
  const action = approvals.find((a) => a.id === actionId);
  if (!action) return { approved: false, reason: "Action not found" };
  if (action.approvalStatus !== "pending") return { approved: false, reason: `Action already ${action.approvalStatus}` };
  if (new Date() > action.expiresAt) {
    action.approvalStatus = "expired";
    return { approved: false, reason: "Approval window expired" };
  }

  action.approvalStatus = "approved";
  action.approvedBy = approvedBy;
  action.approvedAt = new Date();
  return { approved: true };
}

export function rejectCrisisAction(userId: string, actionId: string, rejectedBy: string): boolean {
  const approvals = getUserApprovals(userId);
  const action = approvals.find((a) => a.id === actionId);
  if (!action || action.approvalStatus !== "pending") return false;
  action.approvalStatus = "rejected";
  action.approvedBy = rejectedBy;
  action.approvedAt = new Date();
  return true;
}

export function canExecuteCrisisAction(userId: string, actionId: string): { canExecute: boolean; reason: string } {
  const approvals = getUserApprovals(userId);
  const action = approvals.find((a) => a.id === actionId);
  if (!action) return { canExecute: false, reason: "Action not found" };
  if (action.executedAt) return { canExecute: false, reason: "Already executed" };
  if (action.approvalStatus === "approved" || action.approvalStatus === "auto_approved") {
    return { canExecute: true, reason: "Approved for execution" };
  }
  if (action.approvalStatus === "pending") return { canExecute: false, reason: "Awaiting approval" };
  return { canExecute: false, reason: `Action ${action.approvalStatus}` };
}

export function markExecuted(userId: string, actionId: string): boolean {
  const approvals = getUserApprovals(userId);
  const action = approvals.find((a) => a.id === actionId);
  if (!action) return false;
  const check = canExecuteCrisisAction(userId, actionId);
  if (!check.canExecute) return false;
  action.executedAt = new Date();
  return true;
}

export function getPendingApprovals(userId: string): CrisisResponseAction[] {
  return getUserApprovals(userId).filter((a) => a.approvalStatus === "pending" && new Date() < a.expiresAt);
}
