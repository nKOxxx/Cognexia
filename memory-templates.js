/**
 * Memory Templates Module for Mnemo
 * 
 * Pre-built memory structures for common roles and use cases.
 * Helps users organize their memories from day one.
 */

const TEMPLATES = {
  // ============================================
  // ROLE-BASED TEMPLATES
  // ============================================
  
  'startup-founder': {
    name: 'Startup Founder',
    description: 'Track decisions, goals, milestones, and investor updates',
    categories: [
      {
        type: 'goal',
        title: 'Company Goals',
        description: 'High-level objectives and OKRs',
        prompts: [
          'What is the primary goal for this quarter?',
          'What metric are we trying to improve?',
          'What would success look like in 6 months?'
        ]
      },
      {
        type: 'decision',
        title: 'Key Decisions',
        description: 'Important choices made and their rationale',
        prompts: [
          'What decision was made?',
          'What were the alternatives considered?',
          'Why was this option chosen?'
        ]
      },
      {
        type: 'milestone',
        title: 'Milestones',
        description: 'Major achievements and releases',
        prompts: [
          'What was accomplished?',
          'What was the impact?',
          'Who contributed to this success?'
        ]
      },
      {
        type: 'insight',
        title: 'Customer Insights',
        description: 'Learnings from users and market',
        prompts: [
          'What did we learn from customers?',
          'What market trend is emerging?',
          'What feedback keeps coming up?'
        ]
      },
      {
        type: 'preference',
        title: 'Investor Preferences',
        description: 'Notes from investor meetings and requirements',
        prompts: [
          'What do investors want to see?',
          'What metrics matter most?',
          'What concerns were raised?'
        ]
      }
    ],
    sampleMemories: [
      {
        content: 'Goal: Reach $10K MRR by end of Q2',
        type: 'goal',
        importance: 10
      },
      {
        content: 'Decision: Pivot from B2C to B2B based on customer feedback',
        type: 'decision',
        importance: 9
      }
    ]
  },

  'software-developer': {
    name: 'Software Developer',
    description: 'Track technical decisions, architecture, bugs, and learnings',
    categories: [
      {
        type: 'decision',
        title: 'Architecture Decisions',
        description: 'Technical choices and ADRs',
        prompts: [
          'What technology was chosen?',
          'What alternatives were considered?',
          'What are the trade-offs?'
        ]
      },
      {
        type: 'error',
        title: 'Bugs & Issues',
        description: 'Problems encountered and solutions',
        prompts: [
          'What was the issue?',
          'How was it fixed?',
          'How can it be prevented in the future?'
        ]
      },
      {
        type: 'insight',
        title: 'Technical Learnings',
        description: 'New knowledge and best practices',
        prompts: [
          'What did you learn?',
          'What documentation was helpful?',
          'What would you do differently?'
        ]
      },
      {
        type: 'security',
        title: 'Security Notes',
        description: 'Security considerations and credentials',
        prompts: [
          'What security issue was found?',
          'What credentials need to be stored?',
          'What compliance requirements apply?'
        ]
      },
      {
        type: 'preference',
        title: 'Code Preferences',
        description: 'Style choices and team conventions',
        prompts: [
          'What naming convention should we use?',
          'What patterns are preferred?',
          'What should be avoided?'
        ]
      }
    ],
    sampleMemories: [
      {
        content: 'Decision: Use PostgreSQL instead of MongoDB for relational data',
        type: 'decision',
        importance: 8
      },
      {
        content: 'Bug: Race condition in async payment processing - fixed with mutex',
        type: 'error',
        importance: 7
      }
    ]
  },

  'investor': {
    name: 'Investor',
    description: 'Track portfolio companies, market insights, and deal flow',
    categories: [
      {
        type: 'insight',
        title: 'Market Insights',
        description: 'Trends and opportunities',
        prompts: [
          'What market trend did you notice?',
          'What sector is heating up?',
          'What are competitors doing?'
        ]
      },
      {
        type: 'decision',
        title: 'Investment Decisions',
        description: 'Why investments were made or passed',
        prompts: [
          'Why invest in this company?',
          'What are the risks?',
          'What is the exit strategy?'
        ]
      },
      {
        type: 'milestone',
        title: 'Portfolio Updates',
        description: 'Progress from portfolio companies',
        prompts: [
          'What milestone was reached?',
          'What challenges is the company facing?',
          'How can we help?'
        ]
      },
      {
        type: 'preference',
        title: 'Investment Criteria',
        description: 'What you look for in deals',
        prompts: [
          'What makes a good founder?',
          'What metrics matter?',
          'What sectors do you avoid?'
        ]
      },
      {
        type: 'goal',
        title: 'Fund Goals',
        description: 'Fund-level objectives',
        prompts: [
          'What is the deployment target?',
          'What IRR are we targeting?',
          'How many deals this quarter?'
        ]
      }
    ],
    sampleMemories: [
      {
        content: 'Insight: AI infrastructure plays are getting crowded, looking at application layer',
        type: 'insight',
        importance: 8
      }
    ]
  },

  'researcher': {
    name: 'Researcher',
    description: 'Track research findings, sources, and hypotheses',
    categories: [
      {
        type: 'insight',
        title: 'Findings',
        description: 'Research discoveries',
        prompts: [
          'What did you discover?',
          'What evidence supports this?',
          'What are the implications?'
        ]
      },
      {
        type: 'preference',
        title: 'Sources',
        description: 'Useful references and databases',
        prompts: [
          'What source was helpful?',
          'What database to use?',
          'What experts to consult?'
        ]
      },
      {
        type: 'goal',
        title: 'Research Goals',
        description: 'What you are trying to understand',
        prompts: [
          'What question are you answering?',
          'What hypothesis to test?',
          'What would disprove this?'
        ]
      },
      {
        type: 'decision',
        title: 'Methodology',
        description: 'Research methods and approaches',
        prompts: [
          'What method was chosen?',
          'Why this approach?',
          'What are the limitations?'
        ]
      }
    ],
    sampleMemories: []
  },

  'product-manager': {
    name: 'Product Manager',
    description: 'Track roadmap, user feedback, and feature decisions',
    categories: [
      {
        type: 'goal',
        title: 'Product Goals',
        description: 'Product objectives and roadmap',
        prompts: [
          'What is the product vision?',
          'What features are prioritized?',
          'What is the release timeline?'
        ]
      },
      {
        type: 'insight',
        title: 'User Feedback',
        description: 'Customer input and pain points',
        prompts: [
          'What are users asking for?',
          'What pain points came up?',
          'What delighted users?'
        ]
      },
      {
        type: 'decision',
        title: 'Feature Decisions',
        description: 'Why features were built or cut',
        prompts: [
          'Why build this feature?',
          'What was deprioritized?',
          'What is the expected impact?'
        ]
      },
      {
        type: 'milestone',
        title: 'Releases',
        description: 'Launch milestones',
        prompts: [
          'What shipped?',
          'What were the results?',
          'What to iterate on?'
        ]
      }
    ],
    sampleMemories: []
  },

  // ============================================
  // USE-CASE TEMPLATES
  // ============================================

  'project-management': {
    name: 'Project Management',
    description: 'Generic project tracking template',
    categories: [
      { type: 'goal', title: 'Project Goals', prompts: ['What is the objective?'] },
      { type: 'milestone', title: 'Milestones', prompts: ['What was completed?'] },
      { type: 'decision', title: 'Decisions', prompts: ['What was decided?'] },
      { type: 'error', title: 'Blockers', prompts: ['What is blocking progress?'] }
    ],
    sampleMemories: []
  },

  'learning-journal': {
    name: 'Learning Journal',
    description: 'Track what you learn over time',
    categories: [
      { type: 'insight', title: 'Key Learnings', prompts: ['What did you learn?'] },
      { type: 'preference', title: 'Resources', prompts: ['What helped you learn?'] },
      { type: 'goal', title: 'Learning Goals', prompts: ['What do you want to learn?'] }
    ],
    sampleMemories: []
  },

  'minimal': {
    name: 'Minimal',
    description: 'Simple setup with just insights and decisions',
    categories: [
      { type: 'insight', title: 'Notes', prompts: ['What should I remember?'] },
      { type: 'decision', title: 'Decisions', prompts: ['What did I decide?'] }
    ],
    sampleMemories: []
  }
};

