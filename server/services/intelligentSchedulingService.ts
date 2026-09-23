import { storage } from "../storage";
import { newsService } from "./newsService";
import { videoService } from "./videoService";
import { openaiService } from "./openaiService";
import type { 
  TrendingTopic, 
  InsertTrendingTopic, 
  SchedulingRule, 
  InsertSchedulingRule,
  NewsArticle 
} from "@shared/schema";

interface ViralScore {
  contentScore: number;        // 0-100 - Content quality and engagement potential
  trendingScore: number;       // 0-100 - How well it aligns with trending topics
  timingScore: number;         // 0-100 - Optimal timing for publication
  audienceScore: number;       // 0-100 - Target audience alignment
  overallScore: number;        // 0-100 - Weighted average of all scores
  confidence: number;          // 0-100 - AI confidence in the scoring
}

interface OptimalSchedule {
  newsArticleId: string;
  publishTime: Date;
  language: string;
  priority: number;
  estimatedViews: number;
  viralScore: ViralScore;
  reasoning: string;
}

interface TrendingAnalysis {
  keywords: string[];
  sentiment: 'positive' | 'negative' | 'neutral';
  virality: number;
  peakTime: Date;
  geographicFocus: string[];
  relatedTopics: string[];
}

class IntelligentSchedulingService {
  private readonly VIRAL_THRESHOLD = 75;
  private readonly TREND_DECAY_HOURS = 24;
  private readonly MAX_DAILY_VIDEOS_PER_LANGUAGE = 8;

