export interface DisclosureResult {
  required: boolean;
  disclosureText: string;
  reason: string;
  complianceLevel: "full" | "partial" | "none";
}

export function generateDisclosure(content: {
  isAiGenerated: boolean;
  aiComponents: string[];
  platform: string;
}): DisclosureResult {
  if (!content.isAiGenerated && content.aiComponents.length === 0) {
    return {
      required: false,
      disclosureText: "",
      reason: "No AI-generated components detected",
      complianceLevel: "full",
    };
  }

  const components = content.aiComponents.join(", ");
  const disclosureText = content.aiComponents.length > 0
    ? `AI-assisted content: ${components} were generated or enhanced using AI tools.`
    : "This content was generated using AI tools.";

  return {
    required: true,
    disclosureText,
    reason: `AI components detected: ${components || "full content"}`,
    complianceLevel: "full",
  };
}

export function checkDisclosureCompliance(
  description: string,
  aiComponents: string[],
): { compliant: boolean; missingDisclosures: string[] } {
  if (aiComponents.length === 0) return { compliant: true, missingDisclosures: [] };

  const descLower = description.toLowerCase();
  const hasGenericDisclosure = /ai[- ]?(generated|assisted|created|enhanced|powered)/i.test(descLower);

  if (hasGenericDisclosure) return { compliant: true, missingDisclosures: [] };

  return {
    compliant: false,
    missingDisclosures: aiComponents.map(c => `Missing disclosure for AI-${c}`),
  };
}
