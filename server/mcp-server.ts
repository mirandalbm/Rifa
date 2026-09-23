import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { 
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
// Import types for better TypeScript support
interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

// MCP Server for DarkNews Autopilot System
export class DarkNewsMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "darknews-autopilot-mcp",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupTools();
  }

  private setupTools() {
    // GitHub Tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // GitHub Repository Management
          {
            name: "github_list_repos",
            description: "List GitHub repositories for the authenticated user",
            inputSchema: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: ["all", "owner", "public", "private"],
                  default: "all",
                  description: "Filter repositories by type"
                },
                sort: {
                  type: "string",
                  enum: ["created", "updated", "pushed", "full_name"],
                  default: "updated",
                  description: "Sort repositories by"
                },
                per_page: {
                  type: "number",
                  default: 30,
                  description: "Number of repositories per page"
                }
              }
            }
          },
          {
            name: "github_create_repo",
            description: "Create a new GitHub repository",
            inputSchema: {
              type: "object",
              properties: {
                name: { type: "string", description: "Repository name" },
                description: { type: "string", description: "Repository description" },
                private: { type: "boolean", default: false, description: "Whether the repository is private" },
                auto_init: { type: "boolean", default: true, description: "Create with README" }
              },
              required: ["name"]
            }
          },
          {
            name: "github_get_file",
            description: "Get file content from GitHub repository",
            inputSchema: {
              type: "object",
              properties: {
                owner: { type: "string", description: "Repository owner" },
                repo: { type: "string", description: "Repository name" },
                path: { type: "string", description: "File path" },
                ref: { type: "string", description: "Branch/commit reference" }
              },
              required: ["owner", "repo", "path"]
            }
          },
          {
            name: "github_create_file",
            description: "Create or update a file in GitHub repository",
            inputSchema: {
              type: "object",
              properties: {
                owner: { type: "string", description: "Repository owner" },
                repo: { type: "string", description: "Repository name" },
                path: { type: "string", description: "File path" },
                content: { type: "string", description: "File content (base64 encoded)" },
                message: { type: "string", description: "Commit message" },
                branch: { type: "string", default: "main", description: "Target branch" }
              },
              required: ["owner", "repo", "path", "content", "message"]
            }
          },

          // Database Management
          {
            name: "db_query",
            description: "Execute SQL query on the database",
            inputSchema: {
              type: "object",
              properties: {
                query: { type: "string", description: "SQL query to execute" },
                params: { type: "array", description: "Query parameters" }
              },
              required: ["query"]
            }
          },
          {
            name: "db_get_schema",
            description: "Get database schema information",
            inputSchema: {
              type: "object",
              properties: {
                table: { type: "string", description: "Specific table name (optional)" }
              }
            }
          },
          {
            name: "db_backup",
            description: "Create database backup",
            inputSchema: {
              type: "object",
              properties: {
                tables: { 
                  type: "array", 
                  items: { type: "string" },
                  description: "Tables to backup (all if not specified)" 
                }
              }
            }
          },

          // Slack Integration
          {
            name: "slack_send_message",
            description: "Send message to Slack channel",
            inputSchema: {
              type: "object",
              properties: {
                channel: { type: "string", description: "Slack channel ID or name" },
                text: { type: "string", description: "Message text" },
                blocks: { type: "array", description: "Rich message blocks" },
                thread_ts: { type: "string", description: "Thread timestamp for replies" }
              },
              required: ["channel", "text"]
            }
          },
          {
            name: "slack_list_channels",
            description: "List Slack channels",
            inputSchema: {
              type: "object",
              properties: {
                types: { 
                  type: "string", 
                  default: "public_channel,private_channel",
                  description: "Channel types to list" 
                }
              }
            }
          },
          {
            name: "slack_get_messages",
            description: "Get messages from Slack channel",
            inputSchema: {
              type: "object",
              properties: {
                channel: { type: "string", description: "Slack channel ID" },
                limit: { type: "number", default: 100, description: "Number of messages to retrieve" },
                oldest: { type: "string", description: "Start time (timestamp)" },
                latest: { type: "string", description: "End time (timestamp)" }
              },
              required: ["channel"]
            }
          },

          // News API Integration
          {
            name: "news_get_headlines",
            description: "Get breaking news headlines",
            inputSchema: {
              type: "object",
              properties: {
                category: { 
                  type: "string",
                  enum: ["business", "entertainment", "general", "health", "science", "sports", "technology"],
                  description: "News category"
                },
                country: { type: "string", description: "Country code (e.g., 'us', 'br')" },
                sources: { type: "string", description: "Comma-separated news sources" },
                q: { type: "string", description: "Search keywords" },
                pageSize: { type: "number", default: 20, description: "Number of articles" }
              }
            }
          },
          {
            name: "news_search",
            description: "Search news articles",
            inputSchema: {
              type: "object",
              properties: {
                q: { type: "string", description: "Search query" },
                sources: { type: "string", description: "Comma-separated sources" },
                domains: { type: "string", description: "Comma-separated domains" },
                from: { type: "string", description: "Start date (YYYY-MM-DD)" },
                to: { type: "string", description: "End date (YYYY-MM-DD)" },
                language: { type: "string", default: "pt", description: "Article language" },
                sortBy: { 
                  type: "string",
                  enum: ["relevancy", "popularity", "publishedAt"],
                  default: "publishedAt",
                  description: "Sort by"
                },
                pageSize: { type: "number", default: 20, description: "Number of articles" }
              },
              required: ["q"]
            }
          },
          {
            name: "news_get_sources",
            description: "Get available news sources",
            inputSchema: {
              type: "object",
              properties: {
                category: { type: "string", description: "Filter by category" },
                language: { type: "string", description: "Filter by language" },
                country: { type: "string", description: "Filter by country" }
              }
            }
          },

          // YouTube API Integration
          {
            name: "youtube_list_channels",
            description: "List YouTube channels",
            inputSchema: {
              type: "object",
              properties: {
                part: { 
                  type: "string", 
                  default: "snippet,statistics",
                  description: "Parts to include in response" 
                },
                mine: { type: "boolean", default: true, description: "List my channels" }
              }
            }
          },
          {
            name: "youtube_upload_video",
            description: "Upload video to YouTube",
            inputSchema: {
              type: "object",
              properties: {
                title: { type: "string", description: "Video title" },
                description: { type: "string", description: "Video description" },
                tags: { 
                  type: "array", 
                  items: { type: "string" },
                  description: "Video tags" 
                },
                categoryId: { type: "string", default: "22", description: "YouTube category ID" },
                privacyStatus: { 
                  type: "string",
                  enum: ["private", "public", "unlisted"],
                  default: "public",
                  description: "Video privacy status"
                },
                filePath: { type: "string", description: "Path to video file" }
              },
              required: ["title", "description", "filePath"]
            }
          },
          {
            name: "youtube_get_video_stats",
            description: "Get YouTube video statistics",
            inputSchema: {
              type: "object",
              properties: {
                videoId: { type: "string", description: "YouTube video ID" },
                part: { 
                  type: "string", 
                  default: "statistics,snippet",
                  description: "Parts to include" 
                }
              },
              required: ["videoId"]
            }
          },
          {
            name: "youtube_search_videos",
            description: "Search YouTube videos",
            inputSchema: {
              type: "object",
              properties: {
                q: { type: "string", description: "Search query" },
                channelId: { type: "string", description: "Search within specific channel" },
                order: { 
                  type: "string",
                  enum: ["date", "rating", "relevance", "title", "videoCount", "viewCount"],
                  default: "relevance",
                  description: "Sort order"
                },
                publishedAfter: { type: "string", description: "Published after date (RFC 3339)" },
                publishedBefore: { type: "string", description: "Published before date (RFC 3339)" },
                maxResults: { type: "number", default: 25, description: "Maximum results" }
              },
              required: ["q"]
            }
          },

          // System Tools
          {
            name: "system_health_check",
            description: "Check system health and API status",
            inputSchema: {
              type: "object",
              properties: {
                services: { 
                  type: "array", 
                  items: { type: "string" },
                  description: "Specific services to check" 
                }
              }
            }
          },
          {
            name: "system_get_metrics",
            description: "Get system performance metrics",
            inputSchema: {
              type: "object",
              properties: {
                timeRange: { 
                  type: "string",
                  enum: ["1h", "6h", "24h", "7d"],
                  default: "1h",
                  description: "Time range for metrics"
                }
              }
            }
          }
        ]
      };
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          // GitHub Tools
          case "github_list_repos":
            return await this.handleGitHubListRepos(args);
          case "github_create_repo":
            return await this.handleGitHubCreateRepo(args);
          case "github_get_file":
            return await this.handleGitHubGetFile(args);
          case "github_create_file":
            return await this.handleGitHubCreateFile(args);

          // Database Tools
          case "db_query":
            return await this.handleDbQuery(args);
          case "db_get_schema":
            return await this.handleDbGetSchema(args);
          case "db_backup":
            return await this.handleDbBackup(args);

          // Slack Tools
          case "slack_send_message":
            return await this.handleSlackSendMessage(args);
          case "slack_list_channels":
            return await this.handleSlackListChannels(args);
          case "slack_get_messages":
            return await this.handleSlackGetMessages(args);

          // News Tools
          case "news_get_headlines":
            return await this.handleNewsGetHeadlines(args);
          case "news_search":
            return await this.handleNewsSearch(args);
          case "news_get_sources":
            return await this.handleNewsGetSources(args);

          // YouTube Tools
          case "youtube_list_channels":
            return await this.handleYouTubeListChannels(args);
          case "youtube_upload_video":
            return await this.handleYouTubeUploadVideo(args);
          case "youtube_get_video_stats":
            return await this.handleYouTubeGetVideoStats(args);
          case "youtube_search_videos":
            return await this.handleYouTubeSearchVideos(args);

          // System Tools
          case "system_health_check":
            return await this.handleSystemHealthCheck(args);
          case "system_get_metrics":
            return await this.handleSystemGetMetrics(args);

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error executing ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
          ],
          isError: true
        };
      }
    });
  }

  // GitHub Tool Handlers
  private async handleGitHubListRepos(args: any) {
    // Implementation for GitHub API calls
    const response = await fetch(`${process.env.APP_URL || 'http://localhost:5000'}/api/github/repos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    });
    
    const data = await response.json();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  private async handleGitHubCreateRepo(args: any) {
    const response = await fetch(`${process.env.APP_URL || 'http://localhost:5000'}/api/github/repos/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    });
    
    const data = await response.json();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  private async handleGitHubGetFile(args: any) {
    const response = await fetch(`${process.env.APP_URL || 'http://localhost:5000'}/api/github/files/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    });
    
    const data = await response.json();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  private async handleGitHubCreateFile(args: any) {
    const response = await fetch(`${process.env.APP_URL || 'http://localhost:5000'}/api/github/files/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    });
    
    const data = await response.json();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  // Database Tool Handlers
  private async handleDbQuery(args: any) {
    const response = await fetch(`${process.env.APP_URL || 'http://localhost:5000'}/api/cline/database/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    });
    
    const data = await response.json();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  private async handleDbGetSchema(args: any) {
    const response = await fetch(`${process.env.APP_URL || 'http://localhost:5000'}/api/cline/database/schema`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await response.json();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  private async handleDbBackup(args: any) {
    const response = await fetch(`${process.env.APP_URL || 'http://localhost:5000'}/api/cline/database/backup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    });
    
    const data = await response.json();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  // Slack Tool Handlers
  private async handleSlackSendMessage(args: any) {
    const response = await fetch(`${process.env.APP_URL || 'http://localhost:5000'}/api/slack/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    });
    
    const data = await response.json();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  private async handleSlackListChannels(args: any) {
    const response = await fetch(`${process.env.APP_URL || 'http://localhost:5000'}/api/slack/channels`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await response.json();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  private async handleSlackGetMessages(args: any) {
    const response = await fetch(`${process.env.APP_URL || 'http://localhost:5000'}/api/slack/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    });
    
    const data = await response.json();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  // News Tool Handlers
  private async handleNewsGetHeadlines(args: any) {
    const response = await fetch(`${process.env.APP_URL || 'http://localhost:5000'}/api/news/headlines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    });
    
    const data = await response.json();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  private async handleNewsSearch(args: any) {
    const response = await fetch(`${process.env.APP_URL || 'http://localhost:5000'}/api/news/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    });
    
    const data = await response.json();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  private async handleNewsGetSources(args: any) {
    const response = await fetch(`${process.env.APP_URL || 'http://localhost:5000'}/api/news/sources`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await response.json();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  // YouTube Tool Handlers
  private async handleYouTubeListChannels(args: any) {
    const response = await fetch(`${process.env.APP_URL || 'http://localhost:5000'}/api/youtube/list/channels`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await response.json();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  private async handleYouTubeUploadVideo(args: any) {
    const response = await fetch(`${process.env.APP_URL || 'http://localhost:5000'}/api/youtube/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    });
    
    const data = await response.json();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  private async handleYouTubeGetVideoStats(args: any) {
    const response = await fetch(`${process.env.APP_URL || 'http://localhost:5000'}/api/youtube/stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    });
    
    const data = await response.json();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  private async handleYouTubeSearchVideos(args: any) {
    const response = await fetch(`${process.env.APP_URL || 'http://localhost:5000'}/api/youtube/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    });
    
    const data = await response.json();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  // System Tool Handlers
  private async handleSystemHealthCheck(args: any) {
    const response = await fetch(`${process.env.APP_URL || 'http://localhost:5000'}/api/system/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await response.json();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  private async handleSystemGetMetrics(args: any) {
    const response = await fetch(`${process.env.APP_URL || 'http://localhost:5000'}/api/system/metrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    });
    
    const data = await response.json();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("DarkNews Autopilot MCP Server running on stdio");
  }
}

// Start the server
const server = new DarkNewsMCPServer();
server.run().catch(console.error);