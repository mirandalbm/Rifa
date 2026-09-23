import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { 
  Crown, 
  Package, 
  Calendar, 
  CreditCard,
  CheckCircle,
  X,
  ArrowRight,
  Zap,
  Star,
  Shield,
  Users,
  BarChart3,
  Clock,
  Infinity
} from 'lucide-react';

interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  billing: 'monthly' | 'yearly';
  features: string[];
  limits: {
    videosPerMonth: number;
    apiCallsPerMonth: number;
    storageGB: number;
    channels: number;
    languages: number;
  };
  popular?: boolean;
  current?: boolean;
}

interface Subscription {
  id: string;
  planId: string;
  planName: string;
  status: 'active' | 'canceled' | 'past_due' | 'trialing';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  trialEnd?: string;
  usage: {
    videosGenerated: number;
    apiCallsUsed: number;
    storageUsed: number;
  };
}

const plans: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Perfeito para começar com automação de vídeos',
    price: 29,
    billing: 'monthly',
    features: [
      'Até 50 vídeos por mês',
      '10.000 chamadas de API',
      '5GB de armazenamento',
      '2 canais do YouTube',
      '3 idiomas disponíveis',
      'Suporte por email'
    ],
    limits: {
      videosPerMonth: 50,
      apiCallsPerMonth: 10000,
      storageGB: 5,
      channels: 2,
      languages: 3
    }
  },
  {
    id: 'professional',
    name: 'Professional',
    description: 'Para criadores de conteúdo sérios',
    price: 79,
    billing: 'monthly',
    features: [
      'Até 200 vídeos por mês',
      '50.000 chamadas de API',
      '25GB de armazenamento',
      '10 canais do YouTube',
      '8 idiomas disponíveis',
      'Automação avançada',
      'Analytics detalhado',
      'Suporte prioritário'
    ],
    limits: {
      videosPerMonth: 200,
      apiCallsPerMonth: 50000,
      storageGB: 25,
      channels: 10,
      languages: 8
    },
    popular: true
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Para empresas e agências',
    price: 199,
    billing: 'monthly',
    features: [
      'Vídeos ilimitados',
      'Chamadas de API ilimitadas',
      '100GB de armazenamento',
      'Canais ilimitados',
      'Todos os idiomas',
      'White-label',
      'API personalizada',
      'Suporte 24/7',
      'Treinamento dedicado'
    ],
    limits: {
      videosPerMonth: -1, // unlimited
      apiCallsPerMonth: -1,
      storageGB: 100,
      channels: -1,
      languages: -1
    }
  }
];

const mockSubscription: Subscription = {
  id: 'sub_123',
  planId: 'professional',
  planName: 'Professional',
  status: 'active',
  currentPeriodStart: new Date().toISOString(),
  currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  cancelAtPeriodEnd: false,
  usage: {
    videosGenerated: 87,
    apiCallsUsed: 23450,
    storageUsed: 12.5
  }
};

