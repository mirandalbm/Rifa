import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { 
  CreditCard, 
  DollarSign, 
  TrendingUp, 
  TrendingDown,
  AlertTriangle,
  Plus,
  Wallet,
  BarChart3,
  History,
  Target,
  Zap
} from 'lucide-react';

interface ApiBalance {
  service: string;
  serviceName: string;
  currentBalance: number;
  monthlyUsed: number;
  monthlyLimit: number;
  costPerUnit: number;
  lastUpdated: string;
  status: 'healthy' | 'warning' | 'critical';
}

interface Transaction {
  id: string;
  service: string;
  amount: number;
  type: 'usage' | 'credit' | 'debit';
  description: string;
  timestamp: string;
}

interface CostSummary {
  currentMonth: number;
  lastMonth: number;
  projection: number;
  totalCredits: number;
  breakdown: {
    service: string;
    amount: number;
    percentage: number;
  }[];
}

const mockBalances: ApiBalance[] = [
  {
    service: 'openai',
    serviceName: 'OpenAI GPT',
    currentBalance: 45.32,
    monthlyUsed: 54.68,
    monthlyLimit: 100,
    costPerUnit: 0.02,
    lastUpdated: new Date().toISOString(),
    status: 'healthy'
  },
  {
    service: 'elevenlabs',
    serviceName: 'ElevenLabs Voice',
    currentBalance: 12.50,
    monthlyUsed: 87.50,
    monthlyLimit: 100,
    costPerUnit: 0.30,
    lastUpdated: new Date().toISOString(),
    status: 'warning'
  },
  {
    service: 'heygen',
    serviceName: 'HeyGen Avatar',
    currentBalance: 245.00,
    monthlyUsed: 155.00,
    monthlyLimit: 400,
    costPerUnit: 5.00,
    lastUpdated: new Date().toISOString(),
    status: 'healthy'
  },
  {
    service: 'youtube',
    serviceName: 'YouTube API',
    currentBalance: 98.75,
    monthlyUsed: 1.25,
    monthlyLimit: 100,
    costPerUnit: 0.01,
    lastUpdated: new Date().toISOString(),
    status: 'healthy'
  }
];

const mockTransactions: Transaction[] = [
  {
    id: '1',
    service: 'openai',
    amount: -12.50,
    type: 'usage',
    description: 'Geração de 25 scripts de vídeo',
    timestamp: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: '2',
    service: 'heygen',
    amount: -25.00,
    type: 'usage',
    description: 'Renderização de 5 vídeos com avatar',
    timestamp: new Date(Date.now() - 7200000).toISOString()
  },
  {
    id: '3',
    service: 'elevenlabs',
    amount: -8.40,
    type: 'usage',
    description: 'Síntese de voz para 14 vídeos',
    timestamp: new Date(Date.now() - 10800000).toISOString()
  }
];

const mockCostSummary: CostSummary = {
  currentMonth: 298.43,
  lastMonth: 234.67,
  projection: 387.50,
  totalCredits: 500.00,
  breakdown: [
    { service: 'HeyGen Avatar', amount: 155.00, percentage: 52 },
    { service: 'OpenAI GPT', amount: 54.68, percentage: 18 },
    { service: 'ElevenLabs Voice', amount: 87.50, percentage: 29 },
    { service: 'YouTube API', amount: 1.25, percentage: 1 }
  ]
};