  // Trending Topics Analysis with AI
  async analyzeCurrentTrends(): Promise<TrendingTopic[]> {
    try {
      console.log("🔍 Analyzing current trending topics...");

      // Fetch news from multiple sources to identify trends
      const recentNews = await storage.getNewsArticles(200);
      const trends = await this.extractTrendingTopics(recentNews);
      
      // Update or create trending topics in database
      const trendingTopics: TrendingTopic[] = [];
      
      for (const trend of trends) {
        const existingTopic = (await storage.getTrendingTopics()).find(
          t => t.keyword.toLowerCase() === trend.keyword.toLowerCase()
        );

        if (existingTopic) {
          await storage.updateTrendingTopicScore(
            existingTopic.id,
            trend.trendScore,
            trend.viralPotential
          );
          trendingTopics.push({
            ...existingTopic,
            trendScore: trend.trendScore,
            viralPotential: trend.viralPotential
          });
        } else {
          const newTopic = await storage.createTrendingTopic({
            keyword: trend.keyword,
            category: trend.category,
            trendScore: trend.trendScore,
            viralPotential: trend.viralPotential,
            mentions: trend.mentions,
            engagement: trend.engagement,
            region: trend.region || 'global',
            language: trend.language || 'en-US',
            peakTime: trend.peakTime ? new Date(trend.peakTime) : new Date(Date.now() + 2 * 60 * 60 * 1000), // Convert to Date object or use 2 hours from now
            expiresAt: new Date(Date.now() + this.TREND_DECAY_HOURS * 60 * 60 * 1000),
            metadata: trend.metadata || {}
          });
          trendingTopics.push(newTopic);
        }
      }

      await this.cleanupExpiredTrends();
      console.log(`✅ Analyzed ${trendingTopics.length} trending topics`);
      return trendingTopics;

    } catch (error) {
      console.error("❌ Error analyzing trends:", error);
      await storage.createErrorLog({
        jobId: null,
        errorCode: 'TREND_ANALYSIS_FAILED',
        severity: 'medium',
        message: `Trend analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        serviceName: 'IntelligentScheduling',
        endpoint: 'analyzeCurrentTrends',
        retryCount: 0,
        maxRetries: 3
      });
      return [];
    }
  }

  // AI-powered content scoring for viral potential
  async calculateViralScore(newsArticle: NewsArticle, targetLanguage: string = 'en-US'): Promise<ViralScore> {
    try {
      console.log(`🧠 Calculating viral score for: ${newsArticle.title}`);

      // Get trending topics for context
      const trendingTopics = await storage.getActiveTrendingTopics(targetLanguage);
      
      // Analyze content using AI
      const contentAnalysis = await this.analyzeContentQuality(newsArticle);
      const trendAlignment = await this.analyzeTrendAlignment(newsArticle, trendingTopics);
      const timingAnalysis = await this.analyzeOptimalTiming(newsArticle, targetLanguage);
      const audienceAlignment = await this.analyzeAudienceAlignment(newsArticle, targetLanguage);

      // Calculate weighted scores
      const contentScore = Math.min(100, Math.max(0, contentAnalysis.score));
      const trendingScore = Math.min(100, Math.max(0, trendAlignment.score));
      const timingScore = Math.min(100, Math.max(0, timingAnalysis.score));
      const audienceScore = Math.min(100, Math.max(0, audienceAlignment.score));

      // Weighted calculation (content quality is most important)
      const overallScore = Math.round(
        (contentScore * 0.4) +
        (trendingScore * 0.3) +
        (timingScore * 0.2) +
        (audienceScore * 0.1)
      );

      const confidence = Math.round(
        (contentAnalysis.confidence + trendAlignment.confidence + 
         timingAnalysis.confidence + audienceAlignment.confidence) / 4
      );

      const viralScore: ViralScore = {
        contentScore,
        trendingScore,
        timingScore,
        audienceScore,
        overallScore,
        confidence
      };

      console.log(`📊 Viral score calculated: ${overallScore}/100 (confidence: ${confidence}%)`);
      return viralScore;

    } catch (error) {
      console.error("❌ Error calculating viral score:", error);
      
      // Return conservative scores on error
      return {
        contentScore: 50,
        trendingScore: 30,
        timingScore: 40,
        audienceScore: 45,
        overallScore: 40,
        confidence: 20
      };
    }
  }

  // Generate optimal publishing schedule based on AI analysis
  async generateOptimalSchedule(maxVideos: number = 20): Promise<OptimalSchedule[]> {
    try {
      console.log("📅 Generating optimal publishing schedule...");

      // Get available news articles for processing
      const availableNews = await storage.getNewsArticles(100);
      const unprocessedNews = availableNews.filter(article => 
        article.status === 'discovered' || article.status === 'approved'
      );

      console.log(`📰 Found ${unprocessedNews.length} articles for scheduling consideration`);

      const schedules: OptimalSchedule[] = [];
      const languages = ['en-US', 'pt-BR', 'es-ES', 'es-MX', 'de-DE', 'fr-FR', 'hi-IN', 'ja-JP'];

      // Analyze current trends for context
      await this.analyzeCurrentTrends();
      
      // Get active scheduling rules
      const schedulingRules = await storage.getActiveSchedulingRules();

      for (const article of unprocessedNews.slice(0, maxVideos)) {
        for (const language of languages) {
          try {
            // Calculate viral score for this language
            const viralScore = await this.calculateViralScore(article, language);
            
            // Only proceed if viral score meets threshold
            if (viralScore.overallScore >= this.VIRAL_THRESHOLD) {
              const optimalTime = await this.calculateOptimalPublishTime(
                article, language, schedulingRules
              );

              const estimatedViews = await this.estimateViewership(
                article, language, viralScore
              );

              const reasoning = await this.generateScheduleReasoning(
                article, language, viralScore, optimalTime
              );

              schedules.push({
                newsArticleId: article.id!,
                publishTime: optimalTime,
                language,
                priority: viralScore.overallScore,
                estimatedViews,
                viralScore,
                reasoning
              });
            }
          } catch (error) {
            console.error(`Error processing article ${article.id} for ${language}:`, error);
          }
        }
      }

      // Sort by priority and apply daily limits
      const sortedSchedules = schedules
        .sort((a, b) => b.priority - a.priority)
        .slice(0, maxVideos);

      // Apply daily video limits per language
      const finalSchedules = this.applyDailyLimits(sortedSchedules);

      console.log(`✅ Generated ${finalSchedules.length} optimal scheduling recommendations`);
      return finalSchedules;

    } catch (error) {
      console.error("❌ Error generating optimal schedule:", error);
      throw error;
    }
  }

  // Auto-execute scheduling decisions with approval workflow
  async executeAutonomousScheduling(): Promise<void> {
    try {
      console.log("🤖 Executing autonomous scheduling decisions...");

      const optimalSchedules = await this.generateOptimalSchedule();
      
      for (const schedule of optimalSchedules) {
        // Check if this content already has a workflow
        const existingWorkflow = await storage.getWorkflowByContent(
          schedule.newsArticleId, 'video'
        );

        if (existingWorkflow) {
          continue; // Skip if already being processed
        }

        // Create approval workflow for high-confidence schedules
        if (schedule.viralScore.confidence >= 80 && schedule.viralScore.overallScore >= 85) {
          await storage.createApprovalWorkflow({
            contentId: schedule.newsArticleId,
            contentType: 'video',
            status: 'auto_approved',
            autoApprovalScore: schedule.viralScore.overallScore,
            qualityMetrics: {
              viralScore: schedule.viralScore,
              estimatedViews: schedule.estimatedViews,
              language: schedule.language
            },
            complianceChecks: {
              contentPolicy: true,
              copyright: true,
              factCheck: true
            },
            humanReviewRequired: false,
            approvedBy: 'ai',
            approvedAt: new Date(),
            metadata: {
              schedulingReasoning: schedule.reasoning,
              automationLevel: 'full'
            }
          });

          // Trigger video generation
          await this.scheduleVideoGeneration(schedule);
          
        } else {
          // Create workflow requiring human review
          await storage.createApprovalWorkflow({
            contentId: schedule.newsArticleId,
            contentType: 'video',
            status: 'manual_review',
            autoApprovalScore: schedule.viralScore.overallScore,
            qualityMetrics: {
              viralScore: schedule.viralScore,
              estimatedViews: schedule.estimatedViews,
              language: schedule.language
            },
            humanReviewRequired: true,
            metadata: {
              schedulingReasoning: schedule.reasoning,
              automationLevel: 'supervised'
            }
          });
        }
      }

      console.log("✅ Autonomous scheduling execution completed");

    } catch (error) {
      console.error("❌ Error in autonomous scheduling:", error);
      await storage.createPerformanceAlert({
        alertType: 'automation_failure',
        severity: 'high',
        title: 'Autonomous Scheduling Failed',
        description: `Critical error in autonomous scheduling: ${error instanceof Error ? error.message : String(error)}`,
        serviceName: 'IntelligentScheduling',
        threshold: '0',
        currentValue: '1',
        metadata: { error: String(error) }
      });
    }
  }

  // Private helper methods
  private async extractTrendingTopics(newsArticles: NewsArticle[]): Promise<InsertTrendingTopic[]> {
    // Use AI to analyze news articles and extract trending topics
    const trends: InsertTrendingTopic[] = [];
    
    try {
      const titlesAndContent = newsArticles.map(article => ({
        title: article.title,
        content: article.content.substring(0, 500), // Limit content length
        viralScore: article.viralScore,
        source: article.source
      }));

      // Use OpenAI to identify trending topics
      const trendAnalysisPrompt = `
        Analyze the following news articles and identify the top trending topics.
        Return a JSON array of trending topics with the following structure:
        {
          "keyword": "topic name",
          "category": "category",
          "trendScore": 0-100,
          "viralPotential": 0-100,
          "mentions": number,
          "engagement": estimated_engagement_score,
          "region": "global|specific_region",
          "language": "en-US",
          "peakTime": "estimated_peak_time_iso",
          "metadata": {"additional": "context"}
        }
        
        Articles: ${JSON.stringify(titlesAndContent.slice(0, 20))}
      `;

      // No user id: system analysis runs on the global OpenAI client
      const response = await openaiService.generateCompletion(trendAnalysisPrompt);

      if (response) {
        try {
          // Clean the response by removing markdown code blocks and extra text
          let cleanResponse = response.trim();
          
          // Find JSON block within markdown
          const jsonMatch = cleanResponse.match(/```json\s*([\s\S]*?)\s*```/);
          if (jsonMatch) {
            cleanResponse = jsonMatch[1];
          } else if (cleanResponse.startsWith('```')) {
            // Handle code blocks without json marker
            cleanResponse = cleanResponse.replace(/^```[a-z]*\s*/, '').replace(/\s*```[\s\S]*$/, '');
          } else {
            // Look for JSON array pattern
            const arrayMatch = cleanResponse.match(/(\[[\s\S]*?\])/);
            if (arrayMatch) {
              cleanResponse = arrayMatch[1];
            }
          }
          
          const parsedTrends = JSON.parse(cleanResponse);
          if (Array.isArray(parsedTrends)) {
            trends.push(...parsedTrends.slice(0, 10)); // Limit to top 10 trends
          }
        } catch (parseError) {
          console.warn("Failed to parse trend analysis response:", parseError);
          console.warn("Original response:", response.substring(0, 500), "...");
        }
      }

    } catch (error) {
      console.error("Error in AI trend analysis:", error);
    }

