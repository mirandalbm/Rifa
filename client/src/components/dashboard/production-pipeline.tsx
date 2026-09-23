import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isUnauthorizedError } from "@/lib/authUtils";
import { 
  Newspaper, 
  Mic, 
  Video, 
  CheckCircle, 
  Edit3, 
  Play,
  Clock,
  AlertTriangle
} from "lucide-react";

interface ProcessingJob {
  id: string;
  type: string;
  status: string;
  progress: number;
  data?: any;
  createdAt: string;
}

interface PendingVideo {
  id: string;
  title: string;
  status: string;
  language: string;
  createdAt: string;
}

export default function ProductionPipeline() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: jobs, isLoading: jobsLoading } = useQuery<ProcessingJob[]>({
    queryKey: ["/api/dashboard/jobs"],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const { data: pendingVideos, isLoading: videosLoading } = useQuery<PendingVideo[]>({
    queryKey: ["/api/videos", { status: "ready" }],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  const approveVideoMutation = useMutation({
    mutationFn: async (videoId: string) => {
      await apiRequest("PUT", `/api/videos/${videoId}/approve`);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Video approved and queued for publishing",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
    },
    onError: (error: any) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to approve video",
        variant: "destructive",
      });
    },
  });

  const getJobIcon = (type: string) => {
    switch (type) {
      case 'news_fetch': return Newspaper;
      case 'script_generation': return Newspaper;
      case 'video_render': return Video;
      case 'voice_generation': return Mic;
      default: return Play;
    }
  };

  const getJobColor = (type: string) => {
    switch (type) {
      case 'news_fetch': return 'primary';
      case 'script_generation': return 'primary';
      case 'video_render': return 'chart-3';
      case 'voice_generation': return 'accent';
      default: return 'muted';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready': return 'bg-accent text-accent-foreground';
      case 'processing': return 'bg-primary text-primary-foreground';
      case 'failed': return 'bg-destructive text-destructive-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const formatJobName = (job: ProcessingJob) => {
    if (job.data?.videoId) {
      return `Processing Video Content`;
    }
    switch (job.type) {
      case 'news_fetch': return 'Fetching Latest News';
      case 'script_generation': return 'Generating Script';
      case 'video_render': return 'Rendering Video';
      case 'voice_generation': return 'Creating Voiceover';
      default: return job.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  };

  const getTimeRemaining = (progress: number) => {
    if (progress >= 90) return '1min remaining';
    if (progress >= 70) return '3min remaining';
    if (progress >= 50) return '5min remaining';
    if (progress >= 30) return '8min remaining';
    return '10min remaining';
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Currently Processing */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center">
            <Play className="h-5 w-5 mr-2" />
            Currently Processing
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {jobsLoading ? (
              [...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Skeleton className="w-8 h-8 rounded-full" />
                    <div>
                      <Skeleton className="h-4 w-32 mb-1" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                  <div className="text-right">
                    <Skeleton className="h-2 w-16 mb-1" />
                    <Skeleton className="h-3 w-8" />
                  </div>
                </div>
              ))
            ) : jobs && jobs.length > 0 ? (
              jobs.map((job: ProcessingJob) => {
                const JobIcon = getJobIcon(job.type);
                const color = getJobColor(job.type);
                
                return (
                  <div 
                    key={job.id} 
                    className="flex items-center justify-between p-3 bg-muted rounded-lg"
                    data-testid={`job-${job.id}`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 bg-${color} rounded-full flex items-center justify-center`}>
                        <JobIcon className="h-4 w-4 text-background animate-spin" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {formatJobName(job)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {job.type.replace('_', ' ')} • {getTimeRemaining(job.progress)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Progress 
                        value={job.progress} 
                        className="w-16 h-2 mb-1"
                        data-testid={`progress-${job.id}`}
                      />
                      <p className="text-xs text-muted-foreground">{job.progress}%</p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-8">
                <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No active processing jobs</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pending Approval */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-foreground flex items-center">
              <CheckCircle className="h-5 w-5 mr-2" />
              Pending Approval
            </CardTitle>
            {pendingVideos && pendingVideos.length > 0 && (
              <Badge className="bg-chart-3 text-background" data-testid="pending-count">
                {pendingVideos.length} items
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {videosLoading ? (
              [...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Skeleton className="w-12 h-8 rounded" />
                    <div>
                      <Skeleton className="h-4 w-40 mb-1" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Skeleton className="h-6 w-16" />
                    <Skeleton className="h-6 w-12" />
                  </div>
                </div>
              ))
            ) : pendingVideos && pendingVideos.length > 0 ? (
              pendingVideos.map((video: PendingVideo) => (
                <div 
                  key={video.id} 
                  className="flex items-center justify-between p-3 bg-muted rounded-lg"
                  data-testid={`pending-video-${video.id}`}
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-8 bg-gradient-to-br from-primary to-accent rounded border overflow-hidden">
                      <div className="w-full h-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                        <Video className="h-3 w-3 text-foreground" />
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground line-clamp-1">
                        {video.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Ready for review • {video.language}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      size="sm"
                      onClick={() => approveVideoMutation.mutate(video.id)}
                      disabled={approveVideoMutation.isPending}
                      className="bg-accent hover:bg-accent/80 text-accent-foreground text-xs h-6 px-2"
                      data-testid={`approve-${video.id}`}
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs h-6 px-2"
                      data-testid={`edit-${video.id}`}
                    >
                      <Edit3 className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <CheckCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No videos pending approval</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
