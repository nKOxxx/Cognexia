/**
 * Mnemo Smart Activation Hook
 * Proactively stores relevant memories from all conversations
 * 
 * Usage:
 *   const MnemoSmartHook = require('./mnemo-smart-hook');
 *   const hook = new MnemoSmartHook();
 *   await hook.onMessage("New project GulfWatch", { agentId: 'ares' });
 */

class MnemoSmartHook {
  constructor(options = {}) {
    this.apiUrl = options.apiUrl || process.env.MNEMO_URL || 'http://localhost:10000';
    this.threshold = options.threshold || {
      autoStore: 7,      // Auto-store without confirmation
      suggest: 5,         // Suggest storage
      ignore: 0           // Ignore below this
    };
    this.recentMessages = [];
    this.knownProjects = new Set();
    this.notifications = options.notifications !== false;
    
    // Trigger configurations
    this.EXPLICIT_TRIGGERS = [
      'new project', 'create project', 'start project', 
      'begin project', 'init project', 'project:'
    ];
    
    this.SMART_TRIGGERS = {
      decision: { 
        patterns: ['decided to', 'decision:', 'i decided', 'we decided', 'chose to', 'going with', 'settled on'], 
        score: 7, 
        type: 'decision' 
      },
      milestone: { 
        patterns: ['shipped', 'released', 'launched', 'deployed', 'completed', 'finished', 'done', 'v1.0', 'v2.0', 'v3.0'], 
        score: 8, 
        type: 'milestone' 
      },
      goal: { 
        patterns: ['goal is', 'objective:', 'target:', 'aiming for', 'plan to', 'need to', 'want to', 'the plan is'], 
        score: 6, 
        type: 'goal' 
      },
      issue: { 
        patterns: ['bug:', 'error:', 'issue:', 'problem:', 'broken', 'fails', 'crash', 'exception', 'not working', 'doesn\'t work'], 
        score: 7, 
        type: 'error' 
      },
      security: { 
        patterns: ['api key', 'password', 'secret', 'token', 'credential', 'auth', 'encryption', 'vulnerability', 'exploit'], 
        score: 9, 
        type: 'security' 
      },
      architecture: { 
        patterns: ['architecture', 'design:', 'structure:', 'pattern:', 'refactor', 'redesign', 'restructure', 'tech stack'], 
        score: 6, 
        type: 'insight' 
      },
      learning: { 
        patterns: ['learned that', 'realized', 'discovered', 'found out', 'turns out', 'note:', 'remember that'], 
        score: 5, 
        type: 'insight' 
      },
      preference: { 
        patterns: ['prefer', 'i like', 'i want', 'don\'t like', 'hate', 'love', 'favorite', 'i hate'], 
        score: 4, 
        type: 'preference' 
      },
      important: { 
        patterns: ['important:', 'critical:', 'urgent:', 'must', 'essential', 'crucial', 'vital', 'key point'], 
        score: 7, 
        type: 'insight' 
      }
    };
    
    // Load projects on init
    this.loadProjects();
  }
  
  async loadProjects() {
    try {
      const response = await fetch(`${this.apiUrl}/api/projects`);
      const data = await response.json();
      if (data.projects) {
        data.projects.forEach(p => this.knownProjects.add(p.toLowerCase()));
      }
      console.log(`[MnemoSmart] Loaded ${this.knownProjects.size} projects`);
    } catch (e) {
      console.error('[MnemoSmart] Failed to load projects:', e.message);
    }
  }
  
  /**
   * Process incoming message - main entry point
   */
  async onMessage(message, context = {}) {
    if (!message || typeof message !== 'string') return null;
    
    // Skip very short messages
    if (message.length < 10) return null;
    
    const analysis = this.analyzeMessage(message, context);
    
    // Store if above threshold
    if (analysis.score >= this.threshold.autoStore) {
      const result = await this.storeMemory(message, analysis, context);
      return { action: 'stored', analysis, result };
    } else if (analysis.score >= this.threshold.suggest) {
      return { action: 'suggest', analysis, message: this.suggestStorage(message, analysis) };
    }
    
    // Store in sliding window for context
    this.addToContext(message);
    
    return { action: 'ignored', analysis };
  }
  
