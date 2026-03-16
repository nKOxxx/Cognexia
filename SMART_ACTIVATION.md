# Cognexia Smart Activation System

## Overview

Cognexia becomes proactive - it listens to all conversations and intelligently activates when important context is detected, saving relevant data automatically without explicit commands.

## Activation Triggers

### 1. **Explicit Triggers** (Immediate Activation)

```javascript
const EXPLICIT_TRIGGERS = [
  'new project',
  'create project',
  'start project',
  'begin project',
  'init project'
];
```

**Action:**
- Extract project name from next message
- Create new project memory space
- Store project description
- Set context for following messages

### 2. **Project Name Detection** (Context Switch)

```javascript
// Cognexia maintains list of known projects
const knownProjects = ['gulfwatch', 'agentvault', 'moltguard', '2ndcto', ...];

// Detect project mentions
const PROJECT_PATTERNS = [
  /\b(gulfwatch|gulf watch)\b/i,
  /\b(agentvault|agent vault)\b/i,
  /\b(moltguard|molt guard)\b/i,
  /\b(2ndcto|2nd cto)\b/i,
  // ... auto-populated from existing projects
];
```

**Action:**
- Switch context to mentioned project
- Load recent memories for context
- Tag following memories to this project

### 3. **Smart Trigger Words** (Precautionary Activation)

```javascript
const SMART_TRIGGERS = {
  // Decisions
  decision: ['decided to', 'decision:', 'i decided', 'we decided', 'chose to', 'going with', 'settled on'],
  
  // Milestones
  milestone: ['shipped', 'released', 'launched', 'deployed', 'completed', 'finished', 'done', 'v1.0', 'v2.0'],
  
  // Goals
  goal: ['goal is', 'objective:', 'target:', 'aiming for', 'plan to', 'need to', 'want to', 'the plan'],
  
  // Issues/Bugs
  issue: ['bug:', 'error:', 'issue:', 'problem:', 'broken', 'fails', 'crash', 'exception', 'not working'],
  
  // Security
  security: ['api key', 'password', 'secret', 'token', 'credential', 'auth', 'encryption', 'vulnerability'],
  
  // Architecture
  architecture: ['architecture', 'design:', 'structure:', 'pattern:', 'refactor', 'redesign', 'restructure'],
  
  // Preferences
  preference: ['prefer', 'i like', 'i want', 'don\'t like', 'hate', 'love', 'favorite'],
  
  // Contacts/People
  contact: ['met with', 'talked to', 'call with', 'email from', '@username', 'contact:'],
  
  // Learnings
  learning: ['learned that', 'realized', 'discovered', 'found out', 'turns out', 'note:'],
  
  // Important
  important: ['important:', 'critical:', 'urgent:', 'must', 'essential', 'crucial', 'vital']
};
```

**Action:**
- Analyze message for relevance
- Score importance (1-10)
- If score > threshold (e.g., 6), store memory
- Auto-classify by trigger type

## Smart Relevance Detection

### Message Scoring Algorithm

```javascript
function scoreMessage(message, context) {
  let score = 0;
  let reasons = [];
  
  // Check explicit triggers (high score)
  if (containsExplicitTrigger(message)) {
    score += 8;
    reasons.push('explicit_trigger');
  }
  
  // Check smart triggers
  for (const [type, patterns] of Object.entries(SMART_TRIGGERS)) {
    if (matchesAnyPattern(message, patterns)) {
      score += TRIGGER_SCORES[type] || 5;
      reasons.push(`trigger:${type}`);
      detectedType = type;
    }
  }
  
  // Project mention bonus
  if (mentionsKnownProject(message)) {
    score += 3;
    reasons.push('project_mention');
  }
  
  // Length indicates substance
  if (message.length > 100) {
    score += 1;
    reasons.push('substantial_length');
  }
  
  // Question/answer pairs are often valuable
  if (message.includes('?') && context.previousWasAnswer) {
    score += 2;
    reasons.push('qna_context');
  }
  
  // Code blocks are usually important
  if (containsCodeBlock(message)) {
    score += 3;
    reasons.push('contains_code');
  }
  
  // Links to resources
  if (containsURL(message)) {
    score += 2;
    reasons.push('contains_link');
  }
  
  // Recent similar memory (avoid duplicates)
  if (hasRecentSimilarMemory(message, 24)) {
    score -= 5;
    reasons.push('recent_similar');
  }
  
  return { score, reasons, detectedType };
}
```

### Storage Decision Matrix

| Score | Action | Confirmation |
|-------|--------|--------------|
| 9-10 | Auto-store, notify | "💾 Saved: [summary]" |
| 7-8 | Auto-store, silent | Store without notification |
| 5-6 | Suggest storage | "💡 Store this? [Yes/No/Edit]" |
| <5 | Ignore | - |

## Implementation: Cognexia Smart Hook

### File: `cognexia-smart-hook.js`

