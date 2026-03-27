import { appendEvent } from "../kernel/creator-intelligence-graph";
import { canAutomate, getConfidenceForDomain } from "../kernel/learning-maturity-system";

export interface SystemActivationState {
  systemName: string;
  domain: string;
  currentLevel: "inactive" | "shadow" | "partial" | "active" | "full";
  requiredMaturity: number;
  requiredEvidence: number;
  currentMaturity: number;
  isActive: boolean;
  activatedAt?: Date;
  lastChecked: Date;
}

const systemStates = new Map<string, SystemActivationState>();
let seeded = false;

function initSystemState(
  systemName: string,
  domain: string,
  requiredMaturity: number,
  requiredEvidence: number
): SystemActivationState {
  if (systemStates.has(systemName)) return systemStates.get(systemName)!;
  const state: SystemActivationState = {
    systemName,
    domain,
    currentLevel: "shadow",
    requiredMaturity,
    requiredEvidence,
    currentMaturity: 0,
    isActive: false,
    lastChecked: new Date(),
  };
  systemStates.set(systemName, state);
  return state;
}

export function seedAllSystems(): void {
  initSystemState("narrative_arc", "content", 0.4, 20);
  initSystemState("moment_genome", "content", 0.5, 30);
  initSystemState("content_demand_graph", "content", 0.5, 25);
  initSystemState("pre_creation_oracle", "content", 0.6, 50);
  initSystemState("smart_inbox", "live", 0.3, 10);
  initSystemState("weekly_intelligence_brief", "business", 0.4, 15);
  initSystemState("predictive_content", "content", 0.7, 100);
  initSystemState("audience_soul", "audience", 0.6, 40);
  initSystemState("data_sovereignty", "compliance", 0.5, 20);
  initSystemState("sponsor_ops", "business", 0.4, 15);
  initSystemState("capital_allocation", "business", 0.5, 30);
  initSystemState("trust_risk_simulator", "compliance", 0.6, 25);
  initSystemState("operator_execution", "business", 0.5, 20);
  initSystemState("multilingual", "distribution", 0.4, 15);
  initSystemState("geographic_intelligence", "distribution", 0.4, 15);
  initSystemState("ai_displacement", "business", 0.5, 20);
  initSystemState("mna_intelligence", "business", 0.6, 30);
  initSystemState("infrastructure_positioning", "business", 0.4, 10);
}

export function checkAndActivate(systemName: string): {
  activated: boolean;
  level: SystemActivationState["currentLevel"];
  reason: string;
} {
  const state = systemStates.get(systemName);
  if (!state) return { activated: false, level: "inactive", reason: "System not registered" };

  state.currentMaturity = getConfidenceForDomain(state.domain);
  state.lastChecked = new Date();

  if (state.currentMaturity >= state.requiredMaturity) {
    if (!state.isActive) {
      state.isActive = true;
      state.currentLevel = "active";
      state.activatedAt = new Date();

      appendEvent("system.health_change", "activation", systemName, {
        previousLevel: "shadow",
        newLevel: "active",
        maturity: state.currentMaturity,
      }, "full-systems-activation");
    }
    return { activated: true, level: state.currentLevel, reason: `Maturity ${(state.currentMaturity * 100).toFixed(0)}% meets threshold ${(state.requiredMaturity * 100).toFixed(0)}%` };
  }

  if (state.currentMaturity >= state.requiredMaturity * 0.7) {
    state.currentLevel = "partial";
    return { activated: false, level: "partial", reason: `Approaching maturity threshold: ${(state.currentMaturity * 100).toFixed(0)}%/${(state.requiredMaturity * 100).toFixed(0)}%` };
  }

  return { activated: false, level: state.currentLevel, reason: `Maturity ${(state.currentMaturity * 100).toFixed(0)}% below threshold ${(state.requiredMaturity * 100).toFixed(0)}%` };
}

export function activateAllEligible(): { activated: string[]; pending: string[]; inactive: string[] } {
  const activated: string[] = [];
  const pending: string[] = [];
  const inactive: string[] = [];

  for (const [name] of systemStates) {
    const result = checkAndActivate(name);
    if (result.activated) activated.push(name);
    else if (result.level === "partial" || result.level === "shadow") pending.push(name);
    else inactive.push(name);
  }

  return { activated, pending, inactive };
}

export function getSystemState(name: string): SystemActivationState | undefined {
  return systemStates.get(name);
}

export function getAllSystemStates(): SystemActivationState[] {
  return Array.from(systemStates.values());
}

export function getActivationReport(): {
  total: number;
  active: number;
  partial: number;
  shadow: number;
  inactive: number;
  activationRate: number;
  systems: SystemActivationState[];
} {
  const systems = getAllSystemStates();
  const active = systems.filter((s) => s.currentLevel === "active" || s.currentLevel === "full").length;
  const partial = systems.filter((s) => s.currentLevel === "partial").length;
  const shadow = systems.filter((s) => s.currentLevel === "shadow").length;
  const inactive = systems.filter((s) => s.currentLevel === "inactive").length;

  return {
    total: systems.length,
    active,
    partial,
    shadow,
    inactive,
    activationRate: systems.length > 0 ? active / systems.length : 0,
    systems,
  };
}

export function forceActivate(systemName: string, reason: string): boolean {
  const state = systemStates.get(systemName);
  if (!state) return false;
  state.isActive = true;
  state.currentLevel = "active";
  state.activatedAt = new Date();
  return true;
}
