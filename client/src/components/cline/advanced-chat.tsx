import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Bot, 
  User, 
  Send, 
  Loader2, 
  Settings, 
  Brain,
  MessageSquare,
  Copy,
  Check,
  CheckCircle,
  Zap,
  Sparkles,
  Folder,
  Code,
  Terminal as TerminalIcon,
  FileText,
  Monitor,
  Plus,
  History,
  UserCircle,
  Mic,
  Image as ImageIcon,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  Hash,
  AtSign,
  ChevronDown,
  X,
  PanelLeft,
  PanelRight,
  GripVertical
} from "lucide-react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { FileExplorer } from "./file-explorer";
import { CodeEditor } from "./code-editor";
import { Terminal } from "./terminal";
import { BrowserAutomation } from "./browser-automation";
import { MCPIntegration } from "./mcp-integration";
import { AgentSelector } from "./agent-selector";
import { ContextSelector } from "./context-selector";
import { ModelSelector } from "./model-selector";
import { VoiceTranscription } from "./voice-transcription";
import { FileUploader } from "./file-uploader";
import { SettingsPanel } from "./settings-panel";
import { TaskManager } from "./task-manager";

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  provider?: string;
  model?: string;
  cost?: number;
  tokensUsed?: number;
  rating?: 'good' | 'bad' | null;
}

interface Provider {
  id: string;
  name: string;
  displayName: string;
  models: Array<{
    id: string;
    name: string;
    displayName: string;
    contextWindow: number;
    inputCost: number;
    outputCost: number;
    isDefault?: boolean;
  }>;
  capabilities: Array<{
    type: string;
    level: string;
  }>;
  pricing: string;
}

interface ClineState {
  activeAgent: string;
  selectedContexts: string[];
  currentModel: string;
  taskList: any[];
  autoRunEnabled: boolean;
  voiceEnabled: boolean;
  uploadedFiles: File[];
}

