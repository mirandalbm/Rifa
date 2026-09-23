import {
  users,
  newsArticles,
  videos,
  youtubeChannels,
  processingJobs,
  systemMetrics,
  apiStatus,
  apiConfigurations,
  trendingTopics,
  schedulingRules,
  approvalWorkflows,
  errorLogs,
  resourceMetrics,
  performanceAlerts,
  batchQueues,
  type User,
  type UpsertUser,
  type NewsArticle,
  type InsertNewsArticle,
  type Video,
  type InsertVideo,
  type YoutubeChannel,
  type InsertYoutubeChannel,
  type ProcessingJob,
  type InsertProcessingJob,
  type SystemMetric,
  type InsertSystemMetric,
  type ApiStatus,
  type InsertApiStatus,
  type ApiConfiguration,
  type InsertApiConfiguration,
  type TrendingTopic,
  type InsertTrendingTopic,
  type SchedulingRule,
  type ApprovalWorkflow,
  type InsertApprovalWorkflow,
  type ErrorLog,
  type InsertErrorLog,
  type ResourceMetric,
  type InsertResourceMetric,
  type PerformanceAlert,
  type InsertPerformanceAlert,
  type BatchQueue,
  type DashboardStats,
  type InsertBatchQueue,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, count, gte, lt, isNull } from "drizzle-orm";

