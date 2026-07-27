import { useQuery } from "@tanstack/react-query";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface TmdbGenre {
  id: number;
  name: string;
}

async function fetchGenres(): Promise<TmdbGenre[]> {
  const res = await fetch(`${API_BASE}/api/tmdb/genres`);
  if (!res.ok) throw new Error(`genres fetch failed: ${res.status}`);
  const data: TmdbGenre[] = await res.json();
  // An empty array means the server had no genres — treat as transient error
  // so React Query retries rather than caching an empty list as "fresh" data.
  if (data.length === 0) throw new Error("genres list was empty");
  return data;
}

export function useGenreList() {
  return useQuery({
    queryKey: ["tmdb-genres"],
    queryFn: fetchGenres,
    // Genre list is static — only cache if we actually got data.
    // staleTime is set but React Query will retry on error anyway.
    staleTime: 24 * 60 * 60 * 1000,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
  });
}
