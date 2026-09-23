import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import ProfessionalSidebar from "@/components/layout/professional-sidebar";
import ProfessionalHeader from "@/components/layout/professional-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Search, RefreshCw, CheckCircle, XCircle, 
  TrendingUp, Clock, Globe, Filter,
  Newspaper, Eye, Star, AlertCircle,
  Calendar, BarChart3, Target,
  Bot, Zap, Play
} from "lucide-react";

export default function NewsManagement() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const [searchFilter, setSearchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [scoreFilter, setScoreFilter] = useState("all");

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

  const { data: news, isLoading: newsLoading } = useQuery({
    queryKey: ["/api/news", { status: statusFilter, source: sourceFilter, search: searchFilter }],
    enabled: isAuthenticated,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: newsStats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/news/stats"],
    enabled: isAuthenticated,
    refetchInterval: 60000,
  });

  const { data: newsSources } = useQuery({
    queryKey: ["/api/news/sources"],
    enabled: isAuthenticated,
  });

  const fetchNewsMutation = useMutation({
    mutationFn: async ({ sources, keywords }: { sources?: string[], keywords?: string } = {}) => {
      await apiRequest("POST", "/api/news/fetch", { sources, keywords });
    },
    onSuccess: () => {
      toast({
        title: "Pesquisa Iniciada",
        description: "Buscando notícias com critérios de estilo dark...",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/news"] });
    },
    onError: (error: any) => {
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
        title: "Erro",
        description: "Falha ao iniciar busca de notícias",
        variant: "destructive",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiRequest("PUT", `/api/news/${id}/status`, { status });
    },
    onSuccess: () => {
      toast({
        title: "Status Atualizado",
        description: "Status da notícia atualizado com sucesso",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/news"] });
    },
    onError: (error: any) => {
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
        title: "Erro",
        description: "Falha ao atualizar status da notícia",
        variant: "destructive",
      });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-emerald-500 text-white hover:bg-emerald-600';
      case 'rejected': return 'bg-red-500 text-white hover:bg-red-600';
      case 'processed': return 'bg-blue-500 text-white hover:bg-blue-600';
      case 'pending': return 'bg-amber-500 text-white hover:bg-amber-600';
      case 'discovered': return 'bg-slate-500 text-white hover:bg-slate-600';
      default: return 'bg-gray-500 text-white hover:bg-gray-600';
    }
  };

  const getViralScoreColor = (score: number) => {
    if (score >= 85) return 'text-emerald-600 font-bold';
    if (score >= 70) return 'text-blue-600 font-semibold';
    if (score >= 55) return 'text-amber-600';
    return 'text-gray-600';
  };

  const getViralScoreIcon = (score: number) => {
    if (score >= 85) return <TrendingUp className="h-4 w-4 text-emerald-600" />;
    if (score >= 70) return <Target className="h-4 w-4 text-blue-600" />;
    if (score >= 55) return <Eye className="h-4 w-4 text-amber-600" />;
    return <BarChart3 className="h-4 w-4 text-gray-600" />;
  };

  const filteredNews = (news as any[])?.filter((article: any) => {
    const matchesSearch = searchFilter === "" || 
      article.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
      article.content.toLowerCase().includes(searchFilter.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || article.status === statusFilter;
    const matchesSource = sourceFilter === "all" || article.source === sourceFilter;
    
    const matchesScore = scoreFilter === "all" || 
      (scoreFilter === "high" && article.viralScore >= 85) ||
      (scoreFilter === "medium" && article.viralScore >= 70 && article.viralScore < 85) ||
      (scoreFilter === "low" && article.viralScore < 70);
    
    return matchesSearch && matchesStatus && matchesSource && matchesScore;
  }) || [];

  return (
    <div className="app-container bg-background">
      <ProfessionalSidebar />
      <div className="responsive-container">
        <ProfessionalHeader />
        <main className="flex-1 overflow-y-auto space-y-4 p-4 sm:p-6 w-full safe-bottom">
          {/* Page Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold text-foreground flex items-center">
                  <Newspaper className="h-8 w-8 mr-3 text-primary" />
                  Gerenciamento de Notícias
                </h1>
                <p className="text-muted-foreground mt-2">
                  Sistema inteligente de curadoria automática com classificação viral
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <Button
                  variant="outline"
                  onClick={() => fetchNewsMutation.mutate({})}
                  disabled={fetchNewsMutation.isPending}
                  data-testid="button-auto-search"
                >
                  {fetchNewsMutation.isPending ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Bot className="h-4 w-4 mr-2" />
                  )}
                  Busca Automática IA
                </Button>
                <Button
                  onClick={() => fetchNewsMutation.mutate({})}
                  disabled={fetchNewsMutation.isPending}
                  className="bg-gradient-to-r from-primary to-primary/80"
                  data-testid="button-fetch-news"
                >
                  {fetchNewsMutation.isPending ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4 mr-2" />
                  )}
                  Pesquisar Notícias Dark
                </Button>
              </div>
            </div>
            
            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
              <Card className="border-0 shadow-lg">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Total de Notícias</p>
                      <p className="text-2xl font-bold text-foreground">{(newsStats as any)?.totalNews || 0}</p>
                      <p className="text-xs text-green-600 mt-1">+{(newsStats as any)?.todayNews || 0} hoje</p>
                    </div>
                    <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                      <Newspaper className="h-6 w-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="border-0 shadow-lg">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Score Médio Viral</p>
                      <p className="text-2xl font-bold text-foreground">{(newsStats as any)?.averageScore || 0}</p>
                      <p className="text-xs text-blue-600 mt-1">Classificação IA</p>
                    </div>
                    <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
                      <TrendingUp className="h-6 w-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="border-0 shadow-lg">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Aprovadas</p>
                      <p className="text-2xl font-bold text-foreground">{(newsStats as any)?.approvedNews || 0}</p>
                      <p className="text-xs text-emerald-600 mt-1">{Math.round(((newsStats as any)?.approvedNews || 0) / ((newsStats as any)?.totalNews || 1) * 100)}% taxa</p>
                    </div>
                    <div className="w-12 h-12 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center">
                      <CheckCircle className="h-6 w-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="border-0 shadow-lg">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Fontes Ativas</p>
                      <p className="text-2xl font-bold text-foreground">{(newsSources as any[])?.length || 0}</p>
                      <p className="text-xs text-blue-600 mt-1">APIs conectadas</p>
                    </div>
                    <div className="w-12 h-12 bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl flex items-center justify-center">
                      <Globe className="h-6 w-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            
            {/* Filters */}
            <Card className="border-0 shadow-lg">
              <CardContent className="p-4 sm:p-6">
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">Filtros:</span>
                  </div>
                  
                  {/* Mobile-first responsive filter layout */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4">
                    <div className="sm:col-span-2 lg:col-span-2 xl:col-span-2">
                      <Input
                        placeholder="Buscar notícias..."
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        className="border-border w-full"
                        data-testid="input-search-news"
                      />
                    </div>
                    
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-full" data-testid="select-status-filter">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos Status</SelectItem>
                        <SelectItem value="discovered">Descobertas</SelectItem>
                        <SelectItem value="processed">Processadas</SelectItem>
                        <SelectItem value="approved">Aprovadas</SelectItem>
                        <SelectItem value="rejected">Rejeitadas</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    <Select value={scoreFilter} onValueChange={setScoreFilter}>
                      <SelectTrigger className="w-full" data-testid="select-score-filter">
                        <SelectValue placeholder="Score" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos Scores</SelectItem>
                        <SelectItem value="high">Alto (85+)</SelectItem>
                        <SelectItem value="medium">Médio (70-84)</SelectItem>
                        <SelectItem value="low">Baixo (&lt;70)</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    <Select value={sourceFilter} onValueChange={setSourceFilter}>
                      <SelectTrigger className="w-full" data-testid="select-source-filter">
                        <SelectValue placeholder="Fonte" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas Fontes</SelectItem>
                        {(newsSources as any[])?.map((source: any) => (
                          <SelectItem key={source} value={source}>{source}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    <div className="flex items-center justify-center sm:justify-start">
                      <Badge variant="secondary" className="text-xs sm:text-sm">
                        {filteredNews.length} resultados
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* News Content */}
          <Tabs defaultValue="all" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
              <TabsTrigger value="all" className="text-xs sm:text-sm">Todas</TabsTrigger>
              <TabsTrigger value="pending" className="text-xs sm:text-sm">Pendentes</TabsTrigger>
              <TabsTrigger value="approved" className="text-xs sm:text-sm">Aprovadas</TabsTrigger>
              <TabsTrigger value="high-score" className="text-xs sm:text-sm">Alto Score</TabsTrigger>
            </TabsList>
            
            <TabsContent value="all" className="space-y-4">
              {newsLoading ? (
                <div className="grid grid-cols-1 gap-6">
                  {[...Array(5)].map((_, i) => (
                    <Card key={i} className="border-0 shadow-lg">
                      <CardHeader>
                        <div className="h-6 bg-muted rounded animate-pulse"></div>
                        <div className="h-4 bg-muted rounded animate-pulse w-3/4"></div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="h-4 bg-muted rounded animate-pulse"></div>
                          <div className="h-4 bg-muted rounded animate-pulse w-5/6"></div>
                          <div className="h-4 bg-muted rounded animate-pulse w-2/3"></div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : filteredNews.length > 0 ? (
                <div className="grid grid-cols-1 gap-6">
                  {filteredNews.map((article: any) => (
                    <Card key={article.id} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300" data-testid={`card-news-${article.id}`}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-xl font-bold text-foreground mb-3 leading-tight">
                              {article.title}
                            </CardTitle>
                            <div className="flex items-center space-x-6 text-sm">
                              <div className="flex items-center space-x-2">
                                <Globe className="h-4 w-4 text-muted-foreground" />
                                <span className="text-muted-foreground">{article.source}</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                {getViralScoreIcon(article.viralScore)}
                                <span className={getViralScoreColor(article.viralScore)}>
                                  {article.viralScore}/100
                                </span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Clock className="h-4 w-4 text-muted-foreground" />
                                <span className="text-muted-foreground">
                                  {new Date(article.createdAt).toLocaleDateString('pt-BR')}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-3">
                            <Badge className={getStatusColor(article.status)}>
                              {article.status === 'approved' && <CheckCircle className="h-3 w-3 mr-1" />}
                              {article.status === 'rejected' && <XCircle className="h-3 w-3 mr-1" />}
                              {article.status === 'processed' && <AlertCircle className="h-3 w-3 mr-1" />}
                              {article.status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
                              {article.status === 'discovered' && <Star className="h-3 w-3 mr-1" />}
                              {article.status}
                            </Badge>
                            {article.viralScore >= 85 && (
                              <Badge className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white">
                                <TrendingUp className="h-3 w-3 mr-1" />
                                VIRAL
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-muted-foreground mb-6 leading-relaxed">
                          {article.content}
                        </p>
                        
                        {/* Progress bar for viral score */}
                        <div className="mb-6">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-muted-foreground">Potencial Viral</span>
                            <span className={`text-xs font-bold ${getViralScoreColor(article.viralScore)}`}>
                              {article.viralScore}%
                            </span>
                          </div>
                          <Progress 
                            value={article.viralScore} 
                            className="h-2"
                          />
                        </div>
                        
                        {article.status === 'processed' && (
                          <div className="flex items-center space-x-3">
                            <Button
                              size="sm"
                              onClick={() => updateStatusMutation.mutate({ 
                                id: article.id, 
                                status: 'approved' 
                              })}
                              disabled={updateStatusMutation.isPending}
                              className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white"
                              data-testid={`button-approve-${article.id}`}
                            >
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Aprovar para Produção
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => updateStatusMutation.mutate({ 
                                id: article.id, 
                                status: 'rejected' 
                              })}
                              disabled={updateStatusMutation.isPending}
                              data-testid={`button-reject-${article.id}`}
                            >
                              <XCircle className="h-4 w-4 mr-2" />
                              Rejeitar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(article.url, '_blank')}
                              data-testid={`button-view-${article.id}`}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              Ver Original
                            </Button>
                          </div>
                        )}
                        
                        {article.status === 'approved' && (
                          <div className="flex items-center space-x-3">
                            <Button
                              size="sm"
                              className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white"
                              data-testid={`button-generate-video-${article.id}`}
                            >
                              <Play className="h-4 w-4 mr-2" />
                              Gerar Vídeo
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateStatusMutation.mutate({ 
                                id: article.id, 
                                status: 'processed' 
                              })}
                              disabled={updateStatusMutation.isPending}
                            >
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Reverter
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="border-0 shadow-lg">
                  <CardContent className="p-12 text-center">
                    <div className="w-24 h-24 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full flex items-center justify-center mx-auto mb-6">
                      <Search className="h-12 w-12 text-primary" />
                    </div>
                    <h3 className="text-xl font-bold text-foreground mb-3">Nenhuma Notícia Encontrada</h3>
                    <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                      Não encontramos notícias com os filtros aplicados. Inicie uma nova busca ou ajuste os critérios.
                    </p>
                    <div className="flex justify-center space-x-3">
                      <Button
                        onClick={() => fetchNewsMutation.mutate({})}
                        disabled={fetchNewsMutation.isPending}
                        className="bg-gradient-to-r from-primary to-primary/80"
                      >
                        <Search className="h-4 w-4 mr-2" />
                        Buscar Notícias Dark
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSearchFilter("");
                          setStatusFilter("all");
                          setSourceFilter("all");
                          setScoreFilter("all");
                        }}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Limpar Filtros
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
            
            <TabsContent value="pending">
              <div className="grid grid-cols-1 gap-6">
                {filteredNews.filter((article: any) => article.status === 'processed').map((article: any) => (
                  <Card key={article.id} className="border-0 shadow-lg">
                    <CardHeader>
                      <CardTitle className="text-lg font-semibold">{article.title}</CardTitle>
                      <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                        <span>Score: {article.viralScore}/100</span>
                        <span>{article.source}</span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground mb-4">{article.content}</p>
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          onClick={() => updateStatusMutation.mutate({ 
                            id: article.id, 
                            status: 'approved' 
                          })}
                          disabled={updateStatusMutation.isPending}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => updateStatusMutation.mutate({ 
                            id: article.id, 
                            status: 'rejected' 
                          })}
                          disabled={updateStatusMutation.isPending}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Rejeitar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="approved">
              <div className="grid grid-cols-1 gap-6">
                {filteredNews.filter((article: any) => article.status === 'approved').map((article: any) => (
                  <Card key={article.id} className="border-0 shadow-lg border-l-4 border-l-emerald-500">
                    <CardHeader>
                      <CardTitle className="text-lg font-semibold text-emerald-700">{article.title}</CardTitle>
                      <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                        <Badge className="bg-emerald-100 text-emerald-700">
                          Aprovada para Produção
                        </Badge>
                        <span>Score: {article.viralScore}/100</span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground mb-4">{article.content}</p>
                      <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        <Play className="h-4 w-4 mr-2" />
                        Iniciar Produção de Vídeo
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="high-score">
              <div className="grid grid-cols-1 gap-6">
                {filteredNews.filter((article: any) => article.viralScore >= 85).map((article: any) => (
                  <Card key={article.id} className="border-0 shadow-lg border-l-4 border-l-yellow-500">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg font-semibold">{article.title}</CardTitle>
                        <Badge className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white">
                          <TrendingUp className="h-3 w-3 mr-1" />
                          ALTO POTENCIAL VIRAL
                        </Badge>
                      </div>
                      <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                        <span className="text-yellow-600 font-bold">Score: {article.viralScore}/100</span>
                        <span>{article.source}</span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground mb-4">{article.content}</p>
                      <Progress value={article.viralScore} className="mb-4 h-3" />
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600"
                        >
                          <Zap className="h-4 w-4 mr-2" />
                          Produção Prioritária
                        </Button>
                        {article.status === 'processed' && (
                          <Button
                            size="sm"
                            onClick={() => updateStatusMutation.mutate({ 
                              id: article.id, 
                              status: 'approved' 
                            })}
                            disabled={updateStatusMutation.isPending}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Aprovar
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
}