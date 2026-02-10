import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Building2, FileText, CheckCircle2, ArrowRight, MapPin, Shield,
  Copyright, Lock, AlertTriangle, Scale,
} from "lucide-react";

const entityTypes = [
  {
    name: "Sole Proprietorship",
    icon: FileText,
    description: "The simplest business structure with no formal filing required. You and your business are legally the same entity.",
    pros: ["No formation filing", "Easiest to set up", "Full control", "Simple tax filing"],
    cons: ["Personal liability", "All income is SE tax", "Harder to raise capital", "No liability protection"],
    bestFor: "New creators just starting out with low risk",
    annualCost: "$0 - $50",
  },
  {
    name: "LLC",
    icon: Shield,
    description: "Limited liability company offering personal asset protection with flexible taxation options.",
    pros: ["Limited liability", "Flexible taxation", "Pass-through income", "Credibility"],
    cons: ["Annual filing required", "State fees $50-$500", "Self-employment tax", "Varies by state"],
    bestFor: "Creators earning consistent income who want liability protection",
    annualCost: "$50 - $500",
  },
  {
    name: "S-Corp",
    icon: Building2,
    description: "Corporation that passes income through to shareholders, saving on self-employment taxes at higher income levels.",
    pros: ["Save on SE tax", "Salary + distributions", "Limited liability", "Tax flexibility"],
    cons: ["Payroll required", "More complex", "Reasonable salary rules", "Strict requirements"],
    bestFor: "Creators earning $100k+ annually",
    annualCost: "$500 - $2,000",
  },
  {
    name: "C-Corp",
    icon: Building2,
    description: "Traditional corporation structure best suited for creators seeking venture capital or outside investment.",
    pros: ["Unlimited shareholders", "Attract investors", "Stock options", "Separate legal entity"],
    cons: ["Double taxation", "Most complex", "Board required", "Expensive to maintain"],
    bestFor: "Creators building media companies or seeking VC investment",
    annualCost: "$1,000 - $5,000+",
  },
];

const stateData: Record<string, { filingFee: string; annualReport: string; incomeTax: string; registeredAgent: string }> = {
  CA: {
    filingFee: "$70 LLC / $100 Corp",
    annualReport: "$800 minimum franchise tax + $20 biennial report",
    incomeTax: "1% - 13.3% (highest in US)",
    registeredAgent: "Required - must have a California address",
  },
  TX: {
    filingFee: "$300 LLC / $300 Corp",
    annualReport: "Annual franchise tax report (no tax if revenue under $2.47M)",
    incomeTax: "No state income tax",
    registeredAgent: "Required - must have a Texas address",
  },
  FL: {
    filingFee: "$125 LLC / $70 Corp",
    annualReport: "$138.75 annual report",
    incomeTax: "No state income tax",
    registeredAgent: "Required - must have a Florida address",
  },
  NY: {
    filingFee: "$200 LLC / $125 Corp",
    annualReport: "$9 biennial statement for LLCs / no annual report for Corps",
    incomeTax: "4% - 10.9%",
    registeredAgent: "Required - must have a New York address",
  },
  WA: {
    filingFee: "$200 LLC / $180 Corp",
    annualReport: "$71 annual report",
    incomeTax: "No state income tax",
    registeredAgent: "Required - must have a Washington address",
  },
  DE: {
    filingFee: "$90 LLC / $89 Corp",
    annualReport: "$300 LLC tax / $50+ Corp franchise tax",
    incomeTax: "2.2% - 6.6%",
    registeredAgent: "Required - must have a Delaware address",
  },
  NV: {
    filingFee: "$75 LLC / $75 Corp",
    annualReport: "$150 annual list of members/managers",
    incomeTax: "No state income tax",
    registeredAgent: "Required - must have a Nevada address",
  },
  WY: {
    filingFee: "$100 LLC / $100 Corp",
    annualReport: "$60 minimum annual report",
    incomeTax: "No state income tax",
    registeredAgent: "Required - must have a Wyoming address",
  },
  CO: {
    filingFee: "$50 LLC / $50 Corp",
    annualReport: "$10 periodic report",
    incomeTax: "4.4% flat rate",
    registeredAgent: "Required - must have a Colorado address",
  },
  GA: {
    filingFee: "$100 LLC / $100 Corp",
    annualReport: "$50 annual registration",
    incomeTax: "1% - 5.75%",
    registeredAgent: "Required - must have a Georgia address",
  },
};

