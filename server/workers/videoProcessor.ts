import { storage } from "../storage";
import { videoService } from "../services/videoService";
import { youtubeService } from "../services/youtubeService";
import { openaiService } from "../services/openaiService";
import { elevenlabsService } from "../services/elevenlabsService";
import { heygenService } from "../services/heygenService";
import { autoApprovalService } from "../services/autoApprovalService";
import fs from 'fs/promises';
import path from 'path';

class VideoProcessor {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;

  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log("Video processor started");
    
    // Process immediately
    this.processVideos();
    
    // Then every 30 seconds
    this.intervalId = setInterval(() => {
      this.processVideos();
    }, 30 * 1000); // 30 seconds
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log("Video processor stopped");
  }

  private async processVideos(): Promise<void> {
    try {
      // Ensure temp directory exists
      await fs.mkdir('./temp', { recursive: true }).catch(() => {});
      
      // Process video generation jobs
      const jobs = await storage.getActiveJobs();
      const pendingJobs = jobs.filter(job => 
        (job.type === 'video_generation' || job.type === 'publish') && 
        job.status === 'pending'
      );
      
      const processingJobs = jobs.filter(job => 
        job.type === 'video_generation' && 
        job.status === 'processing'
      );
      
      for (const job of pendingJobs) {
        if (job.type === 'video_generation') {
          await this.processVideoGenerationJob(job.id);
        } else if (job.type === 'publish') {
          await this.processPublishJob(job.id);
        }
      }
      
      // Check external video status for processing jobs
      for (const job of processingJobs) {
        await this.checkExternalVideoStatus(job.id);
      }
    } catch (error) {
      console.error("Error in video processor:", error);
    }
  }

  private async processVideoGenerationJob(jobId: string): Promise<void> {
    try {
      console.log(`Processing video generation job: ${jobId}`);
      
      const jobs = await storage.getActiveJobs();
      const job = jobs.find(j => j.id === jobId);
      
      if (!job || !job.data) {
        throw new Error("Job data not found");
      }

      const { newsArticleId, userId, language = 'en-US' } = job.data as any;
      
      if (!newsArticleId || !userId) {
        throw new Error('Missing required job data: newsArticleId or userId');
      }
      
      await storage.updateJobProgress(jobId, 10);
      
      // Get news article
      const article = await storage.getNewsArticleById(newsArticleId);
      if (!article) {
        throw new Error('News article not found');
      }
      
      // Step 1: Generate script using OpenAI
      console.log(`Generating script for job ${jobId}`);
      const scriptData = await openaiService.generateScript(
        article.title,
        article.content,
        userId
      );
      
      if (!scriptData) {
        throw new Error('Failed to generate script');
      }
      
      await storage.updateJobProgress(jobId, 30);
      
      // Step 2: Generate audio using ElevenLabs
      console.log(`Generating audio for job ${jobId}`);
      const audioBuffer = await elevenlabsService.generateSpeechMultilingual(
        userId,
        scriptData,
        language
      );
      
      // Save audio to temp file
      const audioPath = path.join('./temp', `audio_${jobId}.mp3`);
      await fs.writeFile(audioPath, audioBuffer);
      
      await storage.updateJobProgress(jobId, 60);
      
      // Step 3: Create video with HeyGen using ElevenLabs audio (INTEGRATED PIPELINE)
      console.log(`Creating video with integrated ElevenLabs audio for job ${jobId}`);
      const videoId = await heygenService.createVideoWithAudio(
        userId,
        scriptData,
        audioBuffer,
        {
          language: language,
          avatarStyle: 'dark_anchor',
          background: '#1a1a1a' // Dark theme for mystery content
        }
      );
      
      // Store external video ID for polling
      await storage.updateJobProgress(jobId, 70);
      const updatedJobData = { ...job.data, videoId, audioPath, script: scriptData };
      await storage.updateJob(jobId, {
        status: 'processing',
        data: updatedJobData
      });
      
      console.log(`Video creation initiated for job ${jobId}, HeyGen video ID: ${videoId}`);
      
    } catch (error) {
      console.error(`Error processing video generation job ${jobId}:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      await storage.completeJob(jobId, 'failed', errorMessage);
    }
  }

  private async checkExternalVideoStatus(jobId: string): Promise<void> {
    try {
      const jobs = await storage.getActiveJobs();
      const job = jobs.find(j => j.id === jobId);
      
      if (!job || !job.data) {
        return;
      }
      
      const jobData = job.data as any;
      const { videoId, userId, newsArticleId, audioPath, script } = jobData;
      
      if (!videoId || !userId) {
        return;
      }
      
      // Check video status with HeyGen
      const videoStatus = await heygenService.getVideoStatus(userId, videoId);
      
      if (videoStatus.status === 'completed' && videoStatus.video_url) {
        console.log(`Video completed for job ${jobId}`);
        
        // Download the completed video
        const videoBuffer = await heygenService.downloadVideo(userId, videoStatus.video_url);
        const videoPath = path.join('./temp', `video_${jobId}.mp4`);
        await fs.writeFile(videoPath, videoBuffer);
        
        // Create video record with pending approval status
        const video = await storage.createVideo({
          newsArticleId,
          title: `Dark News: ${script.substring(0, 50)}...`,
          script,
          language: jobData.language || 'en-US',
          avatarTemplate: 'dark_anchor',
          status: 'ready', // awaiting approval (listed for approval in the dashboard)
          duration: 60, // Estimate - would get from actual video metadata
          thumbnailUrl: videoStatus.thumbnail_url,
          videoUrl: videoStatus.video_url,
          audioPath,
        });
        
        console.log(`🔍 Running auto-approval for video: ${video.id}`);
        
        // Run auto-approval process
        try {
          const approvalDecision = await autoApprovalService.processContentForApproval(
            video.id, 
            'video'
          );
          
          if (approvalDecision.approved && !approvalDecision.requiresHumanReview) {
            // Auto-approved - update status and trigger publishing
            await storage.updateVideoStatus(video.id, 'approved');
            
            // Create publish job for auto-approved video
            await storage.createJob({
              type: 'publish',
              status: 'pending',
              data: { 
                videoId: video.id,
                userId: userId,
                autoApproved: true,
                approvalScore: approvalDecision.score,
                approvalReasoning: approvalDecision.reasoning
              },
            });
            
            console.log(`✅ Video ${video.id} auto-approved and queued for publishing (score: ${approvalDecision.score})`);
            
          } else {
            // Requires manual review
            await storage.updateVideoStatus(video.id, 'manual_review');
            console.log(`⚠️ Video ${video.id} requires manual review (score: ${approvalDecision.score})`);
          }
          
        } catch (approvalError) {
          console.error(`❌ Auto-approval failed for video ${video.id}:`, approvalError);
          // Fallback to manual review on approval errors
          await storage.updateVideoStatus(video.id, 'manual_review');
        }
        
        // Complete the video generation job
        await storage.updateJobProgress(jobId, 100);
        await storage.completeJob(jobId, 'completed');
        
        console.log(`Completed video generation job: ${jobId}, created video: ${video.id}`);
        
      } else if (videoStatus.status === 'failed') {
        console.error(`Video generation failed for job ${jobId}: ${videoStatus.error}`);
        await storage.completeJob(jobId, 'failed', videoStatus.error || 'Video generation failed');
        
        // Clean up temp files
        if (audioPath) {
          try {
            await fs.unlink(audioPath);
          } catch (error) {
            console.error('Error cleaning up audio file:', error);
          }
        }
      }
      // If still processing, we continue polling
      
    } catch (error) {
      console.error(`Error checking external video status for job ${jobId}:`, error);
    }
  }


  private async processPublishJob(jobId: string): Promise<void> {
    try {
      console.log(`Processing publish job: ${jobId}`);
      
      const jobs = await storage.getActiveJobs();
      const job = jobs.find(j => j.id === jobId);
      
      if (!job || !job.data) {
        throw new Error("Job data not found");
      }

      const { videoId, userId } = job.data as any;
      
      if (!userId) {
        throw new Error('User ID required for publishing');
      }
      
      await storage.updateJobProgress(jobId, 10);
      
      // Upload to YouTube
      const youtubeVideoId = await youtubeService.uploadVideo(videoId, userId);
      
      await storage.updateJobProgress(jobId, 80);
      
      // Update video status
      await storage.updateVideoStatus(videoId, 'published');
      
      await storage.updateJobProgress(jobId, 100);
      await storage.completeJob(jobId, 'completed');
      
      console.log(`Publish job completed: ${jobId}, YouTube ID: ${youtubeVideoId}`);
      
    } catch (error) {
      console.error(`Error processing publish job ${jobId}:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      await storage.completeJob(jobId, 'failed', errorMessage);
    }
  }
}

const videoProcessor = new VideoProcessor();

export function startVideoProcessor(): void {
  videoProcessor.start();
}

export function stopVideoProcessor(): void {
  videoProcessor.stop();
}
