import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { 
  Database,
  HardDrive,
  Shield,
  RefreshCw,
  Download,
  Upload,
  Clock,
  Calendar,
  Settings,
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  Eye,
  EyeOff,
  Archive,
  Folder,
  FolderOpen,
  File,
  FileText,
  Files,
  Plus,
  Edit,
  Trash2,
  Copy,
  Move,
  Search,
  Filter,
  MoreHorizontal,
  Server,
  Cloud,
  CloudDownload,
  CloudUpload,
  Wifi,
  WifiOff,
  Lock,
  Unlock,
  Key,
  Fingerprint,
  Hash,
  Zap,
  Activity,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Target,
  Flag,
  Bookmark,
  Star,
  Heart,
  ThumbsUp,
  MessageSquare,
  Share2,
  Link2,
  ExternalLink,
  Globe,
  MapPin,
  Navigation,
  Compass,
  History,
  Timer,
  AlarmClock,
  Bell,
  BellOff,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Camera,
  CameraOff,
  Video,
  VideoOff,
  Image,
  FileImage,
  FileVideo,
  Music,
  Headphones,
  Speaker,
  Radio,
  Tv,
  Monitor,
  Smartphone,
  Tablet,
  Laptop,
  HardDriveIcon,
  Cpu,
  MemoryStick,
  Usb,
  Bluetooth,
  Battery,
  BatteryLow,
  Power,
  PowerOff,
  Plug,
  PlugZap,
  Cable,
  Satellite,
  Antenna,
  Router,
  Network
} from 'lucide-react';

interface BackupJob {
  id: string;
  name: string;
  description: string;
  type: 'full' | 'incremental' | 'differential' | 'snapshot';
  source: {
    type: 'database' | 'files' | 'application' | 'system' | 'logs';
    location: string;
    includeFilters: string[];
    excludeFilters: string[];
    size: number; // em bytes
  };
  destination: {
    type: 'local' | 'cloud' | 'ftp' | 's3' | 'google_drive' | 'dropbox';
    location: string;
    credentials?: {
      encrypted: boolean;
      lastVerified: string;
    };
  };
  schedule: {
    enabled: boolean;
    frequency: 'daily' | 'weekly' | 'monthly' | 'custom';
    time: string;
    timezone: string;
    retentionPolicy: {
      keepDaily: number;
      keepWeekly: number;
      keepMonthly: number;
      keepYearly: number;
    };
  };
  encryption: {
    enabled: boolean;
    algorithm: 'AES-256' | 'AES-128' | 'ChaCha20';
    keyManagement: 'manual' | 'auto' | 'hsm';
  };
  compression: {
    enabled: boolean;
    algorithm: 'gzip' | 'bzip2' | 'lz4' | 'zstd';
    level: number; // 1-9
  };
  status: 'active' | 'paused' | 'error' | 'completed' | 'running';
  lastRun: {
    timestamp: string;
    duration: number; // em segundos
    status: 'success' | 'failed' | 'partial';
    size: number;
    filesProcessed: number;
    errors: number;
  };
  nextRun: string;
  statistics: {
    totalRuns: number;
    successRate: number;
    avgDuration: number;
    totalDataBackedUp: number;
    lastSuccessful: string;
  };
  monitoring: {
    alerts: boolean;
    notifications: {
      email: boolean;
      slack: boolean;
      webhook?: string;
    };
    healthCheck: {
      enabled: boolean;
      interval: number; // em horas
      lastCheck: string;
      status: 'healthy' | 'warning' | 'critical';
    };
  };
}

interface BackupHistory {
  id: string;
  jobId: string;
  jobName: string;
  timestamp: string;
  type: 'full' | 'incremental' | 'differential' | 'snapshot';
  status: 'success' | 'failed' | 'partial' | 'running';
  duration: number;
  size: number;
  filesProcessed: number;
  filesSkipped: number;
  errors: Array<{
    type: 'permission' | 'network' | 'storage' | 'corruption' | 'timeout';
    message: string;
    file?: string;
    timestamp: string;
  }>;
  destination: string;
  checksumVerified: boolean;
  metadata: {
    startTime: string;
    endTime: string;
    averageSpeed: number; // MB/s
    peakSpeed: number;
    compressionRatio: number;
    encryptionTime: number;
  };
  recovery: {
    tested: boolean;
    testedAt?: string;
    testResult?: 'success' | 'failed' | 'partial';
    recoverability?: number; // 0-100%, known once tested
  };
}

interface RecoveryPlan {
  id: string;
  name: string;
  description: string;
  type: 'disaster_recovery' | 'point_in_time' | 'selective_restore' | 'system_migration';
  priority: 'critical' | 'high' | 'medium' | 'low';
  targetRTO: number; // Recovery Time Objective em minutos
  targetRPO: number; // Recovery Point Objective em minutos
  steps: Array<{
    id: string;
    name: string;
    description: string;
    type: 'verification' | 'preparation' | 'restore' | 'validation' | 'cleanup';
    dependencies: string[];
    estimatedTime: number;
    automated: boolean;
    commands?: string[];
    validationCriteria: string[];
  }>;
  backupSources: Array<{
    jobId: string;
    backupId: string;
    priority: number;
    critical: boolean;
  }>;
  notifications: {
    onStart: string[];
    onProgress: string[];
    onCompletion: string[];
    onFailure: string[];
  };
  testing: {
    lastTest: string;
    testFrequency: 'monthly' | 'quarterly' | 'biannual' | 'annual';
    nextTest: string;
    testResults: Array<{
      date: string;
      status: 'success' | 'failed' | 'partial';
      issues: string[];
      timeToRecover: number;
    }>;
  };
  compliance: {
    standards: string[];
    requirements: string[];
    documentation: string[];
    auditTrail: boolean;
  };
}

interface SystemHealth {
  overall: 'healthy' | 'warning' | 'critical';
  components: {
    storage: {
      status: 'healthy' | 'warning' | 'critical';
      totalSpace: number;
      usedSpace: number;
      freeSpace: number;
      issues: string[];
    };
    network: {
      status: 'healthy' | 'warning' | 'critical';
      bandwidth: number;
      latency: number;
      connectivity: boolean;
      issues: string[];
    };
    database: {
      status: 'healthy' | 'warning' | 'critical';
      connections: number;
      performance: number;
      replication: boolean;
      issues: string[];
    };
    application: {
      status: 'healthy' | 'warning' | 'critical';
      uptime: number;
      memoryUsage: number;
      cpuUsage: number;
      issues: string[];
    };
  };
  metrics: {
    lastBackupAge: number; // em horas
    backupSuccess: number; // porcentagem
    storageUtilization: number; // porcentagem
    networkThroughput: number; // MB/s
  };
  alerts: Array<{
    id: string;
    severity: 'info' | 'warning' | 'error' | 'critical';
    component: string;
    message: string;
    timestamp: string;
    acknowledged: boolean;
  }>;
}

