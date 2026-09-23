import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, Eye, Users, Globe } from "lucide-react";
import type { DashboardStats, YoutubeChannel } from "@shared/schema";

const mockLanguageData = [
  { language: 'English', views: 24500, percentage: 35 },
  { language: 'Spanish', views: 18200, percentage: 26 },
  { language: 'Portuguese', views: 15700, percentage: 22 },
  { language: 'German', views: 12100, percentage: 17 },
];

const mockViewsData = [
  { date: '2025-01-01', views: 1200 },
  { date: '2025-01-02', views: 1450 },
  { date: '2025-01-03', views: 1680 },
  { date: '2025-01-04', views: 1920 },
  { date: '2025-01-05', views: 2140 },
  { date: '2025-01-06', views: 1890 },
  { date: '2025-01-07', views: 2350 },
];

const COLORS = ['hsl(217, 91%, 60%)', 'hsl(142, 76%, 36%)', 'hsl(47, 96%, 53%)', 'hsl(0, 63%, 31%)'];

export default function Analytics() {
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
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
    enabled: isAuthenticated,
  });

  const { data: channels } = useQuery<YoutubeChannel[]>({
    queryKey: ["/api/channels"],
    enabled: isAuthenticated,
  });

  if (isLoading || !isAuthenticated) {
    return null;
  }

  return (
    <div className="flex min-h-[100dvh] overflow-hidden bg-background">
      <Sidebar />
      
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <header className="bg-card border-b border-border p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">Analytics Dashboard</h2>
              <p className="text-muted-foreground text-sm sm:text-base">Performance insights and channel statistics</p>
            </div>
          </div>
        </header>

        {/* Analytics Content */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* Key Metrics Summary */}
          <section>
            <h3 className="text-base sm:text-lg font-semibold text-foreground mb-3 sm:mb-4">Performance Overview</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
              <Card className="bg-card border-border">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-6">
                  <CardTitle className="text-xs sm:text-sm font-medium">Total Views</CardTitle>
                  <Eye className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="p-3 sm:p-6 pt-0">
                  <div className="text-lg sm:text-2xl font-bold text-foreground" data-testid="text-total-views">
                    {statsLoading ? '...' : (stats?.totalViews || 0).toLocaleString()}
                  </div>
                  <p className="text-xs text-accent">+12% from last week</p>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-6">
                  <CardTitle className="text-xs sm:text-sm font-medium">Subscribers</CardTitle>
                  <Users className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="p-3 sm:p-6 pt-0">
                  <div className="text-lg sm:text-2xl font-bold text-foreground" data-testid="text-total-subscribers">
                    {statsLoading ? '...' : (stats?.totalSubscribers || 0).toLocaleString()}
                  </div>
                  <p className="text-xs text-accent">+8% from last week</p>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-6">
                  <CardTitle className="text-xs sm:text-sm font-medium">Active Channels</CardTitle>
                  <Globe className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="p-3 sm:p-6 pt-0">
                  <div className="text-lg sm:text-2xl font-bold text-foreground" data-testid="text-active-channels">
                    {statsLoading ? '...' : stats?.activeChannels || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">Across 7 languages</p>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-6">
                  <CardTitle className="text-xs sm:text-sm font-medium">Growth Rate</CardTitle>
                  <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="p-3 sm:p-6 pt-0">
                  <div className="text-lg sm:text-2xl font-bold text-foreground" data-testid="text-growth-rate">+18.2%</div>
                  <p className="text-xs text-accent">Monthly average</p>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Charts */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Views Over Time */}
            <Card className="bg-card border-border">
              <CardHeader className="p-3 sm:p-6">
                <CardTitle className="text-foreground text-sm sm:text-base">Views Over Time</CardTitle>
              </CardHeader>
              <CardContent className="p-3 sm:p-6 pt-0">
                <ResponsiveContainer width="100%" height={250} className="sm:h-[300px]">
                  <LineChart data={mockViewsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="date" 
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px',
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="views" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      dot={{ fill: 'hsl(var(--primary))' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Language Performance */}
            <Card className="bg-card border-border">
              <CardHeader className="p-3 sm:p-6">
                <CardTitle className="text-foreground text-sm sm:text-base">Performance by Language</CardTitle>
              </CardHeader>
              <CardContent className="p-3 sm:p-6 pt-0">
                <ResponsiveContainer width="100%" height={250} className="sm:h-[300px]">
                  <PieChart>
                    <Pie
                      data={mockLanguageData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ language, percentage }) => `${language} ${percentage}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="views"
                    >
                      {mockLanguageData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </section>

          {/* Language Statistics Table */}
          <section>
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground">Language Performance Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {mockLanguageData.map((lang, index) => (
                    <div key={lang.language} className="flex items-center justify-between p-4 bg-muted rounded-lg" data-testid={`row-language-${index}`}>
                      <div className="flex items-center space-x-3">
                        <div 
                          className="w-4 h-4 rounded"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        ></div>
                        <span className="text-foreground font-medium">{lang.language}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-foreground font-semibold">{lang.views.toLocaleString()}</div>
                        <div className="text-xs text-accent">+{Math.floor(Math.random() * 20 + 5)}% growth</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Channel List */}
          <section>
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground">Channel Overview</CardTitle>
              </CardHeader>
              <CardContent>
                {channels && channels.length > 0 ? (
                  <div className="space-y-3">
                    {channels.map((channel: any) => (
                      <div key={channel.id} className="flex items-center justify-between p-4 bg-muted rounded-lg" data-testid={`row-channel-${channel.id}`}>
                        <div>
                          <h4 className="font-semibold text-foreground">{channel.name}</h4>
                          <p className="text-sm text-muted-foreground">Language: {channel.language}</p>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-foreground">
                            {channel.subscriberCount?.toLocaleString() || 0} subscribers
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {channel.totalViews?.toLocaleString() || 0} total views
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Globe className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">No Channels Found</h3>
                    <p className="text-muted-foreground">
                      No YouTube channels have been configured yet.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </div>
      </main>
    </div>
  );
}