export default function Assinaturas() {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: subscription = mockSubscription, isLoading } = useQuery<Subscription>({
    queryKey: ['/api/subscription'],
  });

  const { data: billingHistory = [] } = useQuery({
    queryKey: ['/api/subscription/history'],
  });

  const changePlanMutation = useMutation({
    mutationFn: async (planId: string) => {
      const response = await apiRequest('POST', '/api/subscription/change-plan', {
        planId
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/subscription'] });
      toast({
        title: 'Plano alterado',
        description: 'Seu plano foi alterado com sucesso.',
      });
    },
    onError: () => {
      toast({
        title: 'Erro ao alterar plano',
        description: 'Não foi possível alterar o plano. Tente novamente.',
        variant: 'destructive',
      });
    },
  });

  const cancelSubscriptionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/subscription/cancel');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/subscription'] });
      toast({
        title: 'Assinatura cancelada',
        description: 'Sua assinatura foi cancelada e permanecerá ativa até o final do período atual.',
      });
    },
    onError: () => {
      toast({
        title: 'Erro ao cancelar',
        description: 'Não foi possível cancelar a assinatura. Tente novamente.',
        variant: 'destructive',
      });
    },
  });

  const reactivateSubscriptionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/subscription/reactivate');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/subscription'] });
      toast({
        title: 'Assinatura reativada',
        description: 'Sua assinatura foi reativada com sucesso.',
      });
    },
  });

  const formatDate = (date: string) => {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(new Date(date));
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'trialing':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'past_due':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'canceled':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active':
        return 'Ativo';
      case 'trialing':
        return 'Período de teste';
      case 'past_due':
        return 'Vencido';
      case 'canceled':
        return 'Cancelado';
      default:
        return status;
    }
  };

  const getCurrentPlan = () => {
    return plans.find(plan => plan.id === subscription?.planId);
  };

  const getUsagePercentage = (used: number, limit: number) => {
    if (limit === -1) return 0; // unlimited
    return Math.min(Math.round((used / limit) * 100), 100);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const currentPlan = getCurrentPlan();

  return (
    <div className="container mx-auto px-6 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Assinaturas e Planos
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Gerencie sua assinatura e acompanhe o uso dos recursos
        </p>
      </div>

      <Tabs defaultValue="current" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 gap-1 h-auto p-1">
          <TabsTrigger 
            value="current" 
            className="!text-sm !sm:text-sm !px-2 !py-2.5 h-auto min-h-[44px] whitespace-nowrap data-[state=active]:!text-sm"
          >
            Plano Atual
          </TabsTrigger>
          <TabsTrigger 
            value="plans" 
            className="!text-sm !sm:text-sm !px-2 !py-2.5 h-auto min-h-[44px] whitespace-nowrap data-[state=active]:!text-sm"
          >
            Planos Disponíveis
          </TabsTrigger>
          <TabsTrigger 
            value="history" 
            className="!text-sm !sm:text-sm !px-2 !py-2.5 h-auto min-h-[44px] whitespace-nowrap data-[state=active]:!text-sm"
          >
            Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="current" className="space-y-6">
          {/* Status da assinatura */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center space-x-2">
                    <Crown className="h-5 w-5 text-primary" />
                    <span>Plano {currentPlan?.name}</span>
                  </CardTitle>
                  <CardDescription>
                    Assinatura ativa desde {formatDate(subscription.currentPeriodStart)}
                  </CardDescription>
                </div>
                <Badge className={getStatusColor(subscription.status)}>
                  {getStatusText(subscription.status)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary">
                    {formatCurrency(currentPlan?.price || 0)}
                  </p>
                  <p className="text-sm text-gray-500">por mês</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {formatDate(subscription.currentPeriodEnd)}
                  </p>
                  <p className="text-sm text-gray-500">próxima cobrança</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {subscription.cancelAtPeriodEnd ? 'Cancelando' : 'Renovação automática'}
                  </p>
                  <p className="text-sm text-gray-500">status</p>
                </div>
              </div>

              <div className="flex justify-center space-x-3">
                {subscription.cancelAtPeriodEnd ? (
                  <Button
                    onClick={() => reactivateSubscriptionMutation.mutate()}
                    disabled={reactivateSubscriptionMutation.isPending}
                    data-testid="reactivate-subscription-button"
                  >
                    {reactivateSubscriptionMutation.isPending ? 'Reativando...' : 'Reativar Assinatura'}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => cancelSubscriptionMutation.mutate()}
                    disabled={cancelSubscriptionMutation.isPending}
                    data-testid="cancel-subscription-button"
                  >
                    {cancelSubscriptionMutation.isPending ? 'Cancelando...' : 'Cancelar Assinatura'}
                  </Button>
                )}
                <Button variant="default" data-testid="update-payment-button">
                  Atualizar Pagamento
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Uso atual */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <BarChart3 className="h-5 w-5" />
                <span>Uso dos Recursos</span>
              </CardTitle>
              <CardDescription>
                Acompanhe seu consumo mensal
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Vídeos Gerados</span>
                    <span className="text-sm text-gray-500">
                      {subscription.usage.videosGenerated} / {currentPlan?.limits.videosPerMonth === -1 ? '∞' : currentPlan?.limits.videosPerMonth}
                    </span>
                  </div>
                  <Progress 
                    value={getUsagePercentage(subscription.usage.videosGenerated, currentPlan?.limits.videosPerMonth || 0)} 
                    className="h-2"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Chamadas de API</span>
                    <span className="text-sm text-gray-500">
                      {subscription.usage.apiCallsUsed.toLocaleString()} / {currentPlan?.limits.apiCallsPerMonth === -1 ? '∞' : currentPlan?.limits.apiCallsPerMonth?.toLocaleString()}
                    </span>
                  </div>
                  <Progress 
                    value={getUsagePercentage(subscription.usage.apiCallsUsed, currentPlan?.limits.apiCallsPerMonth || 0)} 
                    className="h-2"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Armazenamento</span>
                    <span className="text-sm text-gray-500">
                      {subscription.usage.storageUsed.toFixed(1)}GB / {currentPlan?.limits.storageGB}GB
                    </span>
                  </div>
                  <Progress 
                    value={getUsagePercentage(subscription.usage.storageUsed, currentPlan?.limits.storageGB || 0)} 
                    className="h-2"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plans" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <Card 
                key={plan.id} 
                className={`relative ${plan.popular ? 'border-primary shadow-lg' : ''} ${
                  plan.id === subscription?.planId ? 'ring-2 ring-primary' : ''
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground">
                      <Star className="h-3 w-3 mr-1" />
                      Mais Popular
                    </Badge>
                  </div>
                )}
                
                {plan.id === subscription?.planId && (
                  <div className="absolute -top-3 right-4">
                    <Badge className="bg-green-500 text-white">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Atual
                    </Badge>
                  </div>
                )}

                <CardHeader className="text-center">
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="py-4">
                    <span className="text-4xl font-bold text-primary">
                      {formatCurrency(plan.price)}
                    </span>
                    <span className="text-gray-500">/mês</span>
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  <ul className="space-y-2">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-center space-x-2">
                        <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="pt-4">
                    {plan.id === subscription?.planId ? (
                      <Button variant="outline" disabled className="w-full">
                        Plano Atual
                      </Button>
                    ) : (
                      <Button
                        onClick={() => changePlanMutation.mutate(plan.id)}
                        disabled={changePlanMutation.isPending}
                        className="w-full"
                        variant={plan.popular ? "default" : "outline"}
                        data-testid={`change-plan-${plan.id}`}
                      >
                        {changePlanMutation.isPending ? 'Alterando...' : 'Alterar Plano'}
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Comparação de features */}
          <Card>
            <CardHeader>
              <CardTitle>Comparação Detalhada</CardTitle>
              <CardDescription>
                Compare todos os recursos disponíveis
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Recurso</th>
                      {plans.map((plan) => (
                        <th key={plan.id} className="text-center py-2 px-4">
                          {plan.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="py-2 font-medium">Vídeos por mês</td>
                      {plans.map((plan) => (
                        <td key={plan.id} className="text-center py-2">
                          {plan.limits.videosPerMonth === -1 ? (
                            <Infinity className="h-4 w-4 mx-auto" />
                          ) : (
                            plan.limits.videosPerMonth
                          )}
                        </td>
                      ))}
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 font-medium">Chamadas de API</td>
                      {plans.map((plan) => (
                        <td key={plan.id} className="text-center py-2">
                          {plan.limits.apiCallsPerMonth === -1 ? (
                            <Infinity className="h-4 w-4 mx-auto" />
                          ) : (
                            plan.limits.apiCallsPerMonth?.toLocaleString()
                          )}
                        </td>
                      ))}
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 font-medium">Canais do YouTube</td>
                      {plans.map((plan) => (
                        <td key={plan.id} className="text-center py-2">
                          {plan.limits.channels === -1 ? (
                            <Infinity className="h-4 w-4 mx-auto" />
                          ) : (
                            plan.limits.channels
                          )}
                        </td>
                      ))}
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 font-medium">Idiomas</td>
                      {plans.map((plan) => (
                        <td key={plan.id} className="text-center py-2">
                          {plan.limits.languages === -1 ? (
                            <Infinity className="h-4 w-4 mx-auto" />
                          ) : (
                            plan.limits.languages
                          )}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Calendar className="h-5 w-5" />
                <span>Histórico de Cobrança</span>
              </CardTitle>
              <CardDescription>
                Histórico de pagamentos e faturas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-gray-500">
                <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum histórico de cobrança disponível ainda.</p>
                <p className="text-sm mt-1">
                  Suas faturas aparecerão aqui após o primeiro pagamento.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}