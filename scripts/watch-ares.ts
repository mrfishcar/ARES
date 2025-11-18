#!/usr/bin/env ts-node
/**
 * ARES AI Collaboration Watcher
 *
 * Automatically orchestrates handoffs between Claude and Codex
 * by watching docs/AI_HANDOFF.md for changes.
 */

import * as fs from 'fs';
import * as path from 'path';
import chokidar from 'chokidar';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface WatcherState {
  running: boolean;
  paused: boolean;
  iteration: number;
  maxIterations: number;
  lastUpdate: Date;
  timeoutMinutes: number;
}

class AresWatcher {
  private state: WatcherState = {
    running: false,
    paused: false,
    iteration: 0,
    maxIterations: 50,  // Safety limit
    lastUpdate: new Date(),
    timeoutMinutes: 30  // Auto-pause if stuck
  };

  private watcher: any;
  private readonly repoRoot = '/Users/corygilford/ares';
  private readonly handoffFile = path.join(this.repoRoot, 'docs/AI_HANDOFF.md');
  private readonly claudeTaskFile = '/tmp/claude_task.md';
  private readonly codexTaskFile = '/tmp/codex_task.md';
  private stuckCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.ensureHandoffFileExists();
  }

  private ensureHandoffFileExists() {
    if (!fs.existsSync(this.handoffFile)) {
      const template = `# AI Handoff Document

**Status**: WAITING_FOR_CLAUDE
**Updated**: ${new Date().toISOString()}
**Iteration**: 0

## Current Task
Waiting for initial task assignment

## Context
System initialized and ready for collaboration

## Instructions for Claude
Review the current state and provide next steps

## Instructions for Codex
Awaiting instructions from Claude

## NEXT: Claude
`;
      fs.writeFileSync(this.handoffFile, template);
      console.log('✅ Created AI_HANDOFF.md template');
    }
  }

  start() {
    console.clear();
    this.printBanner();
    console.log('▶️  Starting ARES Watcher...\n');

    this.state.running = true;
    this.state.paused = false;

    // Watch for changes to handoff document
    this.watcher = chokidar.watch(this.handoffFile, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 100
      }
    });

    this.watcher.on('change', () => {
      if (this.state.paused || !this.state.running) {
        console.log('⏸  Watcher paused, ignoring change');
        return;
      }

      this.handleHandoff();
    });

    this.watcher.on('error', (error: Error) => {
      console.error('❌ Watcher error:', error.message);
    });

    // Stuck detection
    this.stuckCheckInterval = setInterval(() => this.checkForStuck(), 60000);

    console.log(`📁 Watching: ${this.handoffFile}`);
    console.log(`🔄 Max iterations: ${this.state.maxIterations}`);
    console.log(`⏱️  Timeout: ${this.state.timeoutMinutes} minutes\n`);

    this.printControls();
    this.startControlListener();

    // Check current state immediately
    this.handleHandoff();
  }

  private printBanner() {
    console.log('╔════════════════════════════════════════════╗');
    console.log('║   🤖 ARES AI Collaboration Watcher 🤖    ║');
    console.log('║   Automated Claude ↔ Codex Handoffs      ║');
    console.log('╚════════════════════════════════════════════╝\n');
  }

  private printControls() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Commands:');
    console.log('  [p] pause   - Pause watcher');
    console.log('  [r] resume  - Resume watcher');
    console.log('  [s] status  - Show status');
    console.log('  [k] KILL    - 🛑 Emergency stop');
    console.log('  [q] quit    - Exit gracefully');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }

  private startControlListener() {
    const readline = require('readline');
    readline.emitKeypressEvents(process.stdin);

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    process.stdin.on('keypress', (str, key) => {
      if (key.ctrl && key.name === 'c') {
        this.kill();
        return;
      }

      switch (key.name) {
        case 'p':
          this.pause();
          break;
        case 'r':
          this.resume();
          break;
        case 's':
          this.printStatus();
          break;
        case 'k':
          this.kill();
          break;
        case 'q':
          this.quit();
          break;
      }
    });
  }

  pause() {
    if (this.state.paused) {
      console.log('⏸  Already paused');
      return;
    }
    console.log('\n⏸  PAUSING watcher...');
    this.state.paused = true;
    console.log('✅ Watcher paused. Press [r] to resume.\n');
  }

  resume() {
    if (!this.state.paused) {
      console.log('▶️  Already running');
      return;
    }
    console.log('\n▶️  RESUMING watcher...');
    this.state.paused = false;
    console.log('✅ Watcher resumed.\n');

    // Check for any pending changes
    this.handleHandoff();
  }

  kill() {
    console.log('\n\n🛑 KILL SWITCH ACTIVATED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Stopping all operations...');

    this.state.running = false;

    if (this.watcher) {
      this.watcher.close();
    }

    if (this.stuckCheckInterval) {
      clearInterval(this.stuckCheckInterval);
    }

    console.log('✅ Watcher stopped');
    console.log('✅ All intervals cleared');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    process.exit(0);
  }

  quit() {
    console.log('\n👋 Shutting down gracefully...');

    if (this.watcher) {
      this.watcher.close();
    }

    if (this.stuckCheckInterval) {
      clearInterval(this.stuckCheckInterval);
    }

    console.log('✅ Goodbye!\n');
    process.exit(0);
  }

  private printStatus() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 WATCHER STATUS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Running: ${this.state.running ? '✅ Yes' : '❌ No'}`);
    console.log(`Paused: ${this.state.paused ? '⏸  Yes' : '▶️  No'}`);
    console.log(`Iteration: ${this.state.iteration}/${this.state.maxIterations}`);
    console.log(`Last Update: ${this.state.lastUpdate.toLocaleTimeString()}`);

    const minutesSince = (Date.now() - this.state.lastUpdate.getTime()) / 60000;
    console.log(`Time Since Last: ${minutesSince.toFixed(1)} minutes`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }

  private async handleHandoff() {
    try {
      // Safety checks
      if (this.state.iteration >= this.state.maxIterations) {
        console.log('\n⚠️  MAX ITERATIONS REACHED');
        console.log(`   Completed ${this.state.maxIterations} iterations`);
        console.log('   Auto-pausing for safety');
        this.pause();
        return;
      }

      // Read handoff document
      if (!fs.existsSync(this.handoffFile)) {
        console.log('⚠️  Handoff file not found, skipping');
        return;
      }

      const content = fs.readFileSync(this.handoffFile, 'utf-8');
      const next = this.parseNext(content);

      if (!next.target) {
        console.log('⚠️  No NEXT target found in handoff document');
        return;
      }

      this.state.iteration++;
      this.state.lastUpdate = new Date();

      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`📋 Iteration ${this.state.iteration}: Handing to ${next.target}`);
      console.log(`⏰ ${new Date().toLocaleTimeString()}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      if (next.target === 'Claude') {
        await this.triggerClaude(next.instructions, content);
      } else if (next.target === 'Codex') {
        await this.triggerCodex(next.instructions, content);
      }

      console.log('✅ Handoff complete\n');

    } catch (error: any) {
      console.error('❌ Error during handoff:', error.message);
    }
  }

  private parseNext(content: string): { target: string; instructions: string } {
    // Parse "NEXT: Claude" or "NEXT: Codex"
    const match = content.match(/##\s*NEXT:\s*(Claude|Codex)/i);
    const target = match ? match[1] : '';

    if (!target) {
      return { target: '', instructions: '' };
    }

    // Extract instructions section
    const instructions = this.extractInstructions(content, target);

    return { target, instructions };
  }

  private extractInstructions(content: string, target: string): string {
    // Extract the relevant instructions section
    const sectionRegex = new RegExp(
      `## Instructions for ${target}\\s*([\\s\\S]*?)(?=## |$)`,
      'i'
    );
    const match = content.match(sectionRegex);
    return match ? match[1].trim() : '';
  }

  private async triggerClaude(instructions: string, fullContent: string) {
    const task = `# Task from AI Handoff System

**Iteration**: ${this.state.iteration}
**Time**: ${new Date().toLocaleString()}

## Instructions
${instructions}

## Full Context
${fullContent}

---
**Action Required**:
1. Complete the task above
2. Update docs/AI_HANDOFF.md with results
3. Set "NEXT: Codex" if handing back, or "NEXT: Claude" if more work needed
`;

    fs.writeFileSync(this.claudeTaskFile, task);
    console.log(`📝 Task file created: ${this.claudeTaskFile}`);
    console.log('🔔 Instructions written for Claude Code to pick up');

    // Optionally trigger Claude Code if API is available
    // For now, Claude Code would need to watch /tmp/claude_task.md
  }

  private async triggerCodex(instructions: string, fullContent: string) {
    const task = `# Task from AI Handoff System

**Iteration**: ${this.state.iteration}
**Time**: ${new Date().toLocaleString()}

## Instructions
${instructions}

## Full Context
${fullContent}

---
**Action Required**:
1. Complete the task above
2. Update docs/AI_HANDOFF.md with results
3. Set "NEXT: Claude" if handing back, or "NEXT: Codex" if more work needed
`;

    fs.writeFileSync(this.codexTaskFile, task);
    console.log(`📝 Task file created: ${this.codexTaskFile}`);
    console.log('🔔 Instructions written for Codex to pick up');
  }

  private checkForStuck() {
    const minutesSinceUpdate =
      (Date.now() - this.state.lastUpdate.getTime()) / 60000;

    if (minutesSinceUpdate > this.state.timeoutMinutes && !this.state.paused) {
      console.log('\n⚠️  TIMEOUT DETECTED');
      console.log(`   No updates for ${this.state.timeoutMinutes} minutes`);
      console.log('   Auto-pausing for safety\n');
      this.pause();
    }
  }
}

// Main execution
if (require.main === module) {
  const watcher = new AresWatcher();
  watcher.start();

  // Handle process termination
  process.on('SIGINT', () => {
    watcher.kill();
  });

  process.on('SIGTERM', () => {
    watcher.kill();
  });
}

export default AresWatcher;