  /**
   * Analyze message for importance
   */
  analyzeMessage(message, context = {}) {
    const lowerMessage = message.toLowerCase();
    let score = 0;
    let reasons = [];
    let detectedType = 'insight';
    let project = context.currentProject || null;
    let isNewProject = false;
    
    // Check explicit triggers (highest priority)
    for (const trigger of this.EXPLICIT_TRIGGERS) {
      if (lowerMessage.includes(trigger)) {
        score += 9;
        reasons.push('explicit_new_project');
        detectedType = 'goal';
        isNewProject = true;
        
        // Extract project name
        const extractedProject = this.extractProjectName(message);
        if (extractedProject) {
          project = extractedProject;
          this.knownProjects.add(extractedProject.toLowerCase());
        }
        break;
      }
    }
    
    // Check known project mentions
    if (!isNewProject) {
      for (const proj of this.knownProjects) {
        if (lowerMessage.includes(proj.toLowerCase())) {
          score += 4;
          reasons.push(`project:${proj}`);
          project = proj;
          break;
        }
      }
    }
    
    // Check smart triggers
    for (const [key, config] of Object.entries(this.SMART_TRIGGERS)) {
      if (config.patterns.some(p => lowerMessage.includes(p))) {
        score += config.score;
        reasons.push(`trigger:${key}`);
        if (config.type) detectedType = config.type;
      }
    }
    
    // Context bonuses
    if (message.length > 150) {
      score += 1;
      reasons.push('substantial');
    }
    
    if (this.containsCode(message)) {
      score += 2;
      reasons.push('has_code');
    }
    
    if (this.containsURL(message)) {
      score += 1;
      reasons.push('has_url');
    }
    
    if (this.containsNumbers(message) && detectedType === 'milestone') {
      score += 1;
      reasons.push('version_number');
    }
    
    // Ongoing discussion bonus
    if (this.isPartOfOngoingDiscussion()) {
      score += 1;
      reasons.push('ongoing_discussion');
    }
    
    return {
      score: Math.min(score, 10),
      reasons,
      detectedType,
      project: project || 'general',
      isNewProject
    };
  }
  
