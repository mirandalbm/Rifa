import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  integer,
  boolean,
  decimal,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Dashboard Statistics Types
export interface DashboardStats {
  totalVideos: number;
  videosToday: number;
  totalViews: number;
  totalSubscribers: number;
  activeChannels: number;
  successRate: number;
}

// Session storage table (express-session / connect-pg-simple).
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table. A user signs in with email + password, Google, or phone (SMS code).
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  passwordHash: varchar("password_hash"),
  googleId: varchar("google_id").unique(),
  phone: varchar("phone").unique(), // E.164, only set after SMS verification
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Single-use tokens sent by email (verification and password reset). Only the hash is stored.
export const authTokens = pgTable("auth_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type").notNull(), // 'verify_email' | 'reset_password'
  tokenHash: varchar("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// One-time SMS login codes. Only the hash is stored.
export const phoneCodes = pgTable("phone_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phone: varchar("phone").notNull(),
  codeHash: varchar("code_hash").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [index("IDX_phone_codes_phone").on(table.phone)]);

// Enums
export const newsStatusEnum = pgEnum('news_status', ['discovered', 'processed', 'approved', 'rejected']);
export const videoStatusEnum = pgEnum('video_status', ['pending', 'generating', 'processing', 'ready', 'approved', 'published', 'failed']);
export const jobStatusEnum = pgEnum('job_status', ['pending', 'processing', 'completed', 'failed', 'paused']);
export const languageEnum = pgEnum('language', ['en-US', 'pt-BR', 'es-ES', 'es-MX', 'de-DE', 'fr-FR', 'hi-IN', 'ja-JP', 'zh-CN', 'ko-KR', 'ru-RU']);
export const apiConfigStatusEnum = pgEnum('api_config_status', ['active', 'inactive', 'error']);
export const schedulingStrategyEnum = pgEnum('scheduling_strategy', ['trending', 'viral_score', 'time_based', 'ai_optimized']);
export const approvalStatusEnum = pgEnum('approval_status', ['pending', 'auto_approved', 'manual_review', 'rejected', 'published']);
export const errorSeverityEnum = pgEnum('error_severity', ['low', 'medium', 'high', 'critical']);
export const resourceTypeEnum = pgEnum('resource_type', ['cpu', 'memory', 'api_calls', 'storage', 'bandwidth']);

// News articles table
export const newsArticles = pgTable("news_articles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  content: text("content").notNull(),
  url: varchar("url").notNull(),
  source: varchar("source").notNull(),
  imageUrl: varchar("image_url"),
  category: varchar("category"),
  viralScore: integer("viral_score").notNull(),
  status: newsStatusEnum("status").default('discovered'),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Video content table
export const videos = pgTable("videos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  newsArticleId: varchar("news_article_id").references(() => newsArticles.id),
  title: text("title").notNull(),
  script: text("script").notNull(),
  language: languageEnum("language").notNull(),
  avatarTemplate: varchar("avatar_template").notNull(),
  status: videoStatusEnum("status").default('pending'),
  progress: integer("progress").default(0), // Progress percentage (0-100)
  videoUrl: varchar("video_url"),
  videoPath: varchar("video_path"),
  audioPath: varchar("audio_path"),
  thumbnailUrl: varchar("thumbnail_url"),
  duration: integer("duration"), // in seconds
  youtubeVideoId: varchar("youtube_video_id"),
  views: integer("views").default(0),
  likes: integer("likes").default(0),
  comments: integer("comments").default(0),
  metadata: jsonb("metadata"), // Additional metadata for auto-approval, processing info, etc.
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// YouTube channels table
export const youtubeChannels = pgTable("youtube_channels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  channelId: varchar("channel_id").notNull().unique(),
  name: varchar("name").notNull(),
  language: languageEnum("language").notNull(),
  subscriberCount: integer("subscriber_count").default(0),
  totalViews: integer("total_views").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Processing jobs table
export const processingJobs = pgTable("processing_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: varchar("type").notNull(), // 'news_fetch', 'script_generation', 'video_render', 'publish'
  status: jobStatusEnum("status").default('pending'),
  progress: integer("progress").default(0), // 0-100
  data: jsonb("data"), // job-specific data
  error: text("error"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// System metrics table
export const systemMetrics = pgTable("system_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  metricName: varchar("metric_name").notNull(),
  value: text("value").notNull(), // Changed from decimal to text to handle both numeric and JSON data
  timestamp: timestamp("timestamp").defaultNow(),
});

// API status table
export const apiStatus = pgTable("api_status", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceName: varchar("service_name").notNull().unique(),
  status: varchar("status").notNull(), // 'operational', 'degraded', 'down'
  responseTime: integer("response_time"), // in ms
  lastChecked: timestamp("last_checked").defaultNow(),
});

// API configurations table
export const apiConfigurations = pgTable("api_configurations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  serviceId: varchar("service_id").notNull(), // openai, elevenlabs, heygen, etc.
  serviceName: varchar("service_name").notNull(),
  isActive: boolean("is_active").default(false),
  encryptedConfig: text("encrypted_config"), // JSON encrypted
  status: apiConfigStatusEnum("status").default('inactive'),
  lastTested: timestamp("last_tested"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_api_config_user_service").on(table.userId, table.serviceId),
]);

// Trending topics and viral scoring table
export const trendingTopics = pgTable("trending_topics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  keyword: varchar("keyword").notNull(),
  category: varchar("category").notNull(),
  trendScore: integer("trend_score").notNull(), // 0-100
  viralPotential: integer("viral_potential").notNull(), // 0-100
  mentions: integer("mentions").default(0),
  engagement: integer("engagement").default(0),
  region: varchar("region").default('global'),
  language: languageEnum("language").default('en-US'),
  isActive: boolean("is_active").default(true),
  detectedAt: timestamp("detected_at").defaultNow(),
  peakTime: timestamp("peak_time"),
  expiresAt: timestamp("expires_at"),
  metadata: jsonb("metadata"), // Additional trend data
}, (table) => [
  index("idx_trending_keyword").on(table.keyword),
  index("idx_trending_score").on(table.trendScore),
  index("idx_trending_active").on(table.isActive),
]);

// Intelligent scheduling rules table
export const schedulingRules = pgTable("scheduling_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  strategy: schedulingStrategyEnum("strategy").notNull(),
  isActive: boolean("is_active").default(true),
  priority: integer("priority").default(50), // 0-100
  conditions: jsonb("conditions").notNull(), // Complex scheduling conditions
  targetAudience: jsonb("target_audience"), // Demographics, timezone, etc.
  language: languageEnum("language").default('en-US'),
  minViralScore: integer("min_viral_score").default(70),
  maxDailyVideos: integer("max_daily_videos").default(10),
  timeSlots: jsonb("time_slots"), // Optimal publishing times
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_scheduling_strategy").on(table.strategy),
  index("idx_scheduling_active").on(table.isActive),
]);

// Auto-approval workflow table
export const approvalWorkflows = pgTable("approval_workflows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contentId: varchar("content_id").notNull(), // References video or news
  contentType: varchar("content_type").notNull(), // 'video', 'news', 'script'
  status: approvalStatusEnum("status").default('pending'),
  autoApprovalScore: integer("auto_approval_score").default(0), // AI-generated score 0-100
  qualityMetrics: jsonb("quality_metrics"), // Content quality analysis
  complianceChecks: jsonb("compliance_checks"), // Copyright, guidelines, etc.
  humanReviewRequired: boolean("human_review_required").default(false),
  reviewerNotes: text("reviewer_notes"),
  approvedBy: varchar("approved_by"), // 'ai' or user_id
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_approval_content").on(table.contentId, table.contentType),
  index("idx_approval_status").on(table.status),
  index("idx_approval_score").on(table.autoApprovalScore),
]);

// Advanced error tracking table
export const errorLogs = pgTable("error_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").references(() => processingJobs.id),
  errorCode: varchar("error_code").notNull(),
  severity: errorSeverityEnum("severity").notNull(),
  message: text("message").notNull(),
  stackTrace: text("stack_trace"),
  context: jsonb("context"), // Request data, environment info
  serviceName: varchar("service_name").notNull(),
  endpoint: varchar("endpoint"),
  retryCount: integer("retry_count").default(0),
  maxRetries: integer("max_retries").default(3),
  nextRetryAt: timestamp("next_retry_at"),
  resolved: boolean("resolved").default(false),
  resolvedAt: timestamp("resolved_at"),
  resolutionNotes: text("resolution_notes"),
  occuredAt: timestamp("occured_at").defaultNow(),
}, (table) => [
  index("idx_error_job").on(table.jobId),
  index("idx_error_severity").on(table.severity),
  index("idx_error_service").on(table.serviceName),
  index("idx_error_unresolved").on(table.resolved),
]);