    // Fallback: Basic keyword extraction if AI fails
    if (trends.length === 0) {
      const keywordCounts = new Map<string, number>();
      
      newsArticles.forEach(article => {
        const words = article.title.toLowerCase()
          .split(/\W+/)
          .filter(word => word.length > 4);
        
        words.forEach(word => {
          keywordCounts.set(word, (keywordCounts.get(word) || 0) + 1);
        });
      });

      const sortedKeywords = Array.from(keywordCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      sortedKeywords.forEach(([keyword, count]) => {
        trends.push({
          keyword,
          category: 'general',
          trendScore: Math.min(100, count * 10),
          viralPotential: Math.min(100, count * 8),
          mentions: count,
          engagement: count * 50,
          region: 'global',
          language: 'en-US',
          peakTime: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
          metadata: { extractionMethod: 'fallback' }
        });
      });
    }

    return trends;
  }

  private async analyzeContentQuality(article: NewsArticle): Promise<{ score: number; confidence: number; factors: string[] }> {
    const factors: string[] = [];
    let score = 50; // Base score
    let confidence = 70;

    // Title analysis
    if (article.title.length > 30 && article.title.length < 100) {
      score += 10;
      factors.push('optimal_title_length');
    }

    // Content length analysis
    if (article.content.length > 300 && article.content.length < 2000) {
      score += 15;
      factors.push('good_content_length');
    }

    // Viral score consideration
    if (article.viralScore > 80) {
      score += 20;
      factors.push('high_viral_score');
    } else if (article.viralScore > 60) {
      score += 10;
      factors.push('moderate_viral_score');
    }

    // Source credibility (simplified)
    const trustedSources = ['Reuters', 'AP', 'BBC', 'CNN', 'Forbes', 'TechCrunch'];
    if (trustedSources.some(source => article.source.includes(source))) {
      score += 15;
      factors.push('trusted_source');
      confidence += 10;
    }

    return { 
      score: Math.min(100, Math.max(0, score)), 
      confidence: Math.min(100, confidence),
      factors 
    };
  }

