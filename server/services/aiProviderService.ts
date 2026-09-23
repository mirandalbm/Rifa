// Unified AI Provider Service
// Handles multiple AI providers with consistent interface

import type { 
  AIProvider, 
  AIRequest, 
  AIResponse, 
  ChatMessage 
} from '@shared/aiProviders';
import { AI_PROVIDERS, DEFAULT_MODELS } from '@shared/aiProviders';

interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  organization?: string;
}

export class AIProviderService {
  private configs: Map<string, ProviderConfig> = new Map();

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders() {
    // Initialize provider configurations from environment
    if (process.env.OPENROUTER_API_KEY) {
      this.configs.set('openrouter', {
        apiKey: process.env.OPENROUTER_API_KEY,
        baseUrl: 'https://openrouter.ai/api/v1'
      });
    }

    // Add OpenAI direct support
    if (process.env.OPENAI_API_KEY) {
      this.configs.set('openai', {
        apiKey: process.env.OPENAI_API_KEY,
        baseUrl: 'https://api.openai.com/v1'
      });
    }

    // Future extensible providers will be loaded here
    this.loadExtensibleProviders();
  }

  private loadExtensibleProviders() {
    // Check for additional providers based on available API keys
    const extensibleProviders = [
      { id: 'xai', key: 'XAI_API_KEY', baseUrl: 'https://api.x.ai/v1' },
      { id: 'perplexity', key: 'PERPLEXITY_API_KEY', baseUrl: 'https://api.perplexity.ai' },
      { id: 'abacusai', key: 'ABACUSAI_API_KEY', baseUrl: 'https://cloud.abacus.ai/api' }
    ];

    extensibleProviders.forEach(provider => {
      const apiKey = process.env[provider.key];
      if (apiKey) {
        this.configs.set(provider.id, {
          apiKey,
          baseUrl: provider.baseUrl
        });
      }
    });
  }

  getAvailableProviders(): AIProvider[] {
    return Object.values(AI_PROVIDERS).filter(provider => 
      this.configs.has(provider.id)
    );
  }

  getProvider(providerId: string): AIProvider | null {
    return AI_PROVIDERS[providerId] || null;
  }

  isProviderAvailable(providerId: string): boolean {
    return this.configs.has(providerId);
  }

  async sendRequest(request: AIRequest): Promise<AIResponse> {
    const provider = this.getProvider(request.provider);
    if (!provider) {
      throw new Error(`Provider ${request.provider} not found`);
    }

    if (!this.isProviderAvailable(request.provider)) {
      throw new Error(`Provider ${request.provider} not configured`);
    }

    const config = this.configs.get(request.provider)!;
    const startTime = Date.now();

    try {
      let response: AIResponse;

      switch (request.provider) {
        case 'openrouter':
          response = await this.callOpenRouter(request, config);
          break;
        case 'openai':
          response = await this.callOpenAI(request, config);
          break;
        case 'xai':
          response = await this.callXAI(request, config);
          break;
        case 'perplexity':
          response = await this.callPerplexity(request, config);
          break;
        case 'abacusai':
          response = await this.callAbacusAI(request, config);
          break;
        default:
          throw new Error(`Provider ${request.provider} not implemented`);
      }

      response.duration = Date.now() - startTime;
      return response;

    } catch (error) {
      console.error(`AI Provider Error (${request.provider}):`, error);
      throw error;
    }
  }

  private async callOpenAI(request: AIRequest, config: ProviderConfig): Promise<AIResponse> {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: request.model.includes('/') ? request.model.split('/')[1] : request.model,
        messages: request.messages,
        temperature: request.temperature || 0.7,
        max_tokens: request.maxTokens,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    return {
      id: data.id,
      provider: 'openai',
      model: request.model,
      content: data.choices[0]?.message?.content || '',
      tokensUsed: {
        input: usage.prompt_tokens,
        output: usage.completion_tokens,
        total: usage.total_tokens
      },
      cost: (usage.prompt_tokens * 0.01 / 1000) + (usage.completion_tokens * 0.03 / 1000), // GPT-4o pricing
      finishReason: data.choices[0]?.finish_reason || 'stop',
      duration: 0
    };
  }

  private async callOpenRouter(request: AIRequest, config: ProviderConfig): Promise<AIResponse> {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:5000',
        'X-Title': 'DarkNews Autopilot Cline AI'
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature || 0.7,
        max_tokens: request.maxTokens,
        stream: false,
        tools: request.tools
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    const model = AI_PROVIDERS.openrouter.models.find(m => m.id === request.model)!;

    return {
      id: data.id,
      provider: 'openrouter',
      model: request.model,
      content: data.choices[0]?.message?.content || '',
      tokensUsed: {
        input: usage.prompt_tokens,
        output: usage.completion_tokens,
        total: usage.total_tokens
      },
      cost: (usage.prompt_tokens * model.inputCost / 1000) + (usage.completion_tokens * model.outputCost / 1000),
      finishReason: data.choices[0]?.finish_reason || 'stop',
      duration: 0
    };
  }

