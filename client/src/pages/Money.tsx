import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DollarSign, Plus, TrendingUp, CalendarDays, Receipt, ShieldCheck, Trash2, Tag,
  Calculator, FileText, AlertTriangle, CheckCircle2, Building2,
  CreditCard, Link2, Copy, Upload,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useState, useMemo } from "react";

type TabKey = "revenue" | "expenses" | "taxes" | "payments";

const FILTER_CATEGORIES = [
  "All", "Advertising", "Equipment", "Software", "Travel", "Home Office",
  "Education", "Professional Services", "Supplies", "Meals", "Internet/Phone",
  "Insurance", "Other",
];

const IRS_CATEGORIES = [
  { value: "advertising", label: "Advertising" },
  { value: "car_vehicle", label: "Car & Vehicle" },
  { value: "commissions", label: "Commissions" },
  { value: "equipment", label: "Equipment" },
  { value: "insurance", label: "Insurance" },
  { value: "interest", label: "Interest" },
  { value: "legal_professional", label: "Legal & Professional" },
  { value: "office_expense", label: "Office Expense" },
  { value: "rent_lease", label: "Rent & Lease" },
  { value: "repairs_maintenance", label: "Repairs & Maintenance" },
  { value: "supplies", label: "Supplies" },
  { value: "taxes_licenses", label: "Taxes & Licenses" },
  { value: "travel", label: "Travel" },
  { value: "meals", label: "Meals" },
  { value: "utilities", label: "Utilities" },
  { value: "wages", label: "Wages" },
  { value: "software_subscriptions", label: "Software & Subscriptions" },
  { value: "education_training", label: "Education & Training" },
  { value: "home_office", label: "Home Office" },
  { value: "other", label: "Other" },
];

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