export default function Saldos() {
  const [newCreditAmount, setNewCreditAmount] = useState('');
  const { toast } = useToast();

  const { data: balances = mockBalances, isLoading: balancesLoading } = useQuery<ApiBalance[]>({
    queryKey: ['/api/billing/balances'],
    refetchInterval: 300000, // Refresh every 5 minutes
  });

  const { data: transactions = mockTransactions } = useQuery<Transaction[]>({
    queryKey: ['/api/billing/transactions'],
  });

  const { data: costSummary = mockCostSummary } = useQuery<CostSummary>({
    queryKey: ['/api/billing/summary'],
  });

  const addCreditsMutation = useMutation({
    mutationFn: async ({ service, amount }: { service: string; amount: number }) => {
      const response = await apiRequest('POST', '/api/billing/add-credits', {
        service,
        amount
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/billing/balances'] });
      setNewCreditAmount('');
      toast({
        title: 'Créditos adicionados',
        description: 'Os créditos foram adicionados com sucesso ao serviço.',
      });
    },
    onError: () => {
      toast({
        title: 'Erro ao adicionar créditos',
        description: 'Não foi possível adicionar os créditos. Tente novamente.',
        variant: 'destructive',
      });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'critical':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    }
  };

  const getUsagePercentage = (used: number, limit: number) => {
    return Math.round((used / limit) * 100);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(date));
  };

  if (balancesLoading) {
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
          Saldos e Custos
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Monitore seus gastos com APIs e gerencie créditos dos serviços
        </p>
      </div>

      {/* Resumo dos custos */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Gasto Atual
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatCurrency(costSummary.currentMonth)}
                </p>
              </div>
              <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-full">
                <DollarSign className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <div className="flex items-center mt-2">
              <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
              <span className="text-sm text-green-600">
                +{Math.round(((costSummary.currentMonth - costSummary.lastMonth) / costSummary.lastMonth) * 100)}% vs mês anterior
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Projeção Mensal
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatCurrency(costSummary.projection)}
                </p>
              </div>
              <div className="p-3 bg-orange-100 dark:bg-orange-900 rounded-full">
                <Target className="h-6 w-6 text-orange-600 dark:text-orange-400" />
              </div>
            </div>
            <div className="flex items-center mt-2">
              <BarChart3 className="h-4 w-4 text-blue-500 mr-1" />
              <span className="text-sm text-blue-600">
                Baseado no uso atual
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Créditos Totais
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatCurrency(costSummary.totalCredits)}
                </p>
              </div>
              <div className="p-3 bg-green-100 dark:bg-green-900 rounded-full">
                <Wallet className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <div className="flex items-center mt-2">
              <Zap className="h-4 w-4 text-green-500 mr-1" />
              <span className="text-sm text-green-600">
                Disponível para uso
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Economia
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatCurrency(costSummary.totalCredits - costSummary.currentMonth)}
                </p>
              </div>
              <div className="p-3 bg-purple-100 dark:bg-purple-900 rounded-full">
                <TrendingDown className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
            <div className="flex items-center mt-2">
              <AlertTriangle className="h-4 w-4 text-purple-500 mr-1" />
              <span className="text-sm text-purple-600">
                Saldo restante
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="balances" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="balances">Saldos por Serviço</TabsTrigger>
          <TabsTrigger value="transactions">Histórico</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="balances" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {balances.map((balance) => {
              const usagePercentage = getUsagePercentage(balance.monthlyUsed, balance.monthlyLimit);
              
              return (
                <Card key={balance.service}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{balance.serviceName}</CardTitle>
                      <Badge className={getStatusColor(balance.status)}>
                        {balance.status === 'healthy' ? 'Saudável' : 
                         balance.status === 'warning' ? 'Atenção' : 'Crítico'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        Saldo Atual
                      </span>
                      <span className="text-lg font-semibold">
                        {formatCurrency(balance.currentBalance)}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Uso Mensal</span>
                        <span>{formatCurrency(balance.monthlyUsed)} / {formatCurrency(balance.monthlyLimit)}</span>
                      </div>
                      <Progress 
                        value={usagePercentage} 
                        className="h-2"
                        data-testid={`usage-progress-${balance.service}`}
                      />
                      <div className="text-xs text-gray-500 text-right">
                        {usagePercentage}% usado
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600 dark:text-gray-400">
                        Custo por unidade
                      </span>
                      <span className="font-medium">
                        {formatCurrency(balance.costPerUnit)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-xs text-gray-500">
                      <span>Última atualização</span>
                      <span>{formatDate(balance.lastUpdated)}</span>
                    </div>

                    <div className="pt-3 border-t">
                      <div className="flex items-center space-x-2">
                        <Input
                          placeholder="Valor em USD"
                          value={newCreditAmount}
                          onChange={(e) => setNewCreditAmount(e.target.value)}
                          className="flex-1"
                          type="number"
                          min="0"
                          step="0.01"
                          data-testid={`credit-input-${balance.service}`}
                        />
                        <Button
                          size="sm"
                          onClick={() => {
                            const amount = parseFloat(newCreditAmount);
                            if (amount > 0) {
                              addCreditsMutation.mutate({ 
                                service: balance.service, 
                                amount 
                              });
                            }
                          }}
                          disabled={!newCreditAmount || addCreditsMutation.isPending}
                          data-testid={`add-credit-button-${balance.service}`}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Adicionar
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="transactions" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <History className="h-5 w-5" />
                <span>Histórico de Transações</span>
              </CardTitle>
              <CardDescription>
                Últimas movimentações de créditos e uso de APIs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {transactions.map((transaction) => (
                  <div 
                    key={transaction.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                    data-testid={`transaction-${transaction.id}`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded-full ${
                        transaction.type === 'usage' ? 'bg-red-100 dark:bg-red-900' :
                        transaction.type === 'credit' ? 'bg-green-100 dark:bg-green-900' :
                        'bg-blue-100 dark:bg-blue-900'
                      }`}>
                        {transaction.type === 'usage' ? 
                          <TrendingDown className="h-4 w-4 text-red-600" /> :
                          transaction.type === 'credit' ?
                          <TrendingUp className="h-4 w-4 text-green-600" /> :
                          <CreditCard className="h-4 w-4 text-blue-600" />
                        }
                      </div>
                      <div>
                        <p className="font-medium">{transaction.description}</p>
                        <p className="text-sm text-gray-500 capitalize">
                          {transaction.service} • {formatDate(transaction.timestamp)}
                        </p>
                      </div>
                    </div>
                    <div className={`text-right ${
                      transaction.amount < 0 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      <p className="font-semibold">
                        {transaction.amount < 0 ? '' : '+'}{formatCurrency(transaction.amount)}
                      </p>
                      <p className="text-xs text-gray-500 capitalize">
                        {transaction.type === 'usage' ? 'Uso' : 
                         transaction.type === 'credit' ? 'Crédito' : 'Débito'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Distribuição de Custos</CardTitle>
                <CardDescription>
                  Breakdown dos gastos por serviço este mês
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {costSummary.breakdown.map((item, index) => (
                    <div key={index} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>{item.service}</span>
                        <span className="font-medium">
                          {formatCurrency(item.amount)} ({item.percentage}%)
                        </span>
                      </div>
                      <Progress value={item.percentage} className="h-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Tendências de Uso</CardTitle>
                <CardDescription>
                  Comparação com o mês anterior
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-primary">
                      +{Math.round(((costSummary.currentMonth - costSummary.lastMonth) / costSummary.lastMonth) * 100)}%
                    </p>
                    <p className="text-sm text-gray-500">Variação no gasto</p>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm">Mês Anterior</span>
                      <span className="font-medium">{formatCurrency(costSummary.lastMonth)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Mês Atual</span>
                      <span className="font-medium">{formatCurrency(costSummary.currentMonth)}</span>
                    </div>
                    <div className="flex justify-between text-primary">
                      <span className="text-sm font-medium">Diferença</span>
                      <span className="font-semibold">
                        +{formatCurrency(costSummary.currentMonth - costSummary.lastMonth)}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}