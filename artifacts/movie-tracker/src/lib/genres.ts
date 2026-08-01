import { useQuery } from "@tanstack/react-query";
import { getSyncSessionHeaders } from "@/lib/demo-auth";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface TmdbGenre {
  id: number;
  name: string;
}

/** Canonical TMDB movie genres — used when /api/tmdb/genres is unreachable. */
export const FALLBACK_GENRES: TmdbGenre[] = [
  { id: 28, name: "Action" },
  { id: 12, name: "Adventure" },
  { id: 16, name: "Animation" },
  { id: 35, name: "Comedy" },
  { id: 80, name: "Crime" },
  { id: 99, name: "Documentary" },
  { id: 18, name: "Drama" },
  { id: 10751, name: "Family" },
  { id: 14, name: "Fantasy" },
  { id: 36, name: "History" },
  { id: 27, name: "Horror" },
  { id: 10402, name: "Music" },
  { id: 9648, name: "Mystery" },
  { id: 10749, name: "Romance" },
  { id: 878, name: "Science Fiction" },
  { id: 10770, name: "TV Movie" },
  { id: 53, name: "Thriller" },
  { id: 10752, name: "War" },
  { id: 37, name: "Western" },
];

async function fetchGenres(): Promise<TmdbGenre[]> {
  try {
    const res = await fetch(`${API_BASE}/api/tmdb/genres`, {
      credentials: "include",
      headers: getSyncSessionHeaders(),
    });
    if (!res.ok) throw new Error(`genres fetch failed: ${res.status}`);
    const data: TmdbGenre[] = await res.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error("genres list was empty");
    return data;
  } catch {
    // Keep Preferences usable on Replit when TMDB/API is briefly down.
    return FALLBACK_GENRES;
  }
}

export function useGenreList() {
  return useQuery({
    queryKey: ["tmdb-genres"],
    queryFn: fetchGenres,
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });
}
