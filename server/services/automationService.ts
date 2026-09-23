import { storage } from '../storage';
import { newsService } from './newsService';
import { openaiService } from './openaiService';

interface AutomationConfig {
  userId: string;
  isActive: boolean;
  autoPublish: boolean;
  targetLanguages: string[];
  maxVideosPerDay: number;
  contentFilters: {
    categories: string[];
    keywords: string[];
    minViralScore: number;
  };
  publishingSchedule: {
    timezone: string;
    publishTimes: string[]; // HH:MM format
    enabled: boolean;
  };
}

class AutomationService {
  private runningPipelines: Set<string> = new Set();

  async startAutomationPipeline(userId: string, config: AutomationConfig): Promise<void> {
    try {
      if (this.runningPipelines.has(userId)) {
        console.log(`Automation pipeline already running for user ${userId}`);
        return;
      }

      this.runningPipelines.add(userId);
      console.log(`Starting automation pipeline for user ${userId}`);

      // Step 1: Fetch and filter news
      await this.fetchAndFilterNews(userId, config);
      
      // Step 2: Generate videos for filtered articles
      await this.generateVideosFromNews(userId, config);
      
      // Step 3: Auto-publish if enabled
      if (config.autoPublish) {
        await this.autoPublishReadyVideos(userId, config);
      }

      this.runningPipelines.delete(userId);
      console.log(`Completed automation pipeline for user ${userId}`);
      
    } catch (error) {
      console.error(`Error in automation pipeline for user ${userId}:`, error);
      this.runningPipelines.delete(userId);
      throw error;
    }
  }

  async fetchAndFilterNews(userId: string, config: AutomationConfig): Promise<void> {
    try {
      console.log(`Fetching news for user ${userId}`);

      // Get fresh news from multiple sources
      const allArticles = await newsService.fetchLatestArticles();

      if (allArticles.length === 0) {
        console.log('No news articles found');
        return;
      }

      // Filter articles for dark/mystery potential
      const filteredArticles = await this.filterArticlesForDarkContent(allArticles, config);
      
      // Save filtered articles to database
      for (const article of filteredArticles) {
        try {
          await storage.createNewsArticle({
            title: article.title,
            content: article.content || '',
            source: article.source || 'Unknown',
            url: article.url,
            publishedAt: article.publishedAt ? new Date(article.publishedAt) : null,
            status: 'discovered',
            // AI score is 0.0-1.0; the column stores an integer 0-100
            viralScore: Math.round((article.viralScore ?? 0.5) * 100),
            category: this.categorizeArticle(article)
          });
        } catch (error) {
          // Article might already exist, continue
          console.log('Article already exists or error saving:', error);
        }
      }

      console.log(`Filtered and saved ${filteredArticles.length} articles for user ${userId}`);
      
    } catch (error) {
      console.error('Error in fetchAndFilterNews:', error);
      throw error;
    }
  }

  async filterArticlesForDarkContent(articles: any[], config: AutomationConfig): Promise<any[]> {
    const filtered = [];
    
    for (const article of articles) {
      try {
        // Use AI to score article for dark/mystery potential
        const prompt = `
Rate this news article from 0.0 to 1.0 for its potential to be turned into a compelling dark mystery video:

Title: ${article.title}
Content: ${article.description || article.content || ''}

Consider:
- Mysterious or unexplained elements
- Potential for dramatic storytelling
- Public interest and viral potential
- Dark or suspenseful themes
- Investigation potential

Return only a number between 0.0 and 1.0
        `;

        const scoreResponse = await openaiService.generateScript(
          'Score Article',
          prompt,
          config.userId
        );
        
        const viralScore = parseFloat(scoreResponse) || 0.0;
        
        // Apply content filters
        if (viralScore >= config.contentFilters.minViralScore) {
          const hasKeywords = config.contentFilters.keywords.length === 0 || 
            config.contentFilters.keywords.some(keyword => 
              article.title.toLowerCase().includes(keyword.toLowerCase()) ||
              (article.description && article.description.toLowerCase().includes(keyword.toLowerCase()))
            );

          if (hasKeywords) {
            filtered.push({
              ...article,
              viralScore
            });
          }
        }
        
        // Rate limiting to avoid API abuse
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.log('Error scoring article:', error);
        // Include article with default score if scoring fails
        filtered.push({
          ...article,
          viralScore: 0.5
        });
      }
    }

    // Sort by viral score and limit results
    return filtered
      .sort((a, b) => b.viralScore - a.viralScore)
      .slice(0, config.maxVideosPerDay * 2); // Get extra for processing buffer
  }