const mockBackupJobs: BackupJob[] = [
  {
    id: 'job_001',
    name: 'Backup Completo do Banco de Dados',
    description: 'Backup diário completo do banco de dados principal com todos os dados de usuários, vídeos e analytics',
    type: 'full',
    source: {
      type: 'database',
      location: 'postgresql://localhost:5432/darknews_prod',
      includeFilters: ['users', 'videos', 'analytics', 'content'],
      excludeFilters: ['temp_tables', 'logs'],
      size: 15728640000 // 15GB
    },
    destination: {
      type: 's3',
      location: 's3://darknews-backups/database/',
      credentials: {
        encrypted: true,
        lastVerified: '2024-03-08 14:30:00'
      }
    },
    schedule: {
      enabled: true,
      frequency: 'daily',
      time: '02:00',
      timezone: 'America/Sao_Paulo',
      retentionPolicy: {
        keepDaily: 7,
        keepWeekly: 4,
        keepMonthly: 12,
        keepYearly: 3
      }
    },
    encryption: {
      enabled: true,
      algorithm: 'AES-256',
      keyManagement: 'auto'
    },
    compression: {
      enabled: true,
      algorithm: 'zstd',
      level: 6
    },
    status: 'active',
    lastRun: {
      timestamp: '2024-03-08 02:00:15',
      duration: 1847, // ~31 minutos
      status: 'success',
      size: 4718592000, // 4.4GB após compressão
      filesProcessed: 1,
      errors: 0
    },
    nextRun: '2024-03-09 02:00:00',
    statistics: {
      totalRuns: 127,
      successRate: 98.4,
      avgDuration: 1823,
      totalDataBackedUp: 598376448000, // ~558GB
      lastSuccessful: '2024-03-08 02:00:15'
    },
    monitoring: {
      alerts: true,
      notifications: {
        email: true,
        slack: true,
        webhook: 'https://hooks.slack.com/darknews-backups'
      },
      healthCheck: {
        enabled: true,
        interval: 6,
        lastCheck: '2024-03-08 14:30:00',
        status: 'healthy'
      }
    }
  },
  {
    id: 'job_002',
    name: 'Backup Incremental de Arquivos',
    description: 'Backup incremental dos arquivos de vídeo, thumbnails e assets do sistema',
    type: 'incremental',
    source: {
      type: 'files',
      location: '/var/darknews/media/',
      includeFilters: ['*.mp4', '*.jpg', '*.png', '*.webp'],
      excludeFilters: ['temp/*', 'cache/*'],
      size: 524288000000 // 488GB
    },
    destination: {
      type: 'cloud',
      location: 'gs://darknews-media-backups/',
      credentials: {
        encrypted: true,
        lastVerified: '2024-03-07 16:45:00'
      }
    },
    schedule: {
      enabled: true,
      frequency: 'daily',
      time: '03:30',
      timezone: 'America/Sao_Paulo',
      retentionPolicy: {
        keepDaily: 14,
        keepWeekly: 8,
        keepMonthly: 6,
        keepYearly: 2
      }
    },
    encryption: {
      enabled: true,
      algorithm: 'ChaCha20',
      keyManagement: 'manual'
    },
    compression: {
      enabled: false, // Arquivos de mídia já comprimidos
      algorithm: 'lz4',
      level: 1
    },
    status: 'active',
    lastRun: {
      timestamp: '2024-03-08 03:30:12',
      duration: 2156, // ~36 minutos
      status: 'success',
      size: 2147483648, // 2GB (incremental)
      filesProcessed: 847,
      errors: 0
    },
    nextRun: '2024-03-09 03:30:00',
    statistics: {
      totalRuns: 89,
      successRate: 96.6,
      avgDuration: 2234,
      totalDataBackedUp: 191268198400, // ~178GB
      lastSuccessful: '2024-03-08 03:30:12'
    },
    monitoring: {
      alerts: true,
      notifications: {
        email: false,
        slack: true
      },
      healthCheck: {
        enabled: true,
        interval: 12,
        lastCheck: '2024-03-08 15:30:00',
        status: 'healthy'
      }
    }
  },
  {
    id: 'job_003',
    name: 'Backup de Configurações do Sistema',
    description: 'Backup das configurações, scripts e arquivos de sistema críticos',
    type: 'snapshot',
    source: {
      type: 'system',
      location: '/etc/darknews/',
      includeFilters: ['*.conf', '*.json', '*.yaml', '*.env'],
      excludeFilters: ['*.log', '*.tmp'],
      size: 52428800 // 50MB
    },
    destination: {
      type: 'local',
      location: '/backup/system/',
      credentials: {
        encrypted: true,
        lastVerified: '2024-03-08 12:00:00'
      }
    },
    schedule: {
      enabled: true,
      frequency: 'weekly',
      time: '01:00',
      timezone: 'America/Sao_Paulo',
      retentionPolicy: {
        keepDaily: 0,
        keepWeekly: 12,
        keepMonthly: 24,
        keepYearly: 5
      }
    },
    encryption: {
      enabled: true,
      algorithm: 'AES-256',
      keyManagement: 'manual'
    },
    compression: {
      enabled: true,
      algorithm: 'gzip',
      level: 9
    },
    status: 'active',
    lastRun: {
      timestamp: '2024-03-04 01:00:05',
      duration: 23,
      status: 'success',
      size: 8388608, // 8MB após compressão
      filesProcessed: 127,
      errors: 0
    },
    nextRun: '2024-03-11 01:00:00',
    statistics: {
      totalRuns: 52,
      successRate: 100,
      avgDuration: 19,
      totalDataBackedUp: 436207616, // ~416MB
      lastSuccessful: '2024-03-04 01:00:05'
    },
    monitoring: {
      alerts: true,
      notifications: {
        email: true,
        slack: false
      },
      healthCheck: {
        enabled: true,
        interval: 24,
        lastCheck: '2024-03-08 01:00:00',
        status: 'healthy'
      }
    }
  }
];

const mockBackupHistory: BackupHistory[] = [
  {
    id: 'hist_001',
    jobId: 'job_001',
    jobName: 'Backup Completo do Banco de Dados',
    timestamp: '2024-03-08 02:00:15',
    type: 'full',
    status: 'success',
    duration: 1847,
    size: 4718592000,
    filesProcessed: 1,
    filesSkipped: 0,
    errors: [],
    destination: 's3://darknews-backups/database/2024-03-08-020015.sql.zst',
    checksumVerified: true,
    metadata: {
      startTime: '2024-03-08 02:00:15',
      endTime: '2024-03-08 02:30:42',
      averageSpeed: 147.2,
      peakSpeed: 203.8,
      compressionRatio: 0.3,
      encryptionTime: 89
    },
    recovery: {
      tested: true,
      testedAt: '2024-03-08 14:30:00',
      testResult: 'success',
      recoverability: 100
    }
  },
  {
    id: 'hist_002',
    jobId: 'job_002',
    jobName: 'Backup Incremental de Arquivos',
    timestamp: '2024-03-08 03:30:12',
    type: 'incremental',
    status: 'success',
    duration: 2156,
    size: 2147483648,
    filesProcessed: 847,
    filesSkipped: 12,
    errors: [
      {
        type: 'permission',
        message: 'Acesso negado ao arquivo',
        file: '/var/darknews/media/temp/processing_temp.mp4',
        timestamp: '2024-03-08 03:45:23'
      }
    ],
    destination: 'gs://darknews-media-backups/2024-03-08-033012/',
    checksumVerified: true,
    metadata: {
      startTime: '2024-03-08 03:30:12',
      endTime: '2024-03-08 04:06:08',
      averageSpeed: 19.8,
      peakSpeed: 45.6,
      compressionRatio: 1.0, // Sem compressão
      encryptionTime: 156
    },
    recovery: {
      tested: false
    }
  },
  {
    id: 'hist_003',
    jobId: 'job_001',
    jobName: 'Backup Completo do Banco de Dados',
    timestamp: '2024-03-07 02:00:18',
    type: 'full',
    status: 'failed',
    duration: 234,
    size: 0,
    filesProcessed: 0,
    filesSkipped: 0,
    errors: [
      {
        type: 'network',
        message: 'Conexão com S3 perdida durante o upload',
        timestamp: '2024-03-07 02:03:52'
      },
      {
        type: 'timeout',
        message: 'Timeout na conexão com o banco de dados',
        timestamp: '2024-03-07 02:04:12'
      }
    ],
    destination: 's3://darknews-backups/database/',
    checksumVerified: false,
    metadata: {
      startTime: '2024-03-07 02:00:18',
      endTime: '2024-03-07 02:04:12',
      averageSpeed: 0,
      peakSpeed: 0,
      compressionRatio: 0,
      encryptionTime: 0
    },
    recovery: {
      tested: false
    }
  }
];