export default function Money() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>("revenue");

  const [revenueDialogOpen, setRevenueDialogOpen] = useState(false);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [taxDeductible, setTaxDeductible] = useState(false);
  const [activeFilter, setActiveFilter] = useState("All");
  const [selectedState, setSelectedState] = useState("");
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [paymentUrl, setPaymentUrl] = useState("");

  const { data: revenueRecords, isLoading: revenueLoading } = useQuery<any[]>({ queryKey: ['/api/revenue'] });
  const { data: revenueSummary } = useQuery<any>({ queryKey: ['/api/revenue/summary'] });

  const { data: expenses, isLoading: expensesLoading } = useQuery<any[]>({ queryKey: ['/api/expenses'] });
  const { data: expenseSummary } = useQuery<any>({ queryKey: ['/api/expenses/summary'] });

  const { data: taxEstimates, isLoading: taxLoading } = useQuery<any[]>({ queryKey: ['/api/tax-estimates', '?year=2026'] });

  const { data: payments, isLoading: paymentsLoading } = useQuery<any[]>({ queryKey: ['/api/stripe/payments'] });

  const createRevenueMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/revenue", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/revenue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/revenue/summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/stats'] });
      setRevenueDialogOpen(false);
      toast({ title: "Revenue recorded" });
    },
  });

  const createExpenseMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/expenses", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/expenses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/expenses/summary'] });
      setExpenseDialogOpen(false);
      setTaxDeductible(false);
      toast({ title: "Expense added" });
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/expenses/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/expenses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/expenses/summary'] });
      toast({ title: "Expense deleted" });
    },
  });

  const importCsvMutation = useMutation({
    mutationFn: async (rows: any[]) => {
      const res = await apiRequest("POST", "/api/expenses/import-csv", { rows });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/expenses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/expenses/summary'] });
      setImportDialogOpen(false);
      toast({ title: `Imported ${data.imported} expenses` });
    },
    onError: () => {
      toast({ title: "Import failed", variant: "destructive" });
    },
  });

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

  const createPaymentMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/stripe/create-payment-link", data);
      return res.json();
    },
    onSuccess: (data: any) => {
      setPaymentUrl(data.url || "");
      queryClient.invalidateQueries({ queryKey: ['/api/stripe/payments'] });
      toast({ title: "Payment link created" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create payment link", description: error.message, variant: "destructive" });
    },
  });

  const totalRevenue = revenueSummary?.total || 0;
  const byPlatform = revenueSummary?.byPlatform || {};

  const { thisMonth, avgPerVideo } = useMemo(() => {
    if (!revenueRecords || revenueRecords.length === 0) return { thisMonth: 0, avgPerVideo: 0 };
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    let monthTotal = 0;
    for (const r of revenueRecords) {
      const date = r.recordedAt ? new Date(r.recordedAt) : null;
      if (date && date.getMonth() === currentMonth && date.getFullYear() === currentYear) {
        monthTotal += r.amount || 0;
      }
    }
    const avg = totalRevenue / revenueRecords.length;
    return { thisMonth: monthTotal, avgPerVideo: avg };
  }, [revenueRecords, totalRevenue]);

  const expenseTotal = expenseSummary?.total || 0;
  const expenseDeductible = expenseSummary?.deductible || 0;
  const byCategory = expenseSummary?.byCategory || {};

  const topCategory = useMemo(() => {
    const entries = Object.entries(byCategory);
    if (entries.length === 0) return "N/A";
    entries.sort((a: any, b: any) => b[1] - a[1]);
    return entries[0][0];
  }, [byCategory]);

  const filteredExpenses = useMemo(() => {
    if (!expenses) return [];
    if (activeFilter === "All") return expenses;
    const filterLower = activeFilter.toLowerCase().replace(/\//g, "_").replace(/ /g, "_");
    return expenses.filter((e: any) => {
      const cat = (e.category || e.irsCategory || "").toLowerCase();
      return cat.includes(filterLower) || filterLower.includes(cat);
    });
  }, [expenses, activeFilter]);

  const entityRec = getEntityRecommendation(totalRevenue);

  const handleCreateRevenue = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createRevenueMutation.mutate({
      platform: formData.get("platform"),
      source: formData.get("source"),
      amount: parseFloat(formData.get("amount") as string),
      period: formData.get("period"),
    });
  };

  const handleCreateExpense = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createExpenseMutation.mutate({
      description: formData.get("description"),
      amount: parseFloat(formData.get("amount") as string),
      category: formData.get("category"),
      vendor: formData.get("vendor"),
      irsCategory: formData.get("irsCategory"),
      expenseDate: formData.get("expenseDate"),
      taxDeductible,
    });
  };

  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) {
        toast({ title: "CSV file is empty or invalid", variant: "destructive" });
        return;
      }
      const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
      const descIdx = headers.findIndex(h => h === "description");
      const amountIdx = headers.findIndex(h => h === "amount");
      const dateIdx = headers.findIndex(h => h.includes("posting") || h === "date");
      const rows: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        if (cols.length <= 1) continue;
        const amount = amountIdx >= 0 ? cols[amountIdx] : "0";
        const description = descIdx >= 0 ? cols[descIdx] : cols[0] || "Imported";
        const date = dateIdx >= 0 ? cols[dateIdx] : "";
        rows.push({
          description: description.replace(/^"|"$/g, "").trim(),
          amount: Math.abs(parseFloat(amount.replace(/[^0-9.-]/g, "")) || 0),
          date: date.replace(/^"|"$/g, "").trim(),
          vendor: description.replace(/^"|"$/g, "").trim(),
        });
      }
      if (rows.length === 0) {
        toast({ title: "No valid rows found in CSV", variant: "destructive" });
        return;
      }
      importCsvMutation.mutate(rows);
    };
    reader.readAsText(file);
  };

  const handleCreatePayment = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const dollars = parseFloat(formData.get("amount") as string);
    createPaymentMutation.mutate({
      amount: Math.round(dollars * 100),
      description: formData.get("description") || "Payment",
      customerEmail: formData.get("customerEmail") || undefined,
    });
  };

  const handleAnalyze = () => {
    analyzeMutation.mutate({
      totalRevenue,
      totalExpenses: 0,
      state: selectedState || "California",
      entityType: "Sole Proprietor",
      year: 2026,
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: "revenue", label: "Revenue" },
    { key: "expenses", label: "Expenses" },
    { key: "taxes", label: "Taxes" },
    { key: "payments", label: "Payments" },
  ];

  const isLoading = (activeTab === "revenue" && revenueLoading) ||
    (activeTab === "expenses" && expensesLoading) ||
    (activeTab === "taxes" && taxLoading) ||
    (activeTab === "payments" && paymentsLoading);

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-48" data-testid="skeleton-title" />
        <div className="flex items-center gap-2 flex-wrap">
          {tabs.map(t => <Skeleton key={t.key} className="h-9 w-24 rounded-md" />)}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">Money</h1>
        <p data-testid="text-page-subtitle" className="text-sm text-muted-foreground mt-1">Revenue, expenses, taxes & payments in one place</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap" data-testid="tab-bar">
        {tabs.map(t => (
          <Button
            key={t.key}
            variant={activeTab === t.key ? "default" : "secondary"}
            onClick={() => setActiveTab(t.key)}
            data-testid={`tab-${t.key}`}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {activeTab === "revenue" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center gap-4 flex-wrap">
            <h2 data-testid="text-revenue-title" className="text-lg font-semibold">Revenue</h2>
            <Dialog open={revenueDialogOpen} onOpenChange={setRevenueDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-revenue" size="sm">
                  <Plus className="w-4 h-4 mr-1" />
                  Record Revenue
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Record Revenue</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateRevenue} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Platform</Label>
                      <Select name="platform" defaultValue="youtube">
                        <SelectTrigger data-testid="select-revenue-platform"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="youtube">YouTube</SelectItem>
                          <SelectItem value="twitch">Twitch</SelectItem>
                          <SelectItem value="tiktok">TikTok</SelectItem>
                          <SelectItem value="kick">Kick</SelectItem>
                          <SelectItem value="instagram">Instagram</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Source</Label>
                      <Select name="source" defaultValue="adsense">
                        <SelectTrigger data-testid="select-revenue-source"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="adsense">AdSense</SelectItem>
                          <SelectItem value="sponsorship">Sponsorship</SelectItem>
                          <SelectItem value="membership">Membership</SelectItem>
                          <SelectItem value="superchat">Super Chat</SelectItem>
                          <SelectItem value="affiliate">Affiliate</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Amount ($)</Label>
                      <Input name="amount" type="number" step="0.01" required data-testid="input-revenue-amount" placeholder="0.00" />
                    </div>
                    <div>
                      <Label>Period</Label>
                      <Input name="period" data-testid="input-revenue-period" placeholder="Jan 2026" />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={createRevenueMutation.isPending} data-testid="button-submit-revenue">
                    {createRevenueMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Total Revenue</span>
                </div>
                <p className="text-xl font-bold" data-testid="text-total-revenue">
                  ${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">This Month</span>
                </div>
                <p className="text-xl font-bold" data-testid="text-month-revenue">
                  ${thisMonth.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Avg per Record</span>
                </div>
                <p className="text-xl font-bold" data-testid="text-avg-revenue">
                  ${(avgPerVideo || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
          </div>

          {Object.keys(byPlatform).length > 0 && (
            <div className="flex gap-3 flex-wrap">
              {Object.entries(byPlatform)
                .sort((a: any, b: any) => b[1] - a[1])
                .map(([platform, amount]) => (
                  <Badge key={platform} variant="secondary" className="capitalize" data-testid={`badge-platform-${platform}`}>
                    {platform}: ${(amount as number).toFixed(0)}
                  </Badge>
                ))}
            </div>
          )}

          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-base">Revenue Records</CardTitle>
            </CardHeader>
            {!revenueRecords || revenueRecords.length === 0 ? (
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <DollarSign className="w-10 h-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground" data-testid="text-no-revenue">No revenue recorded yet.</p>
              </CardContent>
            ) : (
              <CardContent className="p-0">
                <div className="divide-y divide-border/50">
                  {revenueRecords.map((record: any) => (
                    <div key={record.id} data-testid={`row-revenue-${record.id}`} className="px-6 py-4 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium capitalize" data-testid={`text-source-${record.id}`}>{record.source}</span>
                          <Badge variant="secondary" className="text-xs capitalize" data-testid={`badge-record-platform-${record.id}`}>{record.platform}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-period-${record.id}`}>
                          {record.period || (record.recordedAt ? format(new Date(record.recordedAt), "MMM d, yyyy") : "")}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-emerald-400 shrink-0" data-testid={`text-amount-${record.id}`}>
                        +${record.amount?.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      )}

      {activeTab === "expenses" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center gap-4 flex-wrap">
            <h2 data-testid="text-expenses-title" className="text-lg font-semibold">Expense Tracker</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-import-chase" size="sm" variant="secondary">
                    <Upload className="w-4 h-4 mr-1" />
                    Import from Chase
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Import Chase CSV</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Upload a CSV file exported from Chase. Expected columns: Details, Posting Date, Description, Amount, Type, Balance, Check or Slip #
                    </p>
                    <div>
                      <Label>CSV File</Label>
                      <Input
                        type="file"
                        accept=".csv"
                        onChange={handleCsvImport}
                        disabled={importCsvMutation.isPending}
                        data-testid="input-csv-file"
                      />
                    </div>
                    {importCsvMutation.isPending && (
                      <p className="text-sm text-muted-foreground" data-testid="text-importing">Importing...</p>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
              <Dialog open={expenseDialogOpen} onOpenChange={(open) => { setExpenseDialogOpen(open); if (!open) setTaxDeductible(false); }}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-expense" size="sm">
                    <Plus className="w-4 h-4 mr-1" />
                    Add Expense
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Expense</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCreateExpense} className="space-y-4">
                    <div>
                      <Label>Description</Label>
                      <Input name="description" required data-testid="input-expense-description" placeholder="What was this expense for?" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Amount ($)</Label>
                        <Input name="amount" type="number" step="0.01" required data-testid="input-expense-amount" placeholder="0.00" />
                      </div>
                      <div>
                        <Label>Vendor</Label>
                        <Input name="vendor" data-testid="input-expense-vendor" placeholder="Company name" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Category</Label>
                        <Select name="category" defaultValue="other">
                          <SelectTrigger data-testid="select-expense-category"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {FILTER_CATEGORIES.filter(c => c !== "All").map(c => (
                              <SelectItem key={c} value={c.toLowerCase().replace(/\//g, "_").replace(/ /g, "_")}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>IRS Category</Label>
                        <Select name="irsCategory" defaultValue="other">
                          <SelectTrigger data-testid="select-expense-irs-category"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {IRS_CATEGORIES.map(c => (
                              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Expense Date</Label>
                        <Input name="expenseDate" type="date" data-testid="input-expense-date" />
                      </div>
                      <div className="flex items-end gap-2 pb-1">
                        <Checkbox
                          id="taxDeductible"
                          checked={taxDeductible}
                          onCheckedChange={(checked) => setTaxDeductible(checked === true)}
                          data-testid="checkbox-tax-deductible"
                        />
                        <Label htmlFor="taxDeductible" className="cursor-pointer">Tax Deductible</Label>
                      </div>
                    </div>
                    <Button type="submit" className="w-full" disabled={createExpenseMutation.isPending} data-testid="button-submit-expense">
                      {createExpenseMutation.isPending ? "Saving..." : "Add Expense"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Total Expenses</span>
                </div>
                <p className="text-xl font-bold" data-testid="text-total-expenses">
                  ${expenseTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Tax Deductible</span>
                </div>
                <p className="text-xl font-bold" data-testid="text-tax-deductible">
                  ${expenseDeductible.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Top Category</span>
                </div>
                <p className="text-xl font-bold capitalize" data-testid="text-top-category">
                  {topCategory.replace(/_/g, " ")}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="flex gap-2 flex-wrap">
            {FILTER_CATEGORIES.map(cat => (
              <Badge
                key={cat}
                variant={activeFilter === cat ? "default" : "secondary"}
                className="cursor-pointer"
                data-testid={`badge-filter-${cat.toLowerCase().replace(/\//g, "-").replace(/ /g, "-")}`}
                onClick={() => setActiveFilter(cat)}
              >
                {cat}
              </Badge>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-base">Expenses</CardTitle>
            </CardHeader>
            {!filteredExpenses || filteredExpenses.length === 0 ? (
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Receipt className="w-10 h-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground" data-testid="text-no-expenses">No expenses found.</p>
              </CardContent>
            ) : (
              <CardContent className="p-0">
                <div className="divide-y divide-border/50">
                  {filteredExpenses.map((expense: any) => (
                    <div key={expense.id} data-testid={`row-expense-${expense.id}`} className="px-6 py-4 flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium" data-testid={`text-description-${expense.id}`}>{expense.description}</span>
                          <Badge variant="secondary" className="text-xs capitalize" data-testid={`badge-category-${expense.id}`}>
                            {(expense.category || expense.irsCategory || "other").replace(/_/g, " ")}
                          </Badge>
                          {expense.taxDeductible && (
                            <Badge variant="outline" className="text-xs" data-testid={`badge-deductible-${expense.id}`}>
                              Tax Deductible
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <p className="text-xs text-muted-foreground" data-testid={`text-date-${expense.id}`}>
                            {expense.expenseDate ? format(new Date(expense.expenseDate), "MMM d, yyyy") : ""}
                          </p>
                          {expense.vendor && (
                            <p className="text-xs text-muted-foreground" data-testid={`text-vendor-${expense.id}`}>
                              {expense.vendor}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm font-semibold" data-testid={`text-amount-${expense.id}`}>
                          ${expense.amount?.toFixed(2)}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteExpenseMutation.mutate(expense.id)}
                          disabled={deleteExpenseMutation.isPending}
                          data-testid={`button-delete-${expense.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      )}

      {activeTab === "taxes" && (
        <div className="space-y-6">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-muted-foreground">
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
      )}

      {activeTab === "payments" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center gap-4 flex-wrap">
            <h2 data-testid="text-payments-title" className="text-lg font-semibold">Stripe Payments</h2>
            <Dialog open={paymentDialogOpen} onOpenChange={(open) => { setPaymentDialogOpen(open); if (!open) setPaymentUrl(""); }}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-payment-link" size="sm">
                  <Link2 className="w-4 h-4 mr-1" />
                  Create Payment Link
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Payment Link</DialogTitle>
                </DialogHeader>
                {paymentUrl ? (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">Payment link created successfully:</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Input
                        value={paymentUrl}
                        readOnly
                        data-testid="input-payment-url"
                        className="flex-1"
                      />
                      <Button
                        size="icon"
                        variant="secondary"
                        onClick={() => copyToClipboard(paymentUrl)}
                        data-testid="button-copy-url"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() => { setPaymentUrl(""); }}
                      data-testid="button-create-another"
                    >
                      Create Another
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleCreatePayment} className="space-y-4">
                    <div>
                      <Label>Amount ($)</Label>
                      <Input name="amount" type="number" step="0.01" min="1" required data-testid="input-payment-amount" placeholder="0.00" />
                    </div>
                    <div>
                      <Label>Description</Label>
                      <Input name="description" required data-testid="input-payment-description" placeholder="What is this payment for?" />
                    </div>
                    <div>
                      <Label>Customer Email (optional)</Label>
                      <Input name="customerEmail" type="email" data-testid="input-payment-email" placeholder="customer@example.com" />
                    </div>
                    <Button type="submit" className="w-full" disabled={createPaymentMutation.isPending} data-testid="button-submit-payment">
                      {createPaymentMutation.isPending ? "Creating..." : "Create Payment Link"}
                    </Button>
                  </form>
                )}
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                <CreditCard className="h-4 w-4" />
                Recent Payments
              </CardTitle>
            </CardHeader>
            {!payments || payments.length === 0 ? (
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <CreditCard className="w-10 h-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground" data-testid="text-no-payments">No payments yet. Create a payment link to get started.</p>
              </CardContent>
            ) : (
              <CardContent className="p-0">
                <div className="divide-y divide-border/50">
                  {payments.map((payment: any, idx: number) => (
                    <div key={payment.id || idx} data-testid={`row-payment-${payment.id || idx}`} className="px-6 py-4 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium" data-testid={`text-payment-desc-${idx}`}>
                            {payment.description || "Payment"}
                          </span>
                          <Badge
                            variant={payment.status === "succeeded" ? "default" : "secondary"}
                            className="text-xs capitalize"
                            data-testid={`badge-payment-status-${idx}`}
                          >
                            {payment.status || "pending"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-payment-date-${idx}`}>
                          {payment.created ? format(new Date(typeof payment.created === "number" ? payment.created * 1000 : payment.created), "MMM d, yyyy") : ""}
                        </p>
                      </div>
                      <span className="text-sm font-semibold shrink-0" data-testid={`text-payment-amount-${idx}`}>
                        ${((payment.amount || 0) / 100).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}