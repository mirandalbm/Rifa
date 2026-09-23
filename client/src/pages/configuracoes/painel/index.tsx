import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { 
  Monitor, 
  Palette, 
  Globe, 
  Bell, 
  Shield, 
  Layout,
  Settings,
  User,
  Clock,
  Eye
} from 'lucide-react';

interface PanelSettings {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  timezone: string;
  notifications: {
    email: boolean;
    push: boolean;
    slack: boolean;
  };
  dashboard: {
    refreshInterval: number;
    defaultView: string;
    showMetrics: boolean;
    compactMode: boolean;
  };
  security: {
    sessionTimeout: number;
    requireTwoFactor: boolean;
    logApiCalls: boolean;
  };
}

const languages = [
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'en-US', label: 'English (United States)' },
  { value: 'es-ES', label: 'Español (España)' },
  { value: 'fr-FR', label: 'Français (France)' },
  { value: 'de-DE', label: 'Deutsch (Deutschland)' },
];

const timezones = [
  { value: 'America/Sao_Paulo', label: 'São Paulo (UTC-3)' },
  { value: 'America/New_York', label: 'New York (UTC-5)' },
  { value: 'Europe/London', label: 'London (UTC+0)' },
  { value: 'Europe/Paris', label: 'Paris (UTC+1)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (UTC+9)' },
  { value: 'UTC', label: 'UTC (Universal)' },
];

const refreshIntervals = [
  { value: 30, label: '30 segundos' },
  { value: 60, label: '1 minuto' },
  { value: 300, label: '5 minutos' },
  { value: 600, label: '10 minutos' },
  { value: 1800, label: '30 minutos' },
];

const sessionTimeouts = [
  { value: 30, label: '30 minutos' },
  { value: 60, label: '1 hora' },
  { value: 240, label: '4 horas' },
  { value: 480, label: '8 horas' },
  { value: 1440, label: '24 horas' },
];

const defaultViews = [
  { value: 'dashboard', label: 'Dashboard Principal' },
  { value: 'production', label: 'Produção de Vídeos' },
  { value: 'analytics', label: 'Analytics' },
  { value: 'news', label: 'Gerenciamento de Notícias' },
];