  categorizeArticle(article: any): string {
    const title = article.title?.toLowerCase() || '';
    const content = (article.description || article.content || '').toLowerCase();
    
    if (title.includes('tech') || content.includes('technology')) return 'technology';
    if (title.includes('crime') || content.includes('police')) return 'crime';
    if (title.includes('mystery') || content.includes('unexplained')) return 'mystery';
    if (title.includes('politics') || content.includes('government')) return 'politics';
    
    return 'general';
  }

  async generateVideosFromNews(userId: string, config: AutomationConfig): Promise<void> {
    try {
      console.log(`Generating videos from news for user ${userId}`);

      // Get recently discovered articles
      const articles = await storage.getNewsArticles(config.maxVideosPerDay * 2);
      const discoveredArticles = articles.filter(a => a.status === 'discovered');

      if (discoveredArticles.length === 0) {
        console.log('No discovered articles to process');
        return;
      }

      // Create video generation jobs for each language
      for (const article of discoveredArticles.slice(0, config.maxVideosPerDay)) {
        for (const language of config.targetLanguages) {
          try {
            // Create video generation job
            await storage.createJob({
              type: 'video_generation',
              status: 'pending',
              data: {
                newsArticleId: article.id,
                userId,
                language,
                avatarTemplate: 'dark_anchor'
              }
            });

            console.log(`Created video generation job for article ${article.id} in ${language}`);
          } catch (error) {
            console.error(`Error creating video job for article ${article.id}:`, error);
          }
        }

        // Mark article as processed
        await storage.updateNewsArticleStatus(article.id, 'processed');
      }
      
    } catch (error) {
      console.error('Error in generateVideosFromNews:', error);
      throw error;
    }
  }

  async autoPublishReadyVideos(userId: string, config: AutomationConfig): Promise<void> {
    try {
      console.log(`Auto-publishing ready videos for user ${userId}`);
      
      const readyVideos = await storage.getVideosByStatus('ready');
      const userVideos = readyVideos.filter((v: any) => v.userId === userId);
      
      if (userVideos.length === 0) {
        console.log('No ready videos to publish');
        return;
      }
      
      for (const video of userVideos.slice(0, config.maxVideosPerDay)) {
        try {
          await storage.createJob({
            type: 'publish',
            status: 'pending',
            data: {
              videoId: video.id,
              userId,
              targetLanguages: config.targetLanguages,
              publishingSchedule: config.publishingSchedule
            }
          });
          
          console.log(`Queued video ${video.id} for publishing`);
        } catch (error) {
          console.error(`Error queuing video ${video.id} for publishing:`, error);
        }
      }
      
    } catch (error) {
      console.error('Error in autoPublishReadyVideos:', error);
      throw error;
    }
  }

  async runFullAutomationCycle(userId: string): Promise<void> {
    const defaultConfig: AutomationConfig = {
      userId,
      isActive: true,
      autoPublish: true,
      targetLanguages: ['en-US', 'pt-BR', 'es-ES'],
      maxVideosPerDay: 5,
      contentFilters: {
        categories: ['general', 'technology', 'crime', 'mystery'],
        keywords: [],
        minViralScore: 0.6
      },
      publishingSchedule: {
        timezone: 'UTC',
        publishTimes: ['09:00', '15:00', '21:00'],
        enabled: true
      }
    };
    
    await this.startAutomationPipeline(userId, defaultConfig);
  }

  async getAutomationStatus(userId: string): Promise<any> {
    return {
      isRunning: this.runningPipelines.has(userId),
      lastRun: new Date().toISOString(),
      status: this.runningPipelines.has(userId) ? 'active' : 'idle',
      videosGenerated: 0,
      videosPublished: 0
    };
  }

  private isInPublishingWindow(schedule: AutomationConfig['publishingSchedule']): boolean {
    if (!schedule.enabled) return true;

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    // Check if current time is within 30 minutes of any scheduled time
    return schedule.publishTimes.some(publishTime => {
      const [hours, minutes] = publishTime.split(':').map(Number);
      const publishDate = new Date();
      publishDate.setHours(hours, minutes, 0, 0);
      
      const timeDiff = Math.abs(now.getTime() - publishDate.getTime());
      return timeDiff <= 30 * 60 * 1000; // 30 minutes
    });
  }
}

export const automationService = new AutomationService();