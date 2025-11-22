#!/usr/bin/env ts-node
/**
 * Codex Bridge - Automated Claude ↔ Codex Coordination
 *
 * Purpose: Offload mechanical debugging/testing work to Codex (ChatGPT),
 * while Claude handles architecture and analysis
 *
 * Usage:
 *   1. Set OPENAI_API_KEY environment variable
 *   2. Run: npx ts-node scripts/codex-bridge.ts
 *   3. Claude delegates tasks via this script
 *   4. Script sends to Codex, returns results to Claude
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ============================================
// Configuration
// ============================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.CODEX_MODEL || 'gpt-4o'; // or 'gpt-3.5-turbo' for cheaper
const PROJECT_ROOT = path.resolve(__dirname, '..');
const LOG_FILE = path.join(PROJECT_ROOT, 'tmp', 'codex-bridge.log');
const CONTEXT_FILE = path.join(PROJECT_ROOT, 'tmp', 'codex-context.json');

// Ensure tmp directory exists
if (!fs.existsSync(path.join(PROJECT_ROOT, 'tmp'))) {
  fs.mkdirSync(path.join(PROJECT_ROOT, 'tmp'));
}

// ============================================
// Types
// ============================================

interface CodexTask {
  id: string;
  type: 'debug' | 'test' | 'log' | 'investigate';
  description: string;
  files?: string[];
  commands?: string[];
  context?: string;
  priority?: 'low' | 'medium' | 'high';
}

interface CodexResponse {
  taskId: string;
  findings: string;
  logs?: string;
  hypothesis?: string;
  questionsForClaude?: string[];
  commandsRun?: string[];
  filesModified?: string[];
}

interface ConversationContext {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  lastUpdate: string;
}

// ============================================
// Logging
// ============================================

function log(message: string) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, logLine);
  console.log(logLine.trim());
}

// ============================================
// Context Management
// ============================================

function loadContext(): ConversationContext {
  if (!fs.existsSync(CONTEXT_FILE)) {
    const initialContext: ConversationContext = {
      messages: [
        {
          role: 'system',
          content: `You are Codex, a debugging assistant for the ARES project (Advanced Relation Extraction System).

Your role:
- Execute mechanical debugging tasks given by Claude (Anthropic AI)
- Run tests, add logging, investigate issues
- Report findings clearly and concisely
- Ask Claude for guidance on complex decisions

Your capabilities:
- Run bash commands in the ARES project directory
- Read and modify TypeScript/JavaScript files
- Execute tests and analyze output
- Add debug logging
- Report observations and hypotheses

Important:
- You work under Claude's supervision
- Focus on mechanical tasks: testing, logging, observation
- Report findings without making architectural changes
- Ask Claude before major modifications
- Be thorough and systematic

Project structure:
- /app/engine - Core extraction engine
- /app/api - GraphQL API
- /tests - Test suites
- Services on ports: 4000 (API), 8000 (Parser)

Current directory: ${PROJECT_ROOT}`
        }
      ],
      lastUpdate: new Date().toISOString()
    };
    saveContext(initialContext);
    return initialContext;
  }

  const data = fs.readFileSync(CONTEXT_FILE, 'utf-8');
  return JSON.parse(data);
}

function saveContext(context: ConversationContext) {
  context.lastUpdate = new Date().toISOString();
  fs.writeFileSync(CONTEXT_FILE, JSON.stringify(context, null, 2));
}

function resetContext() {
  if (fs.existsSync(CONTEXT_FILE)) {
    fs.unlinkSync(CONTEXT_FILE);
  }
  log('Context reset');
}

// ============================================
// OpenAI API Integration
// ============================================

async function callOpenAI(messages: Array<{ role: string; content: string }>): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable not set');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      temperature: 0.3, // Lower temperature for more focused debugging
      max_tokens: 4000
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${error}`);
  }

  const data = await response.json() as any;
  return data.choices[0].message.content;
}

// ============================================
// Task Execution
// ============================================

async function executeCommand(command: string): Promise<{ stdout: string; stderr: string }> {
  log(`Executing: ${command}`);
  try {
    const result = await execAsync(command, {
      cwd: PROJECT_ROOT,
      timeout: 60000, // 60 second timeout
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });
    return result;
  } catch (error: any) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || error.message || 'Command failed'
    };
  }
}

async function readProjectFile(filePath: string): Promise<string> {
  const fullPath = path.join(PROJECT_ROOT, filePath);
  if (!fs.existsSync(fullPath)) {
    return `[File not found: ${filePath}]`;
  }
  return fs.readFileSync(fullPath, 'utf-8');
}

// ============================================
// Main Task Delegation
// ============================================

async function delegateToCodex(task: CodexTask): Promise<CodexResponse> {
  log(`\n========================================`);
  log(`Delegating task to Codex: ${task.id}`);
  log(`Type: ${task.type}`);
  log(`Description: ${task.description}`);
  log(`========================================\n`);

  // Load conversation context
  const context = loadContext();

  // Build task message
  let taskMessage = `Task ID: ${task.id}\nType: ${task.type}\n\n${task.description}\n\n`;

  if (task.files && task.files.length > 0) {
    taskMessage += `Files to examine:\n`;
    for (const file of task.files) {
      taskMessage += `- ${file}\n`;
      const content = await readProjectFile(file);
      taskMessage += `\n<file path="${file}">\n${content}\n</file>\n\n`;
    }
  }

  if (task.commands && task.commands.length > 0) {
    taskMessage += `Commands to run:\n`;
    for (const cmd of task.commands) {
      taskMessage += `- ${cmd}\n`;
    }
    taskMessage += '\n';
  }

  if (task.context) {
    taskMessage += `Additional context:\n${task.context}\n\n`;
  }

  taskMessage += `Please execute this task systematically and report your findings in this format:

## Findings
[What you observed]

## Commands Run
[List of commands you executed]

## Output/Logs
[Relevant output from commands]

## Hypothesis
[What you think is happening]

## Questions for Claude
[Any questions you have for architectural guidance]`;

  // Add to context
  context.messages.push({
    role: 'user',
    content: taskMessage
  });

  // Call OpenAI
  log('Sending task to Codex...');
  const response = await callOpenAI(context.messages);
  log('Received response from Codex');

  // Add response to context
  context.messages.push({
    role: 'assistant',
    content: response
  });

  // Save context
  saveContext(context);

  // Parse response
  const codexResponse: CodexResponse = {
    taskId: task.id,
    findings: response,
    questionsForClaude: extractQuestions(response)
  };

  log(`\n========================================`);
  log(`Codex completed task: ${task.id}`);
  log(`========================================\n`);

  return codexResponse;
}

function extractQuestions(response: string): string[] {
  const questions: string[] = [];
  const questionSection = response.match(/## Questions for Claude\n([\s\S]*?)(?=\n##|$)/);
  if (questionSection) {
    const lines = questionSection[1].split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
        questions.push(trimmed.substring(1).trim());
      }
    }
  }
  return questions;
}

// ============================================
// CLI Interface
// ============================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log(`
Codex Bridge - Automated Claude ↔ Codex Coordination

Usage:
  npx ts-node scripts/codex-bridge.ts <command> [options]

Commands:
  task <description>       - Delegate a task to Codex
  debug <file> <issue>     - Debug a specific file/issue
  test <test-file>         - Run and analyze a test
  log <file> <location>    - Add logging to a file
  status                   - Check bridge status
  reset                    - Reset conversation context
  interactive              - Start interactive session

Examples:
  # Delegate a debugging task
  npx ts-node scripts/codex-bridge.ts task "Add logging to APPOS filter in entities.ts"

  # Debug a specific issue
  npx ts-node scripts/codex-bridge.ts debug "app/engine/extract/entities.ts" "Empty subject IDs in relations"

  # Run a test
  npx ts-node scripts/codex-bridge.ts test "test-meaning-layer.ts"

  # Interactive mode
  npx ts-node scripts/codex-bridge.ts interactive

Environment Variables:
  OPENAI_API_KEY - Your OpenAI API key (required)
  CODEX_MODEL    - Model to use (default: gpt-4o)
`);
    return;
  }

  try {
    switch (command) {
      case 'task': {
        const description = args.slice(1).join(' ');
        if (!description) {
          console.error('Error: Task description required');
          return;
        }

        const task: CodexTask = {
          id: `task_${Date.now()}`,
          type: 'investigate',
          description
        };

        const response = await delegateToCodex(task);
        console.log('\n=== CODEX RESPONSE ===\n');
        console.log(response.findings);
        console.log('\n=== END RESPONSE ===\n');
        break;
      }

      case 'debug': {
        const file = args[1];
        const issue = args.slice(2).join(' ');

        if (!file || !issue) {
          console.error('Error: File and issue description required');
          return;
        }

        const task: CodexTask = {
          id: `debug_${Date.now()}`,
          type: 'debug',
          description: `Debug this issue: ${issue}`,
          files: [file]
        };

        const response = await delegateToCodex(task);
        console.log('\n=== CODEX RESPONSE ===\n');
        console.log(response.findings);
        console.log('\n=== END RESPONSE ===\n');
        break;
      }

      case 'test': {
        const testFile = args[1];
        if (!testFile) {
          console.error('Error: Test file required');
          return;
        }

        const task: CodexTask = {
          id: `test_${Date.now()}`,
          type: 'test',
          description: `Run the test file and analyze any failures`,
          commands: [
            `npx tsc`,
            `npx ts-node ${testFile}`
          ]
        };

        const response = await delegateToCodex(task);
        console.log('\n=== CODEX RESPONSE ===\n');
        console.log(response.findings);
        console.log('\n=== END RESPONSE ===\n');
        break;
      }

      case 'log': {
        const file = args[1];
        const location = args.slice(2).join(' ');

        if (!file || !location) {
          console.error('Error: File and location required');
          return;
        }

        const task: CodexTask = {
          id: `log_${Date.now()}`,
          type: 'log',
          description: `Add debug logging at: ${location}`,
          files: [file]
        };

        const response = await delegateToCodex(task);
        console.log('\n=== CODEX RESPONSE ===\n');
        console.log(response.findings);
        console.log('\n=== END RESPONSE ===\n');
        break;
      }

      case 'status': {
        const context = loadContext();
        console.log(`\nCodex Bridge Status:`);
        console.log(`- Model: ${OPENAI_MODEL}`);
        console.log(`- Conversation messages: ${context.messages.length}`);
        console.log(`- Last update: ${context.lastUpdate}`);
        console.log(`- Log file: ${LOG_FILE}`);
        console.log(`- API Key: ${OPENAI_API_KEY ? 'Set' : 'NOT SET'}`);
        break;
      }

      case 'reset': {
        resetContext();
        console.log('Conversation context reset');
        break;
      }

      case 'interactive': {
        console.log('Interactive mode not yet implemented');
        console.log('Use individual commands for now');
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        console.log('Run without arguments to see usage');
    }
  } catch (error) {
    console.error('Error:', error);
    log(`Error: ${error}`);
    process.exit(1);
  }
}

// ============================================
// Entry Point
// ============================================

if (require.main === module) {
  main();
}

export { delegateToCodex, CodexTask, CodexResponse };
