# Mnemo Session Monitor - Always-On Memory System

Mnemo now runs **in parallel** during work sessions, continuously capturing important context and enabling **"What did we do?"** recall at any time.

---

## 🎯 How It Works

```
Work Session Started
        │
        ▼
┌──────────────────┐
│ Session Monitor  │ ← Runs continuously in background
│                  │
│  ┌────────────┐  │
│  │  Captures  │  │ ← Every message analyzed
│  │  Important │  │
│  │   Stuff    │  │
│  └─────┬──────┘  │
│        │         │
│  ┌─────┴──────┐  │
│  │   Stores   │  │ ← To Mnemo database
│  │   to Disk  │  │
│  └────────────┘  │
└────────┬─────────┘
         │
    Hours Later...
         │
         ▼
   "What did we do?"
         │
         ▼
┌──────────────────┐
│  RECALL System   │
│                  │
│  • Milestones    │
│  • Decisions     │
│  • Issues Fixed  │
│  • Goals Set     │
└──────────────────┘
```

---

## 🚀 Quick Start

### 1. Start Mnemo Server

```bash
cd /path/to/Mnemo
./start.sh start
```

### 2. Initialize Session Monitor

```javascript
const MnemoSessionMonitor = require('./mnemo-session-monitor');

// Create monitor for your project
const monitor = new MnemoSessionMonitor({
  project: 'gulfwatch'  // or auto-detect
});

// Start session
await monitor.startSession('gulfwatch');
```

### 3. Process Messages During Work

```javascript
// Every message goes through monitor
await monitor.processMessage("I decided to use PostgreSQL");
await monitor.processMessage("Bug: API returns 500");
await monitor.processMessage("Deployed v2.0 to Vercel!");
```

### 4. Recall Later

```javascript
// "What did we do today?"
const summary = await monitor.quickRecall();
console.log(summary);
```

**Output:**
```
📊 Session Summary (2h 15m)

🚀 3 milestones (latest: "Deployed v2.0 to Vercel...")
🎯 2 decisions made
🐛 1 issue encountered
🔒 1 security item

💡 7 total important memories captured
📁 Project: gulfwatch
```

---

## 📋 Usage Patterns

### Pattern 1: OpenClaw Integration (Automatic)

```javascript
// ~/.openclaw/hooks/mnemo-session.js
const MnemoSessionMonitor = require('/path/to/Mnemo/mnemo-session-monitor');

let monitor = null;

module.exports = {
  async onMessage(msg, context) {
    // Auto-start on first message
    if (!monitor) {
      monitor = new MnemoSessionMonitor();
      await monitor.startSession(context.project || 'general');
    }
    
    // Process every message
    await monitor.processMessage(msg, context);
  },
  
  async onCommand(command, args) {
    if (command === 'recall') {
      const summary = await monitor.quickRecall();
      return { reply: summary };
    }
    if (command === 'what') {
      const result = await monitor.recall({ 
        timeframe: args[0] || 'session' 
      });
      return { reply: result.summary.text };
    }
  }
};
```

### Pattern 2: Manual Session Control

```javascript
const MnemoSessionMonitor = require('./mnemo-session-monitor');
const monitor = new MnemoSessionMonitor();

// Start working on Gulf Watch
await monitor.startSession('gulfwatch');

// ... do work ...
await monitor.processMessage("New feature: Circuit Breaker");
await monitor.processMessage("Bug fixed: RSS feed parser");

// Switch to different project
await monitor.switchProject('moltguard');
await monitor.processMessage("Security audit completed");

// Recall what we did in Gulf Watch
const gulfwatchSummary = await monitor.recall({ 
  project: 'gulfwatch',
  timeframe: 'today' 
});

// End session
await monitor.endSession();
```

### Pattern 3: Background Process

```bash
# Start monitor in background
node mnemo-session-monitor.js --daemon --project=gulfwatch &

# It captures everything automatically
# Recall anytime:
curl http://localhost:10001/recall
```

---

## 🔍 Recall Commands

### Quick Recall
```javascript
const summary = await monitor.quickRecall();
```
**Returns:** Human-readable summary of current session

### Detailed Recall
```javascript
const result = await monitor.recall({
  timeframe: 'today',    // 'session', 'today', 'week', 'all'
  type: 'milestone',     // Filter by type (optional)
  project: 'gulfwatch',  // Specific project (optional)
  summarize: true        // Generate summary
});

// Access results
console.log(result.summary.text);
console.log(result.memories);  // Full memory objects
console.log(result.count);     // Total count
```

### Search
```javascript
const search = await monitor.search('vercel deployment', {
  days: 7,
  limit: 10
});
```

---

## 📊 What Gets Captured

### Auto-Captured (High Score ≥7)
- 🚀 **Milestones**: shipped, deployed, released
- 🎯 **Decisions**: decided to, going with, chose
- 🐛 **Issues**: bug, error, crash, fixed
- 🔒 **Security**: api key, password, secret
- ⚠️ **Critical**: important, blocking, urgent

### Session Context
- Duration of work session
- Number of messages processed
- Important memories count
- Project switches

---

## 💡 Example Workflow

```javascript
// 9:00 AM - Start day
const monitor = new MnemoSessionMonitor();
await monitor.startSession('gulfwatch');

// Work through the day...
await monitor.processMessage("New project GulfWatch v3 with RSS feeds");
await monitor.processMessage("I decided to use RSS.app for Twitter sources");
await monitor.processMessage("Bug: Vercel deployment limit hit 100/day");
await monitor.processMessage("Fixed with GitHub Pages fallback");
await monitor.processMessage("Deployed v2.1 to production");
await monitor.processMessage("API key for NewsData.io acquired");

// 5:00 PM - End of day, what did we do?
const summary = await monitor.quickRecall();
```

**Output:**
```
📊 Session Summary (8h 12m)

🚀 1 milestone (latest: "Deployed v2.1 to production...")
🎯 1 decision made
🐛 1 issue encountered (fixed)
🔒 1 security item

💡 6 total important memories captured
📁 Project: gulfwatch
```

**Recall specific details:**
```javascript
// What issues did we fix today?
const issues = await monitor.recall({ 
  type: 'error',
  timeframe: 'today' 
});

// Output: "Bug: Vercel deployment limit..."
```

---

## 🔧 Configuration

```javascript
const monitor = new MnemoSessionMonitor({
  project: 'default-project',     // Default project name
  apiUrl: 'http://localhost:10000', // Mnemo server URL
  recallEnabled: true,            // Enable recall features
  notifications: true             // Show notifications
});
```

---

## 🎮 Commands Reference

| Command | Description | Example |
|---------|-------------|---------|
| `startSession(project)` | Begin monitoring | `monitor.startSession('gulfwatch')` |
| `processMessage(msg)` | Process a message | `monitor.processMessage("Bug found")` |
| `quickRecall()` | Get session summary | `monitor.quickRecall()` |
| `recall(options)` | Detailed recall | `monitor.recall({timeframe:'week'})` |
| `search(query)` | Search memories | `monitor.search('vercel')` |
| `switchProject(p)` | Change project | `monitor.switchProject('moltguard')` |
| `endSession()` | Stop monitoring | `monitor.endSession()` |
| `getStats()` | Get session stats | `monitor.getStats()` |

---

## 📁 Session Persistence

Session state is saved to:
```
~/.openclaw/mnemo-session-state.json
```

This allows:
- Surviving OpenClaw restarts
- Remembering current project
- Restoring session context

---

## Integration with Smart Hook

Session Monitor uses the Smart Hook internally:

```
Session Monitor
      │
      ├─── Smart Hook (194 triggers)
      │      ├─── Scores message importance
      │      ├─── Detects project
      │      └─── Stores to Mnemo
      │
      └─── Session Tracking
             ├─── Buffers messages
             ├─── Tracks important stuff
             └─── Enables recall
```

---

## Benefits

✅ **Never Forget** - Everything important captured automatically  
✅ **Always Available** - Runs in parallel, no manual commands  
✅ **Smart Filtering** - Only important stuff (no casual chat)  
✅ **Instant Recall** - "What did we do?" answered instantly  
✅ **Project Aware** - Context switches tracked  
✅ **Persistent** - Survives restarts  

---

**Ready to use:** `mnemo-session-monitor.js` ⚔️
