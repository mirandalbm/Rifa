import { storage } from "../storage";
import { openaiService } from "./openaiService";
import { intelligentSchedulingService } from "./intelligentSchedulingService";
import type { 
  ApprovalWorkflow, 
  InsertApprovalWorkflow,
  NewsArticle,
  Video,
  ErrorLog
} from "@shared/schema";

interface ContentQualityAssessment {
  overallScore: number;           // 0-100 overall quality score
  factualAccuracy: number;        // 0-100 fact-checking confidence
  contentClarity: number;         // 0-100 readability and structure
  engagementPotential: number;    // 0-100 audience engagement likelihood
  brandSafety: number;           // 0-100 brand safety compliance
  complianceScore: number;       // 0-100 policy and legal compliance
  confidence: number;            // 0-100 AI confidence in assessment
  factors: string[];             // Detailed assessment factors
  risks: ContentRisk[];          // Identified content risks
  recommendations: string[];     // Improvement recommendations
}

interface ContentRisk {
  type: 'copyright' | 'misinformation' | 'offensive' | 'legal' | 'brand_risk' | 'quality';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  confidence: number;
  mitigation?: string;
}

interface AutoApprovalCriteria {
  minOverallScore: number;
  minFactualAccuracy: number;
  minBrandSafety: number;
  minComplianceScore: number;
  maxCriticalRisks: number;
  maxHighRisks: number;
  minConfidence: number;
  requireHumanReview: boolean;
}

interface ApprovalDecision {
  approved: boolean;
  requiresHumanReview: boolean;
  score: number;
  confidence: number;
  reasoning: string;
  risks: ContentRisk[];
  recommendations: string[];
  criteria: AutoApprovalCriteria;
  metadata: any;
}

class AutoApprovalService {
  private readonly DEFAULT_CRITERIA: AutoApprovalCriteria = {
    minOverallScore: 80,
    minFactualAccuracy: 85,
    minBrandSafety: 90,
    minComplianceScore: 95,
    maxCriticalRisks: 0,
    maxHighRisks: 1,
    minConfidence: 80,
    requireHumanReview: false
  };

  private readonly CONSERVATIVE_CRITERIA: AutoApprovalCriteria = {
    minOverallScore: 90,
    minFactualAccuracy: 95,
    minBrandSafety: 98,
    minComplianceScore: 99,
    maxCriticalRisks: 0,
    maxHighRisks: 0,
    minConfidence: 90,
    requireHumanReview: false
  };

  // Main auto-approval workflow processor
  async processContentForApproval(contentId: string, contentType: 'news' | 'video' | 'script'): Promise<ApprovalDecision> {
    try {
      console.log(`🔍 Processing ${contentType} ${contentId} for auto-approval...`);

      // Get content based on type
      const content = await this.getContentById(contentId, contentType);
      if (!content) {
        throw new Error(`Content not found: ${contentId}`);
      }

      // Perform comprehensive quality assessment
      const qualityAssessment = await this.assessContentQuality(content, contentType);
      
      // Determine approval criteria based on content type and risk level
      const criteria = await this.determineApprovalCriteria(content, qualityAssessment);
      
      // Make approval decision
      const decision = await this.makeApprovalDecision(qualityAssessment, criteria);
      
      // Create or update approval workflow
      await this.createApprovalWorkflow(contentId, contentType, decision, qualityAssessment);
      
      // Execute post-approval actions if approved
      if (decision.approved && !decision.requiresHumanReview) {
        await this.executeAutoApprovedActions(contentId, contentType, decision);
      }

      console.log(`✅ Auto-approval decision: ${decision.approved ? 'APPROVED' : 'REQUIRES REVIEW'} (score: ${decision.score})`);
      return decision;

    } catch (error) {
      console.error(`❌ Error in auto-approval process for ${contentId}:`, error);
      
      await storage.createErrorLog({
        jobId: null,
        errorCode: 'AUTO_APPROVAL_FAILED',
        severity: 'high',
        message: `Auto-approval failed for ${contentType} ${contentId}: ${error instanceof Error ? error.message : String(error)}`,
        serviceName: 'AutoApproval',
        endpoint: 'processContentForApproval',
        retryCount: 0,
        maxRetries: 2,
        context: { contentId, contentType }
      });

      // Return conservative decision on error
      return {
        approved: false,
        requiresHumanReview: true,
        score: 0,
        confidence: 0,
        reasoning: 'Auto-approval system error - requires manual review',
        risks: [{ 
          type: 'quality', 
          severity: 'high', 
          description: 'System error during approval process',
          confidence: 100
        }],
        recommendations: ['Manual review required due to system error'],
        criteria: this.CONSERVATIVE_CRITERIA,
        metadata: { error: String(error) }
      };
    }
  }

