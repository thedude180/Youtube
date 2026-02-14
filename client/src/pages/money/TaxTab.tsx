import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Calculator, FileText, AlertTriangle, CheckCircle2, Building2, TrendingUp,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { QueryErrorReset } from "@/components/QueryErrorReset";

type AIResponse = any;

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
  "Delaware", "District of Columbia", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois",
  "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts",
  "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
  "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota",
  "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia",
  "Wisconsin", "Wyoming",
];

const QUARTER_INFO = [
  { label: "Q1", due: "April 15, 2026" },
  { label: "Q2", due: "June 15, 2026" },
  { label: "Q3", due: "September 15, 2026" },
  { label: "Q4", due: "January 15, 2027" },
];

const CREATOR_DEDUCTIONS = [
  "Equipment & gear (cameras, microphones, lighting)",
  "Software subscriptions (editing, analytics, scheduling)",
  "Home office expenses",
  "Internet & phone bills (business portion)",
  "Travel for content creation",
  "Professional development & courses",
  "Advertising & promotion costs",
  "Contractor & freelancer payments",
  "Music licensing & stock media",
  "Health insurance premiums (self-employed)",
];

function getEntityRecommendation(income: number) {
  if (income >= 100000) {
    return { recommended: "S-Corporation", reason: "At your income level ($100k+), an S-Corp can significantly reduce self-employment taxes through salary/distribution splitting." };
  }
  if (income >= 40000) {
    return { recommended: "LLC", reason: "With income between $40k-$100k, an LLC provides liability protection and tax flexibility without the overhead of an S-Corp." };
  }
  return { recommended: "Sole Proprietor", reason: "At your current income level (under $40k), a Sole Proprietorship keeps things simple with minimal filing requirements." };
}

export default function TaxTab() {
  const { toast } = useToast();
  const [selectedState, setSelectedState] = useState("");
  const [analysisResult, setAnalysisResult] = useState<AIResponse>(null);

  const { data: taxEstimates, isLoading: taxLoading, error: taxError } = useQuery<any[]>({ queryKey: ['/api/tax-estimates', '?year=2026'] });
  const { data: revenueSummary } = useQuery<any>({ queryKey: ['/api/revenue/summary'] });

  const totalRevenue = revenueSummary?.total || 0;
  const entityRec = getEntityRecommendation(totalRevenue);

  const analyzeMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/tax-analyze", data);
      return res.json();
    },
    onSuccess: (data) => {
      setAnalysisResult(data);
      toast({ title: "Tax analysis complete" });
    },
    onError: () => {
      toast({ title: "Analysis failed", description: "Could not complete tax analysis. Please try again.", variant: "destructive" });
    },
  });

  const handleAnalyze = () => {
    analyzeMutation.mutate({
      totalRevenue,
      totalExpenses: 0,
      state: selectedState || "California",
      entityType: "Sole Proprietor",
      year: 2026,
    });
  };

  if (taxLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (taxError) return <QueryErrorReset error={taxError} queryKey={['/api/tax-estimates', '?year=2026']} label="Failed to load tax data" />;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <Calculator className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">AI Tax Analysis</p>
              <p className="text-xs text-muted-foreground">Get personalized tax strategy recommendations</p>
            </div>
          </div>
          <Button
            data-testid="button-analyze-tax"
            size="sm"
            onClick={handleAnalyze}
            disabled={analyzeMutation.isPending}
          >
            {analyzeMutation.isPending ? "Analyzing..." : "Run Analysis"}
          </Button>
        </CardContent>
      </Card>

      {analysisResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              <FileText className="h-4 w-4" />
              Analysis Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p data-testid="text-analysis-result" className="text-sm text-muted-foreground whitespace-pre-wrap">
              {typeof analysisResult === "string"
                ? analysisResult
                : analysisResult.recommendations || analysisResult.message || JSON.stringify(analysisResult, null, 2)}
            </p>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 data-testid="text-quarterly-title" className="text-lg font-semibold mb-3">Quarterly Estimates</h2>
        {(!taxEstimates || taxEstimates.length === 0) ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Calculator className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground" data-testid="text-no-estimates">Generate your first tax estimate</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {taxEstimates.map((est: any, idx: number) => (
              <Card key={est.id || idx} data-testid={`card-quarter-${idx}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-base">{QUARTER_INFO[idx]?.label || `Q${idx + 1}`}</CardTitle>
                    <Badge
                      variant={est.paid ? "default" : "secondary"}
                      data-testid={`badge-status-${idx}`}
                    >
                      {est.paid ? "Paid" : "Due"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{QUARTER_INFO[idx]?.due}</p>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold mb-2" data-testid={`text-estimate-amount-${idx}`}>
                    ${(est.estimatedTax || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </p>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div className="flex justify-between gap-2">
                      <span>Federal</span>
                      <span data-testid={`text-federal-${idx}`}>${(est.federal || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span>State</span>
                      <span data-testid={`text-state-${idx}`}>${(est.stateTax || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span>Self-employment</span>
                      <span data-testid={`text-se-${idx}`}>${(est.selfEmployment || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <Building2 className="h-4 w-4" />
            Entity Type Recommendation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-muted-foreground">Current entity:</span>
            <Badge variant="secondary" data-testid="badge-current-entity">Sole Proprietor</Badge>
          </div>
          <div className="flex items-start gap-3">
            <TrendingUp className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-sm font-medium" data-testid="text-recommended-entity">
                Recommended: {entityRec.recommended}
              </p>
              <p className="text-xs text-muted-foreground mt-1" data-testid="text-entity-reason">
                {entityRec.reason}
              </p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground flex items-start gap-2 mt-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>Consult a tax professional before changing your entity type.</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <FileText className="h-4 w-4" />
            State-Specific Guidance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={selectedState} onValueChange={setSelectedState}>
            <SelectTrigger data-testid="select-state" className="w-full sm:w-64">
              <SelectValue placeholder="Select a state" />
            </SelectTrigger>
            <SelectContent>
              {US_STATES.map((state) => (
                <SelectItem key={state} value={state}>{state}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedState && (
            <div data-testid="text-state-info" className="space-y-2 text-sm">
              <p className="font-medium">{selectedState} Tax Information</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-muted-foreground">
                <div>
                  <p className="font-medium text-foreground mb-1">Filing Requirements</p>
                  <p>State income tax return required if you earned income in {selectedState}. Self-employed individuals must file quarterly estimates.</p>
                </div>
                <div>
                  <p className="font-medium text-foreground mb-1">Tax Rates</p>
                  <p>State income tax rates vary. Check your {selectedState} Department of Revenue for current brackets and rates.</p>
                </div>
                <div>
                  <p className="font-medium text-foreground mb-1">Key Deadlines</p>
                  <p>Annual return: April 15, 2026. Quarterly estimates follow federal schedule.</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <CheckCircle2 className="h-4 w-4" />
            Common Creator Deductions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {CREATOR_DEDUCTIONS.map((deduction, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm" data-testid={`text-deduction-${idx}`}>
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>{deduction}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