export default function Painel() {
  const [settings, setSettings] = useState<PanelSettings>({
    theme: 'dark',
    language: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    notifications: {
      email: true,
      push: true,
      slack: false,
    },
    dashboard: {
      refreshInterval: 60,
      defaultView: 'dashboard',
      showMetrics: true,
      compactMode: false,
    },
    security: {
      sessionTimeout: 240,
      requireTwoFactor: false,
      logApiCalls: true,
    },
  });

  const { toast } = useToast();

  const { data: currentSettings, isLoading } = useQuery<PanelSettings>({
    queryKey: ['/api/settings/panel'],
  });

  // React Query v5 removed `onSuccess` from useQuery; sync loaded settings into the form here
  useEffect(() => {
    if (currentSettings) {
      setSettings(currentSettings);
    }
  }, [currentSettings]);

  const saveSettingsMutation = useMutation({
    mutationFn: async (newSettings: PanelSettings) => {
      const response = await apiRequest('POST', '/api/settings/panel', newSettings);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings/panel'] });
      toast({
        title: 'Configurações salvas',
        description: 'As configurações do painel foram atualizadas com sucesso.',
      });
    },
    onError: () => {
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar as configurações. Tente novamente.',
        variant: 'destructive',
      });
    },
  });

  const resetSettingsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/settings/panel/reset');
      return response.json();
    },
    onSuccess: (data) => {
      setSettings(data);
      queryClient.invalidateQueries({ queryKey: ['/api/settings/panel'] });
      toast({
        title: 'Configurações restauradas',
        description: 'As configurações foram restauradas para os valores padrão.',
      });
    },
  });

  const handleSave = () => {
    saveSettingsMutation.mutate(settings);
  };

  const handleReset = () => {
    resetSettingsMutation.mutate();
  };

  const updateSetting = (path: string, value: any) => {
    setSettings(prev => {
      const newSettings = { ...prev };
      const keys = path.split('.');
      let current = newSettings as any;
      
      for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]];
      }
      
      current[keys[keys.length - 1]] = value;
      return newSettings;
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Configurações do Painel
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Personalize a experiência do seu painel de controle
        </p>
      </div>

      <Tabs defaultValue="aparencia" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 gap-1 h-auto p-1">
          <TabsTrigger 
            value="aparencia" 
            className="flex items-center space-x-2 !text-sm !sm:text-sm !px-2 !py-2.5 h-auto min-h-[44px] whitespace-nowrap data-[state=active]:!text-sm"
          >
            <Palette className="h-4 w-4" />
            <span>Aparência</span>
          </TabsTrigger>
          <TabsTrigger 
            value="dashboard" 
            className="flex items-center space-x-2 !text-sm !sm:text-sm !px-2 !py-2.5 h-auto min-h-[44px] whitespace-nowrap data-[state=active]:!text-sm"
          >
            <Layout className="h-4 w-4" />
            <span>Dashboard</span>
          </TabsTrigger>
          <TabsTrigger 
            value="notificacoes" 
            className="flex items-center space-x-2 !text-sm !sm:text-sm !px-2 !py-2.5 h-auto min-h-[44px] whitespace-nowrap data-[state=active]:!text-sm"
          >
            <Bell className="h-4 w-4" />
            <span>Notificações</span>
          </TabsTrigger>
          <TabsTrigger 
            value="seguranca" 
            className="flex items-center space-x-2 !text-sm !sm:text-sm !px-2 !py-2.5 h-auto min-h-[44px] whitespace-nowrap data-[state=active]:!text-sm"
          >
            <Shield className="h-4 w-4" />
            <span>Segurança</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="aparencia" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Monitor className="h-5 w-5" />
                <span>Tema e Localização</span>
              </CardTitle>
              <CardDescription>
                Configure a aparência e o idioma do painel
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="theme">Tema</Label>
                  <Select 
                    value={settings.theme} 
                    onValueChange={(value) => updateSetting('theme', value)}
                  >
                    <SelectTrigger data-testid="theme-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Claro</SelectItem>
                      <SelectItem value="dark">Escuro</SelectItem>
                      <SelectItem value="auto">Automático</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="language">Idioma</Label>
                  <Select 
                    value={settings.language} 
                    onValueChange={(value) => updateSetting('language', value)}
                  >
                    <SelectTrigger data-testid="language-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {languages.map((lang) => (
                        <SelectItem key={lang.value} value={lang.value}>
                          {lang.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="timezone">Fuso Horário</Label>
                  <Select 
                    value={settings.timezone} 
                    onValueChange={(value) => updateSetting('timezone', value)}
                  >
                    <SelectTrigger data-testid="timezone-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {timezones.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dashboard" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Layout className="h-5 w-5" />
                <span>Configurações do Dashboard</span>
              </CardTitle>
              <CardDescription>
                Personalize a exibição e comportamento do dashboard
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="refreshInterval">Intervalo de Atualização</Label>
                  <Select 
                    value={settings.dashboard.refreshInterval.toString()} 
                    onValueChange={(value) => updateSetting('dashboard.refreshInterval', parseInt(value))}
                  >
                    <SelectTrigger data-testid="refresh-interval-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {refreshIntervals.map((interval) => (
                        <SelectItem key={interval.value} value={interval.value.toString()}>
                          {interval.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="defaultView">Visualização Padrão</Label>
                  <Select 
                    value={settings.dashboard.defaultView} 
                    onValueChange={(value) => updateSetting('dashboard.defaultView', value)}
                  >
                    <SelectTrigger data-testid="default-view-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {defaultViews.map((view) => (
                        <SelectItem key={view.value} value={view.value}>
                          {view.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Exibir Métricas em Tempo Real</Label>
                    <p className="text-sm text-gray-500">
                      Mostra estatísticas atualizadas no dashboard principal
                    </p>
                  </div>
                  <Switch
                    checked={settings.dashboard.showMetrics}
                    onCheckedChange={(checked) => updateSetting('dashboard.showMetrics', checked)}
                    data-testid="show-metrics-switch"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Modo Compacto</Label>
                    <p className="text-sm text-gray-500">
                      Reduz o espaçamento entre elementos para economizar espaço
                    </p>
                  </div>
                  <Switch
                    checked={settings.dashboard.compactMode}
                    onCheckedChange={(checked) => updateSetting('dashboard.compactMode', checked)}
                    data-testid="compact-mode-switch"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notificacoes" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Bell className="h-5 w-5" />
                <span>Preferências de Notificação</span>
              </CardTitle>
              <CardDescription>
                Configure como e quando receber notificações
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Notificações por Email</Label>
                    <p className="text-sm text-gray-500">
                      Receba atualizações sobre vídeos, erros e relatórios por email
                    </p>
                  </div>
                  <Switch
                    checked={settings.notifications.email}
                    onCheckedChange={(checked) => updateSetting('notifications.email', checked)}
                    data-testid="email-notifications-switch"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Notificações Push</Label>
                    <p className="text-sm text-gray-500">
                      Receba notificações instantâneas no navegador
                    </p>
                  </div>
                  <Switch
                    checked={settings.notifications.push}
                    onCheckedChange={(checked) => updateSetting('notifications.push', checked)}
                    data-testid="push-notifications-switch"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Integração com Slack</Label>
                    <p className="text-sm text-gray-500">
                      Envie notificações para canais do Slack configurados
                    </p>
                  </div>
                  <Switch
                    checked={settings.notifications.slack}
                    onCheckedChange={(checked) => updateSetting('notifications.slack', checked)}
                    data-testid="slack-notifications-switch"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seguranca" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Shield className="h-5 w-5" />
                <span>Configurações de Segurança</span>
              </CardTitle>
              <CardDescription>
                Configure opções de segurança e privacidade
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="sessionTimeout">Timeout da Sessão</Label>
                <Select 
                  value={settings.security.sessionTimeout.toString()} 
                  onValueChange={(value) => updateSetting('security.sessionTimeout', parseInt(value))}
                >
                  <SelectTrigger data-testid="session-timeout-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sessionTimeouts.map((timeout) => (
                      <SelectItem key={timeout.value} value={timeout.value.toString()}>
                        {timeout.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Autenticação de Dois Fatores</Label>
                    <p className="text-sm text-gray-500">
                      Adiciona uma camada extra de segurança ao login
                    </p>
                  </div>
                  <Switch
                    checked={settings.security.requireTwoFactor}
                    onCheckedChange={(checked) => updateSetting('security.requireTwoFactor', checked)}
                    data-testid="two-factor-switch"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Log de Chamadas da API</Label>
                    <p className="text-sm text-gray-500">
                      Registra todas as chamadas feitas para APIs externas
                    </p>
                  </div>
                  <Switch
                    checked={settings.security.logApiCalls}
                    onCheckedChange={(checked) => updateSetting('security.logApiCalls', checked)}
                    data-testid="log-api-calls-switch"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Botões de ação */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={handleReset}
          disabled={resetSettingsMutation.isPending}
          data-testid="reset-settings-button"
        >
          {resetSettingsMutation.isPending ? 'Restaurando...' : 'Restaurar Padrões'}
        </Button>
        
        <Button
          onClick={handleSave}
          disabled={saveSettingsMutation.isPending}
          data-testid="save-settings-button"
        >
          {saveSettingsMutation.isPending ? 'Salvando...' : 'Salvar Configurações'}
        </Button>
      </div>
    </div>
  );
}