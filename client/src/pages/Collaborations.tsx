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
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Users, Plus, Trash2, ExternalLink, Sparkles, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";

const STATUSES = ["suggested", "contacted", "confirmed", "completed", "declined"] as const;

const statusColors: Record<string, string> = {
  suggested: "bg-blue-500/10 text-blue-500",
  contacted: "bg-amber-500/10 text-amber-500",
  confirmed: "bg-emerald-500/10 text-emerald-500",
  completed: "bg-purple-500/10 text-purple-500",
  declined: "bg-red-500/10 text-red-500",
};

export default function Collaborations() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [platform, setPlatform] = useState("youtube");

  const { data: leads, isLoading } = useQuery<any[]>({ queryKey: ["/api/collaboration-leads"] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/collaboration-leads", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration-leads"] });
      setDialogOpen(false);
      toast({ title: "Creator added" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/collaboration-leads/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration-leads"] });
      toast({ title: "Status updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/collaboration-leads/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration-leads"] });
      toast({ title: "Creator removed" });
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      creatorName: formData.get("creatorName"),
      platform,
      channelUrl: formData.get("channelUrl") || null,
      notes: formData.get("notes") || null,
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4">
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">Collaborations</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-creator" size="sm">
              <Plus className="w-4 h-4 mr-1" />
              Add Creator
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Collaboration Lead</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>Creator Name</Label>
                <Input name="creatorName" required data-testid="input-creator-name" placeholder="e.g. TechGuru" />
              </div>
              <div>
                <Label>Platform</Label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger data-testid="select-creator-platform"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="youtube">YouTube</SelectItem>
                    <SelectItem value="twitch">Twitch</SelectItem>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="twitter">Twitter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Channel URL</Label>
                <Input name="channelUrl" type="url" data-testid="input-creator-url" placeholder="https://youtube.com/@creator" />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea name="notes" data-testid="input-creator-notes" placeholder="Why collaborate?" className="resize-none" />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-creator">
                {createMutation.isPending ? "Saving..." : "Add Creator"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {!leads || leads.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground" data-testid="text-empty-collaborations">Find creators to collaborate with</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {leads.map((lead: any) => {
            const overlap = lead.audienceOverlap;
            const overlapPct = overlap != null ? Math.round(overlap) : null;

            return (
              <Card key={lead.id} data-testid={`card-lead-${lead.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="space-y-1">
                      <CardTitle className="text-base" data-testid={`text-lead-name-${lead.id}`}>{lead.creatorName}</CardTitle>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="capitalize" data-testid={`badge-lead-platform-${lead.id}`}>
                          {lead.platform}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className={statusColors[lead.status] || ""}
                          data-testid={`badge-lead-status-${lead.id}`}
                        >
                          {lead.status}
                        </Badge>
                        {lead.aiSuggested && (
                          <Badge variant="secondary" className="bg-violet-500/10 text-violet-500" data-testid={`badge-lead-ai-${lead.id}`}>
                            <Sparkles className="w-3 h-3 mr-1" />
                            AI Suggested
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" data-testid={`button-change-status-${lead.id}`}>
                            Status
                            <ChevronDown className="w-3 h-3 ml-1" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {STATUSES.map((s) => (
                            <DropdownMenuItem
                              key={s}
                              onClick={() => updateStatusMutation.mutate({ id: lead.id, status: s })}
                              data-testid={`menu-status-${s}-${lead.id}`}
                              className="capitalize"
                            >
                              {s}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(lead.id)}
                        data-testid={`button-delete-lead-${lead.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {lead.channelUrl && (
                    <a
                      href={lead.channelUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      data-testid={`link-lead-channel-${lead.id}`}
                    >
                      <ExternalLink className="w-3 h-3" />
                      {lead.channelUrl}
                    </a>
                  )}

                  {overlapPct != null && (
                    <div>
                      <div className="flex justify-between items-center text-xs mb-1">
                        <span className="text-muted-foreground">Audience Overlap</span>
                        <span className="font-medium" data-testid={`text-lead-overlap-${lead.id}`}>{overlapPct}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${overlapPct}%` }}
                          data-testid={`bar-lead-overlap-${lead.id}`}
                        />
                      </div>
                    </div>
                  )}

                  {lead.notes && (
                    <p className="text-xs text-muted-foreground" data-testid={`text-lead-notes-${lead.id}`}>{lead.notes}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
