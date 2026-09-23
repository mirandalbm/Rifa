import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { 
  Bot, 
  Mic, 
  Video, 
  Youtube, 
  Newspaper, 
  Mail, 
  MessageSquare,
  AlertTriangle,
  CheckCircle,
  Settings,
  Key,
  Eye,
  EyeOff
} from 'lucide-react';

interface ApiConfig {
  serviceId: string;
  serviceName: string;
  isActive: boolean;
  status: 'active' | 'inactive' | 'error';
  lastTested?: string;
}

interface ServiceCredentials {
  [key: string]: string;
}

const serviceIcons = {
  openai: Bot,
  elevenlabs: Mic,
  heygen: Video,
  youtube: Youtube,
  newsapi: Newspaper,
  sendgrid: Mail,
  slack: MessageSquare,
};

const serviceDescriptions = {
  openai: 'Geração de scripts e conteúdo com IA avançada',
  elevenlabs: 'Síntese de voz e dublagem em múltiplos idiomas',
  heygen: 'Criação de avatares de IA para apresentação',
  youtube: 'Publicação automática em canais do YouTube',
  newsapi: 'Agregação de notícias de múltiplas fontes',
  sendgrid: 'Envio de emails e notificações',
  slack: 'Notificações e integrações com Slack',
};

const requiredFields = {
  openai: ['api_key'],
  elevenlabs: ['api_key'],
  heygen: ['api_key'],
  youtube: ['client_id', 'client_secret'],
  newsapi: ['api_key'],
  sendgrid: ['api_key'],
  slack: ['bot_token', 'channel_id'],
};