const mockRecoveryPlans: RecoveryPlan[] = [
  {
    id: 'plan_001',
    name: 'Recuperação de Desastre - Sistema Completo',
    description: 'Plano completo de recuperação em caso de falha total do sistema',
    type: 'disaster_recovery',
    priority: 'critical',
    targetRTO: 240, // 4 horas
    targetRPO: 60,  // 1 hora
    steps: [
      {
        id: 'step_001',
        name: 'Verificação da Infraestrutura',
        description: 'Verificar se a infraestrutura de destino está operacional',
        type: 'verification',
        dependencies: [],
        estimatedTime: 15,
        automated: true,
        commands: ['ping -c 4 backup-server.darknews.com', 'aws s3 ls s3://darknews-backups/'],
        validationCriteria: ['Conectividade com servidor', 'Acesso aos backups']
      },
      {
        id: 'step_002',
        name: 'Preparação do Ambiente',
        description: 'Configurar ambiente de destino para receber os dados',
        type: 'preparation',
        dependencies: ['step_001'],
        estimatedTime: 30,
        automated: false,
        validationCriteria: ['Servidor configurado', 'Banco de dados inicializado']
      },
      {
        id: 'step_003',
        name: 'Restauração do Banco de Dados',
        description: 'Restaurar o backup mais recente do banco de dados',
        type: 'restore',
        dependencies: ['step_002'],
        estimatedTime: 90,
        automated: true,
        commands: ['pg_restore -d darknews_recovery /backup/latest.sql'],
        validationCriteria: ['Dados restaurados', 'Integridade verificada']
      },
      {
        id: 'step_004',
        name: 'Restauração de Arquivos',
        description: 'Restaurar arquivos de mídia e configurações',
        type: 'restore',
        dependencies: ['step_003'],
        estimatedTime: 60,
        automated: true,
        validationCriteria: ['Arquivos restaurados', 'Permissões corretas']
      },
      {
        id: 'step_005',
        name: 'Validação do Sistema',
        description: 'Validar funcionamento completo do sistema',
        type: 'validation',
        dependencies: ['step_004'],
        estimatedTime: 30,
        automated: false,
        validationCriteria: ['Sistema funcional', 'Testes básicos aprovados']
      }
    ],
    backupSources: [
      { jobId: 'job_001', backupId: 'latest', priority: 1, critical: true },
      { jobId: 'job_002', backupId: 'latest', priority: 2, critical: true },
      { jobId: 'job_003', backupId: 'latest', priority: 3, critical: false }
    ],
    notifications: {
      onStart: ['admin@darknews.com', '#emergencies'],
      onProgress: ['admin@darknews.com'],
      onCompletion: ['admin@darknews.com', '#general'],
      onFailure: ['admin@darknews.com', '#emergencies', '+5511999999999']
    },
    testing: {
      lastTest: '2024-02-15 10:00:00',
      testFrequency: 'quarterly',
      nextTest: '2024-05-15 10:00:00',
      testResults: [
        {
          date: '2024-02-15',
          status: 'success',
          issues: [],
          timeToRecover: 215
        },
        {
          date: '2023-11-15',
          status: 'partial',
          issues: ['Demora na restauração de arquivos'],
          timeToRecover: 287
        }
      ]
    },
    compliance: {
      standards: ['ISO 27001', 'SOC 2'],
      requirements: ['RTO < 4h', 'RPO < 1h', 'Teste trimestral'],
      documentation: ['DR-001.pdf', 'RUNBOOK-DR.md'],
      auditTrail: true
    }
  },
  {
    id: 'plan_002',
    name: 'Recuperação Seletiva - Dados de Usuário',
    description: 'Recuperação específica de dados de usuário em caso de corrupção',
    type: 'selective_restore',
    priority: 'high',
    targetRTO: 60,
    targetRPO: 30,
    steps: [
      {
        id: 'step_201',
        name: 'Identificação do Backup',
        description: 'Identificar o backup adequado baseado no timestamp',
        type: 'verification',
        dependencies: [],
        estimatedTime: 10,
        automated: true,
        commands: ['aws s3 ls s3://darknews-backups/database/ | tail -5'],
        validationCriteria: ['Backup identificado', 'Timestamp correto']
      },
      {
        id: 'step_202',
        name: 'Restauração Seletiva',
        description: 'Restaurar apenas as tabelas de usuário afetadas',
        type: 'restore',
        dependencies: ['step_201'],
        estimatedTime: 30,
        automated: true,
        commands: ['pg_restore -t users -t user_profiles /backup/selected.sql'],
        validationCriteria: ['Tabelas restauradas', 'Dados íntegros']
      },
      {
        id: 'step_203',
        name: 'Validação dos Dados',
        description: 'Verificar integridade dos dados restaurados',
        type: 'validation',
        dependencies: ['step_202'],
        estimatedTime: 15,
        automated: false,
        validationCriteria: ['Contagem de registros', 'Consistência relacional']
      }
    ],
    backupSources: [
      { jobId: 'job_001', backupId: 'point_in_time', priority: 1, critical: true }
    ],
    notifications: {
      onStart: ['admin@darknews.com'],
      onProgress: [],
      onCompletion: ['admin@darknews.com'],
      onFailure: ['admin@darknews.com', '#tech-team']
    },
    testing: {
      lastTest: '2024-03-01 15:30:00',
      testFrequency: 'monthly',
      nextTest: '2024-04-01 15:30:00',
      testResults: [
        {
          date: '2024-03-01',
          status: 'success',
          issues: [],
          timeToRecover: 42
        }
      ]
    },
    compliance: {
      standards: ['LGPD', 'GDPR'],
      requirements: ['Auditoria de dados', 'Notificação de restauração'],
      documentation: ['RESTORE-PROC.md'],
      auditTrail: true
    }
  }
];

const mockSystemHealth: SystemHealth = {
  overall: 'healthy',
  components: {
    storage: {
      status: 'warning',
      totalSpace: 2199023255552, // 2TB
      usedSpace: 1759218604442, // 1.6TB
      freeSpace: 439804651110,  // 400GB
      issues: ['Uso de armazenamento acima de 80%']
    },
    network: {
      status: 'healthy',
      bandwidth: 1000, // Mbps
      latency: 15, // ms
      connectivity: true,
      issues: []
    },
    database: {
      status: 'healthy',
      connections: 45,
      performance: 95,
      replication: true,
      issues: []
    },
    application: {
      status: 'healthy',
      uptime: 99.8,
      memoryUsage: 68,
      cpuUsage: 23,
      issues: []
    }
  },
  metrics: {
    lastBackupAge: 6, // 6 horas atrás
    backupSuccess: 98.4,
    storageUtilization: 80,
    networkThroughput: 125.6
  },
  alerts: [
    {
      id: 'alert_001',
      severity: 'warning',
      component: 'storage',
      message: 'Espaço de armazenamento em 80% - considere limpeza ou expansão',
      timestamp: '2024-03-08 14:30:00',
      acknowledged: false
    },
    {
      id: 'alert_002',
      severity: 'info',
      component: 'backup',
      message: 'Backup job_001 executado com sucesso',
      timestamp: '2024-03-08 02:31:02',
      acknowledged: true
    }
  ]
};