  // Comprehensive AI-based content quality assessment
  private async assessContentQuality(content: any, contentType: string): Promise<ContentQualityAssessment> {
    try {
      console.log(`🧠 Assessing content quality for ${contentType}...`);

      // Extract text content for analysis
      const textContent = this.extractTextContent(content, contentType);
      
      // Parallel assessment of different quality dimensions
      const [
        factualAssessment,
        clarityAssessment,
        engagementAssessment,
        safetyAssessment,
        complianceAssessment,
        riskAssessment
      ] = await Promise.all([
        this.assessFactualAccuracy(textContent),
        this.assessContentClarity(textContent),
        this.assessEngagementPotential(textContent, contentType),
        this.assessBrandSafety(textContent),
        this.assessCompliance(textContent, contentType),
        this.identifyContentRisks(textContent, contentType)
      ]);

      // Calculate overall score with weighted factors
      const overallScore = Math.round(
        (factualAssessment.score * 0.25) +
        (clarityAssessment.score * 0.20) +
        (engagementAssessment.score * 0.15) +
        (safetyAssessment.score * 0.25) +
        (complianceAssessment.score * 0.15)
      );

      const confidence = Math.round(
        (factualAssessment.confidence + clarityAssessment.confidence + 
         engagementAssessment.confidence + safetyAssessment.confidence + 
         complianceAssessment.confidence) / 5
      );

      const factors = [
        ...factualAssessment.factors,
        ...clarityAssessment.factors,
        ...engagementAssessment.factors,
        ...safetyAssessment.factors,
        ...complianceAssessment.factors
      ];

      const recommendations = [
        ...factualAssessment.recommendations || [],
        ...clarityAssessment.recommendations || [],
        ...engagementAssessment.recommendations || [],
        ...safetyAssessment.recommendations || [],
        ...complianceAssessment.recommendations || []
      ].filter(rec => rec); // Remove empty recommendations

      const qualityAssessment: ContentQualityAssessment = {
        overallScore,
        factualAccuracy: factualAssessment.score,
        contentClarity: clarityAssessment.score,
        engagementPotential: engagementAssessment.score,
        brandSafety: safetyAssessment.score,
        complianceScore: complianceAssessment.score,
        confidence,
        factors,
        risks: riskAssessment,
        recommendations
      };

      console.log(`📊 Quality assessment complete: ${overallScore}/100 (confidence: ${confidence}%)`);
      return qualityAssessment;

    } catch (error) {
      console.error("Error in content quality assessment:", error);
      
      // Return conservative assessment on error
      return {
        overallScore: 30,
        factualAccuracy: 40,
        contentClarity: 50,
        engagementPotential: 40,
        brandSafety: 30,
        complianceScore: 20,
        confidence: 10,
        factors: ['assessment_error'],
        risks: [{ 
          type: 'quality', 
          severity: 'critical', 
          description: 'Failed to assess content quality',
          confidence: 100
        }],
        recommendations: ['Manual review required due to assessment failure']
      };
    }
  }

