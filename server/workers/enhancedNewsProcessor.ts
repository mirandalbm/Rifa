import { storage } from "../storage";
import { newsService } from "../services/newsService";
import { videoService } from "../services/videoService";
import { intelligentSchedulingService } from "../services/intelligentSchedulingService";
import { errorRecoveryService } from "../services/errorRecoveryService";
import { performanceAlertsService } from "../services/performanceAlertsService";

interface LanguageBatch {
  language: string;
  articles: string[];
  priority: number;
  estimatedProcessingTime: number;
  maxConcurrentJobs: number;
}

interface BatchQueue {
  pending: LanguageBatch[];
  processing: LanguageBatch[];
  completed: LanguageBatch[];
  failed: LanguageBatch[];
}

interface ProcessingMetrics {
  totalArticlesProcessed: number;
  averageProcessingTime: number;
  successRate: number;
  languagePerformance: Map<string, {
    processed: number;
    failed: number;
    avgTime: number;
  }>;
}

class EnhancedNewsProcessor {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private batchQueue: BatchQueue;
  private metrics: ProcessingMetrics;
  
  // Language configurations with priority and resource allocation
  private readonly LANGUAGE_CONFIG = {
    'en-US': { priority: 1, maxConcurrent: 3, audienceSize: 'large' },
    'pt-BR': { priority: 2, maxConcurrent: 3, audienceSize: 'large' },
    'es-ES': { priority: 3, maxConcurrent: 2, audienceSize: 'medium' },
    'hi-IN': { priority: 2, maxConcurrent: 3, audienceSize: 'large' },
    'es-MX': { priority: 4, maxConcurrent: 2, audienceSize: 'medium' },
    'ja-JP': { priority: 4, maxConcurrent: 2, audienceSize: 'medium' },
    'de-DE': { priority: 5, maxConcurrent: 2, audienceSize: 'medium' },
    'fr-FR': { priority: 5, maxConcurrent: 1, audienceSize: 'small' }
  };

  private readonly MAX_DAILY_VIDEOS_PER_LANGUAGE = {
    'en-US': 12, 'pt-BR': 10, 'es-ES': 8, 'hi-IN': 10,
    'es-MX': 6, 'ja-JP': 6, 'de-DE': 5, 'fr-FR': 4
  };

  private readonly PROCESSING_HOURS = {
    'en-US': [6, 9, 12, 15, 18, 21], // 6 times per day
    'pt-BR': [7, 11, 15, 19, 22],    // 5 times per day
    'es-ES': [8, 13, 18, 21],        // 4 times per day
    'hi-IN': [5, 9, 14, 18, 21],     // 5 times per day (IST optimization)
    'es-MX': [9, 14, 20],            // 3 times per day
    'ja-JP': [7, 12, 19],            // 3 times per day (JST optimization)
    'de-DE': [8, 14, 19],            // 3 times per day
    'fr-FR': [9, 16]                 // 2 times per day
  };

  constructor() {
    this.batchQueue = {
      pending: [],
      processing: [],
      completed: [],
      failed: []
    };
    
    this.metrics = {
      totalArticlesProcessed: 0,
      averageProcessingTime: 0,
      successRate: 0,
      languagePerformance: new Map()
    };

    // Initialize language performance tracking
    Object.keys(this.LANGUAGE_CONFIG).forEach(lang => {
      this.metrics.languagePerformance.set(lang, {
        processed: 0,
        failed: 0,
        avgTime: 0
      });
    });
  }

  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log("🌐 Enhanced News Processor started - Multi-language batch processing enabled");
    
    // Process batches every 30 seconds
    this.processBatches();
    this.intervalId = setInterval(() => {
      this.processBatches();
    }, 30 * 1000);
    
