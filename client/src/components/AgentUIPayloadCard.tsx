import { useQuery } from "@tanstack/react-query";
import { Bot, Clock, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AgentPayload {
  id: number;
  userId: string;
  agentName: string;
  payloadType: string;
  title: string;
  body: string | null;
  metadata: Record<string, any>;
  renderedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

function PayloadItem({ payload }: { payload: AgentPayload }) {
  const isExpired = payload.expiresAt && new Date(payload.expiresAt) < new Date();

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg border border-border/50 transition-colors hover:bg-accent/30 ${isExpired ? "opacity-50" : ""}`}
      data-testid={`agent-payload-${payload.id}`}
    >
      <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
        <Bot className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{payload.title}</span>
          <Badge variant="outline" className="text-[9px] h-4 shrink-0" data-testid={`badge-agent-${payload.agentName}`}>
            {payload.agentName}
          </Badge>
        </div>
        {payload.body && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{payload.body}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            <Clock className="h-2.5 w-2.5" />
            {new Date(payload.createdAt).toLocaleString()}
          </span>
          <Badge variant="secondary" className="text-[9px] h-4">{payload.payloadType}</Badge>
          {isExpired && <Badge variant="destructive" className="text-[9px] h-4">Expired</Badge>}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-1" />
    </div>
  );
}

export function AgentUIPayloadCard() {
  const { data: payloads, isLoading } = useQuery<AgentPayload[]>({
    queryKey: ["/api/kernel/agent-ui-payloads"],
    refetchInterval: 60000,
  });

  return (
    <Card data-testid="card-agent-ui-payloads">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Bot className="h-4 w-4" />
          Agent Decisions
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-20">
            <span className="text-xs text-muted-foreground animate-pulse">Loading agent payloads...</span>
          </div>
        ) : !payloads || payloads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-20 text-center" data-testid="empty-agent-payloads">
            <Bot className="h-6 w-6 text-muted-foreground/30 mb-1" />
            <span className="text-xs text-muted-foreground">No agent decisions yet</span>
            <span className="text-[10px] text-muted-foreground/60">Decisions will appear here as agents work</span>
          </div>
        ) : (
          <ScrollArea className="max-h-64">
            <div className="space-y-2">
              {payloads.slice(0, 10).map((p) => (
                <PayloadItem key={p.id} payload={p} />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