  // AI-powered factual accuracy assessment
  private async assessFactualAccuracy(content: string): Promise<{ score: number; confidence: number; factors: string[]; recommendations?: string[] }> {
    try {
      const factCheckPrompt = `
        Analyze the following content for factual accuracy and reliability.
        Consider:
        - Verifiable claims and statements
        - Source credibility indicators
        - Potential misinformation or disinformation
        - Factual consistency
        - Evidence quality

        Return a JSON response with:
        {
          "score": 0-100,
          "confidence": 0-100,
          "factors": ["specific_factors"],
          "concerns": ["potential_issues"],
          "recommendations": ["improvement_suggestions"]
        }

        Content: "${content.substring(0, 1500)}"
      `;

      // No user id: system analysis runs on the global OpenAI client
      const response = await openaiService.generateCompletion(factCheckPrompt);

      if (response) {
        try {
          const analysis = JSON.parse(response);
          return {
            score: Math.min(100, Math.max(0, analysis.score || 50)),
            confidence: Math.min(100, Math.max(0, analysis.confidence || 60)),
            factors: analysis.factors || ['ai_fact_check'],
            recommendations: analysis.recommendations || []
          };
        } catch (parseError) {
          console.warn("Failed to parse fact-check response:", parseError);
        }
      }
    } catch (error) {
      console.error("Error in factual accuracy assessment:", error);
    }

    // Fallback scoring based on heuristics
    const score = this.calculateHeuristicFactualScore(content);
    return {
      score,
      confidence: 40,
      factors: ['heuristic_analysis'],
      recommendations: ['Consider manual fact-checking']
    };
  }

  // Content clarity and readability assessment
  private async assessContentClarity(content: string): Promise<{ score: number; confidence: number; factors: string[]; recommendations?: string[] }> {
    const factors: string[] = [];
    const recommendations: string[] = [];
    let score = 60; // Base score

    // Length analysis
    const wordCount = content.split(/\s+/).length;
    if (wordCount >= 100 && wordCount <= 800) {
      score += 15;
      factors.push('optimal_length');
    } else if (wordCount < 50) {
      score -= 20;
      factors.push('too_short');
      recommendations.push('Expand content for better context');
    } else if (wordCount > 1200) {
      score -= 10;
      factors.push('lengthy_content');
      recommendations.push('Consider breaking into shorter segments');
    }

    // Sentence structure analysis
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgSentenceLength = wordCount / sentences.length;
    
    if (avgSentenceLength >= 8 && avgSentenceLength <= 20) {
      score += 10;
      factors.push('good_sentence_structure');
    } else if (avgSentenceLength > 30) {
      score -= 15;
      factors.push('complex_sentences');
      recommendations.push('Use shorter, clearer sentences');
    }

    // Paragraph structure
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    if (paragraphs.length >= 2 && paragraphs.length <= 6) {
      score += 10;
      factors.push('well_structured');
    }

    // Technical jargon detection (simplified)
    const jargonWords = ['algorithm', 'infrastructure', 'paradigm', 'synergy', 'optimization'];
    const jargonCount = jargonWords.filter(word => 
      content.toLowerCase().includes(word)
    ).length;
    
    if (jargonCount > 3) {
      score -= 10;
      factors.push('technical_jargon');
      recommendations.push('Simplify technical language for broader audience');
    }

    return {
      score: Math.min(100, Math.max(0, score)),
      confidence: 75,
      factors,
      recommendations
    };
  }

  // Engagement potential assessment
  private async assessEngagementPotential(content: string, contentType: string): Promise<{ score: number; confidence: number; factors: string[]; recommendations?: string[] }> {
    const factors: string[] = [];
    const recommendations: string[] = [];
    let score = 50; // Base score

    // Emotional triggers analysis
    const emotionalWords = [
      'shocking', 'amazing', 'incredible', 'exclusive', 'breaking', 'urgent',
      'mysterious', 'secret', 'revealed', 'exposed', 'dramatic', 'stunning'
    ];
    
    const emotionalCount = emotionalWords.filter(word => 
      content.toLowerCase().includes(word)
    ).length;
    
    if (emotionalCount >= 2 && emotionalCount <= 5) {
      score += 15;
      factors.push('emotional_triggers');
    } else if (emotionalCount > 8) {
      score -= 10;
      factors.push('clickbait_concerns');
      recommendations.push('Reduce sensational language');
    }

    // Question engagement
    const questionCount = (content.match(/\?/g) || []).length;
    if (questionCount >= 1 && questionCount <= 3) {
      score += 10;
      factors.push('engaging_questions');
    }

    // Urgency and timeliness
    const urgencyWords = ['now', 'today', 'latest', 'current', 'just', 'recently'];
    const urgencyCount = urgencyWords.filter(word => 
      content.toLowerCase().includes(word)
    ).length;
    
    if (urgencyCount >= 1) {
      score += 10;
      factors.push('timely_content');
    }

    // Story structure indicators
    const storyWords = ['story', 'reveals', 'shows', 'demonstrates', 'explains'];
    const storyCount = storyWords.filter(word => 
      content.toLowerCase().includes(word)
    ).length;
    
    if (storyCount >= 1) {
      score += 10;
      factors.push('narrative_structure');
    }

    // Content type specific adjustments
    if (contentType === 'news') {
      if (content.toLowerCase().includes('exclusive') || content.toLowerCase().includes('breaking')) {
        score += 15;
        factors.push('news_value');
      }
    }

    return {
      score: Math.min(100, Math.max(0, score)),
      confidence: 70,
      factors,
      recommendations
    };
  }

