import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuthHeaders } from "./demo-auth";
import { absoluteAppUrl } from "./app-url";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    credentials: "include",
    headers: { ...(await getAuthHeaders()), ...(opts?.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

/** Public shared fetch — no guest/Clerk headers required for view. */
async function publicFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    credentials: "include",
    headers: { ...(opts?.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type SmartRuleField = "genre" | "language" | "status" | "rating" | "yearFrom" | "yearTo";

export interface SmartRule {
  field: SmartRuleField;
  value: string;
}

export type CollectionVisibility = "private" | "public";

export interface CollectionSummary {
  id: number;
  name: string;
  movieCount: number;
  posters: (string | null)[];
  movieIds: number[];
  rules: SmartRule[] | null;
  visibility: CollectionVisibility;
  shareToken: string | null;
  createdAt: string;
}

export interface CollectionMovie {
  id: number;
  title: string;
  status: string;
  rating: string | null;
  posterPath: string | null;
  releaseYear: number | null;
  originalLanguage: string | null;
  genres: string[] | null;
  tmdbId: number | null;
  createdAt: string;
}

export interface SharedCollectionItem {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseYear: number | null;
  mediaType: string;
}

export interface SharedCollection {
  name: string;
  visibility: "public";
  itemCount: number;
  items: SharedCollectionItem[];
}

export interface SharedCopyResult {
  added: number;
  skipped: number;
  missing: number;
}

export function collectionSharePath(token: string): string {
  return `/c/${token}`;
}

export function collectionShareUrl(token: string): string {
  return absoluteAppUrl(collectionSharePath(token));
}

// ── Query keys ────────────────────────────────────────────────────────────────
export const collectionsKey = () => ["collections"] as const;
export const collectionMoviesKey = (id: number) => ["collections", id, "movies"] as const;
export const movieCollectionsKey = (movieId: number) => ["movies", movieId, "collections"] as const;
export const sharedCollectionKey = (token: string) => ["collections", "shared", token] as const;

// ── Hooks ─────────────────────────────────────────────────────────────────────
export function useCollections() {
  return useQuery<CollectionSummary[]>({
    queryKey: collectionsKey(),
    queryFn: () => apiFetch("/api/collections"),
    staleTime: 30_000,
  });
}

export function useCollectionMovies(id: number, enabled = true) {
  return useQuery<CollectionMovie[]>({
    queryKey: collectionMoviesKey(id),
    queryFn: () => apiFetch(`/api/collections/${id}/movies`),
    enabled: enabled && id > 0,
    staleTime: 30_000,
  });
}

export function useMovieCollections(movieId: number, enabled = true) {
  return useQuery<number[]>({
    queryKey: movieCollectionsKey(movieId),
    queryFn: () => apiFetch(`/api/movies/${movieId}/collections`),
    enabled: enabled && movieId > 0,
    staleTime: 30_000,
  });
}

export function useSharedCollection(token: string, enabled = true) {
  return useQuery<SharedCollection>({
    queryKey: sharedCollectionKey(token),
    queryFn: () => publicFetch(`/api/collections/shared/${encodeURIComponent(token)}`),
    enabled: enabled && !!token,
    staleTime: 30_000,
    retry: false,
  });
}

export function useCreateCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      name,
      rules,
      visibility,
    }: {
      name: string;
      rules?: SmartRule[] | null;
      visibility?: CollectionVisibility;
    }) =>
      apiFetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, rules: rules ?? null, visibility: visibility ?? "private" }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: collectionsKey() }),
  });
}

export function useUpdateCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      name,
      rules,
      visibility,
    }: {
      id: number;
      name: string;
      rules?: SmartRule[] | null;
      visibility?: CollectionVisibility;
    }) =>
      apiFetch(`/api/collections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, rules, visibility }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: collectionsKey() }),
  });
}

export function useRenameCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      apiFetch(`/api/collections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: collectionsKey() }),
  });
}

export function useDeleteCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch(`/api/collections/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: collectionsKey() }),
  });
}

export function useAddToCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ collectionId, movieId }: { collectionId: number; movieId: number }) =>
      apiFetch(`/api/collections/${collectionId}/movies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movieId }),
      }),
    onSuccess: (_data, { collectionId, movieId }) => {
      qc.invalidateQueries({ queryKey: collectionsKey() });
      qc.invalidateQueries({ queryKey: collectionMoviesKey(collectionId) });
      qc.invalidateQueries({ queryKey: movieCollectionsKey(movieId) });
    },
  });
}

export function useRemoveFromCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ collectionId, movieId }: { collectionId: number; movieId: number }) =>
      apiFetch(`/api/collections/${collectionId}/movies/${movieId}`, { method: "DELETE" }),
    onSuccess: (_data, { collectionId, movieId }) => {
      qc.invalidateQueries({ queryKey: collectionsKey() });
      qc.invalidateQueries({ queryKey: collectionMoviesKey(collectionId) });
      qc.invalidateQueries({ queryKey: movieCollectionsKey(movieId) });
    },
  });
}

export function useCopySharedCollection(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { tmdbIds?: number[]; all?: boolean }) =>
      apiFetch(`/api/collections/shared/${encodeURIComponent(token)}/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }) as Promise<SharedCopyResult>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["movies"] });
      qc.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });
}
