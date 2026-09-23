import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Moon, Zap, Globe, BarChart } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                <Moon className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold">DarkNews</h1>
                <p className="text-sm text-muted-foreground">Autopilot System</p>
              </div>
            </div>
            <Button 
              onClick={() => window.location.href = '/login'}
              className="bg-primary hover:bg-primary/90"
              data-testid="login-button"
            >
              Sign In
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-16 text-center">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Automated Dark News
            <br />
            Content Creation
          </h2>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Generate, dub, and publish compelling dark mystery news videos automatically 
            across multiple languages and channels with AI-powered automation.
          </p>
          <Button 
            size="lg" 
            onClick={() => window.location.href = '/login'}
            className="bg-primary hover:bg-primary/90 text-lg px-8 py-3"
            data-testid="get-started-button"
          >
            Get Started
          </Button>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <Zap className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Automated Pipeline</CardTitle>
              <CardDescription>
                Complete automation from news discovery to video publication
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mb-4">
                <Globe className="h-6 w-6 text-accent" />
              </div>
              <CardTitle>Multi-Language</CardTitle>
              <CardDescription>
                Automatic dubbing and publishing in 8 different languages
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <div className="w-12 h-12 bg-chart-3/10 rounded-lg flex items-center justify-center mb-4">
                <Moon className="h-6 w-6 text-chart-3" />
              </div>
              <CardTitle>Dark Style</CardTitle>
              <CardDescription>
                Mysterious, engaging content optimized for viral potential
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <div className="w-12 h-12 bg-destructive/10 rounded-lg flex items-center justify-center mb-4">
                <BarChart className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle>Analytics</CardTitle>
              <CardDescription>
                Real-time performance monitoring and optimization
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50 backdrop-blur-sm py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>&copy; 2025 DarkNews Autopilot. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
