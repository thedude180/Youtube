import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Heart, Coffee, Brain, Clock, Lightbulb,
  Plus, BookOpen, ExternalLink, CheckCircle2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const moodLabels: Record<number, string> = { 1: "Struggling", 2: "Low", 3: "Okay", 4: "Good", 5: "Great" };
const energyLabels: Record<number, string> = { 1: "Struggling", 2: "Low", 3: "Okay", 4: "Good", 5: "Great" };
const stressLabels: Record<number, string> = { 1: "None", 2: "Low", 3: "Moderate", 4: "High", 5: "Overwhelming" };

function getMoodColor(val: number) {
  if (val <= 2) return "bg-red-500/10 text-red-500";
  if (val === 3) return "bg-yellow-500/10 text-yellow-500";
  return "bg-emerald-500/10 text-emerald-500";
}

function getStressColor(val: number) {
  if (val <= 2) return "bg-emerald-500/10 text-emerald-500";
  if (val === 3) return "bg-yellow-500/10 text-yellow-500";
  return "bg-red-500/10 text-red-500";
}

const wellnessTips = [
  { icon: Clock, text: "Take regular breaks - follow the 20-20-20 rule" },
  { icon: Coffee, text: "Stay hydrated throughout your creative sessions" },
  { icon: Heart, text: "Exercise for at least 30 minutes daily" },
  { icon: Brain, text: "Maintain a consistent sleep schedule" },
];

const categoryOptions = ["SEO", "Business", "Legal", "Marketing", "Technical", "Creative"];
const filterCategories = ["All", ...categoryOptions];

function WellnessContent() {
  const { toast } = useToast();
  const [mood, setMood] = useState("3");
  const [energy, setEnergy] = useState("3");
  const [stress, setStress] = useState("3");

  const { data: checkins, isLoading } = useQuery<any[]>({ queryKey: ["/api/wellness"] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/wellness", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wellness"] });
      toast({ title: "Check-in logged" });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      mood: parseInt(mood),
      energy: parseInt(energy),
      stress: parseInt(stress),
      hoursWorked: parseFloat(formData.get("hoursWorked") as string) || 0,
      notes: formData.get("notes") || "",
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily Check-in</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label>Mood</Label>
                <Select value={mood} onValueChange={setMood}>
                  <SelectTrigger data-testid="select-mood"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((v) => (
                      <SelectItem key={v} value={String(v)}>{v} - {moodLabels[v]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Energy</Label>
                <Select value={energy} onValueChange={setEnergy}>
                  <SelectTrigger data-testid="select-energy"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((v) => (
                      <SelectItem key={v} value={String(v)}>{v} - {energyLabels[v]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Stress</Label>
                <Select value={stress} onValueChange={setStress}>
                  <SelectTrigger data-testid="select-stress"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((v) => (
                      <SelectItem key={v} value={String(v)}>{v} - {stressLabels[v]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Hours Worked</Label>
                <Input name="hoursWorked" type="number" step="0.5" min="0" max="24" data-testid="input-hours-worked" placeholder="0" />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea name="notes" data-testid="input-notes" placeholder="How are you feeling today?" className="resize-none" />
            </div>
            <Button type="submit" disabled={createMutation.isPending} data-testid="button-log-checkin">
              {createMutation.isPending ? "Logging..." : "Log Check-in"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <Lightbulb className="h-4 w-4 text-muted-foreground" />
            Wellness Tips
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {wellnessTips.map((tip, i) => (
              <li key={i} className="flex items-center gap-3" data-testid={`tip-${i}`}>
                <tip.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm">{tip.text}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Check-in History</CardTitle>
        </CardHeader>
        {!checkins || checkins.length === 0 ? (
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Heart className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground" data-testid="text-no-checkins">No check-ins yet. Start your wellness journey today.</p>
          </CardContent>
        ) : (
          <CardContent className="p-0">
            <div className="divide-y divide-border/50">
              {checkins.map((checkin: any) => (
                <div key={checkin.id} data-testid={`row-checkin-${checkin.id}`} className="px-6 py-4 space-y-2">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <span className="text-xs text-muted-foreground" data-testid={`text-checkin-date-${checkin.id}`}>
                      {checkin.checkedInAt ? format(new Date(checkin.checkedInAt), "MMM d, yyyy h:mm a") : ""}
                    </span>
                    {checkin.hoursWorked != null && (
                      <span className="text-xs text-muted-foreground" data-testid={`text-hours-${checkin.id}`}>
                        {checkin.hoursWorked}h worked
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="secondary" className={`text-xs ${getMoodColor(checkin.mood)}`} data-testid={`badge-mood-${checkin.id}`}>
                      Mood: {moodLabels[checkin.mood] || checkin.mood}
                    </Badge>
                    <Badge variant="secondary" className={`text-xs ${getMoodColor(checkin.energy)}`} data-testid={`badge-energy-${checkin.id}`}>
                      Energy: {energyLabels[checkin.energy] || checkin.energy}
                    </Badge>
                    <Badge variant="secondary" className={`text-xs ${getStressColor(checkin.stress)}`} data-testid={`badge-stress-${checkin.id}`}>
                      Stress: {stressLabels[checkin.stress] || checkin.stress}
                    </Badge>
                  </div>
                  {checkin.notes && (
                    <p className="text-sm text-muted-foreground" data-testid={`text-notes-${checkin.id}`}>{checkin.notes}</p>
                  )}
                  {checkin.aiRecommendation && (
                    <div className="bg-muted/50 rounded-md p-3 mt-2">
                      <p className="text-xs font-medium mb-1">AI Recommendation</p>
                      <p className="text-sm text-muted-foreground" data-testid={`text-recommendation-${checkin.id}`}>{checkin.aiRecommendation}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function LearningContent() {
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
      <div className="space-y-6">
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
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <h2 data-testid="text-learning-title" className="text-lg font-semibold">Knowledge Hub</h2>
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

export default function You() {
  const [activeTab, setActiveTab] = useState<"wellness" | "learning">("wellness");

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">You</h1>
        <p data-testid="text-page-subtitle" className="text-sm text-muted-foreground mt-1">Your wellness, learning, and personal growth</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          variant={activeTab === "wellness" ? "default" : "secondary"}
          onClick={() => setActiveTab("wellness")}
          data-testid="tab-wellness"
        >
          Wellness
        </Button>
        <Button
          variant={activeTab === "learning" ? "default" : "secondary"}
          onClick={() => setActiveTab("learning")}
          data-testid="tab-learning"
        >
          Learning
        </Button>
      </div>

      {activeTab === "wellness" && <WellnessContent />}
      {activeTab === "learning" && <LearningContent />}
    </div>
  );
}
