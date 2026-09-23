import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import ProfessionalSidebar from "@/components/layout/professional-sidebar";
import ProfessionalHeader from "@/components/layout/professional-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Settings, Key, Eye, EyeOff, CheckCircle, XCircle,
  Zap, Bot, Mic, Video, Globe, Youtube, 
  Twitter, Facebook, Instagram, MessageSquare,
  Save, TestTube, RefreshCw, AlertTriangle,
  Lock, Unlock, Shield, HelpCircle
} from "lucide-react";

interface ApiConfig {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  fields: {
    key: string;
    label: string;
    placeholder: string;
    type: 'text' | 'password';
    required: boolean;
  }[];
  isActive: boolean;
  status: 'connected' | 'disconnected' | 'error' | 'testing';
}

const apiConfigurations: ApiConfig[] = [
  {
    id: 'openai',
    name: 'OpenAI GPT',
    description: 'Geração de scripts e conteúdo inteligente',
    icon: <Bot className="h-5 w-5" />,
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'sk-...', type: 'password', required: true },
      { key: 'model', label: 'Modelo', placeholder: 'gpt-4o', type: 'text', required: false },
    ],
    isActive: false,
    status: 'disconnected'
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs Voice',
    description: 'Síntese de voz em múltiplos idiomas',
    icon: <Mic className="h-5 w-5" />,
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'Your ElevenLabs API key', type: 'password', required: true },
      { key: 'voice_id', label: 'Voice ID Padrão', placeholder: 'Voice ID', type: 'text', required: false },
    ],
    isActive: false,
    status: 'disconnected'
  },
  {
    id: 'heygen',
    name: 'HeyGen Avatars',
    description: 'Geração de avatares e vídeos com IA',
    icon: <Video className="h-5 w-5" />,
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'Your HeyGen API key', type: 'password', required: true },
      { key: 'template_id', label: 'Template ID Padrão', placeholder: 'Template ID', type: 'text', required: false },
    ],
    isActive: false,
    status: 'disconnected'
  },
  {
    id: 'youtube',
    name: 'YouTube API',
    description: 'Publicação automática de vídeos',
    icon: <Youtube className="h-5 w-5" />,
    fields: [
      { key: 'client_id', label: 'Client ID', placeholder: 'Your Google Client ID', type: 'text', required: true },
      { key: 'client_secret', label: 'Client Secret', placeholder: 'Your Google Client Secret', type: 'password', required: true },
      { key: 'refresh_token', label: 'Refresh Token', placeholder: 'OAuth Refresh Token', type: 'password', required: false },
    ],
    isActive: false,
    status: 'disconnected'
  },
  {
    id: 'newsapi',
    name: 'NewsAPI',
    description: 'Agregação de notícias em tempo real',
    icon: <Globe className="h-5 w-5" />,
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'Your NewsAPI key', type: 'password', required: true },
    ],
    isActive: false,
    status: 'disconnected'
  },
  {
    id: 'newsdata',
    name: 'NewsData.io',
    description: 'Fonte secundária de notícias',
    icon: <Globe className="h-5 w-5" />,
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'Your NewsData.io key', type: 'password', required: true },
    ],
    isActive: false,
    status: 'disconnected'
  },
];

const socialMediaConfigs: ApiConfig[] = [
  {
    id: 'twitter',
    name: 'Twitter/X',
    description: 'Publicação automática de tweets',
    icon: <Twitter className="h-5 w-5" />,
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'Twitter API Key', type: 'password', required: true },
      { key: 'api_secret', label: 'API Secret', placeholder: 'Twitter API Secret', type: 'password', required: true },
      { key: 'access_token', label: 'Access Token', placeholder: 'Access Token', type: 'password', required: true },
      { key: 'access_token_secret', label: 'Access Token Secret', placeholder: 'Token Secret', type: 'password', required: true },
    ],
    isActive: false,
    status: 'disconnected'
  },
  {
    id: 'facebook',
    name: 'Facebook',
    description: 'Postagens automáticas no Facebook',
    icon: <Facebook className="h-5 w-5" />,
    fields: [
      { key: 'app_id', label: 'App ID', placeholder: 'Facebook App ID', type: 'text', required: true },
      { key: 'app_secret', label: 'App Secret', placeholder: 'Facebook App Secret', type: 'password', required: true },
      { key: 'access_token', label: 'Page Access Token', placeholder: 'Long-lived Page Token', type: 'password', required: true },
    ],
    isActive: false,
    status: 'disconnected'
  },
  {
    id: 'instagram',
    name: 'Instagram',
    description: 'Publicação de posts e stories',
    icon: <Instagram className="h-5 w-5" />,
    fields: [
      { key: 'access_token', label: 'Access Token', placeholder: 'Instagram Access Token', type: 'password', required: true },
      { key: 'account_id', label: 'Business Account ID', placeholder: 'Instagram Business ID', type: 'text', required: true },
    ],
    isActive: false,
    status: 'disconnected'
  },
  {
    id: 'discord',
    name: 'Discord Bot',
    description: 'Notificações e moderação via Discord',
    icon: <MessageSquare className="h-5 w-5" />,
    fields: [
      { key: 'bot_token', label: 'Bot Token', placeholder: 'Discord Bot Token', type: 'password', required: true },
      { key: 'channel_id', label: 'Channel ID', placeholder: 'Discord Channel ID', type: 'text', required: true },
    ],
    isActive: false,
    status: 'disconnected'
  }
];