  // Brand safety assessment
  private async assessBrandSafety(content: string): Promise<{ score: number; confidence: number; factors: string[]; recommendations?: string[] }> {
    const factors: string[] = [];
    const recommendations: string[] = [];
    let score = 90; // Start with high safety score

    // Controversial topics detection
    const controversialTopics = [
      'politics', 'religion', 'race', 'gender', 'sexuality', 'violence',
      'drugs', 'alcohol', 'gambling', 'conspiracy', 'extremism'
    ];
    
    const controversialCount = controversialTopics.filter(topic => 
      content.toLowerCase().includes(topic)
    ).length;
    
    if (controversialCount > 0) {
      score -= controversialCount * 15;
      factors.push('controversial_content');
      recommendations.push('Review controversial content for brand safety');
    }

    // Negative sentiment words
    const negativeWords = [
      'hate', 'death', 'kill', 'murder', 'violence', 'war', 'terror',
      'disaster', 'crisis', 'scandal', 'corrupt', 'fraud'
    ];
    
    const negativeCount = negativeWords.filter(word => 
      content.toLowerCase().includes(word)
    ).length;
    
    if (negativeCount > 2) {
      score -= negativeCount * 8;
      factors.push('negative_content');
      recommendations.push('Consider moderating negative language');
    }

    // Profanity detection (basic)
    const profanityPattern = /\b(damn|hell|crap|stupid|idiot)\b/gi;
    const profanityMatches = content.match(profanityPattern) || [];
    
    if (profanityMatches.length > 0) {
      score -= profanityMatches.length * 10;
      factors.push('profanity_detected');
      recommendations.push('Remove or replace inappropriate language');
    }

    // Misinformation indicators
    const misinfoIndicators = [
      'they don\'t want you to know', 'hidden truth', 'cover-up',
      'conspiracy', 'fake news', 'hoax', 'propaganda'
    ];
    
    const misinfoCount = misinfoIndicators.filter(indicator => 
      content.toLowerCase().includes(indicator)
    ).length;
    
    if (misinfoCount > 0) {
      score -= misinfoCount * 20;
      factors.push('misinformation_risk');
      recommendations.push('Verify claims and sources carefully');
    }

    return {
      score: Math.min(100, Math.max(0, score)),
      confidence: 85,
      factors,
      recommendations
    };
  }

  // Legal and policy compliance assessment
  private async assessCompliance(content: string, contentType: string): Promise<{ score: number; confidence: number; factors: string[]; recommendations?: string[] }> {
    const factors: string[] = [];
    const recommendations: string[] = [];
    let score = 95; // Start with high compliance score

    // Copyright concerns
    const copyrightIndicators = [
      'copyright', '©', 'all rights reserved', 'proprietary',
      'trademark', '™', '®'
    ];
    
    const copyrightCount = copyrightIndicators.filter(indicator => 
      content.toLowerCase().includes(indicator.toLowerCase())
    ).length;
    
    if (copyrightCount > 0) {
      score -= 10;
      factors.push('copyright_mentions');
      recommendations.push('Verify copyright permissions');
    }

    // Legal disclaimers needed
    const financialTerms = ['investment', 'trading', 'stocks', 'crypto', 'bitcoin'];
    const medicalTerms = ['medical', 'health', 'treatment', 'cure', 'diagnosis'];
    
    const financialCount = financialTerms.filter(term => 
      content.toLowerCase().includes(term)
    ).length;
    
    const medicalCount = medicalTerms.filter(term => 
      content.toLowerCase().includes(term)
    ).length;
    
    if (financialCount > 0) {
      factors.push('financial_content');
      recommendations.push('Add financial disclaimer');
    }
    
    if (medicalCount > 0) {
      factors.push('medical_content');
      recommendations.push('Add medical disclaimer');
    }

    // Privacy concerns
    const privacyTerms = ['personal information', 'data collection', 'privacy'];
    const privacyCount = privacyTerms.filter(term => 
      content.toLowerCase().includes(term)
    ).length;
    
    if (privacyCount > 0) {
      factors.push('privacy_content');
      recommendations.push('Ensure GDPR/privacy compliance');
    }

    return {
      score: Math.min(100, Math.max(0, score)),
      confidence: 80,
      factors,
      recommendations
    };
  }