```javascript
/**
 * Cognexia Smart Activation Hook
 * Proactively stores relevant memories from all conversations
 */

class CognexiaSmartHook {
  constructor() {
    this.apiUrl = process.env.COGNEXIA_URL || 'http://localhost:10000';
    this.threshold = 6; // Minimum score to store
    this.recentMessages = []; // Sliding window for context
    this.knownProjects = new Set();
    
    // Load known projects on init
    this.loadProjects();
  }
  
  async loadProjects() {
    try {
      const response = await fetch(`${this.apiUrl}/api/projects`);
      const data = await response.json();
      this.knownProjects = new Set(data.projects || []);
    } catch (e) {
      console.error('[CognexiaSmart] Failed to load projects:', e);
    }
  }
  
  /**
   * Process incoming message
   */
  async onMessage(message, context = {}) {
    const analysis = this.analyzeMessage(message, context);
    
    if (analysis.score >= this.threshold) {
      await this.storeMemory(message, analysis, context);
    }
    
    // Store in sliding window for context
    this.recentMessages.push({ message, timestamp: Date.now() });
    this.recentMessages = this.recentMessages.slice(-10); // Keep last 10
  }
  
  /**
   * Analyze message for importance
   */
  analyzeMessage(message, context) {
    const lowerMessage = message.toLowerCase();
    let score = 0;
    let reasons = [];
    let detectedType = 'insight';
    let project = null;
    
    // Check explicit triggers (highest priority)
    const EXPLICIT_TRIGGERS = [
      'new project', 'create project', 'start project', 
      'begin project', 'init project'
    ];
    
    if (EXPLICIT_TRIGGERS.some(t => lowerMessage.includes(t))) {
      score += 9;
      reasons.push('explicit_new_project');
      detectedType = 'goal';
      
      // Try to extract project name from next context
      project = this.extractProjectName(message);
    }
    
    // Check known project mentions
    for (const proj of this.knownProjects) {
      if (lowerMessage.includes(proj.toLowerCase())) {
        score += 4;
        reasons.push(`project:${proj}`);
        project = proj;
        break;
      }
    }
    
    // Check smart triggers
    const SMART_TRIGGERS = {
      decision: { patterns: ['decided to', 'decision:', 'chose', 'going with'], score: 7, type: 'decision' },
      milestone: { patterns: ['shipped', 'released', 'launched', 'deployed', 'completed'], score: 8, type: 'milestone' },
      goal: { patterns: ['goal is', 'objective:', 'plan to', 'need to'], score: 6, type: 'goal' },
      issue: { patterns: ['bug:', 'error:', 'issue:', 'problem:', 'broken'], score: 7, type: 'error' },
      security: { patterns: ['api key', 'password', 'secret', 'token', 'credential'], score: 9, type: 'security' },
      learning: { patterns: ['learned', 'realized', 'discovered', 'found out'], score: 5, type: 'insight' },
      preference: { patterns: ['prefer', 'i like', 'i want', 'don\'t like'], score: 4, type: 'preference' }
    };
    
    for (const [key, config] of Object.entries(SMART_TRIGGERS)) {
      if (config.patterns.some(p => lowerMessage.includes(p))) {
        score += config.score;
        reasons.push(`trigger:${key}`);
        detectedType = config.type;
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
    
    // Recent context bonus
    if (this.isPartOfOngoingDiscussion()) {
      score += 1;
      reasons.push('ongoing_discussion');
    }
    
    return {
      score: Math.min(score, 10),
      reasons,
      detectedType,
      project: project || context.currentProject || 'general',
      shouldConfirm: score >= 5 && score < 8
    };
  }
  
  /**
   * Store memory to Cognexia
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
        context: {
          recentMessages: this.recentMessages.slice(-3),
          timestamp: new Date().toISOString()
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
        console.log(`[CognexiaSmart] Stored: ${analysis.detectedType} (${analysis.score}/10)`);
        
        // Notify if high importance
        if (analysis.score >= 8) {
          this.notifyUser(`💾 Auto-saved: ${this.summarize(message)}`);
        }
        
        return true;
      }
    } catch (e) {
      console.error('[CognexiaSmart] Failed to store:', e);
    }
    
    return false;
  }
  
  /**
   * Extract project name from message
   */
  extractProjectName(message) {
    // Match patterns like "new project GulfWatch" or "project: AgentVault"
    const patterns = [
      /(?:new|create|start)\s+(?:project\s+)?["']?([\w-]+)["']?/i,
      /project["']?\s*[:\-]\s*["']?([\w-]+)["']?/i,
      /(?:called|named)\s+["']?([\w-]+)["']?/i
    ];
    
    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        return match[1].toLowerCase();
      }
    }
    
    return null;
  }
  
  containsCode(message) {
    return message.includes('```') || 
           message.includes('`') ||
           /function|const|let|var|class|import|export/.test(message);
  }
  
  containsURL(message) {
    return /https?:\/\/[^\s]+/.test(message);
  }
  
  isPartOfOngoingDiscussion() {
    // Check if recent messages are within last 5 minutes
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    return this.recentMessages.some(m => m.timestamp > fiveMinutesAgo);
  }
  
  summarize(message) {
    // Create brief summary for notification
    return message.length > 60 ? message.slice(0, 60) + '...' : message;
  }
  
  notifyUser(message) {
    // Integration point - send to Telegram, console, etc.
    console.log(`[Cognexia] ${message}`);
  }
}

