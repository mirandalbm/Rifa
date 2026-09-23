import { storage } from "../storage";
import type { InsertNewsArticle } from "@shared/schema";

interface NewsSource {
  name: string;
  url: string;
  apiKey?: string;
}

class NewsService {
  private sources: NewsSource[] = [
    {
      name: "NewsAPI",
      url: "https://newsapi.org/v2/everything",
      apiKey: process.env.NEWSAPI_KEY,
    },
    {
      name: "NewsData",
      url: "https://newsdata.io/api/1/latest",
      apiKey: process.env.NEWSDATA_API_KEY,
    },
  ];

  async fetchNews(): Promise<InsertNewsArticle[]> {
    try {
      const filteredNews = await this.fetchLatestArticles();
      
      // Store top 10 news items
      const topNews = filteredNews.slice(0, 10);
      for (const news of topNews) {
        await storage.createNewsArticle(news);
      }

      return topNews;
    } catch (error) {
      console.error("Error in fetchNews:", error);
      throw error;
    }
  }

  // Fetches from every configured source and ranks the results, without storing them.
  async fetchLatestArticles(): Promise<InsertNewsArticle[]> {
    const allNews: InsertNewsArticle[] = [];

    for (const source of this.sources) {
      try {
        const news = await this.fetchFromSource(source);
        allNews.push(...news);
      } catch (error) {
        console.error(`Error fetching from ${source.name}:`, error);
        await storage.updateApiStatus({
          serviceName: source.name,
          status: 'down',
          lastChecked: new Date(),
        });
      }
    }

    // Filter and rank news based on dark/mystery criteria
    return this.filterAndRankNews(allNews);
  }

  private async fetchFromSource(source: NewsSource): Promise<InsertNewsArticle[]> {
    if (!source.apiKey) {
      throw new Error(`API key not provided for ${source.name}`);
    }

    // Keywords for dark/mystery content
    const darkKeywords = [
      "secret", "leaked", "revealed", "exposed", "hidden", "classified",
      "conspiracy", "scandal", "cover-up", "whistleblower", "breach",
      "investigation", "confidential", "exclusive", "alert", "warning"
    ];

    let url: string;
    const startTime = Date.now();

    if (source.name === "NewsAPI") {
      const query = darkKeywords.join(" OR ");
      url = `${source.url}?q=${encodeURIComponent(query)}&apiKey=${source.apiKey}&sortBy=popularity&pageSize=20&language=en`;
    } else if (source.name === "NewsData") {
      const query = darkKeywords.join(",");
      url = `${source.url}?qInTitle=${encodeURIComponent(query)}&apikey=${source.apiKey}&language=en&size=20`;
    } else {
      throw new Error(`Unsupported news source: ${source.name}`);
    }

    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Update API status
    await storage.updateApiStatus({
      serviceName: source.name,
      status: 'operational',
      responseTime: Date.now() - startTime,
      lastChecked: new Date(),
    });

    // Handle different API response formats
    let articles: any[] = [];
    if (source.name === "NewsAPI") {
      articles = data.articles || [];
    } else if (source.name === "NewsData") {
      articles = data.results || [];
    }

    return articles.map((article: any) => {
      const publishedAt = new Date(article.publishedAt || article.pubDate || new Date());
      
      // Preserve original publisher for reputation boost
      let originalSource;
      if (source.name === "NewsAPI") {
        originalSource = article.source?.name || source.name;
      } else if (source.name === "NewsData") {
        originalSource = article.source_id || article.creator || source.name;
      } else {
        originalSource = source.name;
      }
      
      const mappedArticle = {
        title: article.title,
        description: article.description || article.content || article.summary,
        source: { name: originalSource },
        publishedAt: publishedAt,
        url: article.url || article.link,
      };
      
      return {
        title: article.title,
        content: article.description || article.content || article.summary,
        url: article.url || article.link,
        source: source.name, // Service name for tracking
        viralScore: this.calculateViralScore(mappedArticle),
        publishedAt,
      };
    });
  }

  private calculateViralScore(article: any): number {
    let score = 50; // Base score

    const darkKeywords = [
      "secret", "leaked", "revealed", "exposed", "hidden", "classified",
      "conspiracy", "scandal", "cover-up", "whistleblower", "breach"
    ];

    const title = article.title?.toLowerCase() || "";
    const description = article.description?.toLowerCase() || "";

    // Check for dark keywords
    darkKeywords.forEach(keyword => {
      if (title.includes(keyword)) score += 15;
      if (description.includes(keyword)) score += 10;
    });

    // Source reputation boost
    const highQualitySources = ["reuters", "bbc", "ap", "bloomberg"];
    const source = article.source?.name?.toLowerCase() || "";
    if (highQualitySources.some(s => source.includes(s))) {
      score += 10;
    }

    // Recency boost
    const publishedAt = new Date(article.publishedAt);
    const hoursAgo = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60);
    if (hoursAgo < 6) score += 15;
    else if (hoursAgo < 24) score += 10;

    return Math.min(100, Math.max(0, score));
  }

  private async filterAndRankNews(news: InsertNewsArticle[]): Promise<InsertNewsArticle[]> {
    // Filter news with viral score >= 70
    const filteredNews = news.filter(item => item.viralScore >= 70);
    
    // Sort by viral score descending
    return filteredNews.sort((a, b) => b.viralScore - a.viralScore);
  }

  async triggerNewsFetch(sources?: string[], keywords?: string): Promise<void> {
    console.log("📡 Creating news fetch job...");
    const job = await storage.createJob({
      type: 'news_fetch',
      status: 'pending',
      data: { sources, keywords, manual: true },
    });
    console.log(`✅ News fetch job created: ${job.id}`);
  }
}

export const newsService = new NewsService();