  // Comprehensive content risk identification
  private async identifyContentRisks(content: string, contentType: string): Promise<ContentRisk[]> {
    const risks: ContentRisk[] = [];

    // Misinformation risk
    const misinfoIndicators = [
      'unverified claims', 'anonymous sources', 'conspiracy theory',
      'without evidence', 'allegedly', 'rumored'
    ];
    
    const misinfoCount = misinfoIndicators.filter(indicator => 
      content.toLowerCase().includes(indicator)
    ).length;
    
    if (misinfoCount > 1) {
      risks.push({
        type: 'misinformation',
        severity: 'high',
        description: 'Content contains potential misinformation indicators',
        confidence: 75,
        mitigation: 'Fact-check all claims with reliable sources'
      });
    }

    // Copyright risk
    if (content.toLowerCase().includes('image from') || 
        content.toLowerCase().includes('video from') ||
        content.toLowerCase().includes('source:')) {
      risks.push({
        type: 'copyright',
        severity: 'medium',
        description: 'Potential use of third-party content',
        confidence: 60,
        mitigation: 'Verify usage rights and add proper attribution'
      });
    }

    // Brand safety risk
    const controversialTopics = ['political scandal', 'religious conflict', 'racial tension'];
    const controversialCount = controversialTopics.filter(topic => 
      content.toLowerCase().includes(topic)
    ).length;
    
    if (controversialCount > 0) {
      risks.push({
        type: 'brand_risk',
        severity: 'high',
        description: 'Content touches on controversial subjects',
        confidence: 80,
        mitigation: 'Review editorial guidelines and consider audience impact'
      });
    }

    // Quality risk
    const wordCount = content.split(/\s+/).length;
    if (wordCount < 50) {
      risks.push({
        type: 'quality',
        severity: 'medium',
        description: 'Content may be too brief for engagement',
        confidence: 90,
        mitigation: 'Expand content with additional context and details'
      });
    }

    return risks;
  }

  // Determine appropriate approval criteria based on content analysis
  private async determineApprovalCriteria(content: any, assessment: ContentQualityAssessment): Promise<AutoApprovalCriteria> {
    // Use conservative criteria if high risks detected
    const criticalRisks = assessment.risks.filter(risk => risk.severity === 'critical').length;
    const highRisks = assessment.risks.filter(risk => risk.severity === 'high').length;

    if (criticalRisks > 0 || highRisks > 2 || assessment.overallScore < 70) {
      return this.CONSERVATIVE_CRITERIA;
    }

    // Use default criteria for standard content
    return this.DEFAULT_CRITERIA;
  }

  // Make final approval decision based on assessment and criteria
  private async makeApprovalDecision(
    assessment: ContentQualityAssessment, 
    criteria: AutoApprovalCriteria
  ): Promise<ApprovalDecision> {
    
    const criticalRisks = assessment.risks.filter(risk => risk.severity === 'critical').length;
    const highRisks = assessment.risks.filter(risk => risk.severity === 'high').length;

    // Check if content meets all criteria
    const meetsScoreRequirements = 
      assessment.overallScore >= criteria.minOverallScore &&
      assessment.factualAccuracy >= criteria.minFactualAccuracy &&
      assessment.brandSafety >= criteria.minBrandSafety &&
      assessment.complianceScore >= criteria.minComplianceScore &&
      assessment.confidence >= criteria.minConfidence;

    const meetsRiskRequirements = 
      criticalRisks <= criteria.maxCriticalRisks &&
      highRisks <= criteria.maxHighRisks;

    const approved = meetsScoreRequirements && meetsRiskRequirements && !criteria.requireHumanReview;
    
    // Determine if human review is needed
    const requiresHumanReview = 
      !approved || 
      criticalRisks > 0 || 
      highRisks > 1 ||
      assessment.confidence < 75 ||
      assessment.overallScore < 80;

    // Generate reasoning
    const reasoning = this.generateApprovalReasoning(
      approved, 
      requiresHumanReview, 
      assessment, 
      criteria
    );

    return {
      approved,
      requiresHumanReview,
      score: assessment.overallScore,
      confidence: assessment.confidence,
      reasoning,
      risks: assessment.risks,
      recommendations: assessment.recommendations,
      criteria,
      metadata: {
        assessmentDetails: assessment,
        decisionTimestamp: new Date().toISOString()
      }
    };
  }

