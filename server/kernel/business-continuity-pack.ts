import { appendEvent } from "./creator-intelligence-graph";

export interface ContinuityPackSection {
  name: string;
  category: "operations" | "credentials" | "revenue" | "content" | "contacts" | "legal" | "platform";
  lastUpdated: Date;
  isComplete: boolean;
  data: Record<string, unknown>;
  staleDays: number;
}

export interface BusinessContinuityPack {
  userId: string;
  version: number;
  sections: ContinuityPackSection[];
  completeness: number;
  lastFullUpdate: Date;
  isExportable: boolean;
  staleSections: string[];
  exportHistory: { exportedAt: Date; format: string; sections: string[] }[];
}

const packStore = new Map<string, BusinessContinuityPack>();

function createEmptyPack(userId: string): BusinessContinuityPack {
  const now = new Date();
  return {
    userId, version: 1,
    sections: [
      { name: "Channel Operations", category: "operations", lastUpdated: now, isComplete: false, data: {}, staleDays: 0 },
      { name: "Platform Credentials", category: "credentials", lastUpdated: now, isComplete: false, data: {}, staleDays: 0 },
      { name: "Revenue Streams", category: "revenue", lastUpdated: now, isComplete: false, data: {}, staleDays: 0 },
      { name: "Content Library", category: "content", lastUpdated: now, isComplete: false, data: {}, staleDays: 0 },
      { name: "Key Contacts", category: "contacts", lastUpdated: now, isComplete: false, data: {}, staleDays: 0 },
      { name: "Legal & Contracts", category: "legal", lastUpdated: now, isComplete: false, data: {}, staleDays: 0 },
      { name: "Platform Configurations", category: "platform", lastUpdated: now, isComplete: false, data: {}, staleDays: 0 },
    ],
    completeness: 0,
    lastFullUpdate: now,
    isExportable: false,
    staleSections: [],
    exportHistory: [],
  };
}

export function getOrCreatePack(userId: string): BusinessContinuityPack {
  let pack = packStore.get(userId);
  if (!pack) {
    pack = createEmptyPack(userId);
    packStore.set(userId, pack);
  }
  return pack;
}

export function updateSection(
  userId: string,
  sectionName: string,
  data: Record<string, unknown>,
  isComplete: boolean = true
): BusinessContinuityPack {
  const pack = getOrCreatePack(userId);
  const section = pack.sections.find(s => s.name === sectionName);
  if (!section) throw new Error(`Unknown section: ${sectionName}`);

  section.data = { ...section.data, ...data };
  section.isComplete = isComplete;
  section.lastUpdated = new Date();
  section.staleDays = 0;

  const completeSections = pack.sections.filter(s => s.isComplete).length;
  pack.completeness = completeSections / pack.sections.length;
  pack.isExportable = pack.completeness >= 0.5;
  pack.version++;
  pack.lastFullUpdate = new Date();

  refreshStaleness(pack);

  appendEvent("continuity.section_updated", "business", userId, {
    section: sectionName,
    completeness: pack.completeness,
    isExportable: pack.isExportable,
  }, "business-continuity-pack");

  return pack;
}

function refreshStaleness(pack: BusinessContinuityPack): void {
  const now = Date.now();
  pack.staleSections = [];
  for (const section of pack.sections) {
    section.staleDays = Math.floor((now - section.lastUpdated.getTime()) / (24 * 60 * 60 * 1000));
    if (section.staleDays > 30) {
      pack.staleSections.push(section.name);
    }
  }
}

export function exportPack(
  userId: string,
  format: "json" | "pdf_data" = "json",
  sectionFilter?: string[]
): { data: Record<string, unknown>; exportedSections: string[]; exportedAt: Date } {
  const pack = getOrCreatePack(userId);
  if (!pack.isExportable) throw new Error("Pack is not exportable — completeness below 50%");

  const sectionsToExport = sectionFilter
    ? pack.sections.filter(s => sectionFilter.includes(s.name))
    : pack.sections.filter(s => s.isComplete);

  const exportData: Record<string, unknown> = {
    userId: pack.userId,
    version: pack.version,
    exportedAt: new Date().toISOString(),
    completeness: pack.completeness,
    sections: sectionsToExport.reduce((acc, s) => {
      acc[s.name] = { category: s.category, data: s.data, lastUpdated: s.lastUpdated };
      return acc;
    }, {} as Record<string, unknown>),
  };

  const exportedSections = sectionsToExport.map(s => s.name);
  const exportedAt = new Date();

  pack.exportHistory.push({ exportedAt, format, sections: exportedSections });

  appendEvent("continuity.pack_exported", "business", userId, {
    format,
    sectionCount: exportedSections.length,
    version: pack.version,
  }, "business-continuity-pack");

  return { data: exportData, exportedSections, exportedAt };
}

export function getStalenessAlerts(userId: string): { section: string; staleDays: number; severity: "warning" | "critical" }[] {
  const pack = getOrCreatePack(userId);
  refreshStaleness(pack);
  return pack.staleSections.map(name => {
    const section = pack.sections.find(s => s.name === name)!;
    return {
      section: name,
      staleDays: section.staleDays,
      severity: section.staleDays > 90 ? "critical" as const : "warning" as const,
    };
  });
}
