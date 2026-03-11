/**
 * Mnemo Session Monitor
 * Continuous background monitoring and recall system
 * 
 * Runs in parallel during work sessions, captures important context,
 * and enables "what did we do?" recall queries.
 */

const MnemoSmartHook = require('./mnemo-smart-hook');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class MnemoSessionMonitor {
  constructor(options = {}) {
    this.apiUrl = options.apiUrl || process.env.MNEMO_URL || 'http://localhost:10000';
    this.smartHook = new MnemoSmartHook(options);
    this.currentProject = options.project || 'general';
    this.sessionId = this.generateSessionId();
    this.sessionStartTime = Date.now();
    this.messageBuffer = [];
    this.importantMemories = [];
    this.isRunning = false;
    this.recallEnabled = options.recallEnabled !== false;
    
    // Session state file for persistence across restarts
    this.stateFile = path.join(
      require('os').homedir(),
      '.openclaw',
      'mnemo-session-state.json'
    );
    
    // Load previous session if exists
    this.loadSessionState();
  }
  
  generateSessionId() {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  loadSessionState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        const state = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
        if (state.currentProject) {
          this.currentProject = state.currentProject;
          console.log(`[MnemoSession] Restored project: ${this.currentProject}`);
        }
      }
    } catch (e) {
      console.error('[MnemoSession] Failed to load state:', e.message);
    }
  }
  
  saveSessionState() {
    try {
      const state = {
        currentProject: this.currentProject,
        sessionId: this.sessionId,
        lastActive: Date.now()
      };
      fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
    } catch (e) {
      console.error('[MnemoSession] Failed to save state:', e.message);
    }
  }
  
  /**
   * Start monitoring a work session
   */
  async startSession(project) {
    if (project) {
      this.currentProject = project;
      this.saveSessionState();
    }
    
    this.isRunning = true;
    this.sessionStartTime = Date.now();
    
    // Store session start
    await this.storeSessionEvent('session_start', `Started work session on ${this.currentProject}`);
    
    console.log(`[MnemoSession] 🟢 Started session: ${this.sessionId}`);
    console.log(`[MnemoSession] 📁 Project: ${this.currentProject}`);
    
    return {
      sessionId: this.sessionId,
      project: this.currentProject,
      startedAt: new Date().toISOString()
    };
  }
  
  /**
   * Process a message during the session
   */
  async processMessage(message, context = {}) {
    if (!this.isRunning) {
      console.log('[MnemoSession] ⚠️ No active session, auto-starting...');
      await this.startSession(context.project || 'general');
    }
    
    // Add to buffer for context
    this.messageBuffer.push({
      message: message.slice(0, 200),
      timestamp: Date.now(),
      project: this.currentProject
    });
    
    // Keep only last 50 messages
    this.messageBuffer = this.messageBuffer.slice(-50);
    
    // Process through smart hook
    const result = await this.smartHook.onMessage(message, {
      ...context,
      currentProject: this.currentProject,
      sessionId: this.sessionId
    });
    
    // Track important memories for quick recall
    if (result && result.analysis && result.analysis.score >= 7) {
      this.importantMemories.push({
        content: message.slice(0, 100),
        type: result.analysis.detectedType,
        score: result.analysis.score,
        timestamp: Date.now()
      });
      
      // Keep only last 20 important memories
      this.importantMemories = this.importantMemories.slice(-20);
    }
    
    return result;
  }
  
  /**
   * RECALL: Get summary of what was done in this session
   */
  async recall(options = {}) {
    const { 
      timeframe = 'session',  // 'session', 'today', 'week', 'all'
      type = null,            // Filter by type: 'milestone', 'decision', 'error'
      project = this.currentProject,
      summarize = true
    } = options;
    
    console.log(`[MnemoSession] 🔍 Recalling memories from ${timeframe}...`);
    
    let days = 1;
    if (timeframe === 'week') days = 7;
    if (timeframe === 'all') days = 365;
    
    // Build recall query
    const recallQueries = [
      'milestone shipped deployed completed',
      'decision decided chose finalized',
      'bug error issue fixed',
      'goal objective plan',
      'important critical blocking'
    ];
    
    const allResults = [];
    
    for (const query of recallQueries) {
      try {
        const response = await fetch(
          `${this.apiUrl}/api/memory/query?q=${encodeURIComponent(query)}&project=${project}&days=${days}&limit=10`
        );
        const data = await response.json();
        if (data.results) {
          allResults.push(...data.results);
        }
      } catch (e) {
        console.error('[MnemoSession] Recall query failed:', e.message);
      }
    }
    
    // Remove duplicates by ID
    const uniqueResults = Array.from(
      new Map(allResults.map(m => [m.id, m])).values()
    );
    
    // Sort by importance and time
    uniqueResults.sort((a, b) => {
      if (a.importance !== b.importance) {
        return b.importance - a.importance;
      }
      return new Date(b.created_at) - new Date(a.created_at);
    });
    
    // Filter by type if specified
    let filtered = uniqueResults;
    if (type) {
      filtered = uniqueResults.filter(m => m.content_type === type);
    }
    
    // Generate summary if requested
    let summary = null;
    if (summarize && filtered.length > 0) {
      summary = this.generateSummary(filtered);
    }
    
    return {
      query: options,
      count: filtered.length,
      summary: summary,
      memories: filtered.slice(0, 20),
      sessionContext: {
        project: this.currentProject,
        sessionId: this.sessionId,
        duration: this.getSessionDuration(),
        messagesProcessed: this.messageBuffer.length,
        importantCaptures: this.importantMemories.length
      }
    };
  }
  
  /**
   * Generate human-readable summary of session
   */
  generateSummary(memories) {
    const byType = {};
    memories.forEach(m => {
      const type = m.content_type || 'insight';
      if (!byType[type]) byType[type] = [];
      byType[type].push(m);
    });
    
    const parts = [];
    
    if (byType.milestone) {
      const count = byType.milestone.length;
      const latest = byType.milestone[0].content.slice(0, 60);
      parts.push(`🚀 ${count} milestone${count > 1 ? 's' : ''} (latest: "${latest}...")`);
    }
    
    if (byType.decision) {
      const count = byType.decision.length;
      parts.push(`🎯 ${count} decision${count > 1 ? 's' : ''} made`);
    }
    
    if (byType.error || byType.issue) {
      const count = (byType.error?.length || 0) + (byType.issue?.length || 0);
      parts.push(`🐛 ${count} issue${count > 1 ? 's' : ''} encountered`);
    }
    
    if (byType.security) {
      const count = byType.security.length;
      parts.push(`🔒 ${count} security item${count > 1 ? 's' : ''}`);
    }
    
    if (byType.goal) {
      const count = byType.goal.length;
      parts.push(`📌 ${count} goal${count > 1 ? 's' : ''} set`);
    }
    
    return {
      text: parts.join('\n'),
      byType: byType,
      total: memories.length
    };
  }
  
  /**
   * Quick recall - "What did we do?"
   */
  async quickRecall() {
    const recall = await this.recall({ 
      timeframe: 'session',
      summarize: true 
    });
    
    if (recall.count === 0) {
      return "📭 No significant memories from this session yet.";
    }
    
    const lines = [
      `📊 Session Summary (${recall.sessionContext.duration})`,
      ``,
      recall.summary.text,
      ``,
      `💡 ${recall.count} total important memories captured`,
      `📁 Project: ${recall.sessionContext.project}`
    ];
    
    return lines.join('\n');
  }
  
  /**
   * Search for specific topic
   */
  async search(query, options = {}) {
    const project = options.project || this.currentProject;
    const days = options.days || 30;
    
    try {
      const response = await fetch(
        `${this.apiUrl}/api/memory/query?q=${encodeURIComponent(query)}&project=${project}&days=${days}&limit=${options.limit || 10}`
      );
      const data = await response.json();
      
      return {
        query: query,
        count: data.results?.length || 0,
        results: data.results || []
      };
    } catch (e) {
      console.error('[MnemoSession] Search failed:', e.message);
      return { query, count: 0, results: [], error: e.message };
    }
  }
  
  /**
   * End current session
   */
  async endSession() {
    this.isRunning = false;
    
    // Store session summary
    const summary = await this.quickRecall();
    await this.storeSessionEvent('session_end', `Session ended. ${summary.replace(/\n/g, ' ')}`);
    
    const duration = this.getSessionDuration();
    console.log(`[MnemoSession] 🔴 Ended session: ${this.sessionId}`);
    console.log(`[MnemoSession] ⏱️  Duration: ${duration}`);
    console.log(`[MnemoSession] 💾 Captured: ${this.importantMemories.length} important memories`);
    
    return {
      sessionId: this.sessionId,
      duration: duration,
      messagesProcessed: this.messageBuffer.length,
      importantMemories: this.importantMemories.length
    };
  }
  
  /**
   * Switch to different project
   */
  async switchProject(newProject) {
    if (this.currentProject === newProject) return;
    
    // Store context switch
    await this.storeSessionEvent(
      'project_switch', 
      `Switched from ${this.currentProject} to ${newProject}`
    );
    
    this.currentProject = newProject;
    this.saveSessionState();
    
    console.log(`[MnemoSession] 🔄 Switched to project: ${newProject}`);
    
    return { previous: this.currentProject, current: newProject };
  }
  
  /**
   * Store session event
   */
  async storeSessionEvent(eventType, content) {
    try {
      await fetch(`${this.apiUrl}/api/memory/store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `[Session ${eventType}] ${content}`,
          type: 'conversation',
          importance: 5,
          project: this.currentProject,
          agentId: 'ares',
          metadata: {
            sessionId: this.sessionId,
            eventType: eventType,
            timestamp: Date.now()
          }
        })
      });
    } catch (e) {
      console.error('[MnemoSession] Failed to store event:', e.message);
    }
  }
  
  getSessionDuration() {
    const ms = Date.now() - this.sessionStartTime;
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  }
  
  /**
   * Get current session stats
   */
  getStats() {
    return {
      sessionId: this.sessionId,
      project: this.currentProject,
      isRunning: this.isRunning,
      duration: this.getSessionDuration(),
      messagesInBuffer: this.messageBuffer.length,
      importantMemories: this.importantMemories.length
    };
  }
}

// Export for use
module.exports = MnemoSessionMonitor;

// If run directly, test
if (require.main === module) {
  const monitor = new MnemoSessionMonitor();
  
  console.log('🧠 Mnemo Session Monitor - Test Mode\n');
  console.log('=' .repeat(80));
  
  (async () => {
    // Start session
    await monitor.startSession('testproject');
    
    // Simulate work
    const messages = [
      "New project TestApp with React frontend",
      "I decided to use PostgreSQL for the database",
      "Bug: API returns 500 on user login",
      "Deployed v1.0 to Vercel successfully",
      "API key for production: sk-prod-xyz123"
    ];
    
    for (const msg of messages) {
      console.log(`\nProcessing: "${msg}"`);
      const result = await monitor.processMessage(msg);
      console.log(`Action: ${result?.action || 'error'}`);
    }
    
    // Quick recall
    console.log('\n' + '=' .repeat(80));
    console.log('QUICK RECALL:');
    const summary = await monitor.quickRecall();
    console.log(summary);
    
    // End session
    console.log('\n' + '=' .repeat(80));
    await monitor.endSession();
    
    process.exit(0);
  })();
}
