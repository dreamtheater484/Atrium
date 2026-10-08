import type { Changeset, ChangesetDetail } from '@atrium/schema';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from './api';
import { queryClient, useInvalidateModel } from './queries';

export interface ChangesSummary {
  waitingForReview: number;
  myDraftChanges: number;
  myDraftId: string | null;
  myOpen: number;
}

export function useChangesSummary() {
  return useQuery({
    queryKey: ['changesets', 'summary'],
    queryFn: () => api<ChangesSummary>('/changesets/summary'),
    refetchInterval: 60_000,
  });
}

export function useChangesets(filter: { status?: string; kind?: string; scenarioId?: string; mine?: boolean; limit?: number }) {
  return useQuery({
    queryKey: ['changesets', 'list', filter],
    queryFn: () => api<Changeset[]>('/changesets', { query: filter as never }),
  });
}

export function useChangeset(id: string | undefined) {
  return useQuery({
    queryKey: ['changesets', 'detail', id],
    queryFn: () => api<ChangesetDetail>(`/changesets/${id}`),
    enabled: !!id,
  });
}

export function useChangesetAction() {
  const invalidate = useInvalidateModel();
  return useMutation({
    mutationFn: ({ id, action, note, title, description }: { id: string; action: 'submit' | 'approve' | 'reject' | 'withdraw' | 'undo'; note?: string; title?: string; description?: string }) =>
      api<{ ok: boolean; message?: string }>(`/changesets/${id}/${action}`, { body: { note, title, description } }),
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['changesets'] });
    },
  });
}
