import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  Activity, 
  CheckCircle, 
  AlertTriangle, 
  AlertCircle,
  Info,
  Cpu,
  HardDrive,
  MemoryStick
} from "lucide-react";

interface ApiStatus {
  serviceName: string;
  status: string;
  responseTime?: number;
  lastChecked: string;
}

const mockResourceUsage = {
  cpu: 67,
  memory: 45,
  storage: 82,
};

const mockAlerts = [
  {
    type: 'warning',
    message: 'Synthesia API Rate Limit',
    time: '2 hours ago',
  },
  {
    type: 'success',
    message: 'Daily backup completed',
    time: '6 hours ago',
  },
  {
    type: 'info',
    message: 'New news sources added',
    time: '1 day ago',
  },
];

export default function SystemHealth() {
  const { data: apiStatuses, isLoading: statusLoading } = useQuery<ApiStatus[]>({
    queryKey: ["/api/dashboard/api-status"],
    refetchInterval: 60000, // Refresh every minute
  });

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'operational':
        return <CheckCircle className="h-3 w-3 text-accent" />;
      case 'degraded':
        return <AlertTriangle className="h-3 w-3 text-chart-3" />;
      case 'down':
        return <AlertCircle className="h-3 w-3 text-destructive" />;
      default:
        return <CheckCircle className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'operational':
        return 'text-accent';
      case 'degraded':
        return 'text-chart-3';
      case 'down':
        return 'text-destructive';
      default:
        return 'text-muted-foreground';
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-chart-3" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-accent" />;
      case 'info':
        return <Info className="h-4 w-4 text-primary" />;
      default:
        return <Info className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getAlertBorderColor = (type: string) => {
    switch (type) {
      case 'warning':
        return 'border-chart-3/20 bg-chart-3/10';
      case 'success':
        return 'border-accent/20 bg-accent/10';
      case 'info':
        return 'border-primary/20 bg-primary/10';
      default:
        return 'border-muted/20 bg-muted/10';
    }
  };

  return (
    <div className="space-y-6">
      {/* Language Performance */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Language Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { language: 'English', views: '24.5K', growth: '+12%', color: 'bg-primary' },
              { language: 'Spanish', views: '18.2K', growth: '+8%', color: 'bg-accent' },
              { language: 'Portuguese', views: '15.7K', growth: '+15%', color: 'bg-chart-3' },
              { language: 'German', views: '12.1K', growth: '+6%', color: 'bg-destructive' },
              { language: 'French', views: '9.8K', growth: '+4%', color: 'bg-chart-5' },
            ].map((lang, index) => (
              <div 
                key={lang.language} 
                className="flex items-center justify-between"
                data-testid={`language-${index}`}
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-6 h-4 ${lang.color} rounded border overflow-hidden`}></div>
                  <span className="text-sm text-foreground">{lang.language}</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-foreground">{lang.views}</p>
                  <p className="text-xs text-accent">{lang.growth}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* API Status */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center">
            <Activity className="h-5 w-5 mr-2" />
            API Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {statusLoading ? (
              [...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))
            ) : apiStatuses && apiStatuses.length > 0 ? (
              apiStatuses.map((status: ApiStatus) => (
                <div 
                  key={status.serviceName} 
                  className="flex items-center justify-between"
                  data-testid={`api-status-${status.serviceName.toLowerCase()}`}
                >
                  <span className="text-sm text-foreground">{status.serviceName}</span>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(status.status)}
                    <span className={`text-xs ${getStatusColor(status.status)} capitalize`}>
                      {status.status}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              [
                { name: 'News API', status: 'operational' },
                { name: 'ElevenLabs', status: 'operational' },
                { name: 'Synthesia', status: 'degraded' },
                { name: 'YouTube API', status: 'operational' },
              ].map((service) => (
                <div 
                  key={service.name} 
                  className="flex items-center justify-between"
                  data-testid={`api-status-${service.name.toLowerCase().replace(' ', '-')}`}
                >
                  <span className="text-sm text-foreground">{service.name}</span>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(service.status)}
                    <span className={`text-xs ${getStatusColor(service.status)} capitalize`}>
                      {service.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Resource Usage */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center">
            <Cpu className="h-5 w-5 mr-2" />
            Resource Usage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-foreground flex items-center">
                  <Cpu className="h-3 w-3 mr-1" />
                  CPU Usage
                </span>
                <span className="text-xs text-muted-foreground" data-testid="cpu-usage">
                  {mockResourceUsage.cpu}%
                </span>
              </div>
              <Progress value={mockResourceUsage.cpu} className="h-2" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-foreground flex items-center">
                  <MemoryStick className="h-3 w-3 mr-1" />
                  Memory
                </span>
                <span className="text-xs text-muted-foreground" data-testid="memory-usage">
                  {mockResourceUsage.memory}%
                </span>
              </div>
              <Progress value={mockResourceUsage.memory} className="h-2" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-foreground flex items-center">
                  <HardDrive className="h-3 w-3 mr-1" />
                  Storage
                </span>
                <span className="text-xs text-muted-foreground" data-testid="storage-usage">
                  {mockResourceUsage.storage}%
                </span>
              </div>
              <Progress value={mockResourceUsage.storage} className="h-2" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Alerts */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center">
            <AlertTriangle className="h-5 w-5 mr-2" />
            Recent Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {mockAlerts.map((alert, index) => (
              <div 
                key={index} 
                className={`flex items-start space-x-3 p-3 border rounded-lg ${getAlertBorderColor(alert.type)}`}
                data-testid={`alert-${index}`}
              >
                {getAlertIcon(alert.type)}
                <div>
                  <p className="text-sm text-foreground">{alert.message}</p>
                  <p className="text-xs text-muted-foreground">{alert.time}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