export default function Integracoes() {
  const [activeTab, setActiveTab] = useState('openai');
  const [credentials, setCredentials] = useState<Record<string, ServiceCredentials>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  const { data: configs, isLoading } = useQuery<ApiConfig[]>({
    queryKey: ['/api/settings/apis'],
  });

  const { data: apiStatuses } = useQuery<{ serviceName: string; status: string }[]>({
    queryKey: ['/api/dashboard/api-status'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const saveConfigMutation = useMutation({
    mutationFn: async ({ serviceId, credentials, isActive }: { serviceId: string; credentials: ServiceCredentials; isActive: boolean }) => {
      const response = await apiRequest('PUT', `/api/settings/apis/${serviceId}`, {
        fields: credentials,
        isActive
      });
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings/apis'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/api-status'] });
      toast({
        title: 'Configuração salva',
        description: `${serviceDescriptions[variables.serviceId as keyof typeof serviceDescriptions]} configurado com sucesso.`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar a configuração. Tente novamente.',
        variant: 'destructive',
      });
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: async (serviceId: string) => {
      const response = await apiRequest('POST', `/api/settings/apis/${serviceId}/test`);
      return response.json();
    },
    onSuccess: (data, serviceId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/api-status'] });
      toast({
        title: 'Conexão testada',
        description: `Integração com ${serviceDescriptions[serviceId as keyof typeof serviceDescriptions]} está funcionando.`,
      });
    },
    onError: (error, serviceId) => {
      toast({
        title: 'Erro na conexão',
        description: `Falha ao conectar com ${serviceDescriptions[serviceId as keyof typeof serviceDescriptions]}.`,
        variant: 'destructive',
      });
    },
  });

  const handleCredentialChange = (serviceId: string, field: string, value: string) => {
    setCredentials(prev => ({
      ...prev,
      [serviceId]: {
        ...prev[serviceId],
        [field]: value
      }
    }));
  };

  const handleToggleActive = (serviceId: string, isActive: boolean) => {
    const serviceCredentials = credentials[serviceId] || {};
    saveConfigMutation.mutate({
      serviceId,
      credentials: serviceCredentials,
      isActive
    });
  };

  const handleSaveCredentials = (serviceId: string) => {
    const serviceCredentials = credentials[serviceId] || {};
    const currentConfig = configs?.find((c: ApiConfig) => c.serviceId === serviceId);
    
    saveConfigMutation.mutate({
      serviceId,
      credentials: serviceCredentials,
      isActive: currentConfig?.isActive || false
    });
  };

  const togglePasswordVisibility = (serviceId: string, field: string) => {
    const key = `${serviceId}_${field}`;
    setShowPasswords(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const getServiceStatus = (serviceId: string) => {
    const status = apiStatuses?.find((s: any) => s.serviceName.toLowerCase() === serviceId);
    return status?.status || 'unknown';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'operational':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
      case 'down':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default:
        return <Settings className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'operational':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'error':
      case 'down':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Integrações
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Configure as integrações com serviços externos para automação completa
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar com lista de serviços */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Serviços</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="space-y-1">
                {Object.entries(serviceDescriptions).map(([serviceId, description]) => {
                  const Icon = serviceIcons[serviceId as keyof typeof serviceIcons];
                  const config = configs?.find((c: ApiConfig) => c.serviceId === serviceId);
                  const status = getServiceStatus(serviceId);
                  
                  return (
                    <button
                      key={serviceId}
                      onClick={() => setActiveTab(serviceId)}
                      className={`w-full flex items-center justify-between p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                        activeTab === serviceId ? 'bg-primary/5 border-r-2 border-primary' : ''
                      }`}
                      data-testid={`service-tab-${serviceId}`}
                    >
                      <div className="flex items-center space-x-3">
                        <Icon className="h-5 w-5 text-primary" />
                        <div>
                          <div className="font-medium capitalize">{serviceId}</div>
                          <div className="flex items-center space-x-2 mt-1">
                            {getStatusIcon(status)}
                            <Switch
                              checked={config?.isActive || false}
                              onCheckedChange={(checked) => handleToggleActive(serviceId, checked)}
                              disabled={saveConfigMutation.isPending}
                              className="scale-75"
                            />
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Configuração do serviço ativo */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {(() => {
                    const Icon = serviceIcons[activeTab as keyof typeof serviceIcons];
                    return <Icon className="h-6 w-6 text-primary" />;
                  })()}
                  <div>
                    <CardTitle className="capitalize">{activeTab}</CardTitle>
                    <CardDescription>
                      {serviceDescriptions[activeTab as keyof typeof serviceDescriptions]}
                    </CardDescription>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Badge className={getStatusColor(getServiceStatus(activeTab))}>
                    {getServiceStatus(activeTab) === 'operational' ? 'Conectado' : 
                     getServiceStatus(activeTab) === 'error' ? 'Erro' : 'Desconectado'}
                  </Badge>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testConnectionMutation.mutate(activeTab)}
                    disabled={testConnectionMutation.isPending}
                    data-testid={`test-connection-${activeTab}`}
                  >
                    {testConnectionMutation.isPending ? 'Testando...' : 'Testar Conexão'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-6">
              {/* Campos de credenciais */}
              <div className="space-y-4">
                {requiredFields[activeTab as keyof typeof requiredFields]?.map((field) => {
                  const isPassword = field.includes('key') || field.includes('secret') || field.includes('token');
                  const showPassword = showPasswords[`${activeTab}_${field}`];
                  
                  return (
                    <div key={field} className="space-y-2">
                      <Label htmlFor={field} className="capitalize">
                        {field.replace(/_/g, ' ')}
                      </Label>
                      <div className="relative">
                        <Input
                          id={field}
                          type={isPassword && !showPassword ? 'password' : 'text'}
                          placeholder={`Digite sua ${field.replace(/_/g, ' ')}`}
                          value={credentials[activeTab]?.[field] || ''}
                          onChange={(e) => handleCredentialChange(activeTab, field, e.target.value)}
                          className="pr-10"
                          data-testid={`input-${activeTab}-${field}`}
                        />
                        {isPassword && (
                          <button
                            type="button"
                            onClick={() => togglePasswordVisibility(activeTab, field)}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <Separator />

              {/* Instruções específicas do serviço */}
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <h4 className="font-medium text-blue-900 dark:text-blue-200 mb-2">
                  Como obter as credenciais:
                </h4>
                <div className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
                  {activeTab === 'openai' && (
                    <div>
                      <p>1. Acesse <a href="https://platform.openai.com/api-keys" className="underline" target="_blank">platform.openai.com/api-keys</a></p>
                      <p>2. Clique em "Create new secret key"</p>
                      <p>3. Copie a chave gerada</p>
                    </div>
                  )}
                  {activeTab === 'elevenlabs' && (
                    <div>
                      <p>1. Acesse <a href="https://elevenlabs.io/app/settings/api-keys" className="underline" target="_blank">elevenlabs.io/app/settings/api-keys</a></p>
                      <p>2. Copie sua API key</p>
                    </div>
                  )}
                  {activeTab === 'heygen' && (
                    <div>
                      <p>1. Acesse <a href="https://app.heygen.com/settings/api" className="underline" target="_blank">app.heygen.com/settings/api</a></p>
                      <p>2. Gere uma nova API key</p>
                    </div>
                  )}
                  {activeTab === 'youtube' && (
                    <div>
                      <p>1. Acesse <a href="https://console.developers.google.com" className="underline" target="_blank">Google Cloud Console</a></p>
                      <p>2. Crie um projeto e ative a YouTube Data API v3</p>
                      <p>3. Configure OAuth 2.0 e copie client ID e client secret</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Botões de ação */}
              <div className="flex justify-end space-x-3">
                <Button
                  variant="outline"
                  onClick={() => setCredentials(prev => ({ ...prev, [activeTab]: {} }))}
                  data-testid={`clear-credentials-${activeTab}`}
                >
                  Limpar
                </Button>
                <Button
                  onClick={() => handleSaveCredentials(activeTab)}
                  disabled={saveConfigMutation.isPending}
                  data-testid={`save-credentials-${activeTab}`}
                >
                  {saveConfigMutation.isPending ? 'Salvando...' : 'Salvar Configuração'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}