export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

  // News operations
  createNewsArticle(article: InsertNewsArticle): Promise<NewsArticle>;
  getNewsArticles(limit?: number): Promise<NewsArticle[]>;
  getNewsArticleById(id: string): Promise<NewsArticle | null>;
  updateNewsArticleStatus(id: string, status: 'discovered' | 'processed' | 'approved' | 'rejected'): Promise<void>;

  // Video operations
  createVideo(video: InsertVideo): Promise<Video>;
  getVideos(limit?: number): Promise<Video[]>;
  getVideosByStatus(status: string): Promise<Video[]>;
  getVideoByArticleAndLanguage(articleId: string, language: string): Promise<Video | undefined>;
  getVideosByLanguageAndDate(language: string, date: string): Promise<Video[]>;
  updateVideoStatus(id: string, status: string): Promise<void>;
  updateVideoYoutubeId(id: string, youtubeId: string): Promise<void>;
  getVideoStats(): Promise<{
    totalVideos: number;
    todayVideos: number;
    processingVideos: number;
    successRate: number;
  }>;
  updateVideoProgress(id: string, progress: number): Promise<void>;

  // Channel operations
  getYoutubeChannels(): Promise<YoutubeChannel[]>;
  createYoutubeChannel(channel: InsertYoutubeChannel): Promise<YoutubeChannel>;

  // Job operations
  createJob(job: InsertProcessingJob): Promise<ProcessingJob>;
  getActiveJobs(): Promise<ProcessingJob[]>;
  updateJobProgress(id: string, progress: number): Promise<void>;
  completeJob(id: string, status: 'completed' | 'failed', error?: string): Promise<void>;
  updateJob(id: string, updates: Partial<any>): Promise<any>;

  // Metrics operations
  recordMetric(metric: InsertSystemMetric): Promise<void>;
  getMetrics(metricName: string, hours?: number): Promise<SystemMetric[]>;

  // Trending Topics operations
  createTrendingTopic(topic: InsertTrendingTopic): Promise<TrendingTopic>;
  updateTrendingTopicScore(id: string, trendScore: number, viralPotential: number): Promise<void>;
  getTrendingTopics(limit?: number): Promise<TrendingTopic[]>;
  getActiveTrendingTopics(language?: string): Promise<TrendingTopic[]>;

  // Workflow operations
  getWorkflowByContent(contentId: string, workflowType: string): Promise<ApprovalWorkflow | undefined>;
  createApprovalWorkflow(workflow: InsertApprovalWorkflow): Promise<ApprovalWorkflow>;

  // API status operations
  updateApiStatus(status: InsertApiStatus): Promise<void>;
  getApiStatuses(): Promise<ApiStatus[]>;

  // API Configuration operations
  getApiConfiguration(userId: string, serviceId: string): Promise<ApiConfiguration | undefined>;
  getAllApiConfigurations(userId: string): Promise<ApiConfiguration[]>;
  upsertApiConfiguration(userId: string, serviceId: string, config: {
    serviceName: string;
    isActive: boolean;
    encryptedConfig: string;
    status: 'active' | 'inactive' | 'error';
  }): Promise<ApiConfiguration>;
  updateApiConfigStatus(userId: string, serviceId: string, status: 'active' | 'inactive' | 'error'): Promise<void>;

  // Dashboard data
  getDashboardStats(): Promise<DashboardStats>;

  // Advanced automation operations
  // Trending Topics
  createTrendingTopic(topic: InsertTrendingTopic): Promise<TrendingTopic>;
  getTrendingTopics(limit?: number): Promise<TrendingTopic[]>;
  updateTrendingTopicScore(id: string, trendScore: number, viralPotential: number): Promise<void>;
  getActiveTrendingTopics(language?: string): Promise<TrendingTopic[]>;

  // Scheduling Rules
  getActiveSchedulingRules(strategy?: string): Promise<SchedulingRule[]>;

  // Error Tracking
  createErrorLog(error: InsertErrorLog): Promise<ErrorLog>;
  getErrorLogs(severity?: string, resolved?: boolean): Promise<ErrorLog[]>;
  updateErrorRetryCount(id: string, count: number, nextRetryAt?: Date): Promise<void>;
  markErrorResolved(id: string, notes?: string): Promise<void>;
  getUnresolvedErrors(): Promise<ErrorLog[]>;

  // Resource Metrics
  recordResourceMetric(metric: InsertResourceMetric): Promise<void>;
  getResourceMetrics(resourceType?: string, hours?: number): Promise<ResourceMetric[]>;
  getCurrentResourceUsage(): Promise<ResourceMetric[]>;

  // Performance Alerts
  createPerformanceAlert(alert: InsertPerformanceAlert): Promise<PerformanceAlert>;
  getActiveAlerts(): Promise<PerformanceAlert[]>;
  acknowledgeAlert(id: string, acknowledgedBy: string): Promise<void>;
  resolveAlert(id: string): Promise<void>;

  // Batch Processing
  createBatchQueue(batch: InsertBatchQueue): Promise<BatchQueue>;
  getBatchQueues(status?: string): Promise<BatchQueue[]>;
  updateBatchProgress(id: string, completedJobs: number, failedJobs: number): Promise<void>;
  completeBatch(id: string, results: any): Promise<void>;

  // System Resource Management
  updateSystemResourceLimits(limits: {
    maxConcurrentJobs: number;
    maxQueueSize: number;
    throttleLevel: number;
    timestamp: Date;
  }): Promise<void>;

  // Job status and type filtering
  getJobsByStatus(status: string): Promise<ProcessingJob[]>;
  getJobsByType(type: string): Promise<ProcessingJob[]>;

  // Autonomy testing
  storeAutonomyReport(report: any): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // User operations (mandatory for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // News operations
  async createNewsArticle(article: InsertNewsArticle): Promise<NewsArticle> {
    const [newArticle] = await db.insert(newsArticles).values(article).returning();
    return newArticle;
  }

  async getNewsArticles(limit = 50): Promise<NewsArticle[]> {
    return await db
      .select()
      .from(newsArticles)
      .orderBy(desc(newsArticles.createdAt))
      .limit(limit);
  }

  async getNewsArticleById(id: string): Promise<NewsArticle | null> {
    const [article] = await db
      .select()
      .from(newsArticles)
      .where(eq(newsArticles.id, id));
    return article || null;
  }

  async updateNewsArticleStatus(id: string, status: 'discovered' | 'processed' | 'approved' | 'rejected'): Promise<void> {
    await db
      .update(newsArticles)
      .set({ status, updatedAt: new Date() })
      .where(eq(newsArticles.id, id));
  }

  // Video operations
  async createVideo(video: InsertVideo): Promise<Video> {
    const [newVideo] = await db.insert(videos).values(video).returning();
    return newVideo;
  }

  async getVideos(limit = 50): Promise<Video[]> {
    return await db
      .select()
      .from(videos)
      .orderBy(desc(videos.createdAt))
      .limit(limit);
  }

  async getVideosByStatus(status: string): Promise<Video[]> {
    return await db
      .select()
      .from(videos)
      .where(eq(videos.status, status as any))
      .orderBy(desc(videos.createdAt));
  }

  async getVideoByArticleAndLanguage(articleId: string, language: string): Promise<Video | undefined> {
    const [video] = await db
      .select()
      .from(videos)
      .where(and(eq(videos.newsArticleId, articleId), eq(videos.language, language as any)))
      .limit(1);
    return video;
  }

  // `date` is any string accepted by `new Date()` (e.g. `new Date().toDateString()`)
  async getVideosByLanguageAndDate(language: string, date: string): Promise<Video[]> {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return await db
      .select()
      .from(videos)
      .where(and(
        eq(videos.language, language as any),
        gte(videos.createdAt, start),
        lt(videos.createdAt, end)
      ))
      .orderBy(desc(videos.createdAt));
  }

  async updateVideoStatus(id: string, status: string): Promise<void> {
    await db
      .update(videos)
      .set({ status: status as any, updatedAt: new Date() })
      .where(eq(videos.id, id));
  }

  async updateVideoYoutubeId(id: string, youtubeId: string): Promise<void> {
    await db
      .update(videos)
      .set({ youtubeVideoId: youtubeId, updatedAt: new Date() })
      .where(eq(videos.id, id));
  }

  async updateJob(id: string, updates: Partial<any>): Promise<any> {
    const [job] = await db
      .update(processingJobs)
      .set(updates)
      .where(eq(processingJobs.id, id))
      .returning();
    return job;
  }

  // Channel operations
  async getYoutubeChannels(): Promise<YoutubeChannel[]> {
    return await db.select().from(youtubeChannels).where(eq(youtubeChannels.isActive, true));
  }

  async createYoutubeChannel(channel: InsertYoutubeChannel): Promise<YoutubeChannel> {
    const [newChannel] = await db.insert(youtubeChannels).values(channel).returning();
    return newChannel;
  }

  // Job operations
  async createJob(job: InsertProcessingJob): Promise<ProcessingJob> {
    const [newJob] = await db.insert(processingJobs).values(job).returning();
    return newJob;
  }

  async getActiveJobs(): Promise<ProcessingJob[]> {
    return await db
      .select()
      .from(processingJobs)
      .where(eq(processingJobs.status, 'processing'))
      .orderBy(desc(processingJobs.createdAt));
  }

  async updateJobProgress(id: string, progress: number): Promise<void> {
    await db
      .update(processingJobs)
      .set({ progress })
      .where(eq(processingJobs.id, id));
  }

  async completeJob(id: string, status: 'completed' | 'failed', error?: string): Promise<void> {
    await db
      .update(processingJobs)
      .set({ 
        status: status as any, 
        completedAt: new Date(),
        error: error || null
      })
      .where(eq(processingJobs.id, id));
  }

  // Metrics operations
  async recordMetric(metric: InsertSystemMetric): Promise<void> {
    await db.insert(systemMetrics).values(metric);
  }

  async getMetrics(metricName: string, hours = 24): Promise<SystemMetric[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    return await db
      .select()
      .from(systemMetrics)
      .where(and(
        eq(systemMetrics.metricName, metricName),
        sql`${systemMetrics.timestamp} >= ${since}`
      ))
      .orderBy(desc(systemMetrics.timestamp));
  }

  // API status operations
  async updateApiStatus(status: InsertApiStatus): Promise<void> {
    await db
      .insert(apiStatus)
      .values(status)
      .onConflictDoUpdate({
        target: apiStatus.serviceName,
        set: {
          status: status.status,
          responseTime: status.responseTime,
          lastChecked: new Date(),
        },
      });
  }

  async getApiStatuses(): Promise<ApiStatus[]> {
    return await db.select().from(apiStatus).orderBy(apiStatus.serviceName);
  }

  // Dashboard data
  async getDashboardStats(): Promise<DashboardStats> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalVideosResult] = await db.select({ count: count() }).from(videos);
    const [videosTodayResult] = await db
      .select({ count: count() })
      .from(videos)
      .where(sql`${videos.createdAt} >= ${today}`);

    const [totalViewsResult] = await db
      .select({ sum: sql<number>`COALESCE(SUM(${videos.views}), 0)` })
      .from(videos);

    const [totalSubscribersResult] = await db
      .select({ sum: sql<number>`COALESCE(SUM(${youtubeChannels.subscriberCount}), 0)` })
      .from(youtubeChannels);

    const [activeChannelsResult] = await db
      .select({ count: count() })
      .from(youtubeChannels)
      .where(eq(youtubeChannels.isActive, true));

    const [successfulJobs] = await db
      .select({ count: count() })
      .from(processingJobs)
      .where(eq(processingJobs.status, 'completed'));

    const [totalJobs] = await db.select({ count: count() }).from(processingJobs);

    const successRate = totalJobs.count > 0 ? Math.round((successfulJobs.count / totalJobs.count) * 100) : 100;

    return {
      totalVideos: totalVideosResult.count,
      videosToday: videosTodayResult.count,
      totalViews: totalViewsResult.sum || 0,
      totalSubscribers: totalSubscribersResult.sum || 0,
      activeChannels: activeChannelsResult.count,
      successRate,
    };
  }

  // News statistics
  async getNewsStats(): Promise<any> {
    const [newsStats] = await db
      .select({
        totalNews: count(),
        todayNews: count(sql`case when DATE(${newsArticles.createdAt}) = DATE(NOW()) then 1 end`),
        approvedNews: count(sql`case when ${newsArticles.status} = 'approved' then 1 end`),
        averageScore: sql<number>`CAST(AVG(${newsArticles.viralScore}) AS INTEGER)`,
      })
      .from(newsArticles);

    return newsStats;
  }

  // News sources
  async getNewsSources(): Promise<string[]> {
    const sources = await db
      .selectDistinct({ source: newsArticles.source })
      .from(newsArticles)
      .where(sql`${newsArticles.source} IS NOT NULL`);
    
    return sources.map(s => s.source).filter(Boolean);
  }

  // API Configuration operations
  async getApiConfiguration(userId: string, serviceId: string): Promise<ApiConfiguration | undefined> {
    const [config] = await db
      .select()
      .from(apiConfigurations)
      .where(and(
        eq(apiConfigurations.userId, userId),
        eq(apiConfigurations.serviceId, serviceId)
      ));
    return config;
  }

  async getAllApiConfigurations(userId: string): Promise<ApiConfiguration[]> {
    return await db
      .select()
      .from(apiConfigurations)
      .where(eq(apiConfigurations.userId, userId))
      .orderBy(apiConfigurations.serviceName);
  }

  async upsertApiConfiguration(userId: string, serviceId: string, config: {
    serviceName: string;
    isActive: boolean;
    encryptedConfig: string;
    status: 'active' | 'inactive' | 'error';
  }): Promise<ApiConfiguration> {
    const [result] = await db
      .insert(apiConfigurations)
      .values({
        userId,
        serviceId,
        serviceName: config.serviceName,
        isActive: config.isActive,
        encryptedConfig: config.encryptedConfig,
        status: config.status,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [apiConfigurations.userId, apiConfigurations.serviceId],
        set: {
          serviceName: config.serviceName,
          isActive: config.isActive,
          encryptedConfig: config.encryptedConfig,
          status: config.status,
          updatedAt: new Date(),
        },
      })
      .returning();
    
    return result;
  }

  async updateApiConfigStatus(userId: string, serviceId: string, status: 'active' | 'inactive' | 'error'): Promise<void> {
    await db
      .update(apiConfigurations)
      .set({ 
        status,
        lastTested: new Date(),
        updatedAt: new Date()
      })
      .where(and(
        eq(apiConfigurations.userId, userId),
        eq(apiConfigurations.serviceId, serviceId)
      ));
  }

  // Video statistics
  async getVideoStats(): Promise<{
    totalVideos: number;
    todayVideos: number;
    processingVideos: number;
    successRate: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalVideosResult] = await db.select({ count: count() }).from(videos);
    const [videosTodayResult] = await db
      .select({ count: count() })
      .from(videos)
      .where(sql`${videos.createdAt} >= ${today}`);
    
    const [processingVideosResult] = await db
      .select({ count: count() })
      .from(videos)
      .where(sql`${videos.status} IN ('generating', 'processing')`);
    
    const [completedVideos] = await db
      .select({ count: count() })
      .from(videos)
      .where(sql`${videos.status} IN ('ready', 'approved', 'published')`);
    
    const [failedVideos] = await db
      .select({ count: count() })
      .from(videos)
      .where(eq(videos.status, 'failed'));
    
    const total = completedVideos.count + failedVideos.count;
    const successRate = total > 0 ? Math.round((completedVideos.count / total) * 100) : 100;

    return {
      totalVideos: totalVideosResult.count,
      todayVideos: videosTodayResult.count,
      processingVideos: processingVideosResult.count,
      successRate
    };
  }

  // Update video progress
  async updateVideoProgress(id: string, progress: number): Promise<void> {
    await db
      .update(videos)
      .set({ 
        progress,
        updatedAt: new Date() 
      })
      .where(eq(videos.id, id));
  }

  // Error Tracking
  async createErrorLog(error: InsertErrorLog): Promise<ErrorLog> {
    const [newError] = await db.insert(errorLogs).values(error).returning();
    return newError;
  }

  async getErrorLogs(severity?: string, resolved?: boolean): Promise<ErrorLog[]> {
    let query = db.select().from(errorLogs).$dynamic();
    
    if (severity || resolved !== undefined) {
      const conditions = [];
      if (severity) {
        conditions.push(eq(errorLogs.severity, severity as any));
      }
      if (resolved !== undefined) {
        conditions.push(eq(errorLogs.resolved, resolved));
      }
      query = query.where(and(...conditions));
    }
    
    return await query.orderBy(desc(errorLogs.occuredAt)).limit(100);
  }

  async updateErrorRetryCount(id: string, count: number, nextRetryAt?: Date): Promise<void> {
    const updateData: any = { 
      retryCount: count
    };
    
    if (nextRetryAt) {
      updateData.nextRetryAt = nextRetryAt;
    }
    
    await db
      .update(errorLogs)
      .set(updateData)
      .where(eq(errorLogs.id, id));
  }

  async markErrorResolved(id: string, notes?: string): Promise<void> {
    await db
      .update(errorLogs)
      .set({ 
        resolved: true,
        resolvedAt: new Date(),
        resolutionNotes: notes || null
      })
      .where(eq(errorLogs.id, id));
  }

  async getUnresolvedErrors(): Promise<ErrorLog[]> {
    return await db
      .select()
      .from(errorLogs)
      .where(eq(errorLogs.resolved, false))
      .orderBy(desc(errorLogs.occuredAt));
  }

  // Resource Metrics
  async recordResourceMetric(metric: InsertResourceMetric): Promise<void> {
    await db.insert(resourceMetrics).values(metric);
  }

  async getResourceMetrics(resourceType?: string, hours = 24): Promise<ResourceMetric[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    let query = db.select().from(resourceMetrics).$dynamic();
    
    if (resourceType) {
      query = query.where(and(
        eq(resourceMetrics.resourceType, resourceType as any),
        sql`${resourceMetrics.timestamp} >= ${since}`
      ));
    } else {
      query = query.where(sql`${resourceMetrics.timestamp} >= ${since}`);
    }
    
    return await query.orderBy(desc(resourceMetrics.timestamp));
  }

  async getCurrentResourceUsage(): Promise<ResourceMetric[]> {
    // Get the latest metric for each resource type
    return await db
      .select()
      .from(resourceMetrics)
      .where(sql`${resourceMetrics.timestamp} >= ${new Date(Date.now() - 5 * 60 * 1000)}`) // Last 5 minutes
      .orderBy(desc(resourceMetrics.timestamp));
  }

  // Performance Alerts
  async createPerformanceAlert(alert: InsertPerformanceAlert): Promise<PerformanceAlert> {
    const [newAlert] = await db.insert(performanceAlerts).values(alert).returning();
    return newAlert;
  }

  async getActiveAlerts(): Promise<PerformanceAlert[]> {
    return await db
      .select()
      .from(performanceAlerts)
      .where(and(
        eq(performanceAlerts.acknowledged, false),
        isNull(performanceAlerts.resolvedAt)
      ))
      .orderBy(desc(performanceAlerts.triggeredAt));
  }

  async acknowledgeAlert(id: string, acknowledgedBy: string): Promise<void> {
    await db
      .update(performanceAlerts)
      .set({ 
        acknowledged: true,
        acknowledgedBy,
        acknowledgedAt: new Date()
      })
      .where(eq(performanceAlerts.id, id));
  }

  async resolveAlert(id: string): Promise<void> {
    await db
      .update(performanceAlerts)
      .set({ 
        isActive: false,
        resolvedAt: new Date()
      })
      .where(eq(performanceAlerts.id, id));
  }

  // Batch Processing
  async createBatchQueue(batch: InsertBatchQueue): Promise<BatchQueue> {
    const [newBatch] = await db.insert(batchQueues).values(batch).returning();
    return newBatch;
  }

  async getBatchQueues(status?: string): Promise<BatchQueue[]> {
    let query = db.select().from(batchQueues).$dynamic();
    
    if (status) {
      query = query.where(eq(batchQueues.status, status as any));
    }
    
    return await query.orderBy(desc(batchQueues.createdAt));
  }

  async updateBatchProgress(id: string, completedJobs: number, failedJobs: number): Promise<void> {
    await db
      .update(batchQueues)
      .set({ 
        completedJobs,
        failedJobs
      })
      .where(eq(batchQueues.id, id));
  }

  async completeBatch(id: string, results: any): Promise<void> {
    await db
      .update(batchQueues)
      .set({ 
        status: 'completed' as any,
        results,
        completedAt: new Date()
      })
      .where(eq(batchQueues.id, id));
  }

  // System Resource Management
  async updateSystemResourceLimits(limits: {
    maxConcurrentJobs: number;
    maxQueueSize: number;
    throttleLevel: number;
    timestamp: Date;
  }): Promise<void> {
    // Store in system metrics for tracking
    await this.recordMetric({
      metricName: 'system_resource_limits',
      value: JSON.stringify(limits)
    });
  }

  // Job status and type filtering
  async getJobsByStatus(status: string): Promise<ProcessingJob[]> {
    return await db
      .select()
      .from(processingJobs)
      .where(eq(processingJobs.status, status as any))
      .orderBy(desc(processingJobs.createdAt));
  }

  async getJobsByType(type: string): Promise<ProcessingJob[]> {
    return await db
      .select()
      .from(processingJobs)
      .where(eq(processingJobs.type, type))
      .orderBy(desc(processingJobs.createdAt));
  }

  // Autonomy testing
  async storeAutonomyReport(report: any): Promise<void> {
    // Store in system metrics for now
    await this.recordMetric({
      metricName: 'autonomy_report',
      value: JSON.stringify({
        timestamp: report.timestamp,
        overallScore: report.overallScore,
        autonomyLevel: report.autonomyLevel,
        testCount: report.tests.length
      })
    });
  }

  // Trending Topics operations
  async createTrendingTopic(topic: InsertTrendingTopic): Promise<TrendingTopic> {
    const [newTopic] = await db.insert(trendingTopics).values(topic).returning();
    return newTopic;
  }

  async updateTrendingTopicScore(id: string, trendScore: number, viralPotential: number): Promise<void> {
    await db
      .update(trendingTopics)
      .set({ trendScore, viralPotential })
      .where(eq(trendingTopics.id, id));
  }

  async getTrendingTopics(limit = 50): Promise<TrendingTopic[]> {
    return await db
      .select()
      .from(trendingTopics)
      .orderBy(desc(trendingTopics.detectedAt))
      .limit(limit);
  }

  // Active Trending Topics
  async getActiveTrendingTopics(language?: string): Promise<TrendingTopic[]> {
    const now = new Date();
    let query = db.select().from(trendingTopics).$dynamic();
    
    if (language) {
      query = query.where(and(
        sql`${trendingTopics.expiresAt} > ${now}`,
        eq(trendingTopics.language, language as any)
      ));
    } else {
      query = query.where(sql`${trendingTopics.expiresAt} > ${now}`);
    }
    
    return await query.orderBy(desc(trendingTopics.trendScore)).limit(20);
  }

  // Scheduling Rules
  async getActiveSchedulingRules(strategy?: string): Promise<SchedulingRule[]> {
    let query = db.select().from(schedulingRules).$dynamic();
    
    if (strategy) {
      query = query.where(and(
        eq(schedulingRules.isActive, true),
        eq(schedulingRules.strategy, strategy as any)
      ));
    } else {
      query = query.where(eq(schedulingRules.isActive, true));
    }
    
    return await query.orderBy(desc(schedulingRules.createdAt));
  }

  // Workflow operations
  async getWorkflowByContent(contentId: string, workflowType: string): Promise<ApprovalWorkflow | undefined> {
    const [workflow] = await db
      .select()
      .from(approvalWorkflows)
      .where(and(
        eq(approvalWorkflows.contentId, contentId),
        eq(approvalWorkflows.contentType, workflowType)
      ))
      .limit(1);
    
    return workflow;
  }

  async createApprovalWorkflow(workflow: InsertApprovalWorkflow): Promise<ApprovalWorkflow> {
    const [newWorkflow] = await db.insert(approvalWorkflows).values(workflow).returning();
    return newWorkflow;
  }
}

export const storage = new DatabaseStorage();
