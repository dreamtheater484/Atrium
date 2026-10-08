import type { ElementSummary, ElementType, Health } from '@atrium/schema';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useScenario } from './queries';
import { useUi } from './store';

export interface Overview {
  generatedAt: string;
  at: string;
  counts: Partial<Record<ElementType, number>>;
  applications: {
    total: number;
    cost: number;
    health: Record<Health | 'unknown', number>;
    byLifecycle: Record<string, number>;
    byTime: Record<string, number>;
    byHosting: Record<string, number>;
    byDomain: Array<{ id: string | null; name: string; count: number; cost: number; act: number }>;
    fitScatter: Array<{ id: string; name: string; business: number; technical: number; cost: number; time: string | null }>;
  };
  quality: {
    average: number;
    complete: number;
    total: number;
    gaps: Array<ElementSummary & { quality: number; missing: string[]; domainName: string | null }>;
  };
  risks: Array<ElementSummary & { reasons: string[]; domainName: string | null; cost: number }>;
  eol: Array<{ id: string; name: string; eolDate: string; past: boolean; apps: Array<{ id: string; name: string }> }>;
  initiatives: Array<{ id: string; name: string; status: string | null; start: string | null; end: string | null; progress: number | null; budget: number | null; impacts: number }>;
  capabilities: {
    total: number;
    withoutApps: Array<{ id: string; name: string }>;
    overlaps: Array<{ id: string; name: string; apps: string[] }>;
    costByCapability: Array<{ id: string; name: string; cost: number; health: Health | null }>;
  };
  technology: { total: number; byRadar: Record<string, number> };
  myServices: Array<ElementSummary & { domainName: string | null; dependsOn: number; usedBy: number; reasons: string[]; standards: number }>;
}

export function useOverview() {
  const scenario = useScenario();
  const at = useUi((s) => s.at) ?? undefined;
  return useQuery({
    queryKey: ['model', 'overview', scenario, at],
    queryFn: () => api<Overview>('/stats/overview', { query: { scenario, at } }),
  });
}
