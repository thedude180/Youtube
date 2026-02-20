import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { safeArray } from "@/lib/safe-data";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DollarSign, Plus, Receipt, ShieldCheck, Trash2, Tag, Upload,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { QueryErrorReset } from "@/components/QueryErrorReset";
import { format } from "date-fns";
import { useState, useMemo } from "react";

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

export default function ExpensesTab() {
  const { toast } = useToast();
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [taxDeductible, setTaxDeductible] = useState(false);
  const [activeFilter, setActiveFilter] = useState("All");

  const { data: rawExpenses, isLoading: expensesLoading, error: expensesError } = useQuery<any[]>({ queryKey: ['/api/expenses'], refetchInterval: 30_000, staleTime: 20_000 });
  const expenses = safeArray(rawExpenses);
  const { data: expenseSummary } = useQuery<any>({ queryKey: ['/api/expenses/summary'], refetchInterval: 30_000, staleTime: 20_000 });

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
    if (activeFilter === "All") return expenses;
    const filterLower = activeFilter.toLowerCase().replace(/\//g, "_").replace(/ /g, "_");
    return expenses.filter((e: any) => {
      const cat = (e.category || e.irsCategory || "").toLowerCase();
      return cat.includes(filterLower) || filterLower.includes(cat);
    });
  }, [expenses, activeFilter]);

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

  if (expensesLoading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (expensesError) return <QueryErrorReset error={expensesError} queryKey={["/api/expenses"]} label="Failed to load expenses" />;

  return (
    <div className="space-y-3">
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Card>
          <CardContent className="p-3">
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
          <CardContent className="p-3">
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
          <CardContent className="p-3">
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
        {filteredExpenses.length === 0 ? (
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Receipt className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground" data-testid="text-no-expenses">No expenses found.</p>
          </CardContent>
        ) : (
          <CardContent className="p-0">
            <div className="divide-y divide-border/50">
              {safeArray(filteredExpenses).map((expense: any) => (
                <div key={expense.id} data-testid={`row-expense-${expense.id}`} className="px-3 py-2 flex items-center justify-between gap-4">
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
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" data-testid={`button-delete-${expense.id}`}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Expense</AlertDialogTitle>
                          <AlertDialogDescription>Are you sure you want to delete this ${expense.amount?.toFixed(2)} expense? This cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction data-testid={`button-confirm-delete-${expense.id}`} onClick={() => deleteExpenseMutation.mutate(expense.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
