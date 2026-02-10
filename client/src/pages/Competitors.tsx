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
import { Plus, Trash2, ExternalLink, Users, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

const platforms = ["youtube", "twitch", "tiktok", "kick", "instagram"];

export default function Competitors() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [platform, setPlatform] = useState("youtube");

  const { data: competitors, isLoading } = useQuery<any[]>({ queryKey: ["/api/competitors"] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/competitors", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/competitors"] });
      setDialogOpen(false);
      toast({ title: "Competitor added" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/competitors/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/competitors"] });
      toast({ title: "Competitor removed" });
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      competitorName: formData.get("competitorName"),
      platform,
      channelUrl: formData.get("channelUrl"),
      subscribers: parseInt(formData.get("subscribers") as string) || 0,
      avgViews: parseInt(formData.get("avgViews") as string) || 0,
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">Competitor Intelligence</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-competitor" size="sm">
              <Plus className="w-4 h-4 mr-1" />
              Track Competitor
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Track Competitor</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>Competitor Name</Label>
                <Input name="competitorName" required data-testid="input-competitor-name" placeholder="Channel name" />
              </div>
              <div>
                <Label>Platform</Label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger data-testid="select-competitor-platform"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {platforms.map((p) => (
                      <SelectItem key={p} value={p} className="capitalize">{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Channel URL</Label>
                <Input name="channelUrl" data-testid="input-channel-url" placeholder="https://..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Subscribers</Label>
                  <Input name="subscribers" type="number" data-testid="input-subscribers" placeholder="0" />
                </div>
                <div>
                  <Label>Avg Views</Label>
                  <Input name="avgViews" type="number" data-testid="input-avg-views" placeholder="0" />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-competitor">
                {createMutation.isPending ? "Saving..." : "Track Competitor"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {!competitors || competitors.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground" data-testid="text-no-competitors">Start tracking competitors to find growth opportunities</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {competitors.map((comp: any) => (
            <Card key={comp.id} data-testid={`card-competitor-${comp.id}`}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <CardTitle className="text-sm font-medium" data-testid={`text-competitor-name-${comp.id}`}>
                    {comp.competitorName}
                  </CardTitle>
                  <Badge variant="secondary" className="text-xs capitalize" data-testid={`badge-platform-${comp.id}`}>
                    {comp.platform}
                  </Badge>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => deleteMutation.mutate(comp.id)}
                  data-testid={`button-delete-competitor-${comp.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {comp.channelUrl && (
                  <a
                    href={comp.channelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground flex items-center gap-1 hover:underline"
                    data-testid={`link-channel-${comp.id}`}
                  >
                    <ExternalLink className="w-3 h-3" />
                    {comp.channelUrl}
                  </a>
                )}
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm" data-testid={`text-subscribers-${comp.id}`}>
                      {(comp.subscribers || 0).toLocaleString()} subscribers
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm" data-testid={`text-avg-views-${comp.id}`}>
                      {(comp.avgViews || 0).toLocaleString()} avg views
                    </span>
                  </div>
                </div>
                {comp.strengths && comp.strengths.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap">
                    {comp.strengths.map((s: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-500" data-testid={`badge-strength-${comp.id}-${i}`}>
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}
                {comp.opportunities && comp.opportunities.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap">
                    {comp.opportunities.map((o: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-xs bg-blue-500/10 text-blue-500" data-testid={`badge-opportunity-${comp.id}-${i}`}>
                        {o}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