  private async callAbacusAI(request: AIRequest, config: ProviderConfig): Promise<AIResponse> {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature || 0.7,
        max_tokens: request.maxTokens,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Abacus.AI API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    return {
      id: data.id || 'abacus-' + Date.now(),
      provider: 'abacusai',
      model: request.model,
      content: data.choices[0]?.message?.content || '',
      tokensUsed: {
        input: usage.prompt_tokens,
        output: usage.completion_tokens,
        total: usage.total_tokens
      },
      cost: (usage.prompt_tokens * 0.002 / 1000) + (usage.completion_tokens * 0.002 / 1000),
      finishReason: data.choices[0]?.finish_reason || 'stop',
      duration: 0
    };
  }

  private async callXAI(request: AIRequest, config: ProviderConfig): Promise<AIResponse> {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature || 0.7,
        max_tokens: request.maxTokens,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`xAI API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    const model = AI_PROVIDERS.xai.models.find(m => m.id === request.model)!;

    return {
      id: data.id,
      provider: 'xai',
      model: request.model,
      content: data.choices[0]?.message?.content || '',
      tokensUsed: {
        input: usage.prompt_tokens,
        output: usage.completion_tokens,
        total: usage.total_tokens
      },
      cost: (usage.prompt_tokens * model.inputCost / 1000) + (usage.completion_tokens * model.outputCost / 1000),
      finishReason: data.choices[0]?.finish_reason || 'stop',
      duration: 0
    };
  }

  private async callPerplexity(request: AIRequest, config: ProviderConfig): Promise<AIResponse> {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature || 0.7,
        max_tokens: request.maxTokens,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Perplexity API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    const model = AI_PROVIDERS.perplexity.models.find(m => m.name === request.model)!;

    return {
      id: data.id,
      provider: 'perplexity',
      model: request.model,
      content: data.choices[0]?.message?.content || '',
      tokensUsed: {
        input: usage.prompt_tokens,
        output: usage.completion_tokens,
        total: usage.total_tokens
      },
      cost: (usage.prompt_tokens * model.inputCost / 1000) + (usage.completion_tokens * model.outputCost / 1000),
      finishReason: data.choices[0]?.finish_reason || 'stop',
      duration: 0
    };
  }

  getBestProvider(task: 'coding' | 'research' | 'analysis' | 'creative'): string | null {
    const providers = this.getAvailableProviders();
    
    // For now, OpenRouter is our primary provider for all tasks
    if (providers.find(p => p.id === 'openrouter')) {
      return 'openrouter';
    }
    
    // Fallback to extensible providers based on task
    switch (task) {
      case 'research':
        return providers.find(p => p.id === 'perplexity')?.id || null;
      case 'coding':
      case 'analysis':
      case 'creative':
        return providers.find(p => p.id === 'xai')?.id || 
               providers.find(p => p.id === 'abacusai')?.id || null;
      default:
        return providers[0]?.id || null;
    }
  }

  // Add new provider extension functionality
  async addCustomProvider(extensionRequest: any): Promise<boolean> {
    try {
      // Validate the extension request
      if (!extensionRequest.name || !extensionRequest.apiKeyName || !extensionRequest.baseUrl) {
        throw new Error('Invalid extension request');
      }

      // Check if API key exists in environment
      const apiKey = process.env[extensionRequest.apiKeyName];
      if (!apiKey) {
        throw new Error(`API key ${extensionRequest.apiKeyName} not found in environment`);
      }

      // Add to configs
      this.configs.set(extensionRequest.name, {
        apiKey,
        baseUrl: extensionRequest.baseUrl
      });

      console.log(`Successfully added provider: ${extensionRequest.displayName}`);
      return true;
    } catch (error) {
      console.error('Failed to add custom provider:', error);
      return false;
    }
  }

  getExtensibleProviders() {
    return [
      {
        id: 'xai',
        name: 'xAI Grok',
        apiKeyName: 'XAI_API_KEY',
        baseUrl: 'https://api.x.ai/v1',
        enabled: this.isProviderAvailable('xai')
      },
      {
        id: 'perplexity',
        name: 'Perplexity',
        apiKeyName: 'PERPLEXITY_API_KEY',
        baseUrl: 'https://api.perplexity.ai',
        enabled: this.isProviderAvailable('perplexity')
      },
      {
        id: 'abacusai',
        name: 'Abacus.AI',
        apiKeyName: 'ABACUSAI_API_KEY',
        baseUrl: 'https://cloud.abacus.ai/api',
        enabled: this.isProviderAvailable('abacusai')
      }
    ];
  }
}

export const aiProviderService = new AIProviderService();