import { emitDomainEvent } from "../kernel/index";

export interface ContinuityArtifact {
  id: string;
  type: "operations_packet" | "self_assessment" | "legal_defense" | "data_room" | "revenue_truth" | "audience_graph" | "content_inventory" | "brand_assets";
  name: string;
  size: number;
  lastUpdated: Date;
  exportable: boolean;
  governanceLevel: "public" | "internal" | "confidential" | "restricted";
}

export interface ExportRequest {
  id: string;
  artifactIds: string[];
  requestedBy: string;
  requestedAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
  status: "pending" | "approved" | "rejected" | "exported" | "expired";
  exportFormat: "json" | "pdf" | "zip";
  expiresAt: Date;
}

const artifactStore = new Map<string, ContinuityArtifact[]>();
const exportRequestStore = new Map<string, ExportRequest[]>();

export function registerContinuityArtifact(userId: string, artifact: ContinuityArtifact): void {
  if (!artifactStore.has(userId)) artifactStore.set(userId, []);
  const artifacts = artifactStore.get(userId)!;
  const existing = artifacts.findIndex((a) => a.id === artifact.id);
  if (existing >= 0) artifacts[existing] = artifact;
  else artifacts.push(artifact);
}

export function seedDefaultArtifacts(userId: string): void {
  const defaults: ContinuityArtifact[] = [
    { id: "ops_packet", type: "operations_packet", name: "Operations Continuity Packet", size: 0, lastUpdated: new Date(), exportable: true, governanceLevel: "confidential" },
    { id: "self_assess", type: "self_assessment", name: "System Self-Assessment Report", size: 0, lastUpdated: new Date(), exportable: true, governanceLevel: "internal" },
    { id: "legal_def", type: "legal_defense", name: "Legal Defense Package", size: 0, lastUpdated: new Date(), exportable: true, governanceLevel: "restricted" },
    { id: "data_room", type: "data_room", name: "Data Room Export", size: 0, lastUpdated: new Date(), exportable: true, governanceLevel: "restricted" },
    { id: "rev_truth", type: "revenue_truth", name: "Revenue Truth Records", size: 0, lastUpdated: new Date(), exportable: true, governanceLevel: "confidential" },
    { id: "audience", type: "audience_graph", name: "Audience Identity Graph", size: 0, lastUpdated: new Date(), exportable: true, governanceLevel: "confidential" },
    { id: "content_inv", type: "content_inventory", name: "Content Inventory", size: 0, lastUpdated: new Date(), exportable: true, governanceLevel: "internal" },
    { id: "brand", type: "brand_assets", name: "Brand Assets Package", size: 0, lastUpdated: new Date(), exportable: true, governanceLevel: "internal" },
  ];

  for (const artifact of defaults) {
    registerContinuityArtifact(userId, artifact);
  }
}

export function getArtifacts(userId: string): ContinuityArtifact[] {
  return artifactStore.get(userId) || [];
}

export function requestExport(
  userId: string,
  artifactIds: string[],
  requestedBy: string,
  format: ExportRequest["exportFormat"] = "json"
): ExportRequest {
  if (!exportRequestStore.has(userId)) exportRequestStore.set(userId, []);
  const requests = exportRequestStore.get(userId)!;
  const artifacts = getArtifacts(userId);

  const restrictedArtifacts = artifactIds.filter((id) => {
    const artifact = artifacts.find((a) => a.id === id);
    return artifact?.governanceLevel === "restricted";
  });

  const request: ExportRequest = {
    id: `export_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    artifactIds,
    requestedBy,
    requestedAt: new Date(),
    status: restrictedArtifacts.length > 0 ? "pending" : "approved",
    exportFormat: format,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };

  if (request.status === "approved") {
    request.approvedBy = "system_auto";
    request.approvedAt = new Date();
  }

  requests.push(request);
  return request;
}

export function approveExport(userId: string, requestId: string, approvedBy: string): boolean {
  const requests = exportRequestStore.get(userId) || [];
  const request = requests.find((r) => r.id === requestId);
  if (!request || request.status !== "pending") return false;
  if (new Date() > request.expiresAt) { request.status = "expired"; return false; }
  request.status = "approved";
  request.approvedBy = approvedBy;
  request.approvedAt = new Date();
  return true;
}

export function executeExport(userId: string, requestId: string): {
  success: boolean;
  data?: Record<string, any>;
  reason?: string;
} {
  const requests = exportRequestStore.get(userId) || [];
  const request = requests.find((r) => r.id === requestId);
  if (!request) return { success: false, reason: "Request not found" };
  if (request.status !== "approved") return { success: false, reason: `Request is ${request.status}` };

  const artifacts = getArtifacts(userId);
  const exportData: Record<string, any> = {};
  for (const id of request.artifactIds) {
    const artifact = artifacts.find((a) => a.id === id);
    if (artifact && artifact.exportable) {
      exportData[id] = {
        type: artifact.type,
        name: artifact.name,
        governanceLevel: artifact.governanceLevel,
        exportedAt: new Date().toISOString(),
      };
    }
  }

  request.status = "exported";
  return { success: true, data: exportData };
}

export function getPendingExports(userId: string): ExportRequest[] {
  const requests = exportRequestStore.get(userId) || [];
  return requests.filter((r) => r.status === "pending" && new Date() < r.expiresAt);
}