/**
 * Get all available templates
 * @returns {Object}
 */
function getAllTemplates() {
  return Object.entries(TEMPLATES).map(([id, template]) => ({
    id,
    name: template.name,
    description: template.description,
    categoryCount: template.categories.length
  }));
}

/**
 * Get a specific template
 * @param {string} templateId
 * @returns {Object|null}
 */
function getTemplate(templateId) {
  return TEMPLATES[templateId] || null;
}

/**
 * Apply a template to a project
 * @param {string} templateId
 * @param {string} projectName
 * @returns {Object}
 */
function applyTemplate(templateId, projectName) {
  const template = TEMPLATES[templateId];
  if (!template) {
    throw new Error(`Template '${templateId}' not found`);
  }

  // Create memory entries from template
  const memories = template.sampleMemories.map(m => ({
    ...m,
    project: projectName,
    createdAt: new Date().toISOString(),
    metadata: {
      source: 'template',
      templateId,
      autoGenerated: true
    }
  }));

  return {
    templateId,
    projectName,
    template: {
      name: template.name,
      description: template.description,
      categories: template.categories
    },
    memoriesCreated: memories.length,
    memories
  };
}

/**
 * Get template suggestions based on content
 * @param {string} content
 * @returns {Array}
 */
function suggestTemplates(content) {
  const lowerContent = content.toLowerCase();
  const scores = {};

  // Simple keyword matching
  const keywords = {
    'startup-founder': ['startup', 'founder', 'investor', 'funding', 'mvp', 'pitch'],
    'software-developer': ['code', 'api', 'database', 'bug', 'deploy', 'git'],
    'investor': ['portfolio', 'deal', 'term sheet', 'due diligence', 'exit'],
    'product-manager': ['roadmap', 'feature', 'user story', 'sprint', 'backlog'],
    'researcher': ['study', 'paper', 'hypothesis', 'data', 'analysis'],
    'learning-journal': ['learn', 'course', 'book', 'tutorial', 'study']
  };

  for (const [templateId, words] of Object.entries(keywords)) {
    scores[templateId] = words.filter(w => lowerContent.includes(w)).length;
  }

  // Sort by score
  return Object.entries(scores)
    .filter(([_, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, score]) => ({
      id,
      name: TEMPLATES[id].name,
      score
    }));
}

module.exports = {
  TEMPLATES,
  getAllTemplates,
  getTemplate,
  applyTemplate,
  suggestTemplates
};
