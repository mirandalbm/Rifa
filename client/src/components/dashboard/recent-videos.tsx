import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Video, Eye, ThumbsUp, MessageCircle, ExternalLink } from "lucide-react";

interface RecentVideo {
  id: string;
  title: string;
  language: string;
  status: string;
  views: number;
  likes: number;
  comments: number;
  youtubeVideoId?: string;
  createdAt: string;
  updatedAt: string;
}

export default function RecentVideos() {
  const { data: videos, isLoading } = useQuery<RecentVideo[]>({
    queryKey: ["/api/videos", { status: "published" }],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const formatViews = (views: number) => {
    if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M`;
    if (views >= 1000) return `${(views / 1000).toFixed(1)}K`;
    return views.toString();
  };

  const getLanguageFlag = (language: string) => {
    const flags: { [key: string]: string } = {
      'en-US': '🇺🇸',
      'pt-BR': '🇧🇷',
      'es-ES': '🇪🇸',
      'es-MX': '🇲🇽',
      'de-DE': '🇩🇪',
      'fr-FR': '🇫🇷',
      'hi-IN': '🇮🇳',
      'ja-JP': '🇯🇵',
    };
    return flags[language] || '🌍';
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    
    const diffInWeeks = Math.floor(diffInDays / 7);
    return `${diffInWeeks}w ago`;
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground flex items-center">
          <Video className="h-5 w-5 mr-2" />
          Recently Published Videos
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {isLoading ? (
            [...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div className="flex items-center space-x-4">
                  <Skeleton className="w-16 h-10 rounded" />
                  <div>
                    <Skeleton className="h-4 w-48 mb-2" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center space-x-4">
                    <Skeleton className="h-3 w-8" />
                    <Skeleton className="h-3 w-8" />
                    <Skeleton className="h-3 w-8" />
                  </div>
                </div>
              </div>
            ))
          ) : videos && videos.length > 0 ? (
            videos.slice(0, 5).map((video: RecentVideo) => (
              <div 
                key={video.id} 
                className="flex items-center justify-between p-4 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
                data-testid={`recent-video-${video.id}`}
              >
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-10 bg-gradient-to-br from-primary/20 to-secondary/20 rounded border overflow-hidden flex items-center justify-center">
                    <Video className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-medium text-foreground line-clamp-1 max-w-xs">
                        {video.title}
                      </p>
                      <span className="text-xs">{getLanguageFlag(video.language)}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                      <span>Published {getTimeAgo(video.updatedAt)}</span>
                      <span>•</span>
                      <span>{video.language}</span>
                      {video.youtubeVideoId && (
                        <>
                          <span>•</span>
                          <a 
                            href={`https://youtube.com/watch?v=${video.youtubeVideoId}`}
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-primary hover:underline flex items-center"
                            data-testid={`youtube-link-${video.id}`}
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            YouTube
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center space-x-4 text-xs">
                    <div className="flex items-center space-x-1" data-testid={`views-${video.id}`}>
                      <Eye className="h-3 w-3 text-muted-foreground" />
                      <span className="text-foreground">{formatViews(video.views)}</span>
                    </div>
                    <div className="flex items-center space-x-1" data-testid={`likes-${video.id}`}>
                      <ThumbsUp className="h-3 w-3 text-accent" />
                      <span className="text-foreground">{video.likes}</span>
                    </div>
                    <div className="flex items-center space-x-1" data-testid={`comments-${video.id}`}>
                      <MessageCircle className="h-3 w-3 text-primary" />
                      <span className="text-foreground">{video.comments}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8">
              <Video className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No Published Videos</h3>
              <p className="text-muted-foreground">
                Published videos will appear here once the content production pipeline is active.
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
