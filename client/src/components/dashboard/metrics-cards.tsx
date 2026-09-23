import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Video, Radio, Eye, Users } from "lucide-react";
import type { DashboardStats } from "@shared/schema";

interface MetricsCardsProps {
  stats?: DashboardStats;
  isLoading: boolean;
}

export default function MetricsCards({ stats, isLoading }: MetricsCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="bg-card border-border">
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-1" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const metrics = [
    {
      title: "Total Videos",
      value: stats?.totalVideos || 0,
      change: `+${stats?.videosToday || 0} today`,
      icon: Video,
      color: "primary",
      testId: "metric-total-videos"
    },
    {
      title: "Active Channels",
      value: stats?.activeChannels || 0,
      change: "7 languages",
      icon: Radio,
      color: "accent",
      testId: "metric-active-channels"
    },
    {
      title: "Total Views",
      value: stats?.totalViews ? `${(stats.totalViews / 1000000).toFixed(1)}M` : "0",
      change: "+24.5K today",
      icon: Eye,
      color: "chart-3",
      testId: "metric-total-views"
    },
    {
      title: "Subscribers",
      value: stats?.totalSubscribers ? `${Math.floor(stats.totalSubscribers / 1000)}K` : "0K",
      change: "+1.2K this week",
      icon: Users,
      color: "destructive",
      testId: "metric-subscribers"
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {metrics.map((metric) => (
        <Card 
          key={metric.title} 
          className="bg-card border-border transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
        >
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{metric.title}</p>
                <p 
                  className="text-2xl font-bold text-foreground" 
                  data-testid={metric.testId}
                >
                  {metric.value.toLocaleString()}
                </p>
                <p className="text-xs text-accent mt-1">{metric.change}</p>
              </div>
              <div className={`w-12 h-12 bg-${metric.color}/10 rounded-lg flex items-center justify-center`}>
                <metric.icon className={`h-6 w-6 text-${metric.color}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
