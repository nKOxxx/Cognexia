#!/usr/bin/env node
/**
 * CLAUDE.md ↔ Mnemocode Converter
 * 
 * Bridges centminmod's CLAUDE.md memory bank format with Mnemo's persistence system.
 * Allows Mnemo to read/write CLAUDE.md files while maintaining mnemocode efficiency.
 * 
 * Usage:
 *   ./claude-md-converter.js --to-mnemo <path/to/CLAUDE.md> > output.mnemo
 *   ./claude-md-converter.js --to-claude <path/to/memory.mnemo> > CLAUDE.md
 *   ./claude-md-converter.js --sync --claude-dir <dir> --mnemo-dir <dir>
 */

const fs = require('fs');
const path = require('path');

// Mnemocode version for compatibility
const MNEMOCODE_VERSION = '1.1';
const CONVERTER_VERSION = '1.0.0';

/**
 * Parse CLAUDE.md format into structured memory objects
 */
function parseClaudeMd(content, sourceFile) {
    const memories = [];
    const lines = content.split('\n');
    
    let currentSection = null;
    let currentContent = [];
    let sectionLevel = 0;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
        
        if (headerMatch) {
            // Save previous section if exists
            if (currentSection && currentContent.length > 0) {
                memories.push({
                    id: generateId(),
                    type: inferType(currentSection, currentContent),
                    source: sourceFile,
                    title: currentSection,
                    content: currentContent.join('\n').trim(),
                    tags: extractTags(currentSection, currentContent),
                    priority: inferPriority(currentSection),
                    createdAt: new Date().toISOString(),
                    format: 'claude-md'
                });
            }
            
            // Start new section
            sectionLevel = headerMatch[1].length;
            currentSection = headerMatch[2].trim();
            currentContent = [];
        } else if (currentSection) {
            currentContent.push(line);
        }
    }
    
    // Don't forget last section
    if (currentSection && currentContent.length > 0) {
        memories.push({
            id: generateId(),
            type: inferType(currentSection, currentContent),
            source: sourceFile,
            title: currentSection,
            content: currentContent.join('\n').trim(),
            tags: extractTags(currentSection, currentContent),
            priority: inferPriority(currentSection),
            createdAt: new Date().toISOString(),
            format: 'claude-md'
        });
    }
    
    return memories;
}

/**
 * Convert memories to Mnemocode format
 */
function toMnemocode(memories, options = {}) {
    const chunks = [];
    
    // Header
    chunks.push(`## MNEMOCODE v${MNEMOCODE_VERSION}`);
    chunks.push(`## Source: CLAUDE.md Converter v${CONVERTER_VERSION}`);
    chunks.push(`## Converted: ${new Date().toISOString()}`);
    chunks.push('## Format: claude-md-bridge');
    chunks.push('');
    
    // Session metadata
    chunks.push('---');
    chunks.push(`session_id: ${options.sessionId || generateId()}`);
    chunks.push(`project: ${options.project || 'claude-md-import'}`);
    chunks.push(`source_format: claude-md`);
    chunks.push(`memory_count: ${memories.length}`);
    chunks.push('---');
    chunks.push('');
    
    // Memory chunks
    for (const memory of memories) {
        chunks.push(`◊MNEMO◊`);
        chunks.push(`ID:${memory.id}`);
        chunks.push(`TYPE:${memory.type}`);
        chunks.push(`SRC:${memory.source}`);
        chunks.push(`TITLE:${escapeMnemo(memory.title)}`);
        chunks.push(`TAGS:${memory.tags.join(',')}`);
        chunks.push(`PRIORITY:${memory.priority}`);
        chunks.push(`CREATED:${memory.createdAt}`);
        chunks.push(`◊BEGIN◊`);
        chunks.push(escapeMnemo(memory.content));
        chunks.push(`◊END◊`);
        chunks.push('');
    }
    
    return chunks.join('\n');
}

/**
 * Parse Mnemocode back to structured memories
 */
function parseMnemocode(content) {
    const memories = [];
    const lines = content.split('\n');
    
    let inChunk = false;
    let currentMemory = null;
    let contentBuffer = [];
    
    for (const line of lines) {
        if (line === '◊MNEMO◊') {
            // Save previous if exists
            if (currentMemory && contentBuffer.length > 0) {
                currentMemory.content = unescapeMnemo(contentBuffer.join('\n'));
                memories.push(currentMemory);
            }
            
            inChunk = true;
            currentMemory = {};
            contentBuffer = [];
        } else if (line === '◊BEGIN◊') {
            // Start content section
            continue;
        } else if (line === '◊END◊') {
            // End of memory
            if (currentMemory) {
                currentMemory.content = unescapeMnemo(contentBuffer.join('\n'));
                memories.push(currentMemory);
                currentMemory = null;
                contentBuffer = [];
                inChunk = false;
            }
        } else if (inChunk && currentMemory) {
            // Parse metadata lines
            if (line.startsWith('ID:')) {
                currentMemory.id = line.substring(3);
            } else if (line.startsWith('TYPE:')) {
                currentMemory.type = line.substring(5);
            } else if (line.startsWith('SRC:')) {
                currentMemory.source = line.substring(4);
            } else if (line.startsWith('TITLE:')) {
                currentMemory.title = unescapeMnemo(line.substring(6));
            } else if (line.startsWith('TAGS:')) {
                currentMemory.tags = line.substring(5).split(',').filter(t => t);
            } else if (line.startsWith('PRIORITY:')) {
                currentMemory.priority = parseInt(line.substring(9)) || 5;
            } else if (line.startsWith('CREATED:')) {
                currentMemory.createdAt = line.substring(8);
            } else if (line.startsWith('◊') === false) {
                // Content line
                contentBuffer.push(line);
            }
        }
    }
    
    return memories;
}