  private async analyzeTrendAlignment(article: NewsArticle, trends: TrendingTopic[]): Promise<{ score: number; confidence: number; matchedTrends: string[] }> {
    const matchedTrends: string[] = [];
    let score = 0;
    let confidence = 60;

    const articleText = `${article.title} ${article.content}`.toLowerCase();

    for (const trend of trends) {
      if (articleText.includes(trend.keyword.toLowerCase())) {
        score += trend.viralPotential * 0.3; // Weight by viral potential
        matchedTrends.push(trend.keyword);
        confidence += 5;
      }
    }

    return { 
      score: Math.min(100, score), 
      confidence: Math.min(100, confidence),
      matchedTrends 
    };
  }

  private async analyzeOptimalTiming(article: NewsArticle, language: string): Promise<{ score: number; confidence: number; optimalHour: number }> {
    // Simple timezone-based optimal timing
    const timezoneMap: Record<string, number> = {
      'en-US': -5, // EST
      'pt-BR': -3, // BRT
      'es-ES': 1,  // CET
      'es-MX': -6, // CST
      'de-DE': 1,  // CET
      'fr-FR': 1,  // CET
      'hi-IN': 5.5, // IST
      'ja-JP': 9   // JST
    };

    const timezone = timezoneMap[language] || 0;
    const currentHour = new Date().getUTCHours() + timezone;
    const normalizedHour = ((currentHour % 24) + 24) % 24;

    // Peak engagement hours (simplified)
    const peakHours = [9, 10, 11, 18, 19, 20, 21]; // 9-11 AM and 6-9 PM
    const optimalHour = peakHours.find(hour => Math.abs(hour - normalizedHour) < 2) || 19;

    const score = peakHours.includes(Math.floor(normalizedHour)) ? 85 : 60;

    return { score, confidence: 75, optimalHour };
  }