// Resource usage and performance metrics table
export const resourceMetrics = pgTable("resource_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  resourceType: resourceTypeEnum("resource_type").notNull(),
  serviceName: varchar("service_name").notNull(),
  usage: decimal("usage").notNull(), // Current usage value
  limit: decimal("limit"), // Resource limit
  utilization: decimal("utilization").notNull(), // Percentage 0-100
  cost: decimal("cost"), // Associated cost
  region: varchar("region").default('global'),
  metadata: jsonb("metadata"), // Additional metrics data
  timestamp: timestamp("timestamp").defaultNow(),
}, (table) => [
  index("idx_resource_type_service").on(table.resourceType, table.serviceName),
  index("idx_resource_timestamp").on(table.timestamp),
  index("idx_resource_utilization").on(table.utilization),
]);

// Performance alerts table
export const performanceAlerts = pgTable("performance_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  alertType: varchar("alert_type").notNull(), // 'resource_limit', 'error_threshold', 'performance_degradation'
  severity: errorSeverityEnum("severity").notNull(),
  title: varchar("title").notNull(),
  description: text("description").notNull(),
  serviceName: varchar("service_name").notNull(),
  threshold: decimal("threshold"), // Alert threshold value
  currentValue: decimal("current_value"), // Current metric value
  isActive: boolean("is_active").default(true),
  acknowledged: boolean("acknowledged").default(false),
  acknowledgedBy: varchar("acknowledged_by"),
  acknowledgedAt: timestamp("acknowledged_at"),
  resolvedAt: timestamp("resolved_at"),
  notificationsSent: integer("notifications_sent").default(0),
  metadata: jsonb("metadata"),
  triggeredAt: timestamp("triggered_at").defaultNow(),
}, (table) => [
  index("idx_alert_type_severity").on(table.alertType, table.severity),
  index("idx_alert_active").on(table.isActive),
  index("idx_alert_service").on(table.serviceName),
]);