// Export for use as OpenClaw hook or standalone
module.exports = CognexiaSmartHook;

// If run directly, test
if (require.main === module) {
  const hook = new CognexiaSmartHook();
  
  // Test messages
  const tests = [
    "New project MoltBase - agent-native Notion competitor",
    "I decided to use React for the frontend",
    "Bug: API returns 500 on user login",
    "Just shipped v1.0 of Gulf Watch!",
    "API key: sk-abc123 (don't share this)",
    "I prefer bullet points over long messages",
    "Hey, how are you?" // Should not trigger
  ];
  
  console.log('Testing Cognexia Smart Hook...\n');
  
  for (const test of tests) {
    const analysis = hook.analyzeMessage(test, {});
    console.log(`Message: "${test.slice(0, 50)}..."`);
    console.log(`Score: ${analysis.score}/10, Type: ${analysis.detectedType}`);
    console.log(`Reasons: ${analysis.reasons.join(', ')}`);
    console.log(`Would store: ${analysis.score >= 6 ? 'YES' : 'NO'}\n`);
  }
}
```

## Integration with OpenClaw

### Option 1: Hook Integration

```json
// ~/.openclaw/config.json
{
  "hooks": {
    "messageReceived": ["cognexia-smart-hook.js"],
    "sessionStart": ["cognexia-hook.js"]
  }
}
```

### Option 2: Middleware Integration

```javascript
// In OpenClaw message processing pipeline
const CognexiaSmartHook = require('./cognexia-smart-hook');
const cognexiaHook = new CognexiaSmartHook();

async function processMessage(message, context) {
  // First, let Cognexia analyze and potentially store
  await cognexiaHook.onMessage(message, context);
  
  // Continue with normal processing
  return generateResponse(message, context);
}
```

### Option 3: Bot-Level Integration

For non-OpenClaw bots (Telegram bot, Discord bot, etc.):

```javascript
const CognexiaSmartHook = require('./cognexia-smart-hook');
const cognexia = new CognexiaSmartHook();

// Telegram bot example
bot.on('message', async (msg) => {
  await cognexia.onMessage(msg.text, {
    agentId: 'telegram-bot',
    currentProject: detectProjectFromChat(msg.chat.id)
  });
});
```

## User Experience Flow

### Scenario 1: New Project Detection

**User:** "New project MoltBase - agent-native Notion competitor"

**Cognexia:**
1. Score: 9/10 (explicit trigger + substantial content)
2. Action: Auto-store as `goal` type
3. Create project "moltbase" in database
4. Notify: "💾 Created new project: moltbase"

### Scenario 2: Smart Trigger

**User:** "I decided to use PostgreSQL instead of MongoDB for the user data"

**Cognexia:**
1. Score: 7/10 (decision trigger + substantial)
2. Action: Auto-store as `decision` type
3. Silent store (score < 8)

### Scenario 3: Project Mention

**User:** "Gulf Watch needs a better RSS feed parser"

**Cognexia:**
1. Score: 5/10 (project mention + issue keyword)
2. Action: Suggest storage
3. Ask: "💡 Store this insight about Gulf Watch? [Yes/No/Edit]"

### Scenario 4: Ignore Casual Chat

**User:** "Hey, how's it going?"

**Cognexia:**
1. Score: 0/10 (no triggers)
2. Action: Ignore
3. No storage, no notification

## Configuration

```javascript
// cognexia-smart-config.json
{
  "threshold": {
    "autoStore": 8,      // Auto-store without confirmation
    "suggest": 5,         // Suggest storage
    "ignore": 0           // Ignore below this
  },
  "triggers": {
    "enabled": true,
    "customKeywords": ["blockchain", "smart contract", "tokenomics"],
    "excludePatterns": ["^hello$", "^hi$", "^how are you"]
  },
  "notifications": {
    "enabled": true,
    "minImportance": 8,
    "format": "💾 Auto-saved: {summary}"
  },
  "context": {
    "windowSize": 10,     // Number of recent messages to keep
    "timeWindow": 300000  // 5 minutes in ms
  }
}
```

## Benefits

1. **Never Miss Important Context** - Cognexia captures decisions, bugs, goals automatically
2. **Zero Friction** - No explicit commands needed
3. **Smart Filtering** - Casual chat ignored, important stuff saved
4. **Project Awareness** - Auto-detects which project is being discussed
5. **Confidence Scoring** - Higher scores = more confident storage
6. **Privacy First** - All processing local, user controls data

## Next Steps

1. Implement `cognexia-smart-hook.js`
2. Add to OpenClaw hooks
3. Test with real conversations
4. Tune thresholds based on results
5. Add UI for managing trigger words