export default function BackupRecovery() {
  const [selectedTab, setSelectedTab] = useState('overview');
  const [jobFilter, setJobFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showJobDialog, setShowJobDialog] = useState(false);
  const [showPlanDialog, setShowPlanDialog] = useState(false);
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);
  const { toast } = useToast();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
      case 'healthy':
      case 'active': return 'text-green-500 bg-green-100 dark:bg-green-950';
      case 'warning': return 'text-yellow-500 bg-yellow-100 dark:bg-yellow-950';
      case 'error':
      case 'failed':
      case 'critical': return 'text-red-500 bg-red-100 dark:bg-red-950';
      case 'running':
      case 'partial': return 'text-blue-500 bg-blue-100 dark:bg-blue-950';
      case 'paused': return 'text-gray-500 bg-gray-100 dark:bg-gray-950';
      default: return 'text-gray-500 bg-gray-100 dark:bg-gray-950';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'text-red-500 bg-red-100 dark:bg-red-950';
      case 'high': return 'text-orange-500 bg-orange-100 dark:bg-orange-950';
      case 'medium': return 'text-yellow-500 bg-yellow-100 dark:bg-yellow-950';
      case 'low': return 'text-green-500 bg-green-100 dark:bg-green-950';
      default: return 'text-gray-500 bg-gray-100 dark:bg-gray-950';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'database': return <Database className="h-4 w-4" />;
      case 'files': return <Files className="h-4 w-4" />;
      case 'system': return <Server className="h-4 w-4" />;
      case 'application': return <Globe className="h-4 w-4" />;
      case 'logs': return <FileText className="h-4 w-4" />;
      default: return <Archive className="h-4 w-4" />;
    }
  };

  const formatSize = (bytes: number) => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const handleRunBackup = (jobId: string) => {
    toast({
      title: "Backup iniciado",
      description: "O backup manual foi iniciado e está em execução",
    });
  };

  const handleCreateJob = () => {
    toast({
      title: "Job criado",
      description: "Novo job de backup foi criado com sucesso",
    });
    setShowJobDialog(false);
  };

  const handleCreatePlan = () => {
    toast({
      title: "Plano criado",
      description: "Novo plano de recuperação foi criado",
    });
    setShowPlanDialog(false);
  };

  const handleStartRecovery = () => {
    toast({
      title: "Recuperação iniciada",
      description: "O processo de recuperação foi iniciado",
    });
    setShowRecoveryDialog(false);
  };

  const handleTestRecovery = (planId: string) => {
    toast({
      title: "Teste iniciado",
      description: "Teste de recuperação foi iniciado",
    });
  };

  const filteredJobs = mockBackupJobs.filter(job => {
    let matches = true;
    
    if (jobFilter !== 'all' && job.status !== jobFilter) matches = false;
    if (searchTerm && !job.name.toLowerCase().includes(searchTerm.toLowerCase())) matches = false;
    
    return matches;
  });

  const activeJobs = mockBackupJobs.filter(job => job.status === 'active').length;
  const totalBackups = mockBackupHistory.length;
  const successRate = Math.round((mockBackupHistory.filter(h => h.status === 'success').length / totalBackups) * 100);
  const totalDataBackedUp = mockBackupJobs.reduce((sum, job) => sum + job.statistics.totalDataBackedUp, 0);

  return (
    <div className="container mx-auto px-6 py-8 max-w-7xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Backup e Recuperação</h1>
              <p className="text-muted-foreground">Proteção completa de dados e continuidade do negócio</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <Dialog open={showRecoveryDialog} onOpenChange={setShowRecoveryDialog}>
              <DialogTrigger asChild>
                <Button variant="destructive" data-testid="button-start-recovery">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Iniciar Recuperação
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Iniciar Processo de Recuperação</DialogTitle>
                  <DialogDescription>
                    Selecione o plano de recuperação para executar
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="recovery-plan">Plano de Recuperação</Label>
                    <Select>
                      <SelectTrigger data-testid="select-recovery-plan">
                        <SelectValue placeholder="Selecione um plano" />
                      </SelectTrigger>
                      <SelectContent>
                        {mockRecoveryPlans.map((plan) => (
                          <SelectItem key={plan.id} value={plan.id}>
                            {plan.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="recovery-point">Ponto de Recuperação</Label>
                    <Input
                      id="recovery-point"
                      type="datetime-local"
                      defaultValue="2024-03-08T02:00"
                      data-testid="input-recovery-point"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="recovery-notes">Observações</Label>
                    <Textarea
                      id="recovery-notes"
                      placeholder="Descreva o motivo da recuperação..."
                      data-testid="textarea-recovery-notes"
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch data-testid="switch-notify-team" />
                    <Label className="text-sm">Notificar equipe sobre o início da recuperação</Label>
                  </div>

                  <Button onClick={handleStartRecovery} className="w-full" data-testid="button-confirm-recovery">
                    Confirmar e Iniciar Recuperação
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            
            <Button variant="outline" data-testid="button-backup-settings">
              <Settings className="h-4 w-4 mr-2" />
              Configurações
            </Button>
          </div>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Jobs Ativos</p>
                  <p className="text-2xl font-bold">{activeJobs}</p>
                  <p className="text-xs text-green-500 flex items-center mt-1">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Funcionando
                  </p>
                </div>
                <Activity className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Taxa de Sucesso</p>
                  <p className="text-2xl font-bold">{successRate}%</p>
                  <p className="text-xs text-blue-500 flex items-center mt-1">
                    <TrendingUp className="h-3 w-3 mr-1" />
                    Últimos 30 dias
                  </p>
                </div>
                <BarChart3 className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Dados Protegidos</p>
                  <p className="text-2xl font-bold">{formatSize(totalDataBackedUp)}</p>
                  <p className="text-xs text-purple-500 flex items-center mt-1">
                    <Database className="h-3 w-3 mr-1" />
                    Total acumulado
                  </p>
                </div>
                <HardDrive className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Saúde do Sistema</p>
                  <p className={`text-2xl font-bold ${getStatusColor(mockSystemHealth.overall).split(' ')[0]}`}>
                    {mockSystemHealth.overall === 'healthy' ? 'Saudável' :
                     mockSystemHealth.overall === 'warning' ? 'Atenção' : 'Crítico'}
                  </p>
                  <p className="text-xs text-orange-500 flex items-center mt-1">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {mockSystemHealth.alerts.filter(a => !a.acknowledged).length} alertas
                  </p>
                </div>
                <Shield className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="jobs">Jobs</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
            <TabsTrigger value="recovery">Recuperação</TabsTrigger>
            <TabsTrigger value="monitoring">Monitoramento</TabsTrigger>
            <TabsTrigger value="settings">Configurações</TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* System Health */}
              <Card>
                <CardHeader>
                  <CardTitle>Saúde do Sistema</CardTitle>
                  <CardDescription>Status dos componentes críticos</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {Object.entries(mockSystemHealth.components).map(([key, component]) => (
                      <div key={key} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center space-x-3">
                          {key === 'storage' && <HardDrive className="h-5 w-5" />}
                          {key === 'network' && <Wifi className="h-5 w-5" />}
                          {key === 'database' && <Database className="h-5 w-5" />}
                          {key === 'application' && <Globe className="h-5 w-5" />}
                          <div>
                            <div className="font-medium capitalize">{key.replace('_', ' ')}</div>
                            {component.issues.length > 0 && (
                              <div className="text-xs text-red-500">{component.issues[0]}</div>
                            )}
                          </div>
                        </div>
                        <Badge className={getStatusColor(component.status)}>
                          {component.status === 'healthy' ? 'Saudável' :
                           component.status === 'warning' ? 'Atenção' : 'Crítico'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Recent Backups */}
              <Card>
                <CardHeader>
                  <CardTitle>Backups Recentes</CardTitle>
                  <CardDescription>Últimas execuções de backup</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {mockBackupHistory.slice(0, 5).map((backup) => (
                      <div key={backup.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center space-x-3">
                          {getTypeIcon(backup.type)}
                          <div>
                            <div className="font-medium">{backup.jobName}</div>
                            <div className="text-xs text-muted-foreground">{backup.timestamp}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge className={getStatusColor(backup.status)}>
                            {backup.status === 'success' ? 'Sucesso' :
                             backup.status === 'failed' ? 'Falha' :
                             backup.status === 'partial' ? 'Parcial' : 'Executando'}
                          </Badge>
                          <div className="text-xs text-muted-foreground mt-1">
                            {formatSize(backup.size)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Storage Usage */}
            <Card>
              <CardHeader>
                <CardTitle>Uso de Armazenamento</CardTitle>
                <CardDescription>Distribuição do espaço de backup</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between text-sm">
                    <span>Usado: {formatSize(mockSystemHealth.components.storage.usedSpace)}</span>
                    <span>Livre: {formatSize(mockSystemHealth.components.storage.freeSpace)}</span>
                    <span>Total: {formatSize(mockSystemHealth.components.storage.totalSpace)}</span>
                  </div>
                  <Progress 
                    value={mockSystemHealth.metrics.storageUtilization} 
                    className="w-full"
                  />
                  {mockSystemHealth.metrics.storageUtilization > 80 && (
                    <div className="text-sm text-orange-600 flex items-center">
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      Armazenamento próximo da capacidade máxima
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Jobs */}
          <TabsContent value="jobs" className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Jobs de Backup</h3>
              <div className="flex items-center space-x-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar jobs..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-64"
                    data-testid="input-search-jobs"
                  />
                </div>
                
                <Select value={jobFilter} onValueChange={setJobFilter}>
                  <SelectTrigger className="w-40" data-testid="select-job-filter">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="paused">Pausado</SelectItem>
                    <SelectItem value="error">Erro</SelectItem>
                    <SelectItem value="running">Executando</SelectItem>
                  </SelectContent>
                </Select>

                <Dialog open={showJobDialog} onOpenChange={setShowJobDialog}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-new-job">
                      <Plus className="h-4 w-4 mr-2" />
                      Novo Job
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-3xl">
                    <DialogHeader>
                      <DialogTitle>Criar Novo Job de Backup</DialogTitle>
                      <DialogDescription>
                        Configure um novo job de backup automático
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="job-name">Nome do Job</Label>
                          <Input id="job-name" placeholder="Ex: Backup Diário BD" data-testid="input-job-name" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="job-type">Tipo de Backup</Label>
                          <Select>
                            <SelectTrigger data-testid="select-job-type">
                              <SelectValue placeholder="Tipo" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="full">Completo</SelectItem>
                              <SelectItem value="incremental">Incremental</SelectItem>
                              <SelectItem value="differential">Diferencial</SelectItem>
                              <SelectItem value="snapshot">Snapshot</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="job-source">Origem dos Dados</Label>
                        <Select>
                          <SelectTrigger data-testid="select-job-source">
                            <SelectValue placeholder="Tipo de origem" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="database">Banco de Dados</SelectItem>
                            <SelectItem value="files">Arquivos</SelectItem>
                            <SelectItem value="application">Aplicação</SelectItem>
                            <SelectItem value="system">Sistema</SelectItem>
                            <SelectItem value="logs">Logs</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="job-destination">Destino</Label>
                        <Select>
                          <SelectTrigger data-testid="select-job-destination">
                            <SelectValue placeholder="Destino do backup" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="local">Local</SelectItem>
                            <SelectItem value="s3">Amazon S3</SelectItem>
                            <SelectItem value="gcs">Google Cloud Storage</SelectItem>
                            <SelectItem value="azure">Azure Blob</SelectItem>
                            <SelectItem value="ftp">FTP/SFTP</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="job-schedule">Agendamento</Label>
                          <Select>
                            <SelectTrigger data-testid="select-job-schedule">
                              <SelectValue placeholder="Frequência" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="daily">Diário</SelectItem>
                              <SelectItem value="weekly">Semanal</SelectItem>
                              <SelectItem value="monthly">Mensal</SelectItem>
                              <SelectItem value="custom">Personalizado</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="job-time">Horário</Label>
                          <Input
                            id="job-time"
                            type="time"
                            defaultValue="02:00"
                            data-testid="input-job-time"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center space-x-2">
                          <Switch data-testid="switch-encryption" />
                          <Label className="text-sm">Ativar Criptografia</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Switch data-testid="switch-compression" />
                          <Label className="text-sm">Ativar Compressão</Label>
                        </div>
                      </div>

                      <Button onClick={handleCreateJob} className="w-full" data-testid="button-create-job">
                        Criar Job de Backup
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <div className="space-y-4">
              {filteredJobs.map((job) => (
                <Card key={job.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      {/* Header do job */}
                      <div className="flex items-start justify-between">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center space-x-2">
                            {getTypeIcon(job.source.type)}
                            <h3 className="font-semibold">{job.name}</h3>
                            <Badge className={getStatusColor(job.status)}>
                              {job.status === 'active' ? 'Ativo' :
                               job.status === 'paused' ? 'Pausado' :
                               job.status === 'error' ? 'Erro' :
                               job.status === 'running' ? 'Executando' : 'Completo'}
                            </Badge>
                            <Badge variant="outline">{job.type}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{job.description}</p>
                          <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                            <span>Próxima execução: {job.nextRun}</span>
                            <span>Sucesso: {job.statistics.successRate}%</span>
                            <span>Tamanho origem: {formatSize(job.source.size)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Configurações principais */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-3 bg-muted/50 rounded-lg">
                        <div className="text-center">
                          <div className="text-sm font-bold">{job.schedule.frequency}</div>
                          <div className="text-xs text-muted-foreground">Frequência</div>
                        </div>
                        <div className="text-center">
                          <div className="text-sm font-bold">{job.schedule.time}</div>
                          <div className="text-xs text-muted-foreground">Horário</div>
                        </div>
                        <div className="text-center">
                          <div className="text-sm font-bold">
                            {job.encryption.enabled ? job.encryption.algorithm : 'Não'}
                          </div>
                          <div className="text-xs text-muted-foreground">Criptografia</div>
                        </div>
                        <div className="text-center">
                          <div className="text-sm font-bold">
                            {job.compression.enabled ? job.compression.algorithm : 'Não'}
                          </div>
                          <div className="text-xs text-muted-foreground">Compressão</div>
                        </div>
                      </div>

                      {/* Última execução */}
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">Última Execução:</h4>
                        <div className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center space-x-3">
                            <Clock className="h-4 w-4" />
                            <div>
                              <div className="text-sm font-medium">{job.lastRun.timestamp}</div>
                              <div className="text-xs text-muted-foreground">
                                Duração: {formatDuration(job.lastRun.duration)}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge className={getStatusColor(job.lastRun.status)}>
                              {job.lastRun.status === 'success' ? 'Sucesso' :
                               job.lastRun.status === 'failed' ? 'Falha' : 'Parcial'}
                            </Badge>
                            <div className="text-xs text-muted-foreground mt-1">
                              {formatSize(job.lastRun.size)}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Estatísticas */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center p-2 border rounded">
                          <div className="text-lg font-bold">{job.statistics.totalRuns}</div>
                          <div className="text-xs text-muted-foreground">Total Execuções</div>
                        </div>
                        <div className="text-center p-2 border rounded">
                          <div className="text-lg font-bold">{job.statistics.successRate}%</div>
                          <div className="text-xs text-muted-foreground">Taxa Sucesso</div>
                        </div>
                        <div className="text-center p-2 border rounded">
                          <div className="text-lg font-bold">{formatDuration(job.statistics.avgDuration)}</div>
                          <div className="text-xs text-muted-foreground">Duração Média</div>
                        </div>
                        <div className="text-center p-2 border rounded">
                          <div className="text-lg font-bold">{formatSize(job.statistics.totalDataBackedUp)}</div>
                          <div className="text-xs text-muted-foreground">Total Backup</div>
                        </div>
                      </div>

                      {/* Monitoramento */}
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">Monitoramento:</h4>
                        <div className="flex items-center space-x-4">
                          <div className="flex items-center space-x-2">
                            <Badge className={getStatusColor(job.monitoring.healthCheck.status)}>
                              {job.monitoring.healthCheck.status === 'healthy' ? 'Saudável' :
                               job.monitoring.healthCheck.status === 'warning' ? 'Atenção' : 'Crítico'}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              Verificado: {job.monitoring.healthCheck.lastCheck}
                            </span>
                          </div>
                          {job.monitoring.notifications.email && (
                            <Badge variant="outline">Email</Badge>
                          )}
                          {job.monitoring.notifications.slack && (
                            <Badge variant="outline">Slack</Badge>
                          )}
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between pt-4 border-t">
                        <div className="flex space-x-2">
                          <Button 
                            variant="default" 
                            size="sm"
                            onClick={() => handleRunBackup(job.id)}
                            disabled={job.status === 'running'}
                            data-testid={`button-run-${job.id}`}
                          >
                            <Play className="h-4 w-4 mr-1" />
                            Executar Agora
                          </Button>
                          <Button variant="outline" size="sm" data-testid={`button-edit-${job.id}`}>
                            <Edit className="h-4 w-4 mr-1" />
                            Editar
                          </Button>
                          <Button variant="outline" size="sm" data-testid={`button-pause-${job.id}`}>
                            <Pause className="h-4 w-4 mr-1" />
                            Pausar
                          </Button>
                          <Button variant="outline" size="sm" data-testid={`button-logs-${job.id}`}>
                            <FileText className="h-4 w-4 mr-1" />
                            Logs
                          </Button>
                        </div>
                        
                        <div className="text-xs text-muted-foreground">
                          ID: {job.id}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* History */}
          <TabsContent value="history" className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Histórico de Backups</h3>
              <Button variant="outline" data-testid="button-export-history">
                <Download className="h-4 w-4 mr-2" />
                Exportar Histórico
              </Button>
            </div>

            <div className="space-y-4">
              {mockBackupHistory.map((backup) => (
                <Card key={backup.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      {/* Header do backup */}
                      <div className="flex items-start justify-between">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center space-x-2">
                            {getTypeIcon(backup.type)}
                            <h3 className="font-semibold">{backup.jobName}</h3>
                            <Badge className={getStatusColor(backup.status)}>
                              {backup.status === 'success' ? 'Sucesso' :
                               backup.status === 'failed' ? 'Falha' :
                               backup.status === 'partial' ? 'Parcial' : 'Executando'}
                            </Badge>
                            <Badge variant="outline">{backup.type}</Badge>
                          </div>
                          <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                            <span>Executado: {backup.timestamp}</span>
                            <span>Duração: {formatDuration(backup.duration)}</span>
                            <span>Tamanho: {formatSize(backup.size)}</span>
                            <span>Arquivos: {backup.filesProcessed}</span>
                          </div>
                        </div>
                        
                        {backup.recovery.tested && (
                          <div className="text-right">
                            <Badge className="bg-green-100 text-green-800">
                              ✓ Testado
                            </Badge>
                            <div className="text-xs text-muted-foreground mt-1">
                              {backup.recovery.recoverability}% recuperável
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Métricas detalhadas */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-3 bg-muted/50 rounded-lg">
                        <div className="text-center">
                          <div className="text-sm font-bold">{backup.metadata.averageSpeed.toFixed(1)} MB/s</div>
                          <div className="text-xs text-muted-foreground">Velocidade Média</div>
                        </div>
                        <div className="text-center">
                          <div className="text-sm font-bold">{backup.metadata.peakSpeed.toFixed(1)} MB/s</div>
                          <div className="text-xs text-muted-foreground">Pico Velocidade</div>
                        </div>
                        <div className="text-center">
                          <div className="text-sm font-bold">{Math.round(backup.metadata.compressionRatio * 100)}%</div>
                          <div className="text-xs text-muted-foreground">Compressão</div>
                        </div>
                        <div className="text-center">
                          <div className="text-sm font-bold">
                            {backup.checksumVerified ? 'Verificado' : 'Pendente'}
                          </div>
                          <div className="text-xs text-muted-foreground">Checksum</div>
                        </div>
                      </div>

                      {/* Erros (se houver) */}
                      {backup.errors.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium text-red-600">Erros Encontrados ({backup.errors.length}):</h4>
                          <div className="space-y-1">
                            {backup.errors.slice(0, 3).map((error, index) => (
                              <div key={index} className="p-2 bg-red-50 dark:bg-red-950 rounded text-sm">
                                <div className="flex items-center space-x-2">
                                  <AlertTriangle className="h-4 w-4 text-red-500" />
                                  <span className="font-medium">{error.type}:</span>
                                  <span>{error.message}</span>
                                </div>
                                {error.file && (
                                  <div className="text-xs text-muted-foreground mt-1">
                                    Arquivo: {error.file}
                                  </div>
                                )}
                              </div>
                            ))}
                            {backup.errors.length > 3 && (
                              <div className="text-xs text-muted-foreground">
                                ... e mais {backup.errors.length - 3} erros
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Destino e localização */}
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">Localização do Backup:</h4>
                        <div className="p-2 bg-muted/50 rounded font-mono text-xs">
                          {backup.destination}
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between pt-4 border-t">
                        <div className="flex space-x-2">
                          <Button variant="outline" size="sm" data-testid={`button-restore-${backup.id}`}>
                            <RotateCcw className="h-4 w-4 mr-1" />
                            Restaurar
                          </Button>
                          <Button variant="outline" size="sm" data-testid={`button-download-${backup.id}`}>
                            <Download className="h-4 w-4 mr-1" />
                            Download
                          </Button>
                          <Button variant="outline" size="sm" data-testid={`button-verify-${backup.id}`}>
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Verificar
                          </Button>
                          {!backup.recovery.tested && (
                            <Button variant="outline" size="sm" data-testid={`button-test-${backup.id}`}>
                              <Eye className="h-4 w-4 mr-1" />
                              Testar
                            </Button>
                          )}
                        </div>
                        
                        <div className="text-xs text-muted-foreground">
                          ID: {backup.id}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Recovery */}
          <TabsContent value="recovery" className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Planos de Recuperação</h3>
              <Dialog open={showPlanDialog} onOpenChange={setShowPlanDialog}>
                <DialogTrigger asChild>
                  <Button data-testid="button-new-plan">
                    <Plus className="h-4 w-4 mr-2" />
                    Novo Plano
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl">
                  <DialogHeader>
                    <DialogTitle>Criar Plano de Recuperação</DialogTitle>
                    <DialogDescription>
                      Configure um novo plano de recuperação de desastres
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="plan-name">Nome do Plano</Label>
                        <Input id="plan-name" placeholder="Ex: DR Sistema Principal" data-testid="input-plan-name" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="plan-type">Tipo de Recuperação</Label>
                        <Select>
                          <SelectTrigger data-testid="select-plan-type">
                            <SelectValue placeholder="Tipo" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="disaster_recovery">Recuperação de Desastre</SelectItem>
                            <SelectItem value="point_in_time">Ponto no Tempo</SelectItem>
                            <SelectItem value="selective_restore">Restauração Seletiva</SelectItem>
                            <SelectItem value="system_migration">Migração de Sistema</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="plan-rto">RTO (Recovery Time Objective)</Label>
                        <div className="flex space-x-2">
                          <Input
                            id="plan-rto"
                            type="number"
                            placeholder="240"
                            data-testid="input-plan-rto"
                          />
                          <Select defaultValue="minutes">
                            <SelectTrigger className="w-24">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="minutes">Min</SelectItem>
                              <SelectItem value="hours">Horas</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="plan-rpo">RPO (Recovery Point Objective)</Label>
                        <div className="flex space-x-2">
                          <Input
                            id="plan-rpo"
                            type="number"
                            placeholder="60"
                            data-testid="input-plan-rpo"
                          />
                          <Select defaultValue="minutes">
                            <SelectTrigger className="w-24">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="minutes">Min</SelectItem>
                              <SelectItem value="hours">Horas</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="plan-priority">Prioridade</Label>
                      <Select>
                        <SelectTrigger data-testid="select-plan-priority">
                          <SelectValue placeholder="Prioridade" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="critical">Crítica</SelectItem>
                          <SelectItem value="high">Alta</SelectItem>
                          <SelectItem value="medium">Média</SelectItem>
                          <SelectItem value="low">Baixa</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="plan-description">Descrição</Label>
                      <Textarea
                        id="plan-description"
                        placeholder="Descreva o plano de recuperação..."
                        data-testid="textarea-plan-description"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Jobs de Backup Relacionados</Label>
                      <div className="space-y-2">
                        {mockBackupJobs.map((job) => (
                          <div key={job.id} className="flex items-center space-x-2">
                            <Switch data-testid={`switch-job-${job.id}`} />
                            <Label className="text-sm">{job.name}</Label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <Button onClick={handleCreatePlan} className="w-full" data-testid="button-create-plan">
                      Criar Plano de Recuperação
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="space-y-4">
              {mockRecoveryPlans.map((plan) => (
                <Card key={plan.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      {/* Header do plano */}
                      <div className="flex items-start justify-between">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center space-x-2">
                            <RotateCcw className="h-4 w-4" />
                            <h3 className="font-semibold">{plan.name}</h3>
                            <Badge className={getPriorityColor(plan.priority)}>
                              {plan.priority === 'critical' ? 'Crítica' :
                               plan.priority === 'high' ? 'Alta' :
                               plan.priority === 'medium' ? 'Média' : 'Baixa'}
                            </Badge>
                            <Badge variant="outline">{plan.type.replace('_', ' ')}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{plan.description}</p>
                        </div>
                      </div>

                      {/* Objetivos RTO/RPO */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-3 bg-muted/50 rounded-lg">
                        <div className="text-center">
                          <div className="text-lg font-bold">{Math.floor(plan.targetRTO / 60)}h {plan.targetRTO % 60}m</div>
                          <div className="text-xs text-muted-foreground">RTO Objetivo</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-bold">{Math.floor(plan.targetRPO / 60)}h {plan.targetRPO % 60}m</div>
                          <div className="text-xs text-muted-foreground">RPO Objetivo</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-bold">{plan.steps.length}</div>
                          <div className="text-xs text-muted-foreground">Etapas</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-bold">{plan.backupSources.length}</div>
                          <div className="text-xs text-muted-foreground">Backups</div>
                        </div>
                      </div>

                      {/* Principais etapas */}
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">Principais Etapas:</h4>
                        <div className="space-y-2">
                          {plan.steps.slice(0, 3).map((step, index) => (
                            <div key={step.id} className="flex items-center space-x-3 p-2 border rounded">
                              <div className="w-6 h-6 bg-blue-100 dark:bg-blue-950 rounded-full flex items-center justify-center text-xs font-bold">
                                {index + 1}
                              </div>
                              <div className="flex-1">
                                <div className="text-sm font-medium">{step.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  Tempo estimado: {step.estimatedTime} min
                                  {step.automated && ' (Automático)'}
                                </div>
                              </div>
                            </div>
                          ))}
                          {plan.steps.length > 3 && (
                            <div className="text-xs text-muted-foreground">
                              ... e mais {plan.steps.length - 3} etapas
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Último teste */}
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">Testes de Recuperação:</h4>
                        <div className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center space-x-3">
                            <Calendar className="h-4 w-4" />
                            <div>
                              <div className="text-sm font-medium">Último teste: {plan.testing.lastTest}</div>
                              <div className="text-xs text-muted-foreground">
                                Próximo teste: {plan.testing.nextTest}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            {plan.testing.testResults.length > 0 && (
                              <>
                                <Badge className={getStatusColor(plan.testing.testResults[0].status)}>
                                  {plan.testing.testResults[0].status === 'success' ? 'Sucesso' :
                                   plan.testing.testResults[0].status === 'failed' ? 'Falha' : 'Parcial'}
                                </Badge>
                                <div className="text-xs text-muted-foreground mt-1">
                                  {plan.testing.testResults[0].timeToRecover} min
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Compliance */}
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">Compliance:</h4>
                        <div className="flex flex-wrap gap-1">
                          {plan.compliance.standards.map((standard, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {standard}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between pt-4 border-t">
                        <div className="flex space-x-2">
                          <Button 
                            variant="default" 
                            size="sm"
                            onClick={() => handleTestRecovery(plan.id)}
                            data-testid={`button-test-${plan.id}`}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Testar Plano
                          </Button>
                          <Button variant="outline" size="sm" data-testid={`button-edit-plan-${plan.id}`}>
                            <Edit className="h-4 w-4 mr-1" />
                            Editar
                          </Button>
                          <Button variant="outline" size="sm" data-testid={`button-execute-${plan.id}`}>
                            <Play className="h-4 w-4 mr-1" />
                            Executar
                          </Button>
                          <Button variant="outline" size="sm" data-testid={`button-documentation-${plan.id}`}>
                            <FileText className="h-4 w-4 mr-1" />
                            Documentação
                          </Button>
                        </div>
                        
                        <div className="text-xs text-muted-foreground">
                          ID: {plan.id}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Monitoring */}
          <TabsContent value="monitoring" className="space-y-6">
            <h3 className="text-lg font-semibold">Monitoramento e Alertas</h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Active Alerts */}
              <Card>
                <CardHeader>
                  <CardTitle>Alertas Ativos</CardTitle>
                  <CardDescription>Alertas que requerem atenção</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {mockSystemHealth.alerts.filter(alert => !alert.acknowledged).map((alert) => (
                      <div key={alert.id} className={`p-3 rounded-lg border ${
                        alert.severity === 'critical' ? 'border-red-200 bg-red-50 dark:bg-red-950' :
                        alert.severity === 'warning' ? 'border-yellow-200 bg-yellow-50 dark:bg-yellow-950' :
                        alert.severity === 'error' ? 'border-red-200 bg-red-50 dark:bg-red-950' :
                        'border-blue-200 bg-blue-50 dark:bg-blue-950'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            {alert.severity === 'critical' && <AlertTriangle className="h-4 w-4 text-red-500" />}
                            {alert.severity === 'warning' && <AlertTriangle className="h-4 w-4 text-yellow-500" />}
                            {alert.severity === 'error' && <XCircle className="h-4 w-4 text-red-500" />}
                            {alert.severity === 'info' && <Info className="h-4 w-4 text-blue-500" />}
                            <div>
                              <div className="font-medium text-sm">{alert.component}</div>
                              <div className="text-xs text-muted-foreground">{alert.timestamp}</div>
                            </div>
                          </div>
                          <Button size="sm" variant="outline" data-testid={`button-acknowledge-${alert.id}`}>
                            Reconhecer
                          </Button>
                        </div>
                        <p className="text-sm mt-2">{alert.message}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* System Metrics */}
              <Card>
                <CardHeader>
                  <CardTitle>Métricas do Sistema</CardTitle>
                  <CardDescription>Indicadores de performance</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Último Backup</span>
                      <span className="text-sm font-medium">{mockSystemHealth.metrics.lastBackupAge}h atrás</span>
                    </div>
                    <Progress value={Math.max(0, 24 - mockSystemHealth.metrics.lastBackupAge) / 24 * 100} />

                    <div className="flex justify-between items-center">
                      <span className="text-sm">Taxa de Sucesso</span>
                      <span className="text-sm font-medium">{mockSystemHealth.metrics.backupSuccess}%</span>
                    </div>
                    <Progress value={mockSystemHealth.metrics.backupSuccess} />

                    <div className="flex justify-between items-center">
                      <span className="text-sm">Utilização de Storage</span>
                      <span className="text-sm font-medium">{mockSystemHealth.metrics.storageUtilization}%</span>
                    </div>
                    <Progress value={mockSystemHealth.metrics.storageUtilization} />

                    <div className="flex justify-between items-center">
                      <span className="text-sm">Throughput de Rede</span>
                      <span className="text-sm font-medium">{mockSystemHealth.metrics.networkThroughput} MB/s</span>
                    </div>
                    <Progress value={mockSystemHealth.metrics.networkThroughput / 200 * 100} />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Component Status */}
            <Card>
              <CardHeader>
                <CardTitle>Status dos Componentes</CardTitle>
                <CardDescription>Estado detalhado de cada componente do sistema</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {Object.entries(mockSystemHealth.components).map(([key, component]) => (
                    <div key={key} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          {key === 'storage' && <HardDrive className="h-5 w-5" />}
                          {key === 'network' && <Wifi className="h-5 w-5" />}
                          {key === 'database' && <Database className="h-5 w-5" />}
                          {key === 'application' && <Globe className="h-5 w-5" />}
                          <span className="font-medium capitalize">{key}</span>
                        </div>
                        <Badge className={getStatusColor(component.status)}>
                          {component.status === 'healthy' ? 'OK' :
                           component.status === 'warning' ? 'Atenção' : 'Erro'}
                        </Badge>
                      </div>

                      {key === 'storage' && (
                        <div className="space-y-2">
                          <div className="text-xs">Total: {formatSize(mockSystemHealth.components.storage.totalSpace)}</div>
                          <div className="text-xs">Usado: {formatSize(mockSystemHealth.components.storage.usedSpace)}</div>
                          <div className="text-xs">Livre: {formatSize(mockSystemHealth.components.storage.freeSpace)}</div>
                        </div>
                      )}

                      {key === 'network' && (
                        <div className="space-y-2">
                          <div className="text-xs">Bandwidth: {mockSystemHealth.components.network.bandwidth} Mbps</div>
                          <div className="text-xs">Latência: {mockSystemHealth.components.network.latency} ms</div>
                          <div className="text-xs">Conectado: {mockSystemHealth.components.network.connectivity ? 'Sim' : 'Não'}</div>
                        </div>
                      )}

                      {key === 'database' && (
                        <div className="space-y-2">
                          <div className="text-xs">Conexões: {mockSystemHealth.components.database.connections}</div>
                          <div className="text-xs">Performance: {mockSystemHealth.components.database.performance}%</div>
                          <div className="text-xs">Replicação: {mockSystemHealth.components.database.replication ? 'Ativa' : 'Inativa'}</div>
                        </div>
                      )}

                      {key === 'application' && (
                        <div className="space-y-2">
                          <div className="text-xs">Uptime: {mockSystemHealth.components.application.uptime}%</div>
                          <div className="text-xs">Memória: {mockSystemHealth.components.application.memoryUsage}%</div>
                          <div className="text-xs">CPU: {mockSystemHealth.components.application.cpuUsage}%</div>
                        </div>
                      )}

                      {component.issues.length > 0 && (
                        <div className="mt-2 text-xs text-red-500">
                          {component.issues[0]}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings */}
          <TabsContent value="settings" className="space-y-6">
            <h3 className="text-lg font-semibold">Configurações de Backup</h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Global Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>Configurações Globais</CardTitle>
                  <CardDescription>Configurações aplicadas a todos os jobs</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Retenção de logs de backup</Label>
                      <p className="text-xs text-muted-foreground">Tempo para manter logs de execução</p>
                    </div>
                    <Select defaultValue="90">
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">30 dias</SelectItem>
                        <SelectItem value="90">90 dias</SelectItem>
                        <SelectItem value="180">6 meses</SelectItem>
                        <SelectItem value="365">1 ano</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Paralelismo máximo</Label>
                      <p className="text-xs text-muted-foreground">Jobs simultâneos permitidos</p>
                    </div>
                    <Select defaultValue="3">
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1</SelectItem>
                        <SelectItem value="2">2</SelectItem>
                        <SelectItem value="3">3</SelectItem>
                        <SelectItem value="4">4</SelectItem>
                        <SelectItem value="5">5</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Verificação automática</Label>
                      <p className="text-xs text-muted-foreground">Verificar integridade dos backups</p>
                    </div>
                    <Switch defaultChecked />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Alertas por email</Label>
                      <p className="text-xs text-muted-foreground">Notificações de falhas</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </CardContent>
              </Card>

              {/* Notification Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>Configurações de Notificação</CardTitle>
                  <CardDescription>Como e quando receber alertas</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email-recipients">Destinatários de email</Label>
                    <Textarea
                      id="email-recipients"
                      placeholder="admin@darknews.com, backup@darknews.com"
                      defaultValue="admin@darknews.com"
                      data-testid="textarea-email-recipients"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="slack-webhook">Webhook do Slack</Label>
                    <Input
                      id="slack-webhook"
                      placeholder="https://hooks.slack.com/services/..."
                      defaultValue="https://hooks.slack.com/darknews-backups"
                      data-testid="input-slack-webhook"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Notificar sucessos</Label>
                      <p className="text-xs text-muted-foreground">Alertar quando backups são bem-sucedidos</p>
                    </div>
                    <Switch />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Notificar falhas</Label>
                      <p className="text-xs text-muted-foreground">Alertar sobre falhas em backups</p>
                    </div>
                    <Switch defaultChecked />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Relatórios semanais</Label>
                      <p className="text-xs text-muted-foreground">Resumo semanal por email</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Storage Configuration */}
            <Card>
              <CardHeader>
                <CardTitle>Configuração de Armazenamento</CardTitle>
                <CardDescription>Locais padrão para armazenar backups</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="local-path">Diretório local padrão</Label>
                      <Input
                        id="local-path"
                        defaultValue="/backup/"
                        data-testid="input-local-path"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="s3-bucket">Bucket S3 padrão</Label>
                      <Input
                        id="s3-bucket"
                        placeholder="darknews-backups"
                        defaultValue="darknews-backups"
                        data-testid="input-s3-bucket"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="compression-default">Algoritmo de compressão padrão</Label>
                      <Select defaultValue="zstd">
                        <SelectTrigger data-testid="select-compression-default">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gzip">gzip</SelectItem>
                          <SelectItem value="bzip2">bzip2</SelectItem>
                          <SelectItem value="lz4">lz4</SelectItem>
                          <SelectItem value="zstd">zstd</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="encryption-default">Criptografia padrão</Label>
                      <Select defaultValue="AES-256">
                        <SelectTrigger data-testid="select-encryption-default">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem criptografia</SelectItem>
                          <SelectItem value="AES-128">AES-128</SelectItem>
                          <SelectItem value="AES-256">AES-256</SelectItem>
                          <SelectItem value="ChaCha20">ChaCha20</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Limpeza automática</Label>
                      <p className="text-xs text-muted-foreground">Remover backups antigos automaticamente</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}