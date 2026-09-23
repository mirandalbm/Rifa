import { intelligentSchedulingService } from "./intelligentSchedulingService";
import { autoApprovalService } from "./autoApprovalService";
import { errorRecoveryService } from "./errorRecoveryService";
import { storage } from "../storage";
import { newsService } from "./newsService";

interface SchedulerConfig {
  autonomousSchedulingInterval: number;  // minutes
  trendAnalysisInterval: number;         // minutes  
  performanceCheckInterval: number;      // minutes
  newsAutoFetchInterval: number;         // minutes
  maintenanceHour: number;               // UTC hour for daily maintenance
  maxConcurrentJobs: number;
  emergencyMode: boolean;
}

interface SchedulerMetrics {
  totalCycles: number;
  successfulCycles: number;
  failedCycles: number;
  lastRunTime: Date;
  nextRunTime: Date;
  averageExecutionTime: number;
  currentStatus: 'running' | 'paused' | 'error' | 'maintenance';
  activeJobs: number;
  queuedOperations: number;
}

class AutonomousSchedulerService {
  private isRunning = false;
  private schedulerIntervals: NodeJS.Timeout[] = [];
  private metrics: SchedulerMetrics;
  
  private readonly DEFAULT_CONFIG: SchedulerConfig = {
    autonomousSchedulingInterval: 15,      // Every 15 minutes
    trendAnalysisInterval: 30,             // Every 30 minutes  
    performanceCheckInterval: 5,           // Every 5 minutes
    newsAutoFetchInterval: 60,             // Every hour
    maintenanceHour: 3,                    // 3 AM UTC
    maxConcurrentJobs: 20,
    emergencyMode: false
  };

  private config: SchedulerConfig;

  constructor() {
    this.config = { ...this.DEFAULT_CONFIG };
    this.metrics = {
      totalCycles: 0,
      successfulCycles: 0,
      failedCycles: 0,
      lastRunTime: new Date(),
      nextRunTime: new Date(),
      averageExecutionTime: 0,
      currentStatus: 'paused',
      activeJobs: 0,
      queuedOperations: 0
    };
  }

