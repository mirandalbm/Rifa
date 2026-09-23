import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import Sidebar from "@/components/layout/sidebar";
import MetricsCards from "@/components/dashboard/metrics-cards";
import type { DashboardStats } from "@shared/schema";
import ProductionPipeline from "@/components/dashboard/production-pipeline";
import RecentVideos from "@/components/dashboard/recent-videos";
import SystemHealth from "@/components/dashboard/system-health";
import { Button } from "@/components/ui/button";
import { Play, Pause, Clock } from "lucide-react";

export default function Dashboard() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
    enabled: isAuthenticated,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const handleProcessNews = async () => {
    try {
      const response = await fetch('/api/news/fetch', {
        method: 'POST',
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to trigger news processing');
      }
      
      toast({
        title: "Success",
        description: "News processing has been triggered",
      });
    } catch (error: any) {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/login";
        }, 500);
        return;
      }
      
      toast({
        title: "Error",
        description: "Failed to trigger news processing",
        variant: "destructive",
      });
    }
  };

  const handlePauseJobs = async () => {
    try {
      const response = await fetch('/api/system/pause-jobs', {
        method: 'POST',
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to pause jobs');
      }
      
      toast({
        title: "Success",
        description: "All jobs have been paused",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to pause jobs",
        variant: "destructive",
      });
    }
  };

  if (isLoading || !isAuthenticated) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <header className="bg-card border-b border-border p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-foreground">Dashboard Overview</h2>
              <p className="text-muted-foreground">Monitor your automated news content production</p>
            </div>
            <div className="flex items-center space-x-4">
              <Button 
                onClick={handleProcessNews}
                className="bg-primary hover:bg-primary/80 text-primary-foreground"
                data-testid="button-process-news"
              >
                <Play className="h-4 w-4 mr-2" />
                Process Today's News
              </Button>
              <Button 
                onClick={handlePauseJobs}
                variant="secondary"
                className="bg-secondary hover:bg-secondary/80 text-secondary-foreground"
                data-testid="button-pause-jobs"
              >
                <Pause className="h-4 w-4 mr-2" />
                Pause All Jobs
              </Button>
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span data-testid="text-current-time">
                  {new Date().toLocaleTimeString('en-US', { 
                    timeZone: 'UTC',
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit'
                  })} UTC
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Main Dashboard Content */}
        <div className="p-6 space-y-6">
          {/* Key Metrics */}
          <section>
            <h3 className="text-lg font-semibold text-foreground mb-4">Key Performance Metrics</h3>
            <MetricsCards stats={stats} isLoading={statsLoading} />
          </section>

          {/* Production Pipeline */}
          <section>
            <h3 className="text-lg font-semibold text-foreground mb-4">Production Pipeline Status</h3>
            <ProductionPipeline />
          </section>

          {/* Recent Activity & Analytics */}
          <section>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <RecentVideos />
              </div>
              <div>
                <SystemHealth />
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
