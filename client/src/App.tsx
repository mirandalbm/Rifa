import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import "./i18n";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/components/ui/theme-provider";
import Landing from "@/pages/landing";
import Login from "@/pages/login";
import ResetPassword from "@/pages/reset-password";
import ProfessionalDashboard from "@/pages/professional-dashboard";
import NewsManagement from "@/pages/news-management";
import VideoProduction from "@/pages/video-production";
import Analytics from "@/pages/analytics";
import ApiSettings from "@/pages/api-settings";
import NotFound from "@/pages/not-found";
import ThumbnailGenerator from "@/pages/thumbnails";
import SEOOptimization from "@/pages/seo";
import HashtagGenerator from "@/pages/hashtags";
import YouTubeAnalytics from "@/pages/youtube-analytics";
import TrendsAnalysis from "@/pages/trends";
import RevenueAnalysis from "@/pages/revenue";
import ABTesting from "@/pages/ab-testing";
import AutomationPipelines from "@/pages/automation";
import AIModels from "@/pages/ai-models";
import VoiceCloning from "@/pages/voice-cloning";
import Predictions from "@/pages/predictions";
import Subscriptions from "@/pages/subscriptions";
import Affiliates from "@/pages/affiliates";
import Sponsors from "@/pages/sponsors";
import EmailMarketing from "@/pages/email-marketing";
import AdSense from "@/pages/adsense";
import DiscordBot from "@/pages/discord-bot";
import Notifications from "@/pages/notifications";
import Moderation from "@/pages/moderation";
import ContentVerification from "@/pages/content-verification";
import FactChecking from "@/pages/fact-checking";
import Copyright from "@/pages/copyright";
import Audit from "@/pages/audit";
import BackupRecovery from "@/pages/backup";
import EmotionAnimations from "@/pages/emotion-animations";
import MediaLibrary from "@/pages/MediaLibrary";
// Configurações
import ConfiguracaoIndex from "@/pages/configuracoes";
import Integracoes from "@/pages/configuracoes/integracoes";
import Painel from "@/pages/configuracoes/painel";
import Saldos from "@/pages/configuracoes/saldos";
import Assinaturas from "@/pages/configuracoes/assinaturas";
import Usuarios from "@/pages/configuracoes/usuarios";
import Canais from "@/pages/configuracoes/canais";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-gray-900 flex items-center justify-center safe-bottom">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading DarkNews...</p>
        </div>
      </div>
    );
  }

  return (
    <Switch>
      {!isAuthenticated ? (
        <>
          <Route path="/" component={Landing} />
          <Route path="/login" component={Login} />
          <Route path="/reset-password" component={ResetPassword} />
          <Route>
            {() => {
              // Unauthenticated users go to the login page
              window.location.href = '/login';
              return null;
            }}
          </Route>
        </>
      ) : (
        <>
          <Route path="/" component={ProfessionalDashboard} />
          <Route path="/login">{() => { window.location.href = '/'; return null; }}</Route>
          <Route path="/reset-password" component={ResetPassword} />
          <Route path="/professional" component={ProfessionalDashboard} />
          <Route path="/dashboard" component={ProfessionalDashboard} />
          <Route path="/news" component={NewsManagement} />
          <Route path="/production" component={VideoProduction} />
          <Route path="/analytics" component={Analytics} />
          {/* Ferramentas de Conteúdo */}
          <Route path="/thumbnails" component={ThumbnailGenerator} />
          <Route path="/seo" component={SEOOptimization} />
          <Route path="/hashtags" component={HashtagGenerator} />
          {/* Analytics Avançado */}
          <Route path="/youtube-analytics" component={YouTubeAnalytics} />
          <Route path="/trends" component={TrendsAnalysis} />
          <Route path="/revenue" component={RevenueAnalysis} />
          <Route path="/ab-testing" component={ABTesting} />
          {/* Automação & IA */}
          <Route path="/automation" component={AutomationPipelines} />
          <Route path="/ai-models" component={AIModels} />
          <Route path="/voice-cloning" component={VoiceCloning} />
          <Route path="/predictions" component={Predictions} />
          {/* Monetização */}
          <Route path="/subscriptions" component={Subscriptions} />
          <Route path="/affiliates" component={Affiliates} />
          <Route path="/sponsors" component={Sponsors} />
          <Route path="/adsense" component={AdSense} />
          {/* Comunicação */}
          <Route path="/email" component={EmailMarketing} />
          <Route path="/discord" component={DiscordBot} />
          <Route path="/notifications" component={Notifications} />
          <Route path="/moderation" component={Moderation} />
          {/* Segurança */}
          <Route path="/content-verification" component={ContentVerification} />
          <Route path="/fact-checking" component={FactChecking} />
          <Route path="/copyright" component={Copyright} />
          <Route path="/audit" component={Audit} />
          <Route path="/backup" component={BackupRecovery} />
          <Route path="/emotion-animations" component={EmotionAnimations} />
          <Route path="/media-library" component={MediaLibrary} />
          {/* Configurações */}
          <Route path="/configuracoes" component={ConfiguracaoIndex} />
          <Route path="/configuracoes/integracoes" component={Integracoes} />
          <Route path="/configuracoes/painel" component={Painel} />
          <Route path="/configuracoes/saldos" component={Saldos} />
          <Route path="/configuracoes/assinaturas" component={Assinaturas} />
          <Route path="/configuracoes/usuarios" component={Usuarios} />
          <Route path="/configuracoes/canais" component={Canais} />
          <Route path="/settings" component={ConfiguracaoIndex} />
          <Route path="/settings/integracoes" component={Integracoes} />
          <Route path="/settings/painel" component={Painel} />
          <Route path="/settings/saldos" component={Saldos} />
          <Route path="/settings/assinaturas" component={Assinaturas} />
          <Route path="/settings/usuarios" component={Usuarios} />
          <Route path="/settings/canais" component={Canais} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="darknews-theme">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
