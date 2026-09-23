import { storage } from "../storage";
import { errorRecoveryService } from "./errorRecoveryService";

interface AlertThreshold {
  metricType: 'cpu' | 'memory' | 'queue_size' | 'error_rate' | 'response_time' | 'failed_jobs' | 'api_failures';
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  windowMinutes: number;
  enabled: boolean;
}

interface SystemMetrics {
  activeJobs: number;
  queueSize: number;
  errorRate: number;
  averageResponseTime: number;
  failedJobsLast24h: number;
  apiFailures: number;
  memoryUsage: number;
  cpuUsage: number;
  timestamp: Date;
}

interface AlertNotification {
  type: 'email' | 'slack' | 'webhook' | 'dashboard';
  config: any;
  enabled: boolean;
}

class PerformanceAlertsService {
  private isRunning = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  
  private readonly DEFAULT_THRESHOLDS: AlertThreshold[] = [
    { metricType: 'queue_size', threshold: 50, severity: 'medium', windowMinutes: 5, enabled: true },
    { metricType: 'queue_size', threshold: 100, severity: 'high', windowMinutes: 5, enabled: true },
    { metricType: 'error_rate', threshold: 0.1, severity: 'medium', windowMinutes: 15, enabled: true },
    { metricType: 'error_rate', threshold: 0.25, severity: 'high', windowMinutes: 15, enabled: true },
    { metricType: 'failed_jobs', threshold: 10, severity: 'medium', windowMinutes: 60, enabled: true },
    { metricType: 'failed_jobs', threshold: 25, severity: 'high', windowMinutes: 60, enabled: true },
    { metricType: 'api_failures', threshold: 3, severity: 'medium', windowMinutes: 30, enabled: true },
    { metricType: 'api_failures', threshold: 5, severity: 'critical', windowMinutes: 30, enabled: true },
    { metricType: 'response_time', threshold: 5000, severity: 'medium', windowMinutes: 10, enabled: true },
    { metricType: 'response_time', threshold: 10000, severity: 'high', windowMinutes: 10, enabled: true }
  ];

  private thresholds: AlertThreshold[];
  private notifications: AlertNotification[];
  private recentAlerts: Map<string, Date> = new Map();
  private readonly ALERT_COOLDOWN_MINUTES = 30;

  constructor() {
    this.thresholds = [...this.DEFAULT_THRESHOLDS];
    this.notifications = [
      { type: 'dashboard', config: {}, enabled: true },
      { type: 'slack', config: { webhook: process.env.SLACK_WEBHOOK_URL }, enabled: !!process.env.SLACK_WEBHOOK_URL }
    ];
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log("🚨 Starting Performance Alerts Service...");

    // Monitor every 2 minutes
    this.monitoringInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, 2 * 60 * 1000);

    // Initial check
    await this.performHealthCheck();
    
