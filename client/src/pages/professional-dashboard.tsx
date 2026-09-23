import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useSidebar } from "@/hooks/useSidebar";
import { useTranslation } from 'react-i18next';
import { cn } from "@/lib/utils";
import type { DashboardStats } from "@shared/schema";
import ProfessionalSidebar from "@/components/layout/professional-sidebar";
import ProfessionalHeader from "@/components/layout/professional-header";
import { ClineChat } from "@/components/cline/cline-chat";
import { AdvancedChat } from "@/components/cline/advanced-chat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  Video, 
  TrendingUp, 
  Eye, 
  Users, 
  DollarSign, 
  Play, 
  Pause, 
  BarChart3,
  Globe,
  Clock,
  Zap,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Activity
} from "lucide-react";

export default function ProfessionalDashboard() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const sidebar = useSidebar();
  const { t } = useTranslation();

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: t('errors.unauthorized'),
        description: t('auth.welcome'),
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
    refetchInterval: 30000,
  });

  const { data: jobs } = useQuery<any[]>({
    queryKey: ["/api/dashboard/jobs"],
    enabled: isAuthenticated,
    refetchInterval: 5000,
  });

  const { data: apiStatuses } = useQuery<any[]>({
    queryKey: ["/api/dashboard/api-status"],
    enabled: isAuthenticated,
    refetchInterval: 60000,
  });

  const handleProcessNews = async () => {
    try {
      const response = await fetch('/api/news/fetch', {
        method: 'POST',
        credentials: 'include',
      });
      
      if (response.status === 401) {
        toast({
          title: "Não autorizado",
          description: "Você foi desconectado. Fazendo login novamente...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/login";
        }, 500);
        return;
      }
      
      if (!response.ok) {
        throw new Error('Failed to trigger news processing');
      }
      
      toast({
        title: "Sucesso",
        description: "Processamento de notícias iniciado",
      });
    } catch (error: any) {
      toast({
        title: "Erro",
        description: "Falha ao iniciar processamento de notícias",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center safe-bottom">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const metrics = [
    {
      title: "Total de Vídeos",
      value: stats?.totalVideos || 0,
      change: `+${stats?.videosToday || 0} hoje`,
      icon: Video,
      color: "blue",
      gradient: "from-blue-500 to-blue-600"
    },
    {
      title: "Visualizações Totais", 
      value: stats?.totalViews ? `${(stats.totalViews / 1000000).toFixed(1)}M` : "0",
      change: "+24.5K hoje",
      icon: Eye,
      color: "green",
      gradient: "from-green-500 to-green-600"
    },
    {
      title: "Inscritos",
      value: stats?.totalSubscribers ? `${Math.floor(stats.totalSubscribers / 1000)}K` : "0K",
      change: "+1.2K esta semana",
      icon: Users,
      color: "purple",
      gradient: "from-purple-500 to-purple-600"
    },
    {
      title: "Receita Estimada",
      value: "R$ 12.5K",
      change: "+18% este mês",
      icon: DollarSign,
      color: "yellow",
      gradient: "from-yellow-500 to-yellow-600"
    }
  ];

  const handleTestVideoPipeline = async () => {
    try {
      const response = await fetch('/api/test/video-pipeline', {
        method: 'POST',
        credentials: 'include',
      });
      
      if (response.status === 401) {
        toast({
          title: "Não autorizado",
          description: "Você foi desconectado. Fazendo login novamente...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/login";
        }, 500);
        return;
      }
      
      if (!response.ok) {
        throw new Error('Failed to test video pipeline');
      }
      
      const result = await response.json();
      toast({
        title: "🎬 Pipeline de Vídeo Iniciado",
        description: `Testando criação de vídeo com IA: ${result.videoId}`,
      });
    } catch (error: any) {
      toast({
        title: "Erro",
        description: "Falha ao testar pipeline de vídeo",
        variant: "destructive",
      });
    }
  };

  const quickActions = [
    {
      title: "Processar Notícias",
      description: "Buscar e processar novas notícias",
      icon: Play,
      action: handleProcessNews,
      variant: "default" as const
    },
    {
      title: "🧪 Testar Pipeline",
      description: "Testar geração completa de vídeo com IA",
      icon: Zap,
      action: handleTestVideoPipeline,
      variant: "secondary" as const
    },
    {
      title: "Ver Analytics",
      description: "Abrir relatórios detalhados",
      icon: BarChart3,
      action: () => window.location.href = "/analytics",
      variant: "outline" as const
    }
  ];

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'operational':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'degraded':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'down':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <div className="app-container bg-background">
      <ProfessionalSidebar />
      
      <div className={cn(
        "responsive-container transition-all duration-300",
        sidebar.isMobile && "w-full pl-0" // Remove padding conflito com menu
      )}>
        <ProfessionalHeader />
        
        {/* Integrated Layout Container - Responsive - Corrigido */}
        <div className={cn(
          "flex transition-all duration-300 w-full",
          sidebar.isMobile ? "flex-col min-h-[calc(100dvh-64px)]" : "h-[calc(100dvh-64px)]"
        )}>
          {/* Main Content Area - Responsive - Layout corrigido */}
          <main className={cn(
            "flex-1 overflow-y-auto space-y-3 sm:space-y-4 md:space-y-6 transition-all duration-300",
            sidebar.isMobile ? "px-4 py-4 pb-20 w-full" : sidebar.isTablet ? "p-4 w-full" : "p-6 w-full"
          )}>
            {/* Welcome Section */}
            <div className={cn(
              "flex justify-between transition-all duration-300",
              sidebar.isMobile ? "flex-col space-y-2" : "items-center"
            )}>
              <div>
                <h1 className={cn(
                  "font-bold text-foreground transition-all duration-300",
                  sidebar.isMobile ? "text-2xl" : sidebar.isTablet ? "text-2xl" : "text-3xl"
                )}>Dashboard Principal</h1>
                <p className={cn(
                  "text-muted-foreground mt-1 transition-all duration-300",
                  sidebar.isMobile ? "text-sm" : "text-base"
                )}>
                  Monitore sua produção de conteúdo automatizada
                </p>
              </div>
              <div className={cn(
                "flex items-center space-x-2 text-muted-foreground transition-all duration-300",
                sidebar.isMobile ? "text-xs" : "text-sm"
              )}>
                <Clock className={cn(
                  "transition-all duration-300",
                  sidebar.isMobile ? "h-3 w-3" : "h-4 w-4"
                )} />
                <span>
                  {sidebar.isMobile 
                    ? `${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                    : `Última atualização: ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                  }
                </span>
              </div>
            </div>


          {/* Metrics Cards - Mobile First */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 transition-all duration-300">
            {metrics.map((metric) => (
              <Card key={metric.title} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300">
                <CardContent className={cn(
                  "transition-all duration-300 card-responsive",
                  sidebar.isMobile ? "p-3" : "p-4 md:p-6"
                )}>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1 sm:space-y-2 min-w-0 flex-1 pr-2">
                      <p className={cn(
                        "font-medium text-muted-foreground break-words",
                        sidebar.isMobile ? "text-xs" : "text-sm"
                      )}>
                        {metric.title}
                      </p>
                      <p className={cn(
                        "font-bold text-foreground",
                        sidebar.isMobile ? "text-lg" : "text-2xl md:text-3xl"
                      )}>
                        {typeof metric.value === 'number' ? metric.value.toLocaleString() : metric.value}
                      </p>
                      <p className={cn(
                        "text-green-600 font-medium truncate",
                        sidebar.isMobile ? "text-xs" : "text-sm"
                      )}>
                        {metric.change}
                      </p>
                    </div>
                    <div className={cn(
                      "bg-gradient-to-r rounded-xl flex items-center justify-center flex-shrink-0",
                      sidebar.isMobile ? "w-8 h-8" : "w-10 h-10 md:w-12 md:h-12",
                      metric.gradient
                    )}>
                      <metric.icon className={cn(
                        "text-white",
                        sidebar.isMobile ? "h-4 w-4" : "h-5 w-5 md:h-6 md:w-6"
                      )} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Quick Actions & Status - Responsive */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 transition-all duration-300">
            {/* Quick Actions */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Zap className="h-5 w-5" />
                  <span>Ações Rápidas</span>
                </CardTitle>
              </CardHeader>
              <CardContent className={cn(
                "space-y-3 sm:space-y-4",
                sidebar.isMobile ? "p-4" : "p-6"
              )}>
                {quickActions.map((action) => (
                  <div key={action.title} className="flex flex-col sm:flex-row bg-muted/50 rounded-lg transition-all duration-300 space-y-2 sm:space-y-0 sm:items-center sm:justify-between p-3 sm:p-4">
                    <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1 w-full">
                      <div className="bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10">
                        <action.icon className="text-primary h-4 w-4 sm:h-5 sm:w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium text-foreground text-sm sm:text-base truncate">{action.title}</h3>
                        <p className="text-muted-foreground text-xs sm:text-sm truncate">{action.description}</p>
                      </div>
                    </div>
                    <Button 
                      variant={action.variant} 
                      onClick={action.action}
                      size="sm"
                      className="w-full sm:w-auto mt-2 sm:mt-0 min-h-[44px] px-4"
                      data-testid={`button-${action.title.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <span className="sm:hidden">▶️</span>
                      <span className="hidden sm:inline">Executar</span>
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* System Status */}
            <Card>
              <CardHeader className={cn(
                sidebar.isMobile ? "p-4" : "p-6"
              )}>
                <CardTitle className="flex items-center space-x-2">
                  <Activity className={cn(
                    sidebar.isMobile ? "h-4 w-4" : "h-5 w-5"
                  )} />
                  <span className={cn(
                    sidebar.isMobile ? "text-sm" : "text-base"
                  )}>Status dos Sistemas</span>
                </CardTitle>
              </CardHeader>
              <CardContent className={cn(
                "space-y-3 sm:space-y-4",
                sidebar.isMobile ? "p-4" : "p-6"
              )}>
                {apiStatuses && apiStatuses.length > 0 ? (
                  apiStatuses.map((service: any) => (
                    <div key={service.serviceName} className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 min-w-0 flex-1">
                        {getStatusIcon(service.status)}
                        <span className={cn(
                          "font-medium truncate",
                          sidebar.isMobile ? "text-xs" : "text-sm"
                        )}>{service.serviceName}</span>
                      </div>
                      <Badge 
                        variant={service.status === 'operational' ? 'default' : 'destructive'}
                        className={cn(
                          "flex-shrink-0",
                          sidebar.isMobile ? "text-xs px-1.5 py-0.5" : "text-xs"
                        )}
                      >
                        {service.status}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 min-w-0 flex-1">
                        <CheckCircle className={cn(
                          "text-green-500 flex-shrink-0",
                          sidebar.isMobile ? "h-3 w-3" : "h-4 w-4"
                        )} />
                        <span className={cn(
                          "font-medium truncate",
                          sidebar.isMobile ? "text-xs" : "text-sm"
                        )}>OpenAI</span>
                      </div>
                      <Badge variant="default" className={cn(
                        "flex-shrink-0",
                        sidebar.isMobile ? "text-xs px-1.5 py-0.5" : "text-xs"
                      )}>Operacional</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 min-w-0 flex-1">
                        <CheckCircle className={cn(
                          "text-green-500 flex-shrink-0",
                          sidebar.isMobile ? "h-3 w-3" : "h-4 w-4"
                        )} />
                        <span className={cn(
                          "font-medium truncate",
                          sidebar.isMobile ? "text-xs" : "text-sm"
                        )}>HeyGen</span>
                      </div>
                      <Badge variant="default" className={cn(
                        "flex-shrink-0",
                        sidebar.isMobile ? "text-xs px-1.5 py-0.5" : "text-xs"
                      )}>Operacional</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 min-w-0 flex-1">
                        <CheckCircle className={cn(
                          "text-green-500 flex-shrink-0",
                          sidebar.isMobile ? "h-3 w-3" : "h-4 w-4"
                        )} />
                        <span className={cn(
                          "font-medium truncate",
                          sidebar.isMobile ? "text-xs" : "text-sm"
                        )}>ElevenLabs</span>
                      </div>
                      <Badge variant="default" className={cn(
                        "flex-shrink-0",
                        sidebar.isMobile ? "text-xs px-1.5 py-0.5" : "text-xs"
                      )}>Operacional</Badge>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Production Pipeline */}
          <Card>
            <CardHeader className={cn(
              sidebar.isMobile ? "p-4" : "p-6"
            )}>
              <CardTitle className="flex items-center space-x-2">
                <Globe className={cn(
                  sidebar.isMobile ? "h-4 w-4" : "h-5 w-5"
                )} />
                <span className={cn(
                  sidebar.isMobile ? "text-sm" : "text-base"
                )}>Pipeline de Produção Global</span>
              </CardTitle>
            </CardHeader>
            <CardContent className={cn(
              sidebar.isMobile ? "p-4" : "p-6"
            )}>
              <div className={cn(
                "grid transition-all duration-300",
                sidebar.isMobile ? "grid-cols-1 gap-4" : "grid-cols-2 md:grid-cols-4 gap-6"
              )}>
                {[
                  { lang: "🇺🇸 Inglês", videos: 24, progress: 85 },
                  { lang: "🇧🇷 Português", videos: 18, progress: 72 },
                  { lang: "🇪🇸 Espanhol", videos: 15, progress: 68 },
                  { lang: "🇩🇪 Alemão", videos: 12, progress: 55 }
                ].map((channel) => (
                  <div key={channel.lang} className={cn(
                    "space-y-2 sm:space-y-3 transition-all duration-300",
                    sidebar.isMobile && "bg-muted/30 p-3 rounded-lg"
                  )}>
                    <div className="flex items-center justify-between">
                      <span className={cn(
                        "font-medium",
                        sidebar.isMobile ? "text-xs truncate" : "text-sm"
                      )}>{channel.lang}</span>
                      <Badge 
                        variant="outline"
                        className={cn(
                          "flex-shrink-0",
                          sidebar.isMobile ? "text-xs px-1.5 py-0.5" : "text-xs"
                        )}
                      >{channel.videos} vídeos</Badge>
                    </div>
                    <Progress 
                      value={channel.progress} 
                      className={cn(
                        sidebar.isMobile ? "h-1.5" : "h-2"
                      )} 
                    />
                    <p className={cn(
                      "text-muted-foreground",
                      sidebar.isMobile ? "text-xs" : "text-xs"
                    )}>{channel.progress}% completo</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* System Health Status - Comprehensive */}
          <div className={cn(
            "bg-card text-card-foreground rounded-lg border shadow-sm relative",
            sidebar.isMobile ? "mx-0" : "mx-0"
          )}>
            <div className={cn(
              "flex flex-col space-y-1.5 p-6",
              sidebar.isMobile ? "p-4" : "p-6"
            )}>
              <div className="flex items-center space-x-2">
                <Activity className={cn(
                  sidebar.isMobile ? "h-4 w-4" : "h-5 w-5",
                  "text-green-500"
                )} />
                <h3 className={cn(
                  "text-2xl font-semibold leading-none tracking-tight",
                  sidebar.isMobile ? "text-sm" : "text-base"
                )}>Status do Sistema</h3>
              </div>
            </div>
            <div className={cn(
              "space-y-4 sm:space-y-6",
              sidebar.isMobile ? "p-4 pt-0" : "p-6 pt-0"
            )}>
              {/* Quick Stats Grid */}
              <div className={cn(
                "grid gap-4 transition-all duration-300",
                sidebar.isMobile ? "grid-cols-2" : "grid-cols-3"
              )}>
                <div className="bg-muted/30 rounded-lg p-3 text-center">
                  <div className={cn(
                    "font-bold text-primary",
                    sidebar.isMobile ? "text-lg" : "text-xl"
                  )} data-testid="status-videos-today">
                    {stats?.videosToday || 0}
                  </div>
                  <p className={cn(
                    "text-muted-foreground",
                    sidebar.isMobile ? "text-xs" : "text-sm"
                  )}>Vídeos Hoje</p>
                </div>
                
                <div className="bg-muted/30 rounded-lg p-3 text-center">
                  <div className={cn(
                    "font-bold text-green-500",
                    sidebar.isMobile ? "text-lg" : "text-xl"
                  )} data-testid="status-success-rate">
                    {stats?.successRate || 0}%
                  </div>
                  <p className={cn(
                    "text-muted-foreground",
                    sidebar.isMobile ? "text-xs" : "text-sm"
                  )}>Taxa de Sucesso</p>
                </div>

                <div className={cn(
                  "bg-muted/30 rounded-lg p-3 text-center",
                  sidebar.isMobile && "col-span-2"
                )}>
                  <div className="flex items-center justify-center space-x-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className={cn(
                      "font-medium text-green-500",
                      sidebar.isMobile ? "text-sm" : "text-base"
                    )}>
                      Todos os sistemas funcionando
                    </span>
                  </div>
                </div>
              </div>

              {/* API Services Status */}
              <div className="space-y-3">
                <h4 className={cn(
                  "font-semibold text-foreground",
                  sidebar.isMobile ? "text-sm" : "text-base"
                )}>Serviços Externos</h4>
                
                {apiStatuses && apiStatuses.length > 0 ? (
                  <div className="space-y-2">
                    {apiStatuses.map((service: any) => (
                      <div key={service.serviceName} className="flex items-center justify-between py-2 px-3 bg-muted/20 rounded-lg">
                        <div className="flex items-center space-x-2 min-w-0 flex-1">
                          {getStatusIcon(service.status)}
                          <span className={cn(
                            "font-medium truncate",
                            sidebar.isMobile ? "text-xs" : "text-sm"
                          )}>{service.serviceName}</span>
                        </div>
                        <Badge 
                          variant={service.status === 'operational' ? 'default' : 'destructive'}
                          className={cn(
                            "flex-shrink-0",
                            sidebar.isMobile ? "text-xs px-1.5 py-0.5" : "text-xs"
                          )}
                        >
                          {service.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {[
                      { name: "OpenAI", status: "Operacional" },
                      { name: "HeyGen", status: "Operacional" },
                      { name: "ElevenLabs", status: "Operacional" },
                      { name: "YouTube API", status: "Operacional" }
                    ].map((service) => (
                      <div key={service.name} className="flex items-center justify-between py-2 px-3 bg-muted/20 rounded-lg">
                        <div className="flex items-center space-x-2 min-w-0 flex-1">
                          <CheckCircle className={cn(
                            "text-green-500 flex-shrink-0",
                            sidebar.isMobile ? "h-3 w-3" : "h-4 w-4"
                          )} />
                          <span className={cn(
                            "font-medium truncate",
                            sidebar.isMobile ? "text-xs" : "text-sm"
                          )}>{service.name}</span>
                        </div>
                        <Badge variant="default" className={cn(
                          "flex-shrink-0",
                          sidebar.isMobile ? "text-xs px-1.5 py-0.5" : "text-xs"
                        )}>{service.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          </main>

          {/* AI Assistant Panel - INCREASED WIDTH: Better text visualization */}
          {!sidebar.isMobile && (
            <div className={cn(
              "border-l bg-background/50 transition-all duration-300 flex-shrink-0",
              sidebar.isTablet ? "w-80 max-w-[20rem]" : "w-96 xl:w-[28rem] max-w-[24rem] xl:max-w-[28rem]"
            )}>
              <div className="h-full p-3 md:p-4">
                <AdvancedChat compact={true} />
              </div>
            </div>
          )}
        </div>

        {/* Mobile Chat - INCREASED HEIGHT: 30% more + dynamic text box */}
        {sidebar.isMobile && (
          <div className="border-t bg-background/50 transition-all duration-300 flex-shrink-0">
            <div className="h-[36rem]">
              <div className="h-full p-3">
                <AdvancedChat compact={true} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}