export default function ApiSettings() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  
  const [configs, setConfigs] = useState<Record<string, ApiConfig>>({});
  const [socialConfigs, setSocialConfigs] = useState<Record<string, ApiConfig>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [testingApi, setTestingApi] = useState<string | null>(null);

  // Initialize configurations
  useEffect(() => {
    const apiConfigsMap = apiConfigurations.reduce((acc, config) => {
      acc[config.id] = { ...config };
      return acc;
    }, {} as Record<string, ApiConfig>);
    
    const socialConfigsMap = socialMediaConfigs.reduce((acc, config) => {
      acc[config.id] = { ...config };
      return acc;
    }, {} as Record<string, ApiConfig>);
    
    setConfigs(apiConfigsMap);
    setSocialConfigs(socialConfigsMap);
  }, []);

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

  // Load saved configurations
  const { data: savedConfigs, isLoading: configsLoading } = useQuery({
    queryKey: ["/api/settings/apis"],
    enabled: isAuthenticated,
  });

  const { data: savedSocialConfigs } = useQuery({
    queryKey: ["/api/settings/social"],
    enabled: isAuthenticated,
  });

  // Save API configuration
  const saveApiMutation = useMutation({
    mutationFn: async ({ apiId, config }: { apiId: string, config: any }) => {
      await apiRequest("PUT", `/api/settings/apis/${apiId}`, config);
    },
    onSuccess: (_, { apiId }) => {
      toast({
        title: "Configuração Salva",
        description: "API configurada com sucesso",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/apis"] });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Falha ao salvar configuração",
        variant: "destructive",
      });
    },
  });

  // Test API connection
  const testApiMutation = useMutation({
    mutationFn: async (apiId: string) => {
      const response = await apiRequest("POST", `/api/settings/test/${apiId}`);
      return response;
    },
    onSuccess: (_, apiId) => {
      setConfigs(prev => ({
        ...prev,
        [apiId]: { ...prev[apiId], status: 'connected' }
      }));
      toast({
        title: "Conexão Bem-sucedida",
        description: "API testada e funcionando",
      });
      setTestingApi(null);
    },
    onError: (_, apiId) => {
      setConfigs(prev => ({
        ...prev,
        [apiId]: { ...prev[apiId], status: 'error' }
      }));
      toast({
        title: "Erro na Conexão",
        description: "Falha ao conectar com a API",
        variant: "destructive",
      });
      setTestingApi(null);
    },
  });

  const handleConfigChange = (configType: 'api' | 'social', apiId: string, field: string, value: string) => {
    if (configType === 'api') {
      setConfigs(prev => ({
        ...prev,
        [apiId]: {
          ...prev[apiId],
          fields: prev[apiId].fields.map(f => 
            f.key === field ? { ...f, value } : f
          )
        }
      }));
    } else {
      setSocialConfigs(prev => ({
        ...prev,
        [apiId]: {
          ...prev[apiId],
          fields: prev[apiId].fields.map(f => 
            f.key === field ? { ...f, value } : f
          )
        }
      }));
    }
  };

  const handleToggleActive = (configType: 'api' | 'social', apiId: string) => {
    if (configType === 'api') {
      setConfigs(prev => ({
        ...prev,
        [apiId]: { ...prev[apiId], isActive: !prev[apiId].isActive }
      }));
    } else {
      setSocialConfigs(prev => ({
        ...prev,
        [apiId]: { ...prev[apiId], isActive: !prev[apiId].isActive }
      }));
    }
  };

  const handleSaveConfig = (configType: 'api' | 'social', apiId: string) => {
    const config = configType === 'api' ? configs[apiId] : socialConfigs[apiId];
    const configData = {
      isActive: config.isActive,
      fields: config.fields.reduce((acc, field) => {
        if ((field as any).value) {
          acc[field.key] = (field as any).value;
        }
        return acc;
      }, {} as Record<string, string>)
    };
    
    saveApiMutation.mutate({ apiId, config: configData });
  };

  const handleTestConnection = (apiId: string) => {
    setTestingApi(apiId);
    setConfigs(prev => ({
      ...prev,
      [apiId]: { ...prev[apiId], status: 'testing' }
    }));
    testApiMutation.mutate(apiId);
  };

  const togglePasswordVisibility = (apiId: string, fieldKey: string) => {
    const key = `${apiId}-${fieldKey}`;
    setShowPasswords(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected':
        return <Badge className="bg-green-500 hover:bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Conectado</Badge>;
      case 'testing':
        return <Badge className="bg-blue-500 hover:bg-blue-600"><RefreshCw className="h-3 w-3 mr-1 animate-spin" />Testando</Badge>;
      case 'error':
        return <Badge className="bg-red-500 hover:bg-red-600"><XCircle className="h-3 w-3 mr-1" />Erro</Badge>;
      default:
        return <Badge variant="outline"><XCircle className="h-3 w-3 mr-1" />Desconectado</Badge>;
    }
  };

  const renderConfigCard = (configType: 'api' | 'social', config: ApiConfig) => (
    <Card key={config.id} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              {config.icon}
            </div>
            <div>
              <CardTitle className="text-lg flex items-center">
                {config.name}
                {config.isActive ? (
                  <Unlock className="h-4 w-4 ml-2 text-green-500" />
                ) : (
                  <Lock className="h-4 w-4 ml-2 text-gray-400" />
                )}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{config.description}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {getStatusBadge(config.status)}
            <Switch
              checked={config.isActive}
              onCheckedChange={() => handleToggleActive(configType, config.id)}
              data-testid={`switch-${config.id}`}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {config.fields.map((field) => (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={`${config.id}-${field.key}`} className="flex items-center">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <div className="relative">
              <Input
                id={`${config.id}-${field.key}`}
                type={field.type === 'password' && !showPasswords[`${config.id}-${field.key}`] ? 'password' : 'text'}
                placeholder={field.placeholder}
                value={(field as any).value || ''}
                onChange={(e) => handleConfigChange(configType, config.id, field.key, e.target.value)}
                className={config.isActive ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800' : ''}
                data-testid={`input-${config.id}-${field.key}`}
              />
              {field.type === 'password' && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => togglePasswordVisibility(config.id, field.key)}
                >
                  {showPasswords[`${config.id}-${field.key}`] ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          </div>
        ))}
        
        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleTestConnection(config.id)}
            disabled={testingApi === config.id || !config.isActive}
            data-testid={`test-${config.id}`}
          >
            {testingApi === config.id ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <TestTube className="h-4 w-4 mr-2" />
            )}
            Testar Conexão
          </Button>
          
          <Button
            onClick={() => handleSaveConfig(configType, config.id)}
            disabled={saveApiMutation.isPending}
            className="bg-gradient-to-r from-primary to-primary/80"
            data-testid={`save-${config.id}`}
          >
            <Save className="h-4 w-4 mr-2" />
            Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );

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
                  <Settings className="h-8 w-8 mr-3 text-primary" />
                  Configurações de APIs
                </h1>
                <p className="text-muted-foreground mt-2">
                  Configure e gerencie todas as integrações externas do sistema
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <Badge variant="outline" className="px-3 py-1">
                  <Shield className="h-4 w-4 mr-2" />
                  Seguro e Criptografado
                </Badge>
                <Button variant="outline" size="sm">
                  <HelpCircle className="h-4 w-4 mr-2" />
                  Documentação
                </Button>
              </div>
            </div>

            {/* Security Notice */}
            <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-800 mb-6">
              <CardContent className="p-4">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-yellow-800 dark:text-yellow-200">Aviso de Segurança</h3>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                      Todas as chaves de API são criptografadas e armazenadas com segurança. 
                      Nunca compartilhe suas credenciais com terceiros.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Configuration Content */}
          <Tabs defaultValue="ai-services" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="ai-services">Serviços de IA</TabsTrigger>
              <TabsTrigger value="social-media">Redes Sociais</TabsTrigger>
            </TabsList>
            
            <TabsContent value="ai-services" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {Object.values(configs).map(config => renderConfigCard('api', config))}
              </div>
            </TabsContent>
            
            <TabsContent value="social-media" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {Object.values(socialConfigs).map(config => renderConfigCard('social', config))}
              </div>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
}