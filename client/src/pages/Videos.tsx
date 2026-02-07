import { useVideos } from "@/hooks/use-videos";
import { Link } from "wouter";
import { StatusBadge } from "@/components/StatusBadge";
import { format } from "date-fns";
import { Search, Filter, PlayCircle, MoreHorizontal } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useState } from "react";

export default function Videos() {
  const [filterStatus, setFilterStatus] = useState<string>("");
  const { data: videos, isLoading } = useVideos({ status: filterStatus || undefined });

  return (
    <div className="p-8 space-y-6 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Video Library</h1>
          <p className="text-muted-foreground mt-1">Manage VODs, Shorts, and Clips.</p>
        </div>
        
        <div className="flex items-center gap-3">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input 
                    placeholder="Search videos..."
                    className="pl-9 pr-4 py-2 bg-secondary/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 w-64"
                />
            </div>
            <button className="p-2 border border-border bg-card rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                <Filter className="h-5 w-5" />
            </button>
        </div>
      </div>

      <div className="flex gap-2 pb-2 overflow-x-auto">
        {["", "ingested", "processing", "ready", "scheduled", "uploaded"].map((status) => (
            <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={cn(
                    "px-4 py-1.5 rounded-full text-xs font-medium border transition-all capitalize",
                    filterStatus === status 
                        ? "bg-primary/10 border-primary text-primary" 
                        : "bg-card border-border text-muted-foreground hover:border-primary/50"
                )}
            >
                {status || "All Videos"}
            </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
                <Skeleton key={i} className="h-72 rounded-2xl" />
            ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {videos?.map((video) => (
                <Link key={video.id} href={`/videos/${video.id}`} className="group block h-full">
                    <div className="bg-card border border-border/50 rounded-2xl overflow-hidden hover:shadow-xl hover:shadow-black/20 hover:-translate-y-1 transition-all duration-300 h-full flex flex-col">
                        <div className="aspect-video bg-secondary relative overflow-hidden">
                             {/* Thumbnail Placeholder */}
                             {video.thumbnailUrl ? (
                                <img src={video.thumbnailUrl} alt={video.title} className="w-full h-full object-cover" />
                             ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary to-background">
                                    <PlayCircle className="h-12 w-12 text-muted-foreground/20" />
                                </div>
                             )}
                             <div className="absolute top-3 right-3">
                                <StatusBadge status={video.status} />
                             </div>
                             <div className="absolute bottom-3 right-3 bg-black/80 text-white text-[10px] font-mono px-1.5 py-0.5 rounded">
                                {video.type === 'short' ? 'SHORT' : 'VOD'}
                             </div>
                        </div>
                        <div className="p-4 flex-1 flex flex-col">
                            <h3 className="font-bold text-lg line-clamp-2 mb-2 group-hover:text-primary transition-colors">{video.title}</h3>
                            <p className="text-xs text-muted-foreground line-clamp-2 mb-4 flex-1">{video.description || "No description generated yet."}</p>
                            
                            <div className="pt-4 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground mt-auto">
                                <span>{format(new Date(video.createdAt || Date.now()), "MMM d, yyyy")}</span>
                                <MoreHorizontal className="h-4 w-4 hover:text-foreground cursor-pointer" />
                            </div>
                        </div>
                    </div>
                </Link>
            ))}
        </div>
      )}
    </div>
  );
}
