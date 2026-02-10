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
import { Palette, Plus, Type, Image, Droplets, Trash2, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

const categories = ["All", "Colors", "Fonts", "Logos", "Voice", "Guidelines"] as const;

const categoryMap: Record<string, string> = {
  Colors: "color",
  Fonts: "font",
  Logos: "logo",
  Voice: "voice_tone",
  Guidelines: "guideline",
};

function getCategoryIcon(type: string) {
  switch (type) {
    case "color": return <Palette className="h-4 w-4 text-muted-foreground" />;
    case "font": return <Type className="h-4 w-4 text-muted-foreground" />;
    case "logo": return <Image className="h-4 w-4 text-muted-foreground" />;
    case "voice_tone": return <Droplets className="h-4 w-4 text-muted-foreground" />;
    default: return <Palette className="h-4 w-4 text-muted-foreground" />;
  }
}

export default function BrandKit() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("All");
  const [assetType, setAssetType] = useState("color");

  const { data: assets, isLoading } = useQuery<any[]>({ queryKey: ["/api/brand-assets"] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/brand-assets", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brand-assets"] });
      setDialogOpen(false);
      toast({ title: "Brand asset added" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/brand-assets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brand-assets"] });
      toast({ title: "Asset deleted" });
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      assetType,
      name: formData.get("name"),
      value: formData.get("value"),
    });
  };

  const filtered = assets?.filter((a: any) => {
    if (activeTab === "All") return true;
    return a.assetType === categoryMap[activeTab];
  }) || [];

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-32" />
        <div className="flex gap-2 flex-wrap">
          {categories.map((c) => <Skeleton key={c} className="h-8 w-20 rounded-md" />)}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">Brand Kit</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-asset" size="sm">
              <Plus className="w-4 h-4 mr-1" />
              Add Asset
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Brand Asset</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>Asset Type</Label>
                <Select value={assetType} onValueChange={setAssetType}>
                  <SelectTrigger data-testid="select-asset-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="color">Color</SelectItem>
                    <SelectItem value="font">Font</SelectItem>
                    <SelectItem value="logo">Logo</SelectItem>
                    <SelectItem value="voice_tone">Voice & Tone</SelectItem>
                    <SelectItem value="guideline">Guideline</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Name</Label>
                <Input name="name" required data-testid="input-asset-name" placeholder="e.g. Primary Brand Color" />
              </div>
              <div>
                <Label>Value</Label>
                <Input name="value" required data-testid="input-asset-value" placeholder={assetType === "color" ? "#FF5733" : "Enter value"} />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-asset">
                {createMutation.isPending ? "Saving..." : "Save Asset"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-2 flex-wrap">
        {categories.map((cat) => (
          <Badge
            key={cat}
            variant={activeTab === cat ? "default" : "secondary"}
            className="cursor-pointer toggle-elevate"
            onClick={() => setActiveTab(cat)}
            data-testid={`tab-${cat.toLowerCase()}`}
          >
            {cat}
          </Badge>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Palette className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground" data-testid="text-no-assets">No brand assets yet. Add your first asset to build your brand kit.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map((asset: any) => (
            <Card key={asset.id} data-testid={`card-asset-${asset.id}`}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  {getCategoryIcon(asset.assetType)}
                  <CardTitle className="text-sm font-medium truncate" data-testid={`text-asset-name-${asset.id}`}>{asset.name}</CardTitle>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Badge variant="secondary" className="text-xs capitalize" data-testid={`badge-asset-type-${asset.id}`}>
                    {asset.assetType?.replace("_", " ")}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteMutation.mutate(asset.id)}
                    data-testid={`button-delete-asset-${asset.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {asset.assetType === "color" ? (
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-md border border-border shrink-0"
                      style={{ backgroundColor: asset.value }}
                      data-testid={`swatch-${asset.id}`}
                    />
                    <span className="text-sm font-mono" data-testid={`text-asset-value-${asset.id}`}>{asset.value}</span>
                  </div>
                ) : asset.assetType === "font" ? (
                  <p className="text-sm" data-testid={`text-asset-value-${asset.id}`} style={{ fontFamily: asset.value }}>
                    {asset.value}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground" data-testid={`text-asset-value-${asset.id}`}>{asset.value}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