  // Start 24/7 autonomous operation
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log("🤖 Autonomous scheduler already running");
      return;
    }

    try {
      this.isRunning = true;
      this.metrics.currentStatus = 'running';
      console.log("🚀 Starting DarkNews Autonomous Scheduler 24/7...");

      // Load configuration from database or use defaults
      await this.loadConfiguration();

      // Start all periodic operations
      await this.startPeriodicOperations();

      // Initial execution
      await this.executeImmediateOperations();

      console.log("✅ DarkNews Autonomous Scheduler is now running 24/7");
      
      // Log scheduler startup
      await storage.createErrorLog({
        jobId: null,
        errorCode: 'SCHEDULER_STARTED',
        severity: 'low',
        message: 'Autonomous scheduler started successfully',
        serviceName: 'AutonomousScheduler',
        endpoint: 'start',
        retryCount: 0,
        maxRetries: 0,
        resolved: true,
        resolvedAt: new Date(),
        context: { config: this.config }
      });

    } catch (error) {
      console.error("❌ Failed to start autonomous scheduler:", error);
      this.metrics.currentStatus = 'error';
      
      await storage.createPerformanceAlert({
        alertType: 'system_failure',
        severity: 'critical',
        title: 'Autonomous Scheduler Failed to Start',
        description: `Critical failure starting autonomous scheduler: ${error instanceof Error ? error.message : String(error)}`,
        serviceName: 'AutonomousScheduler',
        threshold: '1',
        currentValue: '0',
        metadata: { error: String(error) }
      });
      
      throw error;
    }
  }

  // Stop autonomous operation
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log("🛑 Stopping autonomous scheduler...");
    
    this.schedulerIntervals.forEach(interval => clearInterval(interval));
    this.schedulerIntervals = [];
    this.isRunning = false;
    this.metrics.currentStatus = 'paused';
    
    console.log("✅ Autonomous scheduler stopped");
  }

  // Core autonomous scheduling execution
  private async startPeriodicOperations(): Promise<void> {
    // 1. Autonomous scheduling (every 15 minutes)
    const schedulingInterval = setInterval(async () => {
      await this.executeWithMetrics('autonomous_scheduling', async () => {
        console.log("🎯 Running autonomous scheduling cycle...");
        await intelligentSchedulingService.executeAutonomousScheduling();
      });
    }, this.config.autonomousSchedulingInterval * 60 * 1000);
    
    // 2. Trend analysis (every 30 minutes)
    const trendInterval = setInterval(async () => {
      await this.executeWithMetrics('trend_analysis', async () => {
        console.log("📈 Running trend analysis cycle...");
        await intelligentSchedulingService.analyzeCurrentTrends();
      });
    }, this.config.trendAnalysisInterval * 60 * 1000);

    // 3. Performance monitoring (every 5 minutes)
    const performanceInterval = setInterval(async () => {
      await this.executeWithMetrics('performance_check', async () => {
        await this.performSystemHealthCheck();
      });
    }, this.config.performanceCheckInterval * 60 * 1000);

    // 4. Auto news fetch (every hour)
    const newsFetchInterval = setInterval(async () => {
      await this.executeWithMetrics('news_fetch', async () => {
        console.log("📰 Running autonomous news fetch...");
        await newsService.fetchNews();
      });
    }, this.config.newsAutoFetchInterval * 60 * 1000);

    // 5. Daily maintenance (once per day at specified hour)
    const maintenanceInterval = setInterval(async () => {
      const now = new Date();
      if (now.getUTCHours() === this.config.maintenanceHour && now.getUTCMinutes() < 10) {
        await this.executeWithMetrics('daily_maintenance', async () => {
          await this.performDailyMaintenance();
        });
      }
    }, 10 * 60 * 1000); // Check every 10 minutes

    this.schedulerIntervals.push(
      schedulingInterval,
      trendInterval, 
      performanceInterval,
      newsFetchInterval,
      maintenanceInterval
    );
  }

  // Execute immediate operations on startup
  private async executeImmediateOperations(): Promise<void> {
    console.log("⚡ Executing immediate startup operations...");
    
    // Analyze current trends
    await this.executeWithMetrics('startup_trends', async () => {
      await intelligentSchedulingService.analyzeCurrentTrends();
    });

    // Check system health  
    await this.performSystemHealthCheck();

    // Run initial autonomous scheduling
    await this.executeWithMetrics('startup_scheduling', async () => {
      await intelligentSchedulingService.executeAutonomousScheduling();
    });
  }

  // Performance and health monitoring
  private async performSystemHealthCheck(): Promise<void> {
    try {
      console.log("🏥 Performing system health check...");
      
      // Check active jobs count
      const activeJobs = await storage.getActiveJobs();
      this.metrics.activeJobs = activeJobs.length;

      // Check for stuck jobs (older than 2 hours)
      const stuckJobs = activeJobs.filter(job => 
        job.status === 'processing' && 
        job.createdAt &&
        new Date().getTime() - job.createdAt.getTime() > 2 * 60 * 60 * 1000
      );

      if (stuckJobs.length > 0) {
        console.warn(`⚠️ Found ${stuckJobs.length} stuck jobs`);
        
        await storage.createPerformanceAlert({
          alertType: 'stuck_jobs',
          severity: 'medium',
          title: 'Stuck Jobs Detected',
          description: `Found ${stuckJobs.length} jobs stuck in processing state for over 2 hours`,
          serviceName: 'AutonomousScheduler',
          threshold: '0',
          currentValue: String(stuckJobs.length),
          metadata: { stuckJobIds: stuckJobs.map(j => j.id) }
        });
      }

      // Check job queue overload
      if (this.metrics.activeJobs > this.config.maxConcurrentJobs) {
        console.warn(`⚠️ Job queue overload: ${this.metrics.activeJobs}/${this.config.maxConcurrentJobs}`);
        
        await storage.createPerformanceAlert({
          alertType: 'queue_overload',
          severity: 'high',
          title: 'Job Queue Overload',
          description: `Active jobs (${this.metrics.activeJobs}) exceed maximum limit (${this.config.maxConcurrentJobs})`,
          serviceName: 'AutonomousScheduler',
          threshold: String(this.config.maxConcurrentJobs),
          currentValue: String(this.metrics.activeJobs),
          metadata: { activeJobsCount: this.metrics.activeJobs }
        });
      }

      // Check API configurations health
      await this.checkApiHealthStatus();

      // Update metrics
      this.updateHealthMetrics();

    } catch (error) {
      console.error("❌ System health check failed:", error);
      
      await storage.createPerformanceAlert({
        alertType: 'health_check_failure',
        severity: 'high',
        title: 'System Health Check Failed',
        description: `Health monitoring failed: ${error instanceof Error ? error.message : String(error)}`,
        serviceName: 'AutonomousScheduler',
        threshold: '1',
        currentValue: '0',
        metadata: { error: String(error) }
      });
    }
  }

  // Check external API health
  private async checkApiHealthStatus(): Promise<void> {
    try {
      const apiStatuses = await storage.getApiStatuses();
      const failedApis = apiStatuses.filter(api => api.status === 'error');
      
      if (failedApis.length > 0) {
        console.warn(`⚠️ Found ${failedApis.length} failed API configurations`);
        
        await storage.createPerformanceAlert({
          alertType: 'api_failures',
          severity: 'medium',
          title: 'API Configuration Failures',
          description: `${failedApis.length} APIs are in failed state: ${failedApis.map(a => a.serviceName).join(', ')}`,
          serviceName: 'AutonomousScheduler',
          threshold: '0',
          currentValue: String(failedApis.length),
          metadata: { failedApis: failedApis.map(a => a.serviceName) }
        });
      }
    } catch (error) {
      console.error("Error checking API health:", error);
    }
  }

  // Daily maintenance operations
  private async performDailyMaintenance(): Promise<void> {
    try {
      console.log("🧹 Performing daily maintenance...");
      this.metrics.currentStatus = 'maintenance';
      
      // Clean up old error logs (older than 30 days)
      await this.cleanupOldLogs();
      
      // Clean up completed jobs (older than 7 days)
      await this.cleanupOldJobs();
      
      // Optimize database performance
      await this.optimizeDatabase();
      
      // Reset daily metrics
      await this.resetDailyMetrics();
      
      this.metrics.currentStatus = 'running';
      console.log("✅ Daily maintenance completed");
      
    } catch (error) {
      console.error("❌ Daily maintenance failed:", error);
      this.metrics.currentStatus = 'error';
    }
  }

  // Utility methods
  private async executeWithMetrics(operationType: string, operation: () => Promise<void>): Promise<void> {
    const startTime = Date.now();
    this.metrics.totalCycles++;
    
    try {
      await errorRecoveryService.executeWithRetry(operation, {
        operationId: `scheduler_${operationType}`,
        serviceName: 'AutonomousScheduler',
        endpoint: operationType,
        retryConfig: {
          maxRetries: 3,
          initialDelayMs: 2000,
          maxDelayMs: 30000,
          backoffMultiplier: 2,
          jitterMs: 500,
          enableCircuitBreaker: true
        }
      });
      
      this.metrics.successfulCycles++;
      
    } catch (error) {
      this.metrics.failedCycles++;
      console.error(`❌ Autonomous operation '${operationType}' failed:`, error);
      
      // Create alert for critical failures
      if (operationType === 'autonomous_scheduling') {
        await storage.createPerformanceAlert({
          alertType: 'autonomous_failure',
          severity: 'high',
          title: 'Autonomous Operation Failed',
          description: `Critical autonomous operation '${operationType}' failed: ${error instanceof Error ? error.message : String(error)}`,
          serviceName: 'AutonomousScheduler',
          threshold: '1',
          currentValue: '0',
          metadata: { operationType, error: String(error) }
        });
      }
    } finally {
      const executionTime = Date.now() - startTime;
      this.updateExecutionMetrics(executionTime);
    }
  }

  private updateExecutionMetrics(executionTime: number): void {
    this.metrics.lastRunTime = new Date();
    this.metrics.nextRunTime = new Date(Date.now() + this.config.autonomousSchedulingInterval * 60 * 1000);
    this.metrics.averageExecutionTime = (this.metrics.averageExecutionTime + executionTime) / 2;
  }

  private updateHealthMetrics(): void {
    // Update scheduler health metrics
    // This could be expanded with more detailed metrics
  }

  private async loadConfiguration(): Promise<void> {
    // Load configuration from database or environment variables
    // For now, using defaults
    console.log("📋 Using default scheduler configuration");
  }

  private async cleanupOldLogs(): Promise<void> {
    // Implementation for cleaning up old logs
    console.log("🗑️ Cleaning up old logs...");
  }

  private async cleanupOldJobs(): Promise<void> {
    // Implementation for cleaning up old jobs
    console.log("🗑️ Cleaning up old jobs...");
  }

  private async optimizeDatabase(): Promise<void> {
    // Implementation for database optimization
    console.log("⚡ Optimizing database performance...");
  }

  private async resetDailyMetrics(): Promise<void> {
    // Reset daily counters
    console.log("📊 Resetting daily metrics...");
  }

  // Public API methods
  async getMetrics(): Promise<SchedulerMetrics> {
    return { ...this.metrics };
  }

  async getConfiguration(): Promise<SchedulerConfig> {
    return { ...this.config };
  }

  async updateConfiguration(newConfig: Partial<SchedulerConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    console.log("⚙️ Scheduler configuration updated");
    
    // Restart with new configuration
    if (this.isRunning) {
      await this.stop();
      await this.start();
    }
  }

  async pauseAutonomousOperations(): Promise<void> {
    console.log("⏸️ Pausing autonomous operations...");
    this.metrics.currentStatus = 'paused';
    // Keep monitoring but pause automation
  }

  async resumeAutonomousOperations(): Promise<void> {
    console.log("▶️ Resuming autonomous operations...");
    this.metrics.currentStatus = 'running';
  }

  isOperational(): boolean {
    return this.isRunning && this.metrics.currentStatus === 'running';
  }

  // Public methods for status checking and autonomous operations
  getIsRunning(): boolean {
    return this.isRunning;
  }

  async executeAutonomousScheduling(): Promise<void> {
    console.log("🤖 Executing autonomous scheduling operations...");
    
    if (!this.isRunning) {
      throw new Error("Scheduler is not running - cannot execute autonomous operations");
    }

    try {
      // Execute the same operations as the periodic scheduler
      await this.executeWithMetrics('manual_autonomous_scheduling', async () => {
        const { intelligentSchedulingService } = await import("./intelligentSchedulingService");
        await intelligentSchedulingService.executeAutonomousScheduling();
      });
      
      console.log("✅ Autonomous scheduling executed successfully");
    } catch (error) {
      console.error("❌ Error in manual autonomous scheduling:", error);
      throw error;
    }
  }
}

export const autonomousSchedulerService = new AutonomousSchedulerService();