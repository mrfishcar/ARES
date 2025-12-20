export const perfBudgets = {
  typingP95: 50,
  typingGoal: 30,
  scrollDroppedFrameBudget: 0.01, // <1%
  sidebarOpenP95: 250,
  dropdownOpenP95: 100,
  longTaskBudget: 50,
};

export type PerfStat = {
  p50: number;
  p95: number;
  p99: number;
};

export type PerfCheckResult = {
  label: string;
  stats: PerfStat;
  budget: number;
  pass: boolean;
};
