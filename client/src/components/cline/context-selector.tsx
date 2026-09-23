import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Hash, 
  File, 
  Folder, 
  Book, 
  Globe, 
  Layers,
  ChevronDown,
  Search,
  X
} from "lucide-react";

interface ContextSelectorProps {
  value: string[];
  onChange: (contexts: string[]) => void;
}

interface ContextOption {
  id: string;
  name: string;
  type: 'file' | 'folder' | 'doc' | 'web' | 'workspace';
  icon: any;
  path?: string;
  description: string;
}

const contextOptions: ContextOption[] = [
  {
    id: "workspace",
    name: "Workspace",
    type: "workspace", 
    icon: Layers,
    description: "Todo o workspace atual"
  },
  {
    id: "client-src",
    name: "Frontend Source",
    type: "folder",
    icon: Folder,
    path: "client/src",
    description: "Código frontend da aplicação"
  },
  {
    id: "server",
    name: "Backend Source", 
    type: "folder",
    icon: Folder,
    path: "server",
    description: "Código backend da aplicação"
  },
  {
    id: "shared",
    name: "Shared Types",
    type: "folder", 
    icon: Folder,
    path: "shared",
    description: "Tipos e schemas compartilhados"
  },
  {
    id: "package-json",
    name: "package.json",
    type: "file",
    icon: File,
    path: "package.json", 
    description: "Dependências do projeto"
  },
  {
    id: "schema",
    name: "Database Schema",
    type: "file",
    icon: File,
    path: "shared/schema.ts",
    description: "Schema do banco de dados"
  },
  {
    id: "readme",
    name: "Project Documentation",
    type: "doc",
    icon: Book,
    path: "README.md",
    description: "Documentação do projeto"
  },
  {
    id: "web-search",
    name: "Web Search Results",
    type: "web",
    icon: Globe,
    description: "Resultados de pesquisa web em tempo real"
  },
  {
    id: "current-url", 
    name: "Current URL Content",
    type: "web",
    icon: Globe,
    description: "Conteúdo da URL atual sendo exibida"
  }
];

export function ContextSelector({ value, onChange }: ContextSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredOptions = contextOptions.filter(option =>
    option.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    option.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleToggle = (optionId: string) => {
    const newValue = value.includes(optionId)
      ? value.filter(id => id !== optionId)
      : [...value, optionId];
    onChange(newValue);
  };

  const handleRemove = (optionId: string) => {
    onChange(value.filter(id => id !== optionId));
  };

  const selectedOptions = contextOptions.filter(option => value.includes(option.id));

  return (
    <div className="relative">
      {/* Selected Context Display */}
      {selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          {selectedOptions.map((option) => (
            <Badge 
              key={option.id} 
              variant="secondary" 
              className="text-xs flex items-center gap-1"
            >
              <option.icon className="h-3 w-3" />
              {option.name}
              <button
                onClick={() => handleRemove(option.id)}
                className="hover:bg-destructive/20 rounded-full p-0.5"
              >
                <X className="h-2 w-2" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-1"
        data-testid="button-context-selector"
      >
        <Hash className="h-3 w-3" />
        <span className="text-xs">
          {value.length === 0 ? "Contexto" : `${value.length} selecionado${value.length > 1 ? 's' : ''}`}
        </span>
        <ChevronDown className="h-3 w-3" />
      </Button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-96 bg-popover border rounded-md shadow-lg z-50">
          <div className="p-3">
            <h4 className="font-semibold text-sm mb-3 flex items-center">
              <Hash className="h-4 w-4 mr-2" />
              Selecionar Contexto
            </h4>
            
            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar contexto..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {/* Context Categories */}
              <div>
                <h5 className="text-xs font-medium text-muted-foreground mb-2">
                  Fontes de Contexto
                </h5>
                <div className="space-y-1">
                  {filteredOptions.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => handleToggle(option.id)}
                      className={`w-full text-left p-2 rounded-md hover:bg-accent transition-colors ${
                        value.includes(option.id) ? 'bg-accent ring-1 ring-primary/20' : ''
                      }`}
                      data-testid={`context-${option.id}`}
                    >
                      <div className="flex items-start space-x-2">
                        <option.icon className={`h-4 w-4 mt-0.5 ${
                          value.includes(option.id) ? 'text-primary' : 'text-muted-foreground'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm flex items-center">
                            {option.name}
                            {value.includes(option.id) && (
                              <Badge variant="outline" className="ml-2 text-xs px-1">
                                Ativo
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {option.description}
                          </div>
                          {option.path && (
                            <div className="text-xs text-muted-foreground font-mono mt-1">
                              {option.path}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {filteredOptions.length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-4">
                  Nenhum contexto encontrado para "{searchQuery}"
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between mt-3 pt-2 border-t">
              <div className="text-xs text-muted-foreground">
                {value.length} contexto{value.length !== 1 ? 's' : ''} selecionado{value.length !== 1 ? 's' : ''}
              </div>
              <div className="flex space-x-2">
                {value.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onChange([])}
                    className="text-xs h-6"
                  >
                    Limpar
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  className="text-xs h-6"
                >
                  Fechar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}