  // Helper methods
  private extractTextContent(content: any, contentType: string): string {
    switch (contentType) {
      case 'news':
        return `${content.title}\n\n${content.content}`;
      case 'video':
        return content.script || content.title || '';
      case 'script':
        return content.script || content.text || '';
      default:
        return JSON.stringify(content);
    }
  }

  private async getContentById(contentId: string, contentType: string): Promise<any> {
    switch (contentType) {
      case 'news':
        return await storage.getNewsArticleById(contentId);
      case 'video':
        const videos = await storage.getVideos(1000);
        return videos.find(v => v.id === contentId);
      default:
        throw new Error(`Unsupported content type: ${contentType}`);
    }
  }

  private calculateHeuristicFactualScore(content: string): number {
    let score = 60; // Base score

    // Source indicators
    if (content.includes('according to') || content.includes('reports say')) {
      score += 10;
    }

    // Specific details (dates, numbers, names)
    const datePattern = /\b\d{1,2}\/\d{1,2}\/\d{4}\b|\b\d{4}\b/g;
    const numberPattern = /\b\d+%\b|\$\d+|\b\d{1,3}(,\d{3})*\b/g;
    
    if (content.match(datePattern)) score += 10;
    if (content.match(numberPattern)) score += 10;

    // Qualification words (may indicate uncertainty)
    const uncertaintyWords = ['allegedly', 'reportedly', 'apparently', 'claims'];
    const uncertaintyCount = uncertaintyWords.filter(word => 
      content.toLowerCase().includes(word)
    ).length;
    
    if (uncertaintyCount > 2) score -= 15;

    return Math.min(100, Math.max(0, score));
  }

  private generateApprovalReasoning(
    approved: boolean, 
    requiresHumanReview: boolean, 
    assessment: ContentQualityAssessment, 
    criteria: AutoApprovalCriteria
  ): string {
    const reasons = [];

    if (approved) {
      reasons.push("Content meets all automated approval criteria");
      if (assessment.overallScore >= 90) {
        reasons.push("Exceptional content quality detected");
      }
      if (assessment.factualAccuracy >= 95) {
        reasons.push("High factual accuracy confidence");
      }
      if (assessment.brandSafety >= 95) {
        reasons.push("Excellent brand safety compliance");
      }
    } else {
      reasons.push("Content does not meet automated approval thresholds");
      if (assessment.overallScore < criteria.minOverallScore) {
        reasons.push(`Overall quality score (${assessment.overallScore}) below threshold (${criteria.minOverallScore})`);
      }
      if (assessment.confidence < criteria.minConfidence) {
        reasons.push(`AI confidence (${assessment.confidence}%) below required level`);
      }
    }

    if (requiresHumanReview) {
      const criticalRisks = assessment.risks.filter(r => r.severity === 'critical').length;
      const highRisks = assessment.risks.filter(r => r.severity === 'high').length;
      
      if (criticalRisks > 0) {
        reasons.push(`${criticalRisks} critical risk(s) identified`);
      }
      if (highRisks > 1) {
        reasons.push(`${highRisks} high-level risks detected`);
      }
      if (assessment.confidence < 75) {
        reasons.push("Low confidence in automated assessment");
      }
    }

    return reasons.join(". ") + ".";
  }

