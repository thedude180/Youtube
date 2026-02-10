import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  Copyright,
  FileText,
  Lock,
  AlertTriangle,
  CheckCircle2,
  Scale,
} from "lucide-react";

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

export default function Protections() {
  const [_activeSection] = useState<string | null>(null);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">
          Protections
        </h1>
        <p data-testid="text-page-subtitle" className="text-sm text-muted-foreground mt-1">
          Safeguard your content, brand, and business
        </p>
      </div>

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