export function AdvancedChat({ compact = false }: { compact?: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("chat");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [chatHistory, setChatHistory] = useState<string[]>([]);
  
  // Inline context selection state
  const [showInlineContexts, setShowInlineContexts] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  
  // Advanced state
  const [clineState, setClineState] = useState<ClineState>({
    activeAgent: "builder",
    selectedContexts: [],
    currentModel: "claude-4-sonnet",
    taskList: [],
    autoRunEnabled: false,
    voiceEnabled: true,
    uploadedFiles: []
  });

  // Right panel tool state
  const [activeRightTool, setActiveRightTool] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | undefined>(undefined);
  const [rightPanelVisible, setRightPanelVisible] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Fetch available providers
  const { data: providers } = useQuery({
    queryKey: ['/api/ai-providers'],
    select: (data) => data as { active: Provider[]; extensible: Provider[] },
  });

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: async (data: { 
      message: string; 
      agent: string; 
      contexts: string[];
      model: string;
      files?: File[];
    }) => {
      const response = await apiRequest("POST", "/api/cline/chat", data);
      return response.json();
    },
    onSuccess: (data) => {
      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
        provider: data.provider,
        model: data.model,
        cost: data.cost,
        tokensUsed: data.tokensUsed,
        rating: null
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      setIsLoading(false);
      
      toast({
        title: "Resposta Gerada",
        description: `Modelo: ${data.model} | Tokens: ${data.tokensUsed}`,
      });
    },
    onError: (error: any) => {
      setIsLoading(false);
      toast({
        title: "Erro",
        description: error.message || "Falha ao enviar mensagem",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    
    // Add to chat history
    setChatHistory(prev => [input, ...prev.slice(0, 9)]); // Keep last 10

    sendMutation.mutate({
      message: input,
      agent: clineState.activeAgent,
      contexts: clineState.selectedContexts,
      model: clineState.currentModel,
      files: clineState.uploadedFiles
    });

    setInput("");
    setClineState(prev => ({ ...prev, uploadedFiles: [] }));
  };

  const handleCopy = async (content: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(messageId);
      setTimeout(() => setCopiedId(null), 2000);
      
      toast({
        title: "Copiado!",
        description: "Mensagem copiada para a área de transferência",
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Falha ao copiar mensagem",
        variant: "destructive",
      });
    }
  };

  const handleRating = (messageId: string, rating: 'good' | 'bad') => {
    setMessages(prev => prev.map(msg => 
      msg.id === messageId ? { ...msg, rating } : msg
    ));
    
    toast({
      title: rating === 'good' ? "👍 Feedback Positivo" : "👎 Feedback Negativo",
      description: "Obrigado pelo feedback! Isso nos ajuda a melhorar.",
    });
  };

  const handleRetry = (messageId: string) => {
    const message = messages.find(msg => msg.id === messageId);
    if (message && message.role === 'user') {
      setInput(message.content);
      inputRef.current?.focus();
    }
  };

  const startNewChat = () => {
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: messages[0].content, // Keep welcome message
      timestamp: new Date(),
    }]);
    setInput("");
    setClineState(prev => ({ 
      ...prev, 
      selectedContexts: [], 
      uploadedFiles: [] 
    }));
    
    toast({
      title: "Novo Chat",
      description: "Conversa reiniciada com sucesso!",
    });
  };

  // Check if input has content for button color
  const hasContent = input.trim().length > 0 || clineState.uploadedFiles.length > 0;

  // Context options for inline selection (same as ContextSelector)
  const contextOptions = [
    { id: "workspace", name: "Workspace", icon: "🏢", description: "Todo o workspace atual" },
    { id: "client-src", name: "Frontend Source", icon: "📁", description: "Código frontend da aplicação" },
    { id: "server", name: "Backend Source", icon: "📁", description: "Código backend da aplicação" },
    { id: "shared", name: "Shared Types", icon: "📁", description: "Tipos compartilhados" },
    { id: "package-json", name: "package.json", icon: "📄", description: "Dependências do projeto" },
    { id: "schema", name: "Database Schema", icon: "📄", description: "Schema do banco" },
    { id: "readme", name: "Project Doc", icon: "📖", description: "Documentação" },
    { id: "web-search", name: "Web Search", icon: "🌐", description: "Resultados de pesquisa web" },
    { id: "current-url", name: "Current URL", icon: "🌐", description: "Conteúdo da URL atual" }
  ];

  // Handle input changes and detect # for inline context selection
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    
    setInput(value);
    setCursorPosition(cursorPos);
    
    // Check if user typed # at current position
    const beforeCursor = value.substring(0, cursorPos);
    const hashIndex = beforeCursor.lastIndexOf('#');
    
    if (hashIndex !== -1 && hashIndex === cursorPos - 1) {
      // User just typed #, show context dropdown
      setShowInlineContexts(true);
    } else if (hashIndex !== -1 && cursorPos > hashIndex) {
      // User is typing after #, keep dropdown open
      const afterHash = beforeCursor.substring(hashIndex + 1);
      setShowInlineContexts(afterHash.length <= 20); // Close if too long
    } else {
      // No # in current context, hide dropdown
      setShowInlineContexts(false);
    }
  };

  // Handle inline context selection
  const handleInlineContextSelect = (contextId: string, contextName: string) => {
    const beforeCursor = input.substring(0, cursorPosition);
    const afterCursor = input.substring(cursorPosition);
    const hashIndex = beforeCursor.lastIndexOf('#');
    
    if (hashIndex !== -1) {
      const beforeHash = beforeCursor.substring(0, hashIndex);
      const newInput = beforeHash + `#${contextName} ` + afterCursor;
      setInput(newInput);
      
      // Add to selected contexts if not already there
      if (!clineState.selectedContexts.includes(contextId)) {
        setClineState(prev => ({
          ...prev,
          selectedContexts: [...prev.selectedContexts, contextId]
        }));
      }
    }
    
    setShowInlineContexts(false);
    inputRef.current?.focus();
  };

  // Compact mode for sidebar usage
  if (compact) {
    return (
      <div className="h-full flex flex-col bg-background">
        {/* Compact Header */}
        <div className="flex-shrink-0 border-b px-3 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Bot className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">Cline AI</span>
            </div>
            <div className="flex items-center space-x-1">
              <Button size="sm" variant="ghost" onClick={startNewChat} data-testid="button-new-chat">
                <Plus className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowSettings(!showSettings)} data-testid="button-settings">
                <Settings className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>

        {/* Compact Controls */}
        <div className="flex-shrink-0 p-2 border-b bg-muted/20">
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <AgentSelector 
                value={clineState.activeAgent}
                onChange={(agent) => setClineState(prev => ({ ...prev, activeAgent: agent }))}
                compact
              />
            </div>
            <div className="flex items-center space-x-2">
              <ModelSelector 
                value={clineState.currentModel}
                onChange={(model) => setClineState(prev => ({ ...prev, currentModel: model }))}
                providers={providers}
                compact
              />
            </div>
            {clineState.selectedContexts.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {clineState.selectedContexts.map((contextId) => {
                  const context = contextOptions.find(c => c.id === contextId);
                  return context ? (
                    <Badge key={contextId} variant="secondary" className="text-xs px-1 py-0">
                      {context.icon} {context.name}
                      <X 
                        className="h-3 w-3 ml-1 cursor-pointer" 
                        onClick={() => {
                          setClineState(prev => ({
                            ...prev,
                            selectedContexts: prev.selectedContexts.filter(id => id !== contextId)
                          }));
                        }}
                      />
                    </Badge>
                  ) : null;
                })}
              </div>
            )}
          </div>
        </div>

        {/* Chat Area - Increased padding for better text readability */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <ScrollArea ref={scrollRef} className="flex-1 p-4">
            <div className="space-y-4">
              {messages.length === 0 && (
                <div className="text-center py-8">
                  <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-semibold text-lg mb-2">Cline AI Assistant</h3>
                  <p className="text-muted-foreground text-sm">
                    Olá! Eu sou o Cline, seu assistente de desenvolvimento.<br/>
                    Digite sua pergunta ou tarefa abaixo.
                  </p>
                </div>
              )}
              
              {messages.map((message) => (
                <div key={message.id} className={cn(
                  "flex gap-3",
                  message.role === 'user' ? "justify-end" : "justify-start"
                )}>
                  {message.role === 'assistant' && (
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                        <Bot className="h-4 w-4 text-primary-foreground" />
                      </div>
                    </div>
                  )}
                  
                  <div className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                    message.role === 'user' 
                      ? "bg-primary text-primary-foreground ml-auto" 
                      : "bg-muted"
                  )}>
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    
                    {message.role === 'assistant' && (
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-muted-foreground/20">
                        <div className="flex items-center space-x-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleCopy(message.content, message.id)}
                            className="h-6 p-1"
                            data-testid={`button-copy-${message.id}`}
                          >
                            {copiedId === message.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRating(message.id, 'good')}
                            className={cn("h-6 p-1", message.rating === 'good' && "text-green-600")}
                            data-testid={`button-like-${message.id}`}
                          >
                            <ThumbsUp className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRating(message.id, 'bad')}
                            className={cn("h-6 p-1", message.rating === 'bad' && "text-red-600")}
                            data-testid={`button-dislike-${message.id}`}
                          >
                            <ThumbsDown className="h-3 w-3" />
                          </Button>
                        </div>
                        {message.model && (
                          <span className="text-xs text-muted-foreground">{message.model}</span>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {message.role === 'user' && (
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  )}
                </div>
              ))}
              
              {isLoading && (
                <div className="flex gap-3">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                      <Loader2 className="h-4 w-4 text-primary-foreground animate-spin" />
                    </div>
                  </div>
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <div className="flex items-center space-x-2">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span className="text-sm text-muted-foreground">Pensando...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Compact Input */}
          <div className="flex-shrink-0 p-3 border-t bg-background">
            <form onSubmit={handleSubmit} className="relative">
              <div className="flex items-center space-x-2">
                <div className="flex-1 relative">
                  <Textarea
                    ref={inputRef}
                    value={input}
                    onChange={handleInputChange}
                    placeholder="Digite sua mensagem... (use # para contexto)"
                    disabled={isLoading}
                    className="pr-12 text-sm resize-none min-h-[2.5rem] max-h-[80vh] overflow-y-auto"
                    rows={1}
                    style={{
                      height: 'auto',
                      minHeight: '2.5rem',
                      maxHeight: window.innerWidth <= 768 ? '80vh' : '12rem'
                    }}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = Math.min(target.scrollHeight, window.innerWidth <= 768 ? window.innerHeight * 0.8 : 192) + 'px';
                    }}
                    data-testid="textarea-message"
                  />
                  
                  {/* Inline Context Dropdown */}
                  {showInlineContexts && (
                    <div className="absolute bottom-full left-0 right-0 mb-1 bg-popover border rounded-md shadow-lg z-50 max-h-40 overflow-y-auto">
                      <div className="p-1">
                        {contextOptions.map((context) => (
                          <button
                            key={context.id}
                            type="button"
                            onClick={() => handleInlineContextSelect(context.id, context.name)}
                            className="w-full text-left px-2 py-1.5 hover:bg-accent rounded text-xs flex items-center space-x-2"
                          >
                            <span>{context.icon}</span>
                            <span>{context.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                <FileUploader 
                  files={clineState.uploadedFiles}
                  onChange={(files) => setClineState(prev => ({ ...prev, uploadedFiles: files }))}
                  compact
                />
                
                <Button 
                  type="submit" 
                  size="sm" 
                  disabled={isLoading || (!input.trim() && clineState.uploadedFiles.length === 0)}
                  className={cn(
                    "transition-all duration-200",
                    hasContent ? "bg-primary hover:bg-primary/90" : "bg-muted-foreground hover:bg-muted-foreground/90"
                  )}
                  data-testid="button-send"
                >
                  {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                </Button>
              </div>
              
              {clineState.uploadedFiles.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {clineState.uploadedFiles.map((file, index) => (
                    <Badge key={index} variant="outline" className="text-xs px-1 py-0">
                      📎 {file.name}
                      <X 
                        className="h-3 w-3 ml-1 cursor-pointer" 
                        onClick={() => {
                          setClineState(prev => ({
                            ...prev,
                            uploadedFiles: prev.uploadedFiles.filter((_, i) => i !== index)
                          }));
                        }}
                      />
                    </Badge>
                  ))}
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <SettingsPanel 
            onClose={() => setShowSettings(false)}
            clineState={clineState}
            onStateChange={setClineState}
            compact
          />
        )}
      </div>
    );
  }

  // Full mode for standalone usage
  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header Compacto */}
      <div className="flex-shrink-0 border-b px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Bot className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">Cline AI</span>
            <Badge variant="outline" className="text-xs px-1 py-0">Avançado</Badge>
          </div>
          
          <div className="flex items-center space-x-1">
            <Button size="sm" variant="ghost" onClick={startNewChat} data-testid="button-new-chat">
              <Plus className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => {}} data-testid="button-history">
              <History className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowSettings(!showSettings)} data-testid="button-settings">
              <Settings className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowUserMenu(!showUserMenu)} data-testid="button-user-menu">
              <UserCircle className="h-3 w-3" />
            </Button>
            
            {showUserMenu && (
              <div className="absolute right-3 top-12 w-40 bg-popover border rounded-md shadow-lg z-50">
                <div className="py-1 text-sm">
                  <button className="w-full text-left px-2 py-1 hover:bg-accent">Account</button>
                  <button className="w-full text-left px-2 py-1 hover:bg-accent">Settings</button>
                  <Separator className="my-1" />
                  <button className="w-full text-left px-2 py-1 hover:bg-accent text-red-600">Logout</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Layout Principal com Painéis Redimensionáveis */}
      <PanelGroup direction="horizontal" className="flex-1">
        {/* Painel Esquerdo - Navegação/Tools */}
        <Panel defaultSize={20} minSize={15} maxSize={35}>
          <div className="h-full border-r bg-muted/20">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
              <TabsList className="flex-shrink-0 grid w-full grid-cols-3 bg-transparent p-1 h-auto">
                <TabsTrigger value="chat" className="flex flex-col items-center p-1 text-xs">
                  <MessageSquare className="h-3 w-3" />
                  <span className="mt-1">Chat</span>
                </TabsTrigger>
                <TabsTrigger value="tools" className="flex flex-col items-center p-1 text-xs">
                  <Settings className="h-3 w-3" />
                  <span className="mt-1">Tools</span>
                </TabsTrigger>
                <TabsTrigger value="mcp" className="flex flex-col items-center p-1 text-xs">
                  <Zap className="h-3 w-3" />
                  <span className="mt-1">MCP</span>
                </TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-hidden">
                <TabsContent value="chat" className="mt-0 h-full p-2">
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-muted-foreground">Agentes</h4>
                    <AgentSelector 
                      value={clineState.activeAgent}
                      onChange={(agent) => setClineState(prev => ({ ...prev, activeAgent: agent }))}
                    />
                    
                    <h4 className="text-xs font-medium text-muted-foreground mt-3">Contexto</h4>
                    <ContextSelector 
                      value={clineState.selectedContexts}
                      onChange={(contexts) => setClineState(prev => ({ ...prev, selectedContexts: contexts }))}
                    />

                    <h4 className="text-xs font-medium text-muted-foreground mt-3">Modelo</h4>
                    <ModelSelector 
                      value={clineState.currentModel}
                      onChange={(model) => setClineState(prev => ({ ...prev, currentModel: model }))}
                      providers={providers}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="tools" className="mt-0 h-full p-2">
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-muted-foreground">Ferramentas</h4>
                    <div className="space-y-1">
                      <Button 
                        variant={activeRightTool === 'files' ? 'default' : 'ghost'} 
                        size="sm" 
                        className="w-full justify-start h-8 px-2"
                        onClick={() => {
                          setActiveRightTool('files');
                          setRightPanelVisible(true);
                        }}
                        data-testid="button-tool-files"
                      >
                        <Folder className="h-3 w-3 mr-2" />
                        <span className="text-xs">Files</span>
                      </Button>
                      <Button 
                        variant={activeRightTool === 'code' ? 'default' : 'ghost'} 
                        size="sm" 
                        className="w-full justify-start h-8 px-2"
                        onClick={() => {
                          setActiveRightTool('code');
                          setRightPanelVisible(true);
                        }}
                        data-testid="button-tool-code"
                      >
                        <Code className="h-3 w-3 mr-2" />
                        <span className="text-xs">Code</span>
                      </Button>
                      <Button 
                        variant={activeRightTool === 'terminal' ? 'default' : 'ghost'} 
                        size="sm" 
                        className="w-full justify-start h-8 px-2"
                        onClick={() => {
                          setActiveRightTool('terminal');
                          setRightPanelVisible(true);
                        }}
                        data-testid="button-tool-terminal"
                      >
                        <TerminalIcon className="h-3 w-3 mr-2" />
                        <span className="text-xs">Terminal</span>
                      </Button>
                      <Button 
                        variant={activeRightTool === 'browser' ? 'default' : 'ghost'} 
                        size="sm" 
                        className="w-full justify-start h-8 px-2"
                        onClick={() => {
                          setActiveRightTool('browser');
                          setRightPanelVisible(true);
                        }}
                        data-testid="button-tool-browser"
                      >
                        <Monitor className="h-3 w-3 mr-2" />
                        <span className="text-xs">Browser</span>
                      </Button>
                    </div>

                    <Separator className="my-2" />
                    
                    <h4 className="text-xs font-medium text-muted-foreground">Utilitários</h4>
                    <div className="space-y-1">
                      <Button 
                        variant={activeRightTool === 'tasks' ? 'default' : 'ghost'} 
                        size="sm" 
                        className="w-full justify-start h-8 px-2"
                        onClick={() => {
                          setActiveRightTool('tasks');
                          setRightPanelVisible(true);
                        }}
                        data-testid="button-tool-tasks"
                      >
                        <CheckCircle className="h-3 w-3 mr-2" />
                        <span className="text-xs">Tasks</span>
                      </Button>
                      <Button 
                        variant={activeRightTool === 'voice' ? 'default' : 'ghost'} 
                        size="sm" 
                        className="w-full justify-start h-8 px-2"
                        onClick={() => {
                          setActiveRightTool('voice');
                          setRightPanelVisible(true);
                        }}
                        data-testid="button-tool-voice"
                      >
                        <Mic className="h-3 w-3 mr-2" />
                        <span className="text-xs">Voice</span>
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="mcp" className="mt-0 h-full p-2">
                  <MCPIntegration />
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </Panel>

        <PanelResizeHandle className="w-1 bg-transparent hover:bg-accent/50 transition-colors" />

        {/* Painel Central - Chat */}
        <Panel defaultSize={rightPanelVisible ? 50 : 80} minSize={40}>
          <div className="h-full flex flex-col">
            {/* Mensagem de Boas Vindas */}
            {messages.length === 0 && (
              <div className="flex-1 flex items-center justify-center p-4">
                <div className="text-center text-muted-foreground max-w-md">
                  <Bot className="h-8 w-8 mx-auto mb-3 text-primary" />
                  <h3 className="font-medium text-sm mb-2">Bem-vindo ao Cline AI</h3>
                  <p className="text-xs leading-relaxed">
                    Selecione um agente (@), escolha o contexto (#) e comece a conversar. Tenho acesso a todas as ferramentas para ajudá-lo com desenvolvimento e análise de código.
                  </p>
                </div>
              </div>
            )}
            <Tabs defaultValue="chat" className="h-full flex flex-col">
              <TabsList className="flex-shrink-0 grid w-full grid-cols-5 bg-transparent p-1 h-auto">
                <TabsTrigger value="chat" className="flex flex-col items-center p-1 text-xs" data-testid="tab-chat">
                  <MessageSquare className="h-3 w-3" />
                  <span className="mt-1">Chat</span>
                </TabsTrigger>
                <TabsTrigger value="agents" className="flex flex-col items-center p-1 text-xs" data-testid="tab-agents">
                  <Bot className="h-3 w-3" />
                  <span className="mt-1">Agents</span>
                </TabsTrigger>
                <TabsTrigger value="mcp" className="flex flex-col items-center p-1 text-xs" data-testid="tab-mcp">
                  <Zap className="h-3 w-3" />
                  <span className="mt-1">MCP</span>
                </TabsTrigger>
                <TabsTrigger value="context" className="flex flex-col items-center p-1 text-xs" data-testid="tab-context">
                  <Hash className="h-3 w-3" />
                  <span className="mt-1">Context</span>
                </TabsTrigger>
                <TabsTrigger value="models" className="flex flex-col items-center p-1 text-xs" data-testid="tab-models">
                  <Brain className="h-3 w-3" />
                  <span className="mt-1">Models</span>
                </TabsTrigger>
              </TabsList>

          {/* Tab Content - Chat */}
          <TabsContent value="chat" className="flex-1 flex flex-col mt-0 h-full">
            {/* Messages Area - Takes most space */}
            <div className="flex-1 overflow-hidden">
              <ScrollArea className="h-full p-4" ref={scrollRef}>
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        "flex w-full group",
                        message.role === "user" ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "flex max-w-[80%] space-x-2",
                          message.role === "user" ? "flex-row-reverse space-x-reverse" : "flex-row"
                        )}
                      >
                        <div
                          className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                            message.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {message.role === "user" ? (
                            <User className="h-4 w-4" />
                          ) : (
                            <Bot className="h-4 w-4" />
                          )}
                        </div>
                        <div
                          className={cn(
                            "rounded-lg px-3 py-2 prose prose-sm max-w-none relative",
                            message.role === "user"
                              ? "bg-primary text-primary-foreground ml-2"
                              : "bg-muted text-foreground mr-2"
                          )}
                        >
                          <div className="whitespace-pre-wrap break-words">
                            {message.content}
                          </div>
                          
                          {/* Message Actions */}
                          {message.role === 'assistant' && (
                            <div className="absolute -right-1 -top-1 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 bg-background hover:bg-accent border"
                                onClick={() => handleCopy(message.content, message.id)}
                                data-testid={`button-copy-${message.id}`}
                              >
                                {copiedId === message.id ? (
                                  <Check className="h-3 w-3" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 bg-background hover:bg-accent border"
                                onClick={() => handleRating(message.id, 'good')}
                                data-testid={`button-like-${message.id}`}
                              >
                                <ThumbsUp className={cn("h-3 w-3", message.rating === 'good' && "text-green-600")} />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 bg-background hover:bg-accent border"
                                onClick={() => handleRating(message.id, 'bad')}
                                data-testid={`button-dislike-${message.id}`}
                              >
                                <ThumbsDown className={cn("h-3 w-3", message.rating === 'bad' && "text-red-600")} />
                              </Button>
                            </div>
                          )}
                          
                          {/* User Message Actions */}
                          {message.role === 'user' && (
                            <div className="absolute -left-1 -top-1 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 bg-background hover:bg-accent border"
                                onClick={() => handleRetry(message.id)}
                                data-testid={`button-retry-${message.id}`}
                              >
                                <RotateCcw className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 bg-background hover:bg-accent border"
                                onClick={() => handleCopy(message.content, message.id)}
                                data-testid={`button-copy-user-${message.id}`}
                              >
                                {copiedId === message.id ? (
                                  <Check className="h-3 w-3" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                          )}
                          
                          {/* Message Metadata */}
                          {(message.provider || message.model) && (
                            <div className="mt-2 pt-2 border-t border-border/50">
                              <div className="flex flex-wrap gap-2 text-xs opacity-70">
                                {message.model && (
                                  <Badge variant="secondary" className="text-xs">
                                    {message.model}
                                  </Badge>
                                )}
                                {message.tokensUsed && (
                                  <Badge variant="outline" className="text-xs">
                                    {message.tokensUsed} tokens
                                  </Badge>
                                )}
                                {message.cost && (
                                  <Badge variant="outline" className="text-xs">
                                    ${message.cost.toFixed(4)}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="flex items-center space-x-2 bg-muted rounded-lg px-3 py-2">
                        <Bot className="h-4 w-4" />
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Processando...</span>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
            
            {/* Input Area - FIXED: Removed fixed positioning to allow scrolling */}
            <div>
              {/* Action Icons Above Prompt */}
              {messages.length > 0 && (
                <div className="px-4 py-2 border-t">
                  <div className="flex justify-center space-x-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRating(messages[messages.length - 1]?.id, 'good')}
                      data-testid="button-good"
                    >
                      <ThumbsUp className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRating(messages[messages.length - 1]?.id, 'bad')}
                      data-testid="button-bad"
                    >
                      <ThumbsDown className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCopy(messages[messages.length - 1]?.content || '', messages[messages.length - 1]?.id)}
                      data-testid="button-copy"
                    >
                      {copiedId === messages[messages.length - 1]?.id ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRetry(messages[messages.length - 1]?.id)}
                      data-testid="button-retry"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Advanced Prompt Area */}
              <div className="p-4 border-t bg-muted/30">
                <form onSubmit={handleSubmit} className="space-y-3">
                  {/* Uploaded Files Display */}
                  {clineState.uploadedFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {clineState.uploadedFiles.map((file, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          📎 {file.name}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Main Input Row */}
                  <div className="flex items-end space-x-2">
                    {/* Left Icons */}
                    <div className="flex items-center space-x-1">
                      <AgentSelector 
                        value={clineState.activeAgent}
                        onChange={(agent) => setClineState(prev => ({ ...prev, activeAgent: agent }))}
                      />
                      <ContextSelector 
                        value={clineState.selectedContexts}
                        onChange={(contexts) => setClineState(prev => ({ ...prev, selectedContexts: contexts }))}
                      />
                      <FileUploader 
                        onFilesSelected={(files) => setClineState(prev => ({ ...prev, uploadedFiles: files }))}
                      />
                    </div>

                    {/* Center - Input + Model Selector */}
                    <div className="flex-1 flex flex-col space-y-2">
                      <ModelSelector 
                        value={clineState.currentModel}
                        onChange={(model) => setClineState(prev => ({ ...prev, currentModel: model }))}
                        providers={providers}
                      />
                      <div className="relative">
                        <Textarea
                          ref={inputRef}
                          value={input}
                          onChange={handleInputChange}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape' && showInlineContexts) {
                              setShowInlineContexts(false);
                              e.preventDefault();
                            }
                          }}
                          placeholder="Digite sua mensagem... Use @ para agentes e # para contexto"
                          disabled={isLoading}
                          className="min-h-[44px] resize-none max-h-[80vh] overflow-y-auto"
                          rows={1}
                          style={{
                            height: 'auto',
                            minHeight: '44px',
                            maxHeight: window.innerWidth <= 768 ? '80vh' : '12rem'
                          }}
                          onInput={(e) => {
                            const target = e.target as HTMLTextAreaElement;
                            target.style.height = 'auto';
                            target.style.height = Math.min(target.scrollHeight, window.innerWidth <= 768 ? window.innerHeight * 0.8 : 192) + 'px';
                          }}
                          data-testid="textarea-message"
                        />
                        
                        {/* Inline Context Dropdown */}
                        {showInlineContexts && (
                          <div className="absolute bottom-full left-0 mb-1 w-80 bg-popover border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                            <div className="p-2">
                              <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center">
                                <Hash className="h-3 w-3 mr-1" />
                                Selecione um contexto
                              </div>
                              <div className="space-y-1">
                                {contextOptions.map((option) => (
                                  <button
                                    key={option.id}
                                    onClick={() => handleInlineContextSelect(option.id, option.name)}
                                    className="w-full text-left p-2 rounded-md hover:bg-accent transition-colors text-sm"
                                    data-testid={`inline-context-${option.id}`}
                                  >
                                    <div className="flex items-center space-x-2">
                                      <span className="text-base">{option.icon}</span>
                                      <div className="flex-1 min-w-0">
                                        <div className="font-medium">{option.name}</div>
                                        <div className="text-xs text-muted-foreground truncate">
                                          {option.description}
                                        </div>
                                      </div>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right Icons */}
                    <div className="flex items-center space-x-1">
                      <VoiceTranscription 
                        enabled={clineState.voiceEnabled}
                        onTranscription={(text) => setInput(text)}
                      />
                      <Button
                        type="submit"
                        disabled={!hasContent || isLoading}
                        className={cn(
                          "transition-colors",
                          hasContent ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"
                        )}
                        data-testid="button-send"
                      >
                        {isLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </TabsContent>

          {/* Other Tabs */}
          <TabsContent value="agents" className="flex-1 flex flex-col mt-0">
            <div className="p-4 space-y-4">
              <h3 className="text-lg font-semibold">Agentes Disponíveis</h3>
              <AgentSelector 
                value={clineState.activeAgent}
                onChange={(agent) => setClineState(prev => ({ ...prev, activeAgent: agent }))}
              />
              <div className="mt-4 p-4 bg-muted/30 rounded-lg">
                <h4 className="text-sm font-medium mb-2">Agente Atual: {clineState.activeAgent}</h4>
                <p className="text-xs text-muted-foreground">
                  {clineState.activeAgent === 'builder' && 'Especialista em desenvolvimento, debugging e deploy.'}
                  {clineState.activeAgent === 'analyzer' && 'Especialista em análise de código e performance.'}
                  {clineState.activeAgent === 'automator' && 'Especialista em automação e workflows.'}
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="mcp" className="flex-1 flex flex-col mt-0">
            <div className="p-4">
              <MCPIntegration />
            </div>
          </TabsContent>

          <TabsContent value="context" className="flex-1 flex flex-col mt-0">
            <div className="p-4 space-y-4">
              <h3 className="text-lg font-semibold">Contexto Selecionado</h3>
              <ContextSelector 
                value={clineState.selectedContexts}
                onChange={(contexts) => setClineState(prev => ({ ...prev, selectedContexts: contexts }))}
              />
              {clineState.selectedContexts.length > 0 && (
                <div className="mt-4 p-4 bg-muted/30 rounded-lg">
                  <h4 className="text-sm font-medium mb-2">Contextos Ativos:</h4>
                  <div className="flex flex-wrap gap-2">
                    {clineState.selectedContexts.map(contextId => {
                      const context = contextOptions.find(c => c.id === contextId);
                      return context ? (
                        <Badge key={contextId} variant="secondary" className="text-xs">
                          {context.icon} {context.name}
                        </Badge>
                      ) : null;
                    })}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="models" className="flex-1 flex flex-col mt-0">
            <div className="p-4 space-y-4">
              <h3 className="text-lg font-semibold">Modelos de AI</h3>
              <ModelSelector 
                value={clineState.currentModel}
                onChange={(model) => setClineState(prev => ({ ...prev, currentModel: model }))}
                providers={providers}
              />
              <div className="mt-4 p-4 bg-muted/30 rounded-lg">
                <h4 className="text-sm font-medium mb-2">Modelo Atual: {clineState.currentModel}</h4>
                <p className="text-xs text-muted-foreground">
                  Modelo selecionado para as próximas interações.
                </p>
              </div>
            </div>
          </TabsContent>
            </Tabs>
          </div>
        </Panel>

        {/* Third Panel - Tools (Right) */}
        {rightPanelVisible && (
          <>
            <PanelResizeHandle className="w-2 bg-muted hover:bg-accent transition-colors flex items-center justify-center">
              <GripVertical className="h-3 w-3 text-muted-foreground" />
            </PanelResizeHandle>
            
            <Panel defaultSize={30} minSize={20} maxSize={50}>
              <div className="h-full border-l bg-muted/10">
                <div className="p-3 border-b bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      {activeRightTool === 'files' && <Folder className="h-4 w-4" />}
                      {activeRightTool === 'code' && <Code className="h-4 w-4" />}
                      {activeRightTool === 'terminal' && <TerminalIcon className="h-4 w-4" />}
                      {activeRightTool === 'browser' && <Monitor className="h-4 w-4" />}
                      {activeRightTool === 'tasks' && <CheckCircle className="h-4 w-4" />}
                      {activeRightTool === 'voice' && <Mic className="h-4 w-4" />}
                      <span className="font-medium text-sm capitalize">
                        {activeRightTool}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setRightPanelVisible(false);
                        setActiveRightTool(null);
                      }}
                      className="h-6 w-6 p-0"
                      data-testid="button-close-right-panel"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                
                <div className="flex-1 overflow-hidden h-full">
                  {activeRightTool === 'files' && (
                    <FileExplorer 
                      onFileSelect={(file) => {
                        setSelectedFile(file.path);
                        setActiveRightTool('code');
                      }}
                      selectedPath={selectedFile}
                    />
                  )}
                  {activeRightTool === 'code' && (
                    <CodeEditor 
                      filePath={selectedFile}
                      onClose={() => {
                        setSelectedFile(undefined);
                        setActiveRightTool('files');
                      }}
                    />
                  )}
                  {activeRightTool === 'terminal' && <Terminal />}
                  {activeRightTool === 'browser' && <BrowserAutomation />}
                  {activeRightTool === 'tasks' && <TaskManager />}
                  {activeRightTool === 'voice' && <VoiceTranscription enabled={clineState.voiceEnabled} onTranscription={(text) => setInput(text)} />}
                </div>
              </div>
            </Panel>
          </>
        )}

      </PanelGroup>

      {/* Settings Panel */}
      {showSettings && (
        <SettingsPanel 
          onClose={() => setShowSettings(false)}
          clineState={clineState}
          onStateChange={setClineState}
        />
      )}
    </div>
  );
}