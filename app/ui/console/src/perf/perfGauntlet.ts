import { perfBudgets } from './perfBudgets';
import {
  computeStats,
  measureInteraction,
  observeLongTasks,
  reportResults,
  sampleFPS,
} from './perfMetrics';

type GauntletResult = {
  typing: number[];
  backspace: number[];
  sidebarOpen: number[];
  dropdownOpen: number[];
  scrollFrames: { frames: number; expected: number } | null;
};

const LARGE_FIXTURE = Array.from({ length: 2000 })
  .map((_, i) => `Entity-${i}: Lorem ipsum dolor sit amet, consectetur adipiscing elit.`)
  .join('\n');

async function measureTyping(target: HTMLTextAreaElement, chars: number): Promise<number[]> {
  const samples: number[] = [];
  for (let i = 0; i < chars; i++) {
    const latency = await measureInteraction('keystroke', () => {
      target.value += 'a';
    });
    samples.push(latency);
  }
  return samples;
}

async function measureBackspace(target: HTMLTextAreaElement, durationMs: number): Promise<number[]> {
  const samples: number[] = [];
  const endAt = performance.now() + durationMs;
  while (performance.now() < endAt) {
    const latency = await measureInteraction('backspace', () => {
      target.value = target.value.slice(0, -1);
    });
    samples.push(latency);
  }
  return samples;
}

async function measureOpenClose(element: HTMLElement, iterations: number): Promise<number[]> {
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const latency = await measureInteraction('open', () => {
      element.style.display = 'block';
      element.getBoundingClientRect();
      element.dataset.open = '1';
    });
    samples.push(latency);

    const closeLatency = await measureInteraction('close', () => {
      element.style.display = 'none';
      element.dataset.open = '0';
    });
    samples.push(closeLatency);
  }
  return samples;
}

function buildFixture(): {
  textarea: HTMLTextAreaElement;
  sidebar: HTMLDivElement;
  dropdown: HTMLDivElement;
  cleanup: () => void;
} {
  const root = document.createElement('div');
  root.style.position = 'fixed';
  root.style.top = '-9999px';
  root.style.left = '-9999px';
  root.style.width = '600px';
  root.style.height = '600px';
  root.style.pointerEvents = 'none';
  root.setAttribute('data-test', 'perf-gauntlet');

  const textarea = document.createElement('textarea');
  textarea.style.width = '100%';
  textarea.style.height = '200px';
  textarea.value = LARGE_FIXTURE;

  const sidebar = document.createElement('div');
  sidebar.style.display = 'none';
  sidebar.style.width = '320px';
  sidebar.style.height = '480px';
  sidebar.style.overflow = 'auto';
  sidebar.textContent = LARGE_FIXTURE;

  const dropdown = document.createElement('div');
  dropdown.style.display = 'none';
  dropdown.style.width = '220px';
  dropdown.style.height = '320px';
  dropdown.style.overflow = 'auto';
  dropdown.textContent = LARGE_FIXTURE;

  root.appendChild(textarea);
  root.appendChild(sidebar);
  root.appendChild(dropdown);
  document.body.appendChild(root);

  return {
    textarea,
    sidebar,
    dropdown,
    cleanup: () => root.remove(),
  };
}

export async function runPerfGauntlet() {
  if (typeof window === 'undefined') {
    // eslint-disable-next-line no-console
    console.warn('[PerfGauntlet] Skipped: window not available');
    return;
  }

  // eslint-disable-next-line no-console
  console.info('[PerfGauntlet] Starting scripted interactions...');
  const longTaskSamples: { start: number; duration: number }[] = [];
  const disconnect = observeLongTasks('gauntlet', longTaskSamples);

  const { textarea, sidebar, dropdown, cleanup } = buildFixture();

  const results: GauntletResult = {
    typing: [],
    backspace: [],
    sidebarOpen: [],
    dropdownOpen: [],
    scrollFrames: null,
  };

  results.typing = await measureTyping(textarea, 200);
  results.backspace = await measureBackspace(textarea, 2000);
  results.scrollFrames = await sampleFPS(1500);
  results.sidebarOpen = await measureOpenClose(sidebar, 10);
  results.dropdownOpen = await measureOpenClose(dropdown, 10);

  cleanup();
  disconnect();

  const checkResults = [
    {
      label: 'Keystroke latency',
      stats: computeStats(results.typing),
      budget: perfBudgets.typingP95,
    },
    {
      label: 'Sidebar open/close',
      stats: computeStats(results.sidebarOpen),
      budget: perfBudgets.sidebarOpenP95,
    },
    {
      label: 'Dropdown open/close',
      stats: computeStats(results.dropdownOpen),
      budget: perfBudgets.dropdownOpenP95,
    },
  ].map((entry) => ({
    label: entry.label,
    stats: entry.stats,
    budget: entry.budget,
    pass: entry.stats.p95 <= entry.budget,
  }));

  if (results.scrollFrames) {
    const dropRate = Math.max(0, 1 - results.scrollFrames.frames / results.scrollFrames.expected);
    const pass = dropRate <= perfBudgets.scrollDroppedFrameBudget;
    // eslint-disable-next-line no-console
    console.log(
      `[PerfGauntlet] Scroll FPS: frames=${results.scrollFrames.frames.toFixed(
        0
      )} expected=${results.scrollFrames.expected.toFixed(0)} dropRate=${(dropRate * 100).toFixed(
        2
      )}% -> ${pass ? 'PASS' : 'FAIL'}`
    );
  }

  reportResults(checkResults, longTaskSamples);
  return { checkResults, longTaskSamples };
}