  private async analyzeAudienceAlignment(article: NewsArticle, language: string): Promise<{ score: number; confidence: number; factors: string[] }> {
    const factors: string[] = [];
    let score = 60; // Base score
    let confidence = 65;

    // Language-specific content preferences (simplified)
    const contentPreferences: Record<string, string[]> = {
      'en-US': ['technology', 'politics', 'business', 'entertainment'],
      'pt-BR': ['sports', 'politics', 'entertainment', 'technology'],
      'es-ES': ['politics', 'sports', 'culture', 'technology'],
      'es-MX': ['sports', 'entertainment', 'politics', 'culture'],
      'de-DE': ['technology', 'business', 'politics', 'science'],
      'fr-FR': ['culture', 'politics', 'technology', 'lifestyle'],
      'hi-IN': ['technology', 'business', 'entertainment', 'sports'],
      'ja-JP': ['technology', 'business', 'culture', 'entertainment']
    };

    const preferences = contentPreferences[language] || ['general'];
    const articleCategory = article.category?.toLowerCase() || 'general';

    if (preferences.includes(articleCategory)) {
      score += 20;
      factors.push('category_match');
      confidence += 10;
    }

    return { score, confidence, factors };
  }

  private async calculateOptimalPublishTime(
    article: NewsArticle, 
    language: string, 
    rules: SchedulingRule[]
  ): Promise<Date> {
    // Find relevant scheduling rules
    const relevantRules = rules.filter(rule => 
      rule.language === language || rule.language === 'en-US' // Fallback to English
    );

    const now = new Date();
    const timezoneMap: Record<string, number> = {
      'en-US': -5, 'pt-BR': -3, 'es-ES': 1, 'es-MX': -6,
      'de-DE': 1, 'fr-FR': 1, 'hi-IN': 5.5, 'ja-JP': 9
    };

    const timezone = timezoneMap[language] || 0;
    
    // Default to next optimal hour (peak engagement)
    const peakHours = [9, 12, 18, 20]; // Peak hours in local time
    const currentLocalHour = (now.getUTCHours() + timezone + 24) % 24;
    
    const nextPeakHour = peakHours.find(hour => hour > currentLocalHour) || peakHours[0];
    const hoursToAdd = nextPeakHour > currentLocalHour 
      ? nextPeakHour - currentLocalHour 
      : (24 - currentLocalHour) + nextPeakHour;

    const optimalTime = new Date(now.getTime() + hoursToAdd * 60 * 60 * 1000);
    
    // Apply rule modifications if any
    if (relevantRules.length > 0) {
      const highestPriorityRule = relevantRules.reduce((prev, curr) => 
        (curr.priority || 0) > (prev.priority || 0) ? curr : prev
      );
      
      // Apply time slot preferences from the rule
      if (highestPriorityRule.timeSlots) {
        const timeSlots = highestPriorityRule.timeSlots as any;
        if (timeSlots.preferredHours) {
          const preferredHour = timeSlots.preferredHours[0];
          if (preferredHour) {
            optimalTime.setUTCHours(preferredHour - timezone);
          }
        }
      }
    }

    return optimalTime;
  }

