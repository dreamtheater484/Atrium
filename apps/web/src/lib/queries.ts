import type {
  CreateElementInput,
  CreateRelationInput,
  CurrentUser,
  EditResponse,
  ElementDetail,
  ElementRow,
  ElementType,
  Page,
  SearchHit,
  SuggestedRelation,
  UpdateElementInput,
  WorkspaceInfo,
} from '@atrium/schema';
import { toast } from '@atrium/ui';
import { keepPreviousData, QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from './api';
import { useUi } from './store';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
    mutations: {
      onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong. Try again.'),
    },
  },
});

/** The scenario currently shown ("today" means no scenario). */
export function useScenario(): string | undefined {
  const s = useUi((u) => u.scenario);
  return s === 'today' ? undefined : s;
}

export function useWorkspace() {
  return useQuery({ queryKey: ['workspace'], queryFn: () => api<WorkspaceInfo>('/workspace'), staleTime: 10_000 });
}

export type Me = CurrentUser & { homeRole: string };

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/me'), staleTime: 60_000, retry: false });
}

export function useCounts() {
  const scenario = useScenario();
  return useQuery({
    queryKey: ['model', 'counts', scenario],
    queryFn: () => api<Record<string, number>>('/elements/counts', { query: { scenario } }),
  });
}

export interface ElementListParams {
  type?: ElementType;
  types?: ElementType[];
  q?: string;
  domainId?: string;
  parentId?: string;
  lifecycle?: string;
  health?: string;
  layer?: 'org' | 'reference' | 'all';
  pack?: string;
  gaps?: boolean;
  at?: string;
  sort?: string;
  dir?: 'asc' | 'desc';
  limit?: number;
}

export function useElements(params: ElementListParams, opts: { enabled?: boolean } = {}) {
  const scenario = useScenario();
  return useQuery({
    queryKey: ['model', 'elements', scenario, params],
    queryFn: () =>
      api<Page<ElementRow>>('/elements', {
        query: { ...params, types: params.types, scenario } as never,
      }),
    placeholderData: keepPreviousData,
    enabled: opts.enabled,
  });
}

export type ElementDetailWithSuggestions = ElementDetail & { suggestedRelations: SuggestedRelation[] };

export function useElement(id: string | null | undefined) {
  const scenario = useScenario();
  return useQuery({
    queryKey: ['model', 'element', id, scenario],
    queryFn: () => api<ElementDetailWithSuggestions>(`/elements/${id}`, { query: { scenario } }),
    enabled: !!id,
  });
}

export function useSearch(q: string, opts: { types?: ElementType[]; layer?: 'org' | 'reference' | 'all'; limit?: number } = {}) {
  const scenario = useScenario();
  return useQuery({
    queryKey: ['model', 'search', q, scenario, opts],
    queryFn: ({ signal }) =>
      api<SearchHit[]>('/search', { query: { q, scenario, types: opts.types, layer: opts.layer, limit: opts.limit }, signal }),
    enabled: q.trim().length > 0,
    placeholderData: keepPreviousData,
    staleTime: 5_000,
  });
}

function announce(mode: EditResponse['mode']) {
  if (mode === 'suggestion') {
    toast('Saved as a suggestion', {
      description: 'Others see it after review. Submit it from Changes when you are ready.',
      action: { label: 'Open changes', onClick: () => window.location.assign('/changes') },
    });
  }
}

export function useInvalidateModel() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['model'] });
    void qc.invalidateQueries({ queryKey: ['workspace'] });
    void qc.invalidateQueries({ queryKey: ['changesets'] });
  };
}

export function useUpdateElement() {
  const qc = useQueryClient();
  const scenario = useScenario();
  const invalidate = useInvalidateModel();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateElementInput }) =>
      api<EditResponse>(`/elements/${id}`, { method: 'PATCH', body: patch, query: { scenario } }),
    onMutate: async ({ id, patch }) => {
      // Optimistic: the field updates instantly; the server confirms in the background.
      const key = ['model', 'element', id, scenario];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ElementDetailWithSuggestions>(key);
      if (prev) {
        const { attributes, ...rest } = patch;
        const next = { ...prev, ...(rest as object), attributes: { ...prev.attributes } } as ElementDetailWithSuggestions;
        for (const [k, v] of Object.entries(attributes ?? {})) {
          if (v === null || v === '') delete next.attributes[k];
          else next.attributes[k] = v;
        }
        qc.setQueryData(key, next);
      }
      return { prev, key };
    },
    onError: (err, _vars, context) => {
      if (context?.prev) qc.setQueryData(context.key, context.prev);
      toast.error(err instanceof ApiError ? err.message : "Couldn't save that change.");
    },
    onSuccess: (res) => announce(res.mode),
    onSettled: () => invalidate(),
  });
}

export function useCreateElement() {
  const scenario = useScenario();
  const invalidate = useInvalidateModel();
  return useMutation({
    mutationFn: (input: CreateElementInput) => api<EditResponse>('/elements', { body: input, query: { scenario } }),
    onSuccess: (res) => {
      announce(res.mode);
      invalidate();
    },
  });
}

export function useDeleteElement() {
  const scenario = useScenario();
  const invalidate = useInvalidateModel();
  return useMutation({
    mutationFn: (id: string) => api<EditResponse>(`/elements/${id}`, { method: 'DELETE', query: { scenario } }),
    onSuccess: (res) => {
      announce(res.mode);
      invalidate();
    },
  });
}

export function useCreateRelation() {
  const scenario = useScenario();
  const invalidate = useInvalidateModel();
  return useMutation({
    mutationFn: (input: CreateRelationInput) => api<EditResponse>('/relations', { body: input, query: { scenario } }),
    onSuccess: (res) => {
      announce(res.mode);
      invalidate();
    },
  });
}

export function useDeleteRelation() {
  const scenario = useScenario();
  const invalidate = useInvalidateModel();
  return useMutation({
    mutationFn: (id: string) => api<EditResponse>(`/relations/${id}`, { method: 'DELETE', query: { scenario } }),
    onSuccess: (res) => {
      announce(res.mode);
      invalidate();
    },
  });
}