    // Schedule hourly batch creation
    this.scheduleHourlyBatchCreation();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log("Enhanced News Processor stopped");
  }

  private async processBatches(): Promise<void> {
    try {
      // Check system health before processing
      const systemMetrics = await performanceAlertsService.getSystemMetrics();
      if (systemMetrics.queueSize > 80) {
        console.log("⚠️ System queue overloaded, reducing batch processing");
        return;
      }

      // Process pending batches by priority
      const pendingBatches = this.batchQueue.pending
        .sort((a, b) => a.priority - b.priority)
        .slice(0, 3); // Max 3 concurrent language batches

      for (const batch of pendingBatches) {
        if (this.canProcessBatch(batch)) {
          await this.processBatch(batch);
        }
      }

      // Check for completed external processing
      await this.checkProcessingBatches();
      
      // Cleanup old batches
      this.cleanupBatches();

    } catch (error) {
      console.error("Error in enhanced news processor:", error);
    }
  }

  private canProcessBatch(batch: LanguageBatch): boolean {
    const currentProcessing = this.batchQueue.processing.filter(
      b => b.language === batch.language
    ).length;
    
    const languageConfig = this.LANGUAGE_CONFIG[batch.language as keyof typeof this.LANGUAGE_CONFIG];
    return currentProcessing < (languageConfig?.maxConcurrent || 1);
  }

  private async processBatch(batch: LanguageBatch): Promise<void> {
    try {
      console.log(`🎬 Processing batch for ${batch.language}: ${batch.articles.length} articles`);
      
      // Move to processing queue
      this.batchQueue.pending = this.batchQueue.pending.filter(b => b !== batch);
      this.batchQueue.processing.push(batch);

      const startTime = Date.now();

      // Process articles in parallel with controlled concurrency
      const maxConcurrent = Math.min(batch.maxConcurrentJobs, batch.articles.length);
      const chunks = this.chunkArray(batch.articles, maxConcurrent);
      
      for (const chunk of chunks) {
        await Promise.all(
          chunk.map(articleId => this.processArticleForLanguage(articleId, batch.language))
        );
      }

      const processingTime = Date.now() - startTime;
      
      // Update metrics
      this.updateBatchMetrics(batch, processingTime, true);
      
      // Move to completed
      this.batchQueue.processing = this.batchQueue.processing.filter(b => b !== batch);
      this.batchQueue.completed.push({
        ...batch,
        estimatedProcessingTime: processingTime
      });

      console.log(`✅ Completed batch for ${batch.language} in ${processingTime}ms`);

    } catch (error) {
      console.error(`❌ Error processing batch for ${batch.language}:`, error);
      
      // Move to failed queue
      this.batchQueue.processing = this.batchQueue.processing.filter(b => b !== batch);
      this.batchQueue.failed.push(batch);
      this.updateBatchMetrics(batch, 0, false);
    }
  }

  private async processArticleForLanguage(articleId: string, language: string): Promise<void> {
    return errorRecoveryService.executeWithRetry(
      async () => {
        // Check if video already exists for this article+language
        const existingVideo = await storage.getVideoByArticleAndLanguage(articleId, language);
        if (existingVideo) {
          console.log(`⏭️ Video already exists for article ${articleId} in ${language}`);
          return;
        }

        // Check daily limits
        const today = new Date().toDateString();
        const todayVideos = await storage.getVideosByLanguageAndDate(language, today);
        const maxDaily = this.MAX_DAILY_VIDEOS_PER_LANGUAGE[language as keyof typeof this.MAX_DAILY_VIDEOS_PER_LANGUAGE] || 5;
        
        if (todayVideos.length >= maxDaily) {
          console.log(`📊 Daily limit reached for ${language}: ${todayVideos.length}/${maxDaily}`);
          return;
        }

        // Generate video for the language
        console.log(`🎥 Generating video for article ${articleId} in ${language}`);
        await videoService.generateVideo(articleId, language);
        
        this.metrics.totalArticlesProcessed++;
        
      },
      {
        operationId: `process_article_${language}`,
        serviceName: 'EnhancedNewsProcessor',
        endpoint: 'processArticleForLanguage',
        retryConfig: {
          maxRetries: 2,
          initialDelayMs: 3000,
          maxDelayMs: 15000,
          backoffMultiplier: 2,
          jitterMs: 500,
          enableCircuitBreaker: true
        }
      }
    );
  }

  private async checkProcessingBatches(): Promise<void> {
    // Check for any stuck processing batches (over 30 minutes)
    const now = Date.now();
    const stuckBatches = this.batchQueue.processing.filter(batch => {
      // Estimate timeout (5 minutes per article + base time)
      const estimatedTimeout = (batch.articles.length * 5 * 60 * 1000) + (10 * 60 * 1000);
      return (now - batch.estimatedProcessingTime) > estimatedTimeout;
    });

    for (const stuckBatch of stuckBatches) {
      console.warn(`⚠️ Batch stuck for ${stuckBatch.language}, moving to failed queue`);
      this.batchQueue.processing = this.batchQueue.processing.filter(b => b !== stuckBatch);
      this.batchQueue.failed.push(stuckBatch);
    }
  }

  private scheduleHourlyBatchCreation(): void {
    // Check every 10 minutes for scheduled batch creation
    setInterval(async () => {
      const now = new Date();
      const currentHour = now.getUTCHours();
      
      for (const [language, hours] of Object.entries(this.PROCESSING_HOURS)) {
        if (hours.includes(currentHour) && now.getUTCMinutes() < 10) {
          await this.createBatchForLanguage(language);
        }
      }
    }, 10 * 60 * 1000); // Every 10 minutes
  }

  private async createBatchForLanguage(language: string): Promise<void> {
    try {
      console.log(`📋 Creating batch for ${language}`);
      
      // Get recent high-quality articles suitable for video generation
      const recentNews = await storage.getNewsArticles(50);
      const qualityArticles = recentNews
        .filter(article => article.viralScore > 60) // Only high-potential articles
        .filter(article => !this.isArticleAlreadyProcessed(article.id!, language))
        .slice(0, 8) // Max 8 articles per batch
        .map(article => article.id!);

      if (qualityArticles.length === 0) {
        console.log(`📭 No suitable articles for ${language} batch`);
        return;
      }

      const languageConfig = this.LANGUAGE_CONFIG[language as keyof typeof this.LANGUAGE_CONFIG];
      const priority = languageConfig?.priority || 5;
      const maxConcurrent = languageConfig?.maxConcurrent || 1;

      const batch: LanguageBatch = {
        language,
        articles: qualityArticles,
        priority,
        estimatedProcessingTime: Date.now(),
        maxConcurrentJobs: maxConcurrent
      };

      // Check if similar batch already exists
      const existingBatch = this.batchQueue.pending.find(
        b => b.language === language && this.arrayOverlap(b.articles, qualityArticles) > 0.5
      );

      if (!existingBatch) {
        this.batchQueue.pending.push(batch);
        console.log(`✅ Created batch for ${language}: ${qualityArticles.length} articles`);
      }

    } catch (error) {
      console.error(`❌ Error creating batch for ${language}:`, error);
    }
  }

  private isArticleAlreadyProcessed(articleId: string, language: string): boolean {
    // Check if article is in any current batch for this language
    const inPending = this.batchQueue.pending.some(
      batch => batch.language === language && batch.articles.includes(articleId)
    );
    const inProcessing = this.batchQueue.processing.some(
      batch => batch.language === language && batch.articles.includes(articleId)
    );
    
    return inPending || inProcessing;
  }

  private arrayOverlap(arr1: string[], arr2: string[]): number {
    const intersection = arr1.filter(item => arr2.includes(item));
    const union = Array.from(new Set([...arr1, ...arr2]));
    return intersection.length / union.length;
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private updateBatchMetrics(batch: LanguageBatch, processingTime: number, success: boolean): void {
    const langMetrics = this.metrics.languagePerformance.get(batch.language);
    if (langMetrics) {
      if (success) {
        langMetrics.processed += batch.articles.length;
        langMetrics.avgTime = (langMetrics.avgTime + processingTime) / 2;
      } else {
        langMetrics.failed += batch.articles.length;
      }
      
      this.metrics.languagePerformance.set(batch.language, langMetrics);
    }

    // Update global metrics
    const totalProcessed = Array.from(this.metrics.languagePerformance.values())
      .reduce((sum, metrics) => sum + metrics.processed, 0);
    const totalFailed = Array.from(this.metrics.languagePerformance.values())
      .reduce((sum, metrics) => sum + metrics.failed, 0);
    
    this.metrics.successRate = totalProcessed / (totalProcessed + totalFailed || 1);
  }

  private cleanupBatches(): void {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    
    // Clean completed batches older than 1 hour
    this.batchQueue.completed = this.batchQueue.completed.filter(
      batch => batch.estimatedProcessingTime > oneHourAgo
    );
    
    // Clean failed batches older than 1 hour
    this.batchQueue.failed = this.batchQueue.failed.filter(
      batch => batch.estimatedProcessingTime > oneHourAgo
    );
  }

  // Force immediate news fetch and batch creation for all languages
  async forceFullLanguageBatch(): Promise<void> {
    try {
      console.log("🚀 Force creating batches for all languages...");
      
      // First fetch fresh news
      await newsService.fetchNews();
      
      // Create batches for all languages
      for (const language of Object.keys(this.LANGUAGE_CONFIG)) {
        await this.createBatchForLanguage(language);
      }
      
      console.log("✅ Force batch creation completed for all languages");
      
    } catch (error) {
      console.error("❌ Error in force full language batch:", error);
    }
  }

  // Public API methods
  getBatchQueueStatus(): BatchQueue {
    return {
      pending: [...this.batchQueue.pending],
      processing: [...this.batchQueue.processing],
      completed: [...this.batchQueue.completed],
      failed: [...this.batchQueue.failed]
    };
  }

  getProcessingMetrics(): ProcessingMetrics {
    return {
      ...this.metrics,
      languagePerformance: new Map(this.metrics.languagePerformance)
    };
  }

  async retryFailedBatches(): Promise<void> {
    console.log("🔄 Retrying failed batches...");
    
    const failedBatches = [...this.batchQueue.failed];
    this.batchQueue.failed = [];
    
    for (const batch of failedBatches) {
      this.batchQueue.pending.push(batch);
    }
    
    console.log(`✅ Moved ${failedBatches.length} failed batches back to pending`);
  }
}

export const enhancedNewsProcessor = new EnhancedNewsProcessor();