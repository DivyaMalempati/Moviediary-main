import { useQuery } from "@tanstack/react-query";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface TmdbGenre {
  id: number;
  name: string;
}

async function fetchGenres(): Promise<TmdbGenre[]> {
  const res = await fetch(`${API_BASE}/api/tmdb/genres`);
  if (!res.ok) return [];
  return res.json();
}

export function useGenreList() {
  return useQuery({
    queryKey: ["tmdb-genres"],
    queryFn: fetchGenres,
    staleTime: 24 * 60 * 60 * 1000, // genre list is effectively static
  });
}