/**
 * Convert memories to CLAUDE.md format
 */
function toClaudeMd(memories, options = {}) {
    const sections = [];
    
    // Header
    sections.push('# CLAUDE.md');
    sections.push('');
    sections.push('This file provides guidance to Claude Code when working with code in this repository.');
    sections.push('');
    sections.push('> 🔄 Auto-converted from Mnemocode');
    sections.push(`> 📅 Last sync: ${new Date().toISOString()}`);
    sections.push('');
    
    // Group by type
    const byType = groupBy(memories, 'type');
    
    for (const [type, typeMemories] of Object.entries(byType)) {
        sections.push(`## ${capitalize(type)}`);
        sections.push('');
        
        for (const memory of typeMemories.sort((a, b) => b.priority - a.priority)) {
            sections.push(`### ${memory.title}`);
            sections.push('');
            sections.push(memory.content);
            sections.push('');
            
            if (memory.tags.length > 0) {
                sections.push(`*Tags: ${memory.tags.join(', ')}*`);
                sections.push('');
            }
        }
    }
    
    return sections.join('\n');
}

/**
 * Bidirectional sync between CLAUDE.md directory and Mnemo storage
 */
async function syncDirectories(claudeDir, mnemoDir, options = {}) {
    console.error(`🔄 Syncing CLAUDE.md (${claudeDir}) ↔ Mnemo (${mnemoDir})`);
    
    const results = {
        imported: 0,
        exported: 0,
        skipped: 0,
        errors: []
    };
    
    // Ensure directories exist
    if (!fs.existsSync(claudeDir)) {
        fs.mkdirSync(claudeDir, { recursive: true });
    }
    if (!fs.existsSync(mnemoDir)) {
        fs.mkdirSync(mnemoDir, { recursive: true });
    }
    
    // Read all CLAUDE*.md files
    const claudeFiles = fs.readdirSync(claudeDir)
        .filter(f => f.match(/CLAUDE.*\.md$/i))
        .map(f => path.join(claudeDir, f));
    
    console.error(`📄 Found ${claudeFiles.length} CLAUDE.md files`);
    
    // Import from CLAUDE.md to Mnemo
    for (const file of claudeFiles) {
        try {
            const content = fs.readFileSync(file, 'utf8');
            const memories = parseClaudeMd(content, file);
            
            const mnemoFile = path.join(mnemoDir, `${path.basename(file, '.md')}.mnemo`);
            const mnemoContent = toMnemocode(memories, {
                project: options.project || 'claude-md-import',
                sessionId: generateId()
            });
            
            fs.writeFileSync(mnemoFile, mnemoContent);
            results.imported += memories.length;
            console.error(`  ✓ ${path.basename(file)} → ${memories.length} memories`);
        } catch (err) {
            results.errors.push({ file, error: err.message });
            console.error(`  ✗ ${path.basename(file)}: ${err.message}`);
        }
    }
    
    // Export from Mnemo back to CLAUDE.md (if bidirectional)
    if (options.bidirectional) {
        const mnemoFiles = fs.readdirSync(mnemoDir)
            .filter(f => f.endsWith('.mnemo'))
            .map(f => path.join(mnemoDir, f));
        
        for (const file of mnemoFiles) {
            try {
                const content = fs.readFileSync(file, 'utf8');
                const memories = parseMnemocode(content);
                
                const claudeFile = path.join(claudeDir, `${path.basename(file, '.mnemo')}.md`);
                const claudeContent = toClaudeMd(memories);
                
                fs.writeFileSync(claudeFile, claudeContent);
                results.exported += memories.length;
                console.error(`  ✓ ${path.basename(file)} → CLAUDE.md`);
            } catch (err) {
                results.errors.push({ file, error: err.message });
                console.error(`  ✗ ${path.basename(file)}: ${err.message}`);
            }
        }
    }
    
    console.error(`\n📊 Sync complete:`);
    console.error(`   Imported: ${results.imported} memories`);
    console.error(`   Exported: ${results.exported} memories`);
    console.error(`   Errors: ${results.errors.length}`);
    
    return results;
}