// Batch processing queue table
export const batchQueues = pgTable("batch_queues", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  batchType: varchar("batch_type").notNull(), // 'video_generation', 'publishing', 'analysis'
  status: jobStatusEnum("status").default('pending'),
  priority: integer("priority").default(50), // 0-100
  totalJobs: integer("total_jobs").notNull(),
  completedJobs: integer("completed_jobs").default(0),
  failedJobs: integer("failed_jobs").default(0),
  progress: integer("progress").default(0), // 0-100
  estimatedDuration: integer("estimated_duration"), // seconds
  resourceRequirements: jsonb("resource_requirements"),
  configuration: jsonb("configuration"), // Batch-specific config
  results: jsonb("results"), // Batch execution results
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_batch_type_status").on(table.batchType, table.status),
  index("idx_batch_priority").on(table.priority),
]);

// Relations
export const newsArticlesRelations = relations(newsArticles, ({ many }) => ({
  videos: many(videos),
}));

export const videosRelations = relations(videos, ({ one }) => ({
  newsArticle: one(newsArticles, {
    fields: [videos.newsArticleId],
    references: [newsArticles.id],
  }),
}));

export const processingJobsRelations = relations(processingJobs, ({ many }) => ({
  errorLogs: many(errorLogs),
}));

export const errorLogsRelations = relations(errorLogs, ({ one }) => ({
  job: one(processingJobs, {
    fields: [errorLogs.jobId],
    references: [processingJobs.id],
  }),
}));

// Export types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
// User as sent to the browser (no credential fields)
export type PublicUser = Omit<User, "passwordHash">;
export type AuthToken = typeof authTokens.$inferSelect;
export type PhoneCode = typeof phoneCodes.$inferSelect;
export type NewsArticle = typeof newsArticles.$inferSelect;
export type InsertNewsArticle = typeof newsArticles.$inferInsert;
export type Video = typeof videos.$inferSelect;
export type InsertVideo = typeof videos.$inferInsert;
export type YoutubeChannel = typeof youtubeChannels.$inferSelect;
export type InsertYoutubeChannel = typeof youtubeChannels.$inferInsert;
export type ProcessingJob = typeof processingJobs.$inferSelect;
export type InsertProcessingJob = typeof processingJobs.$inferInsert;
export type SystemMetric = typeof systemMetrics.$inferSelect;
export type InsertSystemMetric = typeof systemMetrics.$inferInsert;
export type ApiStatus = typeof apiStatus.$inferSelect;
export type InsertApiStatus = typeof apiStatus.$inferInsert;
export type ApiConfiguration = typeof apiConfigurations.$inferSelect;
export type InsertApiConfiguration = typeof apiConfigurations.$inferInsert;
export type TrendingTopic = typeof trendingTopics.$inferSelect;
export type InsertTrendingTopic = typeof trendingTopics.$inferInsert;
export type SchedulingRule = typeof schedulingRules.$inferSelect;
export type InsertSchedulingRule = typeof schedulingRules.$inferInsert;
export type ApprovalWorkflow = typeof approvalWorkflows.$inferSelect;
export type InsertApprovalWorkflow = typeof approvalWorkflows.$inferInsert;
export type ErrorLog = typeof errorLogs.$inferSelect;
export type InsertErrorLog = typeof errorLogs.$inferInsert;
export type ResourceMetric = typeof resourceMetrics.$inferSelect;
export type InsertResourceMetric = typeof resourceMetrics.$inferInsert;
export type PerformanceAlert = typeof performanceAlerts.$inferSelect;
export type InsertPerformanceAlert = typeof performanceAlerts.$inferInsert;
export type BatchQueue = typeof batchQueues.$inferSelect;
export type InsertBatchQueue = typeof batchQueues.$inferInsert;

// Insert schemas
export const insertNewsArticleSchema = createInsertSchema(newsArticles);
export const insertVideoSchema = createInsertSchema(videos);
export const insertProcessingJobSchema = createInsertSchema(processingJobs);
export const insertApiConfigurationSchema = createInsertSchema(apiConfigurations);
export const insertTrendingTopicSchema = createInsertSchema(trendingTopics);
export const insertSchedulingRuleSchema = createInsertSchema(schedulingRules);
export const insertApprovalWorkflowSchema = createInsertSchema(approvalWorkflows);
export const insertErrorLogSchema = createInsertSchema(errorLogs);
export const insertResourceMetricSchema = createInsertSchema(resourceMetrics);
export const insertPerformanceAlertSchema = createInsertSchema(performanceAlerts);
export const insertBatchQueueSchema = createInsertSchema(batchQueues);