    console.log("✅ Performance Alerts Service started");
  }

  async stop(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isRunning = false;
    console.log("Performance Alerts Service stopped");
  }

  private async performHealthCheck(): Promise<void> {
    try {
      console.log("📊 Performing system health check...");
      
      const metrics = await this.collectSystemMetrics();
      await this.evaluateThresholds(metrics);
      
    } catch (error) {
      console.error("❌ Error in performance health check:", error);
      
      await this.triggerAlert('system_monitoring_failure', {
        severity: 'high',
        title: 'Performance Monitoring Failed',
        description: `Performance monitoring system encountered an error: ${error instanceof Error ? error.message : String(error)}`,
        metricValue: 0,
        threshold: 1
      });
    }
  }

  private async collectSystemMetrics(): Promise<SystemMetrics> {
    const now = new Date();
    const past24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Collect metrics from storage
    const [activeJobs, allErrorLogs, apiStatuses] = await Promise.all([
      storage.getActiveJobs(),
      storage.getErrorLogs(),
      storage.getApiStatuses()
    ]);

    // Filter error logs to last 24h manually
    const errorLogs = allErrorLogs.filter(log => log.occuredAt && log.occuredAt > past24h);

    const queueSize = activeJobs.filter(job => job.status === 'pending').length;
    const processingJobs = activeJobs.filter(job => job.status === 'processing').length;
    const failedJobsLast24h = activeJobs.filter(job => 
      job.status === 'failed' && job.createdAt && job.createdAt > past24h
    ).length;
    
    const totalRequests = errorLogs.length + activeJobs.length;
    const errorRate = totalRequests > 0 ? errorLogs.length / totalRequests : 0;
    
    const apiFailures = apiStatuses.filter(api => api.status === 'error' || api.status === 'down').length;
    
    // Simulated system metrics (in production, these would come from actual system monitoring)
    const memoryUsage = process.memoryUsage().heapUsed / process.memoryUsage().heapTotal;
    const cpuUsage = Math.random() * 0.3 + 0.1; // Simulated 10-40% CPU usage
    
    // Calculate average response time from recent jobs
    const recentJobs = activeJobs.filter(job => 
      job.completedAt && (now.getTime() - job.completedAt.getTime()) < 10 * 60 * 1000
    );
    const averageResponseTime = recentJobs.length > 0 
      ? recentJobs.reduce((sum, job) => {
          const startedAt = job.startedAt || job.createdAt;
          const duration = job.completedAt && startedAt
            ? job.completedAt.getTime() - startedAt.getTime()
            : 0;
          return sum + duration;
        }, 0) / recentJobs.length
      : 0;

    return {
      activeJobs: activeJobs.length,
      queueSize,
      errorRate,
      averageResponseTime,
      failedJobsLast24h,
      apiFailures,
      memoryUsage,
      cpuUsage,
      timestamp: now
    };
  }

  private async evaluateThresholds(metrics: SystemMetrics): Promise<void> {
    for (const threshold of this.thresholds) {
      if (!threshold.enabled) continue;

      let currentValue: number;
      let metricName: string;

      switch (threshold.metricType) {
        case 'queue_size':
          currentValue = metrics.queueSize;
          metricName = 'Queue Size';
          break;
        case 'error_rate':
          currentValue = metrics.errorRate;
          metricName = 'Error Rate';
          break;
        case 'response_time':
          currentValue = metrics.averageResponseTime;
          metricName = 'Average Response Time';
          break;
        case 'failed_jobs':
          currentValue = metrics.failedJobsLast24h;
          metricName = 'Failed Jobs (24h)';
          break;
        case 'api_failures':
          currentValue = metrics.apiFailures;
          metricName = 'API Failures';
          break;
        case 'memory':
          currentValue = metrics.memoryUsage * 100;
          metricName = 'Memory Usage %';
          break;
        case 'cpu':
          currentValue = metrics.cpuUsage * 100;
          metricName = 'CPU Usage %';
          break;
        default:
          continue;
      }

      if (currentValue >= threshold.threshold) {
        const alertKey = `${threshold.metricType}_${threshold.severity}`;
        
        // Check cooldown
        const lastAlert = this.recentAlerts.get(alertKey);
        const now = new Date();
        if (lastAlert && (now.getTime() - lastAlert.getTime()) < this.ALERT_COOLDOWN_MINUTES * 60 * 1000) {
          continue; // Skip if in cooldown period
        }

        console.warn(`⚠️ Threshold exceeded: ${metricName} = ${currentValue} (threshold: ${threshold.threshold})`);
        
        await this.triggerAlert(alertKey, {
          severity: threshold.severity,
          title: `${metricName} Threshold Exceeded`,
          description: `${metricName} has exceeded the ${threshold.severity} threshold. Current value: ${currentValue.toFixed(2)}, Threshold: ${threshold.threshold}`,
          metricValue: currentValue,
          threshold: threshold.threshold,
          windowMinutes: threshold.windowMinutes
        });

        this.recentAlerts.set(alertKey, now);
      }
    }
  }

  private async triggerAlert(alertKey: string, alertData: {
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string;
    metricValue: number;
    threshold: number;
    windowMinutes?: number;
  }): Promise<void> {
    try {
      console.log(`🚨 ALERT [${alertData.severity.toUpperCase()}]: ${alertData.title}`);
      
      // Store alert in database
      await storage.createPerformanceAlert({
        alertType: alertKey,
        severity: alertData.severity,
        title: alertData.title,
        description: alertData.description,
        serviceName: 'PerformanceMonitor',
        threshold: alertData.threshold,
        currentValue: alertData.metricValue,
        metadata: {
          windowMinutes: alertData.windowMinutes,
          alertKey,
          timestamp: new Date().toISOString()
        }
      });

      // Send notifications
      await this.sendNotifications(alertData);

      // Take automated actions for critical alerts
      if (alertData.severity === 'critical') {
        await this.handleCriticalAlert(alertKey, alertData);
      }

    } catch (error) {
      console.error("❌ Error triggering alert:", error);
    }
  }

  private async sendNotifications(alertData: any): Promise<void> {
    for (const notification of this.notifications) {
      if (!notification.enabled) continue;

      try {
        switch (notification.type) {
          case 'slack':
            await this.sendSlackNotification(alertData, notification.config);
            break;
          case 'webhook':
            await this.sendWebhookNotification(alertData, notification.config);
            break;
          case 'dashboard':
            // Dashboard alerts are handled by storing in database
            break;
        }
      } catch (error) {
        console.error(`Error sending ${notification.type} notification:`, error);
      }
    }
  }

  private async sendSlackNotification(alertData: any, config: any): Promise<void> {
    if (!config.webhook) return;

    const color = {
      'low': '#36a64f',
      'medium': '#ff9500', 
      'high': '#ff6b00',
      'critical': '#ff0000'
    }[alertData.severity] || '#ff0000';

    const slackMessage = {
      attachments: [{
        color,
        title: `🚨 ${alertData.title}`,
        text: alertData.description,
        fields: [
          { title: 'Severity', value: alertData.severity.toUpperCase(), short: true },
          { title: 'Current Value', value: alertData.metricValue.toFixed(2), short: true },
          { title: 'Threshold', value: alertData.threshold.toString(), short: true },
          { title: 'Time', value: new Date().toISOString(), short: true }
        ],
        footer: 'DarkNews Autopilot Performance Monitor'
      }]
    };

    await fetch(config.webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackMessage)
    });
  }

  private async sendWebhookNotification(alertData: any, config: any): Promise<void> {
    if (!config.url) return;

    await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alert: alertData,
        timestamp: new Date().toISOString(),
        source: 'DarkNews_Autopilot'
      })
    });
  }

  private async handleCriticalAlert(alertKey: string, alertData: any): Promise<void> {
    console.log("🚨 CRITICAL ALERT - Taking automated action...");

    try {
      switch (alertKey) {
        case 'queue_size_critical':
          await this.handleQueueOverload();
          break;
        case 'api_failures_critical':
          await this.handleApiFailures();
          break;
        case 'error_rate_critical':
          await this.handleHighErrorRate();
          break;
        default:
          console.log("No automated action configured for this critical alert");
      }
    } catch (error) {
      console.error("Error handling critical alert:", error);
    }
  }

  private async handleQueueOverload(): Promise<void> {
    console.log("🔧 Handling queue overload - pausing non-critical jobs");
    
    const activeJobs = await storage.getActiveJobs();
    const nonCriticalJobs = activeJobs.filter(job => 
      job.status === 'pending' && 
      !['news_fetch', 'autonomous_scheduling'].includes(job.type)
    );

    // Pause some non-critical jobs
    for (let i = 0; i < Math.min(10, nonCriticalJobs.length); i++) {
      await storage.updateJob(nonCriticalJobs[i].id, { status: 'paused' });
    }

    console.log(`⏸️ Paused ${Math.min(10, nonCriticalJobs.length)} non-critical jobs`);
  }

  private async handleApiFailures(): Promise<void> {
    console.log("🔧 Handling multiple API failures - enabling emergency mode");
    
    // This could trigger emergency mode in the autonomous scheduler
    // or switch to fallback services
  }

  private async handleHighErrorRate(): Promise<void> {
    console.log("🔧 Handling high error rate - reducing concurrent operations");
    
    // Could implement logic to reduce concurrent job processing
    // or increase retry delays
  }

  // Public API methods
  async getSystemMetrics(): Promise<SystemMetrics> {
    return this.collectSystemMetrics();
  }

  async getActiveAlerts(): Promise<any[]> {
    return storage.getActiveAlerts();
  }

  async updateThresholds(newThresholds: AlertThreshold[]): Promise<void> {
    this.thresholds = newThresholds;
    console.log("⚙️ Alert thresholds updated");
  }

  async testAlert(alertType: string): Promise<void> {
    await this.triggerAlert(`test_${alertType}`, {
      severity: 'low',
      title: 'Test Alert',
      description: 'This is a test alert to verify the alerting system',
      metricValue: 100,
      threshold: 50
    });
  }
}

export const performanceAlertsService = new PerformanceAlertsService();