// Helper functions
function generateId() {
    return `mm_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

function inferType(title, content) {
    const text = (title + ' ' + content.join(' ')).toLowerCase();
    
    if (text.includes('error') || text.includes('bug') || text.includes('fix')) return 'error';
    if (text.includes('todo') || text.includes('task') || text.includes('action')) return 'task';
    if (text.includes('decision') || text.includes('chose') || text.includes('selected')) return 'decision';
    if (text.includes('architecture') || text.includes('design') || text.includes('pattern')) return 'architecture';
    if (text.includes('security') || text.includes('auth') || text.includes('encrypt')) return 'security';
    if (text.includes('api') || text.includes('endpoint') || text.includes('interface')) return 'api';
    return 'insight';
}

function extractTags(title, content) {
    const tags = [];
    const text = (title + ' ' + content.join(' ')).toLowerCase();
    
    const tagMap = {
        'claude': ['claude', 'anthropic'],
        'memory': ['memory', 'persistence', 'session'],
        'critical': ['critical', 'important', 'must'],
        'backend': ['server', 'api', 'database', 'backend'],
        'frontend': ['ui', 'react', 'component', 'frontend'],
        'security': ['security', 'auth', 'encrypt', 'key'],
        'performance': ['performance', 'speed', 'optimize', 'cache']
    };
    
    for (const [tag, keywords] of Object.entries(tagMap)) {
        if (keywords.some(kw => text.includes(kw))) {
            tags.push(tag);
        }
    }
    
    return tags;
}

function inferPriority(title) {
    const text = title.toLowerCase();
    if (text.includes('critical') || text.includes('urgent') || text.includes('must')) return 9;
    if (text.includes('important') || text.includes('should')) return 7;
    if (text.includes('todo') || text.includes('task')) return 5;
    return 3;
}

function escapeMnemo(text) {
    return text
        .replace(/◊/g, '\\u25CA')
        .replace(/\n/g, '\\n');
}

function unescapeMnemo(text) {
    return text
        .replace(/\\u25CA/g, '◊')
        .replace(/\\n/g, '\n');
}

function groupBy(arr, key) {
    return arr.reduce((acc, item) => {
        const val = item[key] || 'uncategorized';
        (acc[val] = acc[val] || []).push(item);
        return acc;
    }, {});
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// CLI
function main() {
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.length === 0) {
        console.log(`
CLAUDE.md ↔ Mnemocode Converter v${CONVERTER_VERSION}

Usage:
  --to-mnemo <file>       Convert CLAUDE.md to Mnemocode
  --to-claude <file>      Convert Mnemocode to CLAUDE.md
  --sync                  Bidirectional sync between directories
  --claude-dir <dir>      Source directory for CLAUDE.md files
  --mnemo-dir <dir>       Target directory for Mnemo files
  --project <name>        Project identifier
  --bidirectional         Enable two-way sync

Examples:
  # Convert single file
  ./claude-md-converter.js --to-mnemo CLAUDE.md > memories.mnemo
  
  # Sync entire directories
  ./claude-md-converter.js --sync --claude-dir ./memory-bank --mnemo-dir ./mnemo-store
`);
        process.exit(0);
    }
    
    const toMnemo = args.includes('--to-mnemo');
    const toClaude = args.includes('--to-claude');
    const sync = args.includes('--sync');
    
    if (toMnemo) {
        const fileIndex = args.indexOf('--to-mnemo') + 1;
        const file = args[fileIndex];
        
        if (!file || !fs.existsSync(file)) {
            console.error('Error: File not found');
            process.exit(1);
        }
        
        const content = fs.readFileSync(file, 'utf8');
        const memories = parseClaudeMd(content, file);
        const mnemo = toMnemocode(memories, { project: path.basename(file, '.md') });
        console.log(mnemo);
    }
    
    if (toClaude) {
        const fileIndex = args.indexOf('--to-claude') + 1;
        const file = args[fileIndex];
        
        if (!file || !fs.existsSync(file)) {
            console.error('Error: File not found');
            process.exit(1);
        }
        
        const content = fs.readFileSync(file, 'utf8');
        const memories = parseMnemocode(content);
        const claude = toClaudeMd(memories);
        console.log(claude);
    }
    
    if (sync) {
        const claudeDirIndex = args.indexOf('--claude-dir') + 1;
        const mnemoDirIndex = args.indexOf('--mnemo-dir') + 1;
        const projectIndex = args.indexOf('--project') + 1;
        
        const claudeDir = args[claudeDirIndex] || './memory-bank';
        const mnemoDir = args[mnemoDirIndex] || './mnemo-store';
        const project = args[projectIndex] || 'claude-md-bridge';
        const bidirectional = args.includes('--bidirectional');
        
        syncDirectories(claudeDir, mnemoDir, { project, bidirectional })
            .then(() => process.exit(0))
            .catch(err => {
                console.error('Sync failed:', err);
                process.exit(1);
            });
    }
}

if (require.main === module) {
    main();
}

// Export for use as module
module.exports = {
    parseClaudeMd,
    toMnemocode,
    parseMnemocode,
    toClaudeMd,
    syncDirectories
};
