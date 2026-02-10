import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, BookOpen, ExternalLink, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

const categoryOptions = ["SEO", "Business", "Legal", "Marketing", "Technical", "Creative"];
const filterCategories = ["All", ...categoryOptions];

export default function KnowledgeHub() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState("All");
  const [category, setCategory] = useState("SEO");

  const { data: topics, isLoading } = useQuery<any[]>({ queryKey: ["/api/knowledge"] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/knowledge", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge"] });
      setDialogOpen(false);
      toast({ title: "Topic added" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, progress }: { id: number; progress: number }) => {
      const res = await apiRequest("PUT", `/api/knowledge/${id}`, { progress });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge"] });
      toast({ title: "Progress updated" });
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      topic: formData.get("topic"),
      category,
      progress: parseInt(formData.get("progress") as string) || 0,
    });
  };

  const handleUpdateProgress = (id: number, currentProgress: number) => {
    const newProgress = Math.min(currentProgress + 10, 100);
    updateMutation.mutate({ id, progress: newProgress });
  };

  const filtered = topics?.filter((t: any) => {
    if (activeFilter === "All") return true;
    return t.category === activeFilter;
  }) || [];

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-40" />
        <div className="flex gap-2 flex-wrap">
          {filterCategories.map((c) => <Skeleton key={c} className="h-8 w-20 rounded-md" />)}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">Knowledge Hub</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-topic" size="sm">
              <Plus className="w-4 h-4 mr-1" />
              Add Topic
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Learning Topic</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>Topic</Label>
                <Input name="topic" required data-testid="input-topic" placeholder="e.g. YouTube SEO Basics" />
              </div>
              <div>
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger data-testid="select-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Initial Progress (0-100)</Label>
                <Input name="progress" type="number" min="0" max="100" defaultValue="0" data-testid="input-progress" />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-topic">
                {createMutation.isPending ? "Saving..." : "Add Topic"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-2 flex-wrap">
        {filterCategories.map((cat) => (
          <Badge
            key={cat}
            variant={activeFilter === cat ? "default" : "secondary"}
            className="cursor-pointer toggle-elevate"
            onClick={() => setActiveFilter(cat)}
            data-testid={`filter-${cat.toLowerCase()}`}
          >
            {cat}
          </Badge>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <BookOpen className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground" data-testid="text-no-topics">Start your creator education journey</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map((topic: any) => (
            <Card key={topic.id} data-testid={`card-topic-${topic.id}`}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <CardTitle className="text-sm font-medium" data-testid={`text-topic-name-${topic.id}`}>
                    {topic.topic}
                  </CardTitle>
                  <Badge variant="secondary" className="text-xs" data-testid={`badge-category-${topic.id}`}>
                    {topic.category}
                  </Badge>
                  {topic.completed && (
                    <Badge variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-500" data-testid={`badge-completed-${topic.id}`}>
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Completed
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Progress</span>
                    <span className="text-xs font-medium" data-testid={`text-progress-${topic.id}`}>{topic.progress || 0}%</span>
                  </div>
                  <Progress value={topic.progress || 0} className="h-2" data-testid={`progress-bar-${topic.id}`} />
                </div>
                {topic.resources && topic.resources.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Resources</span>
                    <ul className="space-y-1">
                      {topic.resources.map((resource: string, i: number) => (
                        <li key={i}>
                          <a
                            href={resource}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-muted-foreground flex items-center gap-1 hover:underline"
                            data-testid={`link-resource-${topic.id}-${i}`}
                          >
                            <ExternalLink className="w-3 h-3 shrink-0" />
                            <span className="truncate">{resource}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {!topic.completed && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleUpdateProgress(topic.id, topic.progress || 0)}
                    disabled={updateMutation.isPending}
                    data-testid={`button-update-progress-${topic.id}`}
                  >
                    Update Progress
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
