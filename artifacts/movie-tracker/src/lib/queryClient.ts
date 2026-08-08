import { QueryClient } from "@tanstack/react-query";
import {
  getGetMovieStatsQueryKey,
  getListMoviesQueryKey,
} from "@workspace/api-client-react";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,          // 1 min — don't refetch on every nav/focus
      gcTime: 10 * 60 * 1000,        // keep cache 10 min after component unmounts
      refetchOnWindowFocus: false,   // biggest win: stops refetch storms on tab switch
      retry: 1,
    },
  },
});

/**
 * Invalidate every library list/stats query that Watched, Watchlist, and
 * movie details read. Prefer this over ad-hoc `["movies"]` keys.
 */
export function invalidateLibrary(qc: QueryClient = queryClient): Promise<void> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: getListMoviesQueryKey() }),
    qc.invalidateQueries({ queryKey: getListMoviesQueryKey({ status: "watched" }) }),
    qc.invalidateQueries({ queryKey: getListMoviesQueryKey({ status: "watchlist" }) }),
    qc.invalidateQueries({ queryKey: ["/api/movies"] }),
    qc.invalidateQueries({ queryKey: getGetMovieStatsQueryKey() }),
    qc.invalidateQueries({ queryKey: ["/api/movies/stats"] }),
    qc.invalidateQueries({ queryKey: ["movie-stats"] }),
  ]).then(() => undefined);
}