const allStates = [
  { value: "AL", label: "Alabama" }, { value: "AK", label: "Alaska" }, { value: "AZ", label: "Arizona" },
  { value: "AR", label: "Arkansas" }, { value: "CA", label: "California" }, { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" }, { value: "DE", label: "Delaware" }, { value: "DC", label: "District of Columbia" },
  { value: "FL", label: "Florida" }, { value: "GA", label: "Georgia" }, { value: "HI", label: "Hawaii" },
  { value: "ID", label: "Idaho" }, { value: "IL", label: "Illinois" }, { value: "IN", label: "Indiana" },
  { value: "IA", label: "Iowa" }, { value: "KS", label: "Kansas" }, { value: "KY", label: "Kentucky" },
  { value: "LA", label: "Louisiana" }, { value: "ME", label: "Maine" }, { value: "MD", label: "Maryland" },
  { value: "MA", label: "Massachusetts" }, { value: "MI", label: "Michigan" }, { value: "MN", label: "Minnesota" },
  { value: "MS", label: "Mississippi" }, { value: "MO", label: "Missouri" }, { value: "MT", label: "Montana" },
  { value: "NE", label: "Nebraska" }, { value: "NV", label: "Nevada" }, { value: "NH", label: "New Hampshire" },
  { value: "NJ", label: "New Jersey" }, { value: "NM", label: "New Mexico" }, { value: "NY", label: "New York" },
  { value: "NC", label: "North Carolina" }, { value: "ND", label: "North Dakota" }, { value: "OH", label: "Ohio" },
  { value: "OK", label: "Oklahoma" }, { value: "OR", label: "Oregon" }, { value: "PA", label: "Pennsylvania" },
  { value: "RI", label: "Rhode Island" }, { value: "SC", label: "South Carolina" }, { value: "SD", label: "South Dakota" },
  { value: "TN", label: "Tennessee" }, { value: "TX", label: "Texas" }, { value: "UT", label: "Utah" },
  { value: "VT", label: "Vermont" }, { value: "VA", label: "Virginia" }, { value: "WA", label: "Washington" },
  { value: "WV", label: "West Virginia" }, { value: "WI", label: "Wisconsin" }, { value: "WY", label: "Wyoming" },
];

const formationSteps = [
  { step: 1, title: "Choose your entity type", description: "Compare structures above to find the best fit for your creator business" },
  { step: 2, title: "Select your state of formation", description: "Consider your home state or business-friendly states like Wyoming or Delaware" },
  { step: 3, title: "Choose a business name", description: "Check availability with your state's Secretary of State website" },
  { step: 4, title: "File with the state", description: "Submit Articles of Organization (LLC) or Articles of Incorporation (Corp)" },
  { step: 5, title: "Get an EIN from the IRS", description: "Apply online at IRS.gov - it's free and takes minutes" },
  { step: 6, title: "Open a business bank account", description: "Keep personal and business finances separate" },
  { step: 7, title: "Set up accounting", description: "Use software like QuickBooks or Wave to track income and expenses" },
  { step: 8, title: "Register for state taxes", description: "Register for sales tax, payroll tax, or other applicable state taxes" },
];

const copyrightItems = [
  "Register works with US Copyright Office ($65/work)",
  "Add watermarks to thumbnails and images",
  "Document your creative process",
  "Set up Content ID on YouTube",
  "Monitor for unauthorized use",
];

const trademarkItems = [
  "Search USPTO for existing trademarks",
  "File trademark application ($250-$350/class)",
  "Register in relevant categories (entertainment, education)",
  "Monitor for infringement",
  "Consider international registration (Madrid Protocol)",
];

const legalAgreements = [
  { name: "Sponsorship contract template", severity: "Critical" },
  { name: "Collaboration agreement", severity: "Important" },
  { name: "Terms of service for your website", severity: "Important" },
  { name: "Privacy policy", severity: "Required by law" },
  { name: "Independent contractor agreement", severity: "Important" },
  { name: "Non-disclosure agreement", severity: "Recommended" },
];

const dmcaSteps = [
  "Document the infringement (screenshots, URLs)",
  "File DMCA takedown notice",
  "Contact platform's copyright team",
  "Consider legal action for repeat offenders",
  "Set up Google Alerts for your content titles",
];

const insuranceTypes = [
  {
    name: "General liability",
    description: "Covers third-party bodily injury and property damage claims from business operations",
  },
  {
    name: "Professional liability (E&O)",
    description: "Protects against claims of negligence, errors, or omissions in your professional services",
  },
  {
    name: "Equipment insurance",
    description: "Covers repair or replacement of cameras, lighting, computers, and other gear",
  },
  {
    name: "Business interruption",
    description: "Replaces lost income if your business is temporarily unable to operate",
  },
];

function severityVariant(severity: string) {
  switch (severity) {
    case "Critical":
      return "destructive";
    case "Required by law":
      return "destructive";
    case "Important":
      return "secondary";
    default:
      return "outline";
  }
}

function FormationContent() {
  const [selectedState, setSelectedState] = useState<string>("");

  const stateInfo = selectedState ? stateData[selectedState] : null;
  const stateName = allStates.find(s => s.value === selectedState)?.label;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Building2 className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Entity Type Comparison</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {entityTypes.map((entity) => {
            const Icon = entity.icon;
            return (
              <Card key={entity.name} data-testid={`card-entity-${entity.name.toLowerCase().replace(/[\s-]+/g, "-")}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <CardTitle className="text-base">{entity.name}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">{entity.description}</p>
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1">
                      {entity.pros.map((pro) => (
                        <Badge key={pro} variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-500 no-default-hover-elevate no-default-active-elevate">
                          {pro}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {entity.cons.map((con) => (
                        <Badge key={con} variant="secondary" className="text-xs" data-testid={`badge-con-${con.toLowerCase().replace(/\s+/g, "-")}`}>
                          {con}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="border-t pt-3 space-y-1">
                    <div className="flex items-start gap-2">
                      <ArrowRight className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                      <p className="text-xs text-muted-foreground"><span className="font-medium">Best for:</span> {entity.bestFor}</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <FileText className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                      <p className="text-xs text-muted-foreground"><span className="font-medium">Est. annual cost:</span> {entity.annualCost}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <MapPin className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">State Formation Details</h2>
        </div>
        <div className="max-w-sm">
          <Select value={selectedState} onValueChange={setSelectedState}>
            <SelectTrigger data-testid="select-state">
              <SelectValue placeholder="Select a state" />
            </SelectTrigger>
            <SelectContent>
              {allStates.map((state) => (
                <SelectItem key={state.value} value={state.value} data-testid={`option-state-${state.value}`}>
                  {state.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedState && (
          <Card className="mt-4" data-testid="card-state-info">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{stateName}</CardTitle>
            </CardHeader>
            <CardContent>
              {stateInfo ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Filing Fee</p>
                    <p className="text-sm" data-testid="text-filing-fee">{stateInfo.filingFee}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Annual Report</p>
                    <p className="text-sm" data-testid="text-annual-report">{stateInfo.annualReport}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">State Income Tax</p>
                    <p className="text-sm" data-testid="text-income-tax">{stateInfo.incomeTax}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Registered Agent</p>
                    <p className="text-sm" data-testid="text-registered-agent">{stateInfo.registeredAgent}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground" data-testid="text-no-state-data">
                  Contact a local attorney for state-specific details.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Recommended Steps</h2>
        </div>
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border/50">
              {formationSteps.map((item) => (
                <div key={item.step} className="px-6 py-4 flex items-start gap-4" data-testid={`step-${item.step}`}>
                  <div className="flex items-center justify-center h-7 w-7 rounded-full bg-muted text-sm font-semibold shrink-0">
                    {item.step}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ProtectionsContent() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card data-testid="card-copyright-protection">
          <CardHeader className="flex flex-row items-center gap-3 flex-wrap">
            <Copyright className="h-5 w-5 text-muted-foreground shrink-0" />
            <CardTitle className="text-base">Copyright Protection</CardTitle>
          </CardHeader>
          <CardContent>
            <p data-testid="text-copyright-description" className="text-sm text-muted-foreground mb-4">
              Your original content is automatically copyrighted. Here's how to strengthen your protection.
            </p>
            <ul className="space-y-2">
              {copyrightItems.map((item, index) => (
                <li key={index} data-testid={`item-copyright-${index}`} className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span className="text-sm">{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card data-testid="card-trademark-protection">
          <CardHeader className="flex flex-row items-center gap-3 flex-wrap">
            <Shield className="h-5 w-5 text-muted-foreground shrink-0" />
            <CardTitle className="text-base">Trademark Protection</CardTitle>
          </CardHeader>
          <CardContent>
            <p data-testid="text-trademark-description" className="text-sm text-muted-foreground mb-4">
              Protect your brand name, logo, and catchphrases
            </p>
            <ul className="space-y-2">
              {trademarkItems.map((item, index) => (
                <li key={index} data-testid={`item-trademark-${index}`} className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span className="text-sm">{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card data-testid="card-legal-agreements">
          <CardHeader className="flex flex-row items-center gap-3 flex-wrap">
            <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
            <CardTitle className="text-base">Legal Agreements</CardTitle>
          </CardHeader>
          <CardContent>
            <p data-testid="text-legal-description" className="text-sm text-muted-foreground mb-4">
              Essential contracts for your creator business
            </p>
            <ul className="space-y-3">
              {legalAgreements.map((item, index) => (
                <li key={index} data-testid={`item-legal-${index}`} className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm">{item.name}</span>
                  <Badge
                    data-testid={`badge-severity-${index}`}
                    variant={severityVariant(item.severity) as any}
                    className="shrink-0"
                  >
                    {item.severity}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card data-testid="card-dmca-content-theft">
          <CardHeader className="flex flex-row items-center gap-3 flex-wrap">
            <AlertTriangle className="h-5 w-5 text-muted-foreground shrink-0" />
            <CardTitle className="text-base">DMCA & Content Theft</CardTitle>
          </CardHeader>
          <CardContent>
            <p data-testid="text-dmca-description" className="text-sm text-muted-foreground mb-4">
              What to do when your content is stolen
            </p>
            <ol className="space-y-2">
              {dmcaSteps.map((step, index) => (
                <li key={index} data-testid={`item-dmca-${index}`} className="flex items-start gap-2">
                  <span className="text-sm font-medium text-muted-foreground shrink-0">{index + 1}.</span>
                  <span className="text-sm">{step}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-creator-insurance">
        <CardHeader className="flex flex-row items-center gap-3 flex-wrap">
          <Scale className="h-5 w-5 text-muted-foreground shrink-0" />
          <CardTitle className="text-base">Creator Insurance</CardTitle>
        </CardHeader>
        <CardContent>
          <p data-testid="text-insurance-description" className="text-sm text-muted-foreground mb-4">
            As your business grows, consider these insurance types:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {insuranceTypes.map((insurance, index) => (
              <div key={index} data-testid={`item-insurance-${index}`} className="space-y-1">
                <p className="text-sm font-medium">{insurance.name}</p>
                <p className="text-xs text-muted-foreground">{insurance.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-ai-compliance-monitor">
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-muted-foreground shrink-0" />
            <CardTitle className="text-base">Your AI Legal Advisor is always watching</CardTitle>
          </div>
          <Badge data-testid="badge-ai-monitoring" variant="secondary">
            AI Monitoring Active
          </Badge>
        </CardHeader>
        <CardContent>
          <p data-testid="text-ai-compliance-description" className="text-sm text-muted-foreground">
            The Legal Advisor agent continuously monitors your content and business activities for compliance issues.
            It scans sponsorship disclosures, checks copyright usage, reviews contract terms, and alerts you to
            potential legal risks before they become problems. All monitoring happens automatically in the background
            so you can focus on creating.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Legal() {
  const [activeTab, setActiveTab] = useState<"formation" | "protections">("formation");

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">Legal</h1>
        <p data-testid="text-page-subtitle" className="text-sm text-muted-foreground mt-1">Business formation, protections, and legal guidance</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          variant={activeTab === "formation" ? "default" : "secondary"}
          onClick={() => setActiveTab("formation")}
          data-testid="tab-formation"
        >
          Formation
        </Button>
        <Button
          variant={activeTab === "protections" ? "default" : "secondary"}
          onClick={() => setActiveTab("protections")}
          data-testid="tab-protections"
        >
          Protections
        </Button>
      </div>

      {activeTab === "formation" && <FormationContent />}
      {activeTab === "protections" && <ProtectionsContent />}
    </div>
  );
}