  /**
   * Store memory to Mnemo
   */
  async storeMemory(message, analysis, context) {
    const memory = {
      content: message,
      type: analysis.detectedType,
      importance: analysis.score,
      project: analysis.project,
      agentId: context.agentId || 'ares',
      metadata: {
        autoStored: true,
        reasons: analysis.reasons,
        timestamp: new Date().toISOString(),
        context: {
          recentMessages: this.recentMessages.slice(-3).map(m => m.message.slice(0, 100))
        }
      }
    };
    
    try {
      const response = await fetch(`${this.apiUrl}/api/memory/store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(memory)
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(`[MnemoSmart] ✓ Stored [${analysis.detectedType}] ${analysis.score}/10 - ${analysis.project}`);
        
        // Notify if high importance
        if (this.notifications && analysis.score >= 8) {
          this.notify(`💾 Auto-saved: ${this.summarize(message)}`);
        }
        
        return { success: true, id: data.id };
      } else {
        const error = await response.text();
        console.error('[MnemoSmart] Store failed:', error);
        return { success: false, error };
      }
    } catch (e) {
      console.error('[MnemoSmart] Network error:', e.message);
      return { success: false, error: e.message };
    }
  }
  
  /**
   * Suggest storage to user
   */
  suggestStorage(message, analysis) {
    const summary = this.summarize(message);
    return `💡 Store this ${analysis.detectedType}? "${summary}" [Yes/No/Edit]`;
  }
  
  /**
   * Extract project name from message
   */
  extractProjectName(message) {
    const patterns = [
      /(?:new|create|start|begin)\s+(?:project\s+)?["']?([\w-]+)["']?/i,
      /project["']?\s*[:\-]\s*["']?([\w-]+)["']?/i,
      /(?:called|named)\s+["']?([\w-]+)["']?/i,
      /^(?:project\s+)?["']?([\w-]+)["']?\s*[-:]/i
    ];
    
    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        return match[1].toLowerCase();
      }
    }
    
    return null;
  }
  
  /**
   * Helper: Check if message contains code
   */
  containsCode(message) {
    return message.includes('```') || 
           (message.includes('`') && message.match(/`[^`]+`/)) ||
           /\b(function|const|let|var|class|import|export|return|if|for|while)\b/.test(message);
  }
  
  /**
   * Helper: Check if message contains URL
   */
  containsURL(message) {
    return /https?:\/\/[^\s]+/.test(message);
  }
  
  /**
   * Helper: Check if message contains numbers
   */
  containsNumbers(message) {
    return /\d+\.\d+|v\d+/.test(message);
  }
  
  /**
   * Check if part of ongoing discussion
   */
  isPartOfOngoingDiscussion() {
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    return this.recentMessages.some(m => m.timestamp > fiveMinutesAgo);
  }
  
  /**
   * Add message to context window
   */
  addToContext(message) {
    this.recentMessages.push({ 
      message: message.slice(0, 200), 
      timestamp: Date.now() 
    });
    this.recentMessages = this.recentMessages.slice(-10);
  }
  
  /**
   * Create brief summary
   */
  summarize(message) {
    // Remove code blocks for summary
    const clean = message.replace(/```[\s\S]*?```/g, '[code]').replace(/`[^`]+`/g, '[code]');
    return clean.length > 60 ? clean.slice(0, 60) + '...' : clean;
  }
  
  /**
   * Notification handler
   */
  notify(message) {
    // Override this method to integrate with Telegram, console, etc.
    console.log(`[Mnemo] ${message}`);
    
    // If Telegram bot is available, send message
    if (this.telegramBot && this.chatId) {
      this.telegramBot.sendMessage(this.chatId, message);
    }
  }
  
  /**
   * Set Telegram bot for notifications
   */
  setTelegramBot(bot, chatId) {
    this.telegramBot = bot;
    this.chatId = chatId;
  }
}

// Export for use
module.exports = MnemoSmartHook;

// If run directly, test
if (require.main === module) {
  const hook = new MnemoSmartHook();
  
  const tests = [
    { msg: "New project MoltBase - agent-native Notion competitor", ctx: {} },
    { msg: "I decided to use PostgreSQL instead of MongoDB", ctx: {} },
    { msg: "Bug: API returns 500 on user login", ctx: { currentProject: 'testapp' } },
    { msg: "Just shipped v1.0 of Gulf Watch!", ctx: {} },
    { msg: "API key: sk-abc123 (don't share this)", ctx: {} },
    { msg: "I prefer bullet points over long messages", ctx: {} },
    { msg: "Hey, how are you?", ctx: {} },
    { msg: "The goal is to build a circuit breaker algorithm", ctx: {} },
    { msg: "Learned that Vercel has a 100 deployments/day limit", ctx: {} },
    { msg: "Refactoring the auth middleware to use JWT", ctx: { currentProject: 'moltguard' } }
  ];
  
  console.log('🧠 Mnemo Smart Hook - Test Mode\n');
  console.log('=' .repeat(80));
  
  (async () => {
    for (const test of tests) {
      const result = await hook.onMessage(test.msg, test.ctx);
      const analysis = result.analysis;
      
      console.log(`\nMessage: "${test.msg}"`);
      console.log(`Score: ${analysis.score}/10 | Type: ${analysis.detectedType} | Project: ${analysis.project}`);
      console.log(`Reasons: ${analysis.reasons.join(', ')}`);
      console.log(`Action: ${result.action.toUpperCase()}`);
      
      if (result.action === 'suggest') {
        console.log(`Suggestion: ${result.message}`);
      }
      
      console.log('-'.repeat(80));
    }
    
    console.log('\n✅ Test complete');
    process.exit(0);
  })();
}
