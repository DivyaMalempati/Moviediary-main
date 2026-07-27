import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getGuestHeaders } from "./demo-auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    credentials: "include",
    headers: { ...getGuestHeaders(), ...(opts?.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type SmartRuleField = "genre" | "language" | "status" | "rating" | "yearFrom" | "yearTo";

export interface SmartRule {
  field: SmartRuleField;
  value: string;
}

export interface CollectionSummary {
  id: number;
  name: string;
  movieCount: number;
  posters: (string | null)[];
  movieIds: number[];
  rules: SmartRule[] | null;
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

// ── Query keys ────────────────────────────────────────────────────────────────
export const collectionsKey = () => ["collections"] as const;
export const collectionMoviesKey = (id: number) => ["collections", id, "movies"] as const;
export const movieCollectionsKey = (movieId: number) => ["movies", movieId, "collections"] as const;

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

export function useCreateCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, rules }: { name: string; rules?: SmartRule[] | null }) =>
      apiFetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, rules: rules ?? null }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: collectionsKey() }),
  });
}

export function useUpdateCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name, rules }: { id: number; name: string; rules?: SmartRule[] | null }) =>
      apiFetch(`/api/collections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, rules }),
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