  private async estimateViewership(
    article: NewsArticle, 
    language: string, 
    viralScore: ViralScore
  ): Promise<number> {
    // Base viewership estimates by language (simplified)
    const baseViews: Record<string, number> = {
      'en-US': 10000, 'pt-BR': 7500, 'es-ES': 6000, 'es-MX': 5500,
      'de-DE': 5000, 'fr-FR': 4500, 'hi-IN': 8000, 'ja-JP': 6500
    };

    const base = baseViews[language] || 3000;
    const viralMultiplier = 1 + (viralScore.overallScore / 100) * 2; // Up to 3x multiplier
    const confidenceMultiplier = 0.7 + (viralScore.confidence / 100) * 0.6; // 0.7x to 1.3x

    return Math.round(base * viralMultiplier * confidenceMultiplier);
  }

  private async generateScheduleReasoning(
    article: NewsArticle,
    language: string,
    viralScore: ViralScore,
    publishTime: Date
  ): Promise<string> {
    const reasons = [];

    if (viralScore.overallScore >= 90) {
      reasons.push("Exceptional viral potential detected");
    } else if (viralScore.overallScore >= 75) {
      reasons.push("High viral potential identified");
    }

    if (viralScore.trendingScore >= 80) {
      reasons.push("Strong alignment with current trends");
    }

    if (viralScore.contentScore >= 85) {
      reasons.push("High-quality content analysis");
    }

    if (viralScore.confidence >= 85) {
      reasons.push("High AI confidence in assessment");
    }

    const timeFormatted = publishTime.toLocaleString('en-US', {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });

    reasons.push(`Optimized for ${language} audience at ${timeFormatted}`);

    return reasons.join(". ") + ".";
  }

  private applyDailyLimits(schedules: OptimalSchedule[]): OptimalSchedule[] {
    const dailyCount = new Map<string, number>();
    const today = new Date().toDateString();

    return schedules.filter(schedule => {
      const key = `${schedule.language}_${today}`;
      const currentCount = dailyCount.get(key) || 0;

      if (currentCount < this.MAX_DAILY_VIDEOS_PER_LANGUAGE) {
        dailyCount.set(key, currentCount + 1);
        return true;
      }

      return false;
    });
  }

  private async scheduleVideoGeneration(schedule: OptimalSchedule): Promise<void> {
    try {
      console.log(`🎬 Scheduling video generation for ${schedule.newsArticleId} in ${schedule.language}`);
      
      // Create job for video generation
      await storage.createJob({
        type: 'video_generation',
        status: 'pending',
        data: {
          newsArticleId: schedule.newsArticleId,
          language: schedule.language,
          scheduledTime: schedule.publishTime,
          priority: schedule.priority,
          automationLevel: 'full',
          viralScore: schedule.viralScore,
          estimatedViews: schedule.estimatedViews
        }
      });

      console.log(`✅ Video generation scheduled for ${schedule.publishTime}`);

    } catch (error) {
      console.error("❌ Error scheduling video generation:", error);
      throw error;
    }
  }

  private async cleanupExpiredTrends(): Promise<void> {
    try {
      const allTrends = await storage.getTrendingTopics();
      const now = new Date();

      for (const trend of allTrends) {
        if (trend.expiresAt && trend.expiresAt < now) {
          // Mark as inactive instead of deleting for historical data
          await storage.updateTrendingTopicScore(trend.id, 0, 0);
        }
      }
    } catch (error) {
      console.error("Error cleaning up expired trends:", error);
    }
  }
}

export const intelligentSchedulingService = new IntelligentSchedulingService();