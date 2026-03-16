#!/usr/bin/env node
/**
 * Cognexia Session Integration for OpenClaw
 * 
 * This script enables continuous session monitoring.
 * Run it to start monitoring, then use it to recall later.
 * 
 * Usage:
 *   ./cognexia-session.js start gulfwatch    # Start monitoring project
 *   ./cognexia-session.js recall             # What did we do?
 *   ./cognexia-session.js search "vercel"    # Search memories
 *   ./cognexia-session.js status             # Current session stats
 *   ./cognexia-session.js stop               # End session
 */

const CognexiaSessionMonitor = require('./cognexia-session-monitor');
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(require('os').homedir(), '.openclaw', 'cognexia-active-session.json');

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (e) {}
  return null;
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('Failed to save state:', e.message);
  }
}

function clearState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      fs.unlinkSync(STATE_FILE);
    }
  } catch (e) {}
}

async function startSession(project) {
  const monitor = new CognexiaSessionMonitor();
  await monitor.startSession(project);
  
  saveState({
    project: project,
    sessionId: monitor.sessionId,
    startedAt: Date.now(),
    pid: process.pid
  });
  
  console.log(`🟢 Session started: ${project}`);
  console.log(`Session ID: ${monitor.sessionId}`);
  
  // Keep process running for monitoring
  console.log('Press Ctrl+C to stop monitoring...');
  
  process.on('SIGINT', async () => {
    console.log('\n🛑 Stopping session...');
    await monitor.endSession();
    clearState();
    process.exit(0);
  });
  
  // Keep alive
  setInterval(() => {}, 1000);
}

async function recallSession() {
  const state = loadState();
  if (!state) {
    console.log('❌ No active session. Start one with: ./cognexia-session.js start <project>');
    return;
  }
  
  const monitor = new CognexiaSessionMonitor({ project: state.project });
  monitor.sessionId = state.sessionId;
  monitor.sessionStartTime = state.startedAt;
  
  const summary = await monitor.quickRecall();
  console.log('\n' + summary);
}

async function searchMemories(query) {
  const state = loadState();
  const project = state?.project || 'general';
  
  const monitor = new CognexiaSessionMonitor({ project });
  const results = await monitor.search(query, { days: 7, limit: 10 });
  
  console.log(`\n🔍 Search: "${query}"`);
  console.log(`Found: ${results.count} results\n`);
  
  results.results.forEach((m, i) => {
    console.log(`${i + 1}. [${m.content_type}] ${m.content.slice(0, 60)}...`);
  });
}

async function sessionStatus() {
  const state = loadState();
  if (!state) {
    console.log('❌ No active session');
    return;
  }
  
  const duration = Math.floor((Date.now() - state.startedAt) / 60000);
  const hours = Math.floor(duration / 60);
  const mins = duration % 60;
  
  console.log('\n📊 Session Status');
  console.log(`Project: ${state.project}`);
  console.log(`Session ID: ${state.sessionId.slice(0, 20)}...`);
  console.log(`Duration: ${hours}h ${mins}m`);
  console.log(`Started: ${new Date(state.startedAt).toLocaleString()}`);
}

async function stopSession() {
  const state = loadState();
  if (!state) {
    console.log('❌ No active session to stop');
    return;
  }
  
  console.log('🛑 Stopping session...');
  clearState();
  console.log('✅ Session ended');
}

// Main CLI
async function main() {
  const command = process.argv[2];
  const arg = process.argv[3];
  
  switch (command) {
    case 'start':
      if (!arg) {
        console.log('Usage: ./cognexia-session.js start <project-name>');
        process.exit(1);
      }
      await startSession(arg);
      break;
      
    case 'recall':
      await recallSession();
      process.exit(0);
      break;
      
    case 'search':
      if (!arg) {
        console.log('Usage: ./cognexia-session.js search <query>');
        process.exit(1);
      }
      await searchMemories(arg);
      process.exit(0);
      break;
      
    case 'status':
      await sessionStatus();
      process.exit(0);
      break;
      
    case 'stop':
      await stopSession();
      process.exit(0);
      break;
      
    default:
      console.log('Cognexia Session Monitor');
      console.log('');
      console.log('Commands:');
      console.log('  start <project>  - Start monitoring a project');
      console.log('  recall           - Show session summary (what did we do?)');
      console.log('  search <query>   - Search memories');
      console.log('  status           - Show current session status');
      console.log('  stop             - Stop current session');
      console.log('');
      console.log('Examples:');
      console.log('  ./cognexia-session.js start gulfwatch');
      console.log('  ./cognexia-session.js recall');
      console.log('  ./cognexia-session.js search "vercel"');
      process.exit(0);
  }
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
