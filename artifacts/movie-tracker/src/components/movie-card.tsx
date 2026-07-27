import { Link } from "wouter";
import { Film, Star, Heart } from "lucide-react";
import { LanguageBadge } from "./language-badge";
import { getPosterUrl, RATING_LABELS } from "@/lib/movie-utils";
import { cn } from "@/lib/utils";

interface MoviePosterCardProps {
  id: number; // Internal ID
  title: string;
  posterPath?: string | null;
  language?: string | null;
  rating?: string | null;
  year?: number | null;
  className?: string;
  actionNode?: React.ReactNode;
}

export function MoviePosterCard({
  id,
  title,
  posterPath,
  language,
  rating,
  year,
  className,
  actionNode
}: MoviePosterCardProps) {
  const posterUrl = getPosterUrl(posterPath);

  return (
    <div className={cn("group relative flex flex-col gap-2", className)}>
      <Link href={`/movie/${id}`} className="block relative aspect-[2/3] rounded-xl overflow-hidden bg-secondary/50 border border-border/50 shadow-lg transition-transform duration-300 group-hover:-translate-y-1 group-hover:shadow-2xl group-hover:shadow-primary/10">
        {posterUrl ? (
          <img 
            src={posterUrl} 
            alt={title} 
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground p-4 text-center">
            <Film className="w-10 h-10 mb-2 opacity-50" />
            <span className="text-xs font-medium">{title}</span>
          </div>
        )}
        
        {/* Overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        
        <div className="absolute top-2 right-2 z-10">
          <LanguageBadge language={language} />
        </div>

        {rating && (
          <div className="absolute bottom-2 left-2 z-10 bg-black/60 backdrop-blur-md rounded-full px-2 py-1 flex items-center gap-1.5 border border-white/10">
            {rating === "loved" ? (
              <Heart className="w-3 h-3 text-white fill-white" />
            ) : (
              <Star className="w-3 h-3 text-white fill-white" />
            )}
            <span className="text-[10px] font-medium text-white">{RATING_LABELS[rating] || rating}</span>
          </div>
        )}
      </Link>
      
      <div className="flex flex-col gap-1 px-1">
        <h3 className="font-medium text-sm line-clamp-1 group-hover:text-primary transition-colors" title={title}>
          {title}
        </h3>
        {year && (
          <span className="text-xs text-muted-foreground font-mono">{year}</span>
        )}
      </div>

      {actionNode && (
        <div className="absolute top-2 left-2 z-20">
          {actionNode}
        </div>
      )}
    </div>
  );
}