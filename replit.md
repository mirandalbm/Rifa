# DarkNews Autopilot System

## Overview

DarkNews Autopilot is a fully automated content creation system that generates, produces, and publishes dark mystery-style news videos across multiple languages and YouTube channels. The system operates with minimal human supervision, automatically sourcing breaking news, creating compelling scripts in a dark documentary style, generating AI avatars with voice synthesis, and publishing to multiple language-specific channels.

The platform features a comprehensive dashboard for monitoring production pipelines, managing content approval workflows, and tracking analytics across all channels. Built as a modern full-stack web application, it combines real-time news aggregation, AI-powered content generation, multi-language dubbing, and automated social media publishing into a single cohesive system.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18+ with TypeScript for type safety and modern development
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query for server state management and caching
- **UI Framework**: Tailwind CSS with shadcn/ui component library for consistent dark theme design
- **Build Tool**: Vite for fast development and optimized production builds

### Backend Architecture
- **Runtime**: Node.js with Express.js server framework
- **Language**: TypeScript throughout for end-to-end type safety
- **Authentication**: Replit Auth integration with session-based authentication
- **Background Processing**: Custom worker system for news processing and video generation
- **API Design**: RESTful endpoints with consistent error handling and logging

### Data Storage Solutions
- **Primary Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Connection Pool**: Neon serverless PostgreSQL with connection pooling
- **Session Storage**: PostgreSQL-based session store for authentication persistence
- **File Storage**: Local file system for temporary video processing and generated content

### Database Schema Design
The system uses a comprehensive relational schema with the following key entities:
- **Users**: Authentication and profile management (required for Replit Auth)
- **News Articles**: Source content with status tracking (discovered, processed, approved, rejected)
- **Videos**: Generated content with multi-language support and production status
- **YouTube Channels**: Channel management for multi-language publishing
- **Processing Jobs**: Background task queue with progress tracking
- **System Metrics**: Performance monitoring and analytics data
- **API Status**: External service health monitoring

### Authentication and Authorization
- **Provider**: Replit's OpenID Connect (OIDC) authentication system
- **Session Management**: Secure session-based authentication with PostgreSQL storage
- **Authorization Pattern**: Route-level authentication middleware protecting all dashboard endpoints
- **Security**: HTTP-only cookies with secure flags and CSRF protection

### Content Generation Pipeline
The system implements a multi-stage automated pipeline:
1. **News Discovery**: Automated news aggregation from multiple sources (NewsAPI, etc.)
2. **Content Filtering**: AI-powered ranking and selection based on viral potential and dark theme suitability
3. **Script Generation**: GPT-powered script writing in dark documentary style with dramatic structure
4. **Voice Synthesis**: ElevenLabs integration for high-quality narration with consistent voice profiles
5. **Avatar Generation**: HeyGen API integration for professional video avatar creation with realistic AI presenters
6. **Multi-language Dubbing**: Automated translation and voice synthesis for 8+ languages
7. **Publishing Automation**: YouTube API integration for multi-channel publishing with optimized metadata

### Background Processing System
Custom-built worker system handling:
- **News Processor**: Scheduled news fetching and content curation (hourly intervals)
- **Video Processor**: Video generation pipeline management (30-second intervals)
- **Job Queue Management**: Task prioritization and progress tracking with real-time status updates
- **Error Handling**: Comprehensive error recovery and retry logic with service health monitoring

### Monitoring and Analytics
- **Real-time Metrics**: Dashboard showing production statistics, success rates, and system health
- **API Status Monitoring**: Continuous health checks for all external service dependencies
- **Performance Tracking**: Video performance analytics across all channels and languages
- **Resource Monitoring**: System resource usage tracking and alerting

## External Dependencies

### AI and Content Generation Services
- **OpenAI GPT API**: Primary content generation engine for script writing and metadata creation
- **ElevenLabs**: Voice synthesis and multi-language dubbing with professional voice models
- **HeyGen**: AI avatar generation and video rendering with custom avatar templates

### News and Data Sources
- **NewsAPI**: Primary news aggregation service for breaking news content
- **NewsData.io**: Secondary news source for content diversity and reliability
- **Google News API**: Additional news source integration for comprehensive coverage

### Social Media and Publishing
- **YouTube Data API v3**: Multi-channel video publishing with automated metadata optimization
- **Google Auth**: OAuth 2.0 integration for YouTube channel management and publishing permissions

### Database and Infrastructure
- **Neon Database**: Serverless PostgreSQL hosting with automatic scaling and connection pooling
- **Replit Infrastructure**: Platform hosting with integrated authentication and development tools

### Development and Monitoring Tools
- **Drizzle Kit**: Database migration management and schema generation
- **Connect PG Simple**: PostgreSQL session store for authentication persistence
- **Recharts**: Analytics visualization and dashboard charting components

### UI and Design Systems
- **Radix UI**: Accessible component primitives for complex UI interactions
- **Tailwind CSS**: Utility-first CSS framework with custom dark theme configuration
- **Lucide React**: Icon library optimized for the dark news aesthetic
- **date-fns**: Date manipulation and formatting utilities for content timestamps
## Security Configuration

Set these secrets before deploying:
- **ALLOWED_EMAILS**: comma-separated emails allowed to use the dashboard. If empty, any Replit account that signs in gets access (a warning is logged at startup).
- **ADMIN_EMAILS**: comma-separated emails allowed to use the developer tools under `/api/cline/*` (file editor, terminal, raw SQL, browser, git). Falls back to `ALLOWED_EMAILS`; if both are empty, those tools are disabled. The AI chat (`/api/cline/chat`) is not restricted.
- **API_ENCRYPTION_KEY**: long random secret used to encrypt stored API credentials (AES-256-GCM). Values saved by older versions are still readable, as long as the key stays the same.