  private async createApprovalWorkflow(
    contentId: string, 
    contentType: string, 
    decision: ApprovalDecision, 
    assessment: ContentQualityAssessment
  ): Promise<void> {
    const workflowData: InsertApprovalWorkflow = {
      contentId,
      contentType,
      status: decision.approved && !decision.requiresHumanReview ? 'auto_approved' : 'manual_review',
      autoApprovalScore: decision.score,
      qualityMetrics: {
        assessment,
        decision,
        processingTimestamp: new Date().toISOString()
      },
      complianceChecks: {
        factualAccuracy: assessment.factualAccuracy,
        brandSafety: assessment.brandSafety,
        compliance: assessment.complianceScore,
        riskAssessment: assessment.risks
      },
      humanReviewRequired: decision.requiresHumanReview,
      approvedBy: decision.approved && !decision.requiresHumanReview ? 'ai' : null,
      approvedAt: decision.approved && !decision.requiresHumanReview ? new Date() : null,
      metadata: {
        autoApprovalVersion: '1.0',
        criteria: decision.criteria,
        reasoning: decision.reasoning,
        recommendations: decision.recommendations
      }
    };

    await storage.createApprovalWorkflow(workflowData);
  }

  private async executeAutoApprovedActions(
    contentId: string, 
    contentType: string, 
    decision: ApprovalDecision
  ): Promise<void> {
    try {
      console.log(`🚀 Executing auto-approved actions for ${contentType} ${contentId}`);

      if (contentType === 'news') {
        // Update news article status
        await storage.updateNewsArticleStatus(contentId, 'approved');
        
        // Trigger intelligent scheduling for video generation
        await intelligentSchedulingService.executeAutonomousScheduling();
      } else if (contentType === 'video') {
        // Update video status and trigger publishing workflow
        await storage.updateVideoStatus(contentId, 'approved');
        
        // Create publishing job
        await storage.createJob({
          type: 'publish',
          status: 'pending',
          data: {
            videoId: contentId,
            autoApproved: true,
            approvalScore: decision.score,
            priority: decision.score > 90 ? 'high' : 'normal'
          }
        });
      }

      console.log(`✅ Auto-approved actions executed for ${contentId}`);

    } catch (error) {
      console.error(`❌ Error executing auto-approved actions:`, error);
      
      await storage.createErrorLog({
        jobId: null,
        errorCode: 'AUTO_APPROVAL_ACTION_FAILED',
        severity: 'medium',
        message: `Failed to execute auto-approved actions for ${contentType} ${contentId}`,
        serviceName: 'AutoApproval',
        context: { contentId, contentType, decision }
      });
    }
  }

  // Batch processing for multiple content items
  async processBatchApproval(contentItems: Array<{id: string; type: string}>): Promise<ApprovalDecision[]> {
    console.log(`🔄 Processing batch approval for ${contentItems.length} items...`);
    
    const decisions: ApprovalDecision[] = [];
    const batchId = `batch_${Date.now()}`;
    
    try {
      // Create batch queue entry
      await storage.createBatchQueue({
        batchType: 'auto_approval',
        status: 'processing',
        priority: 60,
        totalJobs: contentItems.length,
        completedJobs: 0,
        failedJobs: 0,
        configuration: {
          approvalCriteria: this.DEFAULT_CRITERIA,
          batchId
        }
      });

      let completedJobs = 0;
      let failedJobs = 0;

      for (const item of contentItems) {
        try {
          const decision = await this.processContentForApproval(item.id, item.type as any);
          decisions.push(decision);
          completedJobs++;
        } catch (error) {
          console.error(`Failed to process ${item.type} ${item.id}:`, error);
          failedJobs++;
        }

        // Update batch progress
        await storage.updateBatchProgress(batchId, completedJobs, failedJobs);
      }

      // Complete batch
      await storage.completeBatch(batchId, {
        totalProcessed: contentItems.length,
        successful: completedJobs,
        failed: failedJobs,
        autoApproved: decisions.filter(d => d.approved && !d.requiresHumanReview).length,
        requireReview: decisions.filter(d => d.requiresHumanReview).length
      });

      console.log(`✅ Batch approval completed: ${completedJobs} successful, ${failedJobs} failed`);
      return decisions;

    } catch (error) {
      console.error("❌ Error in batch approval processing:", error);
      throw error;
    }
  }
}

export const autoApprovalService = new AutoApprovalService();