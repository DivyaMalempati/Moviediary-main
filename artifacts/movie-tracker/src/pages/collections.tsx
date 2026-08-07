import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { MoviePosterCard } from "@/components/movie-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { getPosterUrl } from "@/lib/movie-utils";
import {
  useCollections,
  useCollectionMovies,
  useCreateCollection,
  useUpdateCollection,
  useDeleteCollection,
  collectionShareUrl,
  type SmartRule,
  type SmartRuleField,
  type CollectionSummary,
  type CollectionVisibility,
} from "@/lib/collections-api";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  FolderOpen,
  Plus,
  Pencil,
  Trash2,
  ArrowLeft,
  Loader2,
  Film,
  Check,
  Zap,
  X,
  Settings2,
  Globe,
  Lock,
  Link2,
} from "lucide-react";

async function copyShareLink(token: string) {
  const url = collectionShareUrl(token);
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Share link copied");
  } catch {
    toast.error("Couldn’t copy link", { description: url });
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LANGUAGE_OPTIONS = [
  { value: "hi", label: "Hindi" },
  { value: "ta", label: "Tamil" },
  { value: "te", label: "Telugu" },
  { value: "ml", label: "Malayalam" },
  { value: "kn", label: "Kannada" },
  { value: "bn", label: "Bengali" },
  { value: "mr", label: "Marathi" },
  { value: "pa", label: "Punjabi" },
  { value: "en", label: "English" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
];

const RATING_OPTIONS = ["1", "2", "3", "4", "5"];

const STATUS_OPTIONS = [
  { value: "watched", label: "Watched" },
  { value: "wishlist", label: "Wishlist" },
];

const FIELD_LABELS: Record<SmartRuleField, string> = {
  genre: "Genre",
  language: "Language",
  status: "Status",
  rating: "Rating",
  yearFrom: "Year from",
  yearTo: "Year to",
};

function ruleDisplay(rule: SmartRule): string {
  switch (rule.field) {
    case "language": {
      const lang = LANGUAGE_OPTIONS.find((l) => l.value === rule.value);
      return `Language: ${lang?.label ?? rule.value}`;
    }
    case "status":
      return `Status: ${rule.value === "watched" ? "Watched" : "Wishlist"}`;
    case "rating":
      return `Rating: ${"★".repeat(Number(rule.value))}`;
    case "yearFrom":
      return `Year ≥ ${rule.value}`;
    case "yearTo":
      return `Year ≤ ${rule.value}`;
    case "genre":
      return `Genre: ${rule.value}`;
    default:
      return `${rule.field}: ${rule.value}`;
  }
}

// ── Poster mosaic (up to 4 posters) ─────────────────────────────────────────
function PosterMosaic({ posters, size = 64 }: { posters: (string | null)[]; size?: number }) {
  const filled = [...posters, null, null, null, null].slice(0, 4);
  return (
    <div className="grid grid-cols-2 gap-0.5 rounded-lg overflow-hidden" style={{ width: size, height: size }}>
      {filled.map((p, i) => {
        const url = p ? getPosterUrl(p, "w500") : null;
        return (
          <div key={i} className="bg-secondary flex items-center justify-center">
            {url ? (
              <img src={url} alt="" className="w-full h-full object-cover" />
            ) : (
              <Film className="w-3 h-3 text-muted-foreground opacity-40" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Rule editor ───────────────────────────────────────────────────────────────

interface RuleEditorProps {
  rules: SmartRule[];
  onChange: (rules: SmartRule[]) => void;
}

function RuleEditor({ rules, onChange }: RuleEditorProps) {
  const [addingField, setAddingField] = useState<SmartRuleField | "">("");
  const [addingValue, setAddingValue] = useState("");
  const [genreInput, setGenreInput] = useState("");

  const removeRule = (index: number) => {
    onChange(rules.filter((_, i) => i !== index));
  };

  const addRule = () => {
    if (!addingField) return;
    const value = addingField === "genre" ? genreInput.trim() : addingValue;
    if (!value) return;
    onChange([...rules, { field: addingField as SmartRuleField, value }]);
    setAddingField("");
    setAddingValue("");
    setGenreInput("");
  };

  const renderValueInput = () => {
    if (!addingField) return null;
    switch (addingField) {
      case "language":
        return (
          <Select value={addingValue} onValueChange={setAddingValue}>
            <SelectTrigger className="h-8 text-sm bg-background flex-1">
              <SelectValue placeholder="Select language" />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map((l) => (
                <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "status":
        return (
          <Select value={addingValue} onValueChange={setAddingValue}>
            <SelectTrigger className="h-8 text-sm bg-background flex-1">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "rating":
        return (
          <Select value={addingValue} onValueChange={setAddingValue}>
            <SelectTrigger className="h-8 text-sm bg-background flex-1">
              <SelectValue placeholder="Select rating" />
            </SelectTrigger>
            <SelectContent>
              {RATING_OPTIONS.map((r) => (
                <SelectItem key={r} value={r}>{"★".repeat(Number(r))} ({r} star{Number(r) !== 1 ? "s" : ""})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "yearFrom":
      case "yearTo":
        return (
          <Input
            type="number"
            placeholder={addingField === "yearFrom" ? "e.g. 1990" : "e.g. 2010"}
            value={addingValue}
            onChange={(e) => setAddingValue(e.target.value)}
            className="h-8 text-sm bg-background flex-1"
            min={1900}
            max={2100}
          />
        );
      case "genre":
        return (
          <Input
            placeholder="e.g. Action, Drama, Thriller…"
            value={genreInput}
            onChange={(e) => setGenreInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addRule()}
            className="h-8 text-sm bg-background flex-1"
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-3">
      {/* Current rules */}
      {rules.length > 0 && (
        <div className="space-y-1.5">
          {rules.map((rule, i) => (
            <div key={i} className="flex items-center justify-between gap-2 bg-primary/10 border border-primary/20 rounded-lg px-3 py-1.5 text-sm">
              <span className="text-foreground">{ruleDisplay(rule)}</span>
              <button
                onClick={() => removeRule(i)}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add rule */}
      <div className="flex gap-2 flex-wrap">
        <Select value={addingField} onValueChange={(v) => { setAddingField(v as SmartRuleField); setAddingValue(""); setGenreInput(""); }}>
          <SelectTrigger className="h-8 text-sm bg-background w-36">
            <SelectValue placeholder="Add rule…" />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(FIELD_LABELS) as SmartRuleField[]).map((f) => (
              <SelectItem key={f} value={f}>{FIELD_LABELS[f]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {addingField && (
          <>
            {renderValueInput()}
            <Button
              size="sm"
              className="h-8 shrink-0"
              onClick={addRule}
              disabled={
                !addingField ||
                (addingField === "genre" ? !genreInput.trim() : !addingValue)
              }
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </>
        )}
      </div>

      {rules.length === 0 && !addingField && (
        <p className="text-xs text-muted-foreground">
          No rules yet — add at least one rule to make this a smart collection.
        </p>
      )}
    </div>
  );
}

// ── Create collection dialog ──────────────────────────────────────────────────

function VisibilityToggle({
  value,
  onChange,
}: {
  value: CollectionVisibility;
  onChange: (v: CollectionVisibility) => void;
}) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => onChange("private")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
          value === "private"
            ? "border-primary bg-primary/10 text-primary"
            : "border-border text-muted-foreground hover:border-white/20"
        }`}
      >
        <Lock className="w-3.5 h-3.5" />
        Private
      </button>
      <button
        type="button"
        onClick={() => onChange("public")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
          value === "public"
            ? "border-primary bg-primary/10 text-primary"
            : "border-border text-muted-foreground hover:border-white/20"
        }`}
      >
        <Globe className="w-3.5 h-3.5" />
        Public
      </button>
    </div>
  );
}

function CreateCollectionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [isSmart, setIsSmart] = useState(false);
  const [rules, setRules] = useState<SmartRule[]>([]);
  const [visibility, setVisibility] = useState<CollectionVisibility>("private");
  const createCollection = useCreateCollection();

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      await createCollection.mutateAsync({
        name: name.trim(),
        rules: isSmart && rules.length > 0 ? rules : null,
        visibility,
      });
      toast.success("Collection created");
      setName("");
      setIsSmart(false);
      setRules([]);
      setVisibility("private");
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create collection");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New collection</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Input
            placeholder="Collection name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !isSmart && handleCreate()}
            autoFocus
          />

          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Visibility</p>
            <VisibilityToggle value={visibility} onChange={setVisibility} />
            <p className="text-[11px] text-muted-foreground">
              {visibility === "public"
                ? "Anyone with the share link can view titles and posters."
                : "Only you can see this collection."}
            </p>
          </div>

          {/* Smart toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => { setIsSmart(!isSmart); setRules([]); }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                isSmart
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-white/20"
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              Smart collection
            </button>
            {!isSmart && (
              <span className="text-xs text-muted-foreground">Add films manually</span>
            )}
          </div>

          {isSmart && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Rules — match ALL of:</p>
              <RuleEditor rules={rules} onChange={setRules} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || createCollection.isPending || (isSmart && rules.length === 0)}
          >
            {createCollection.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit rules dialog ─────────────────────────────────────────────────────────

function EditCollectionDialog({
  collection,
  onClose,
}: {
  collection: CollectionSummary;
  onClose: () => void;
}) {
  const [name, setName] = useState(collection.name);
  const [rules, setRules] = useState<SmartRule[]>(collection.rules ?? []);
  const [visibility, setVisibility] = useState<CollectionVisibility>(
    collection.visibility ?? "private",
  );
  const updateCollection = useUpdateCollection();

  const isSmart = rules.length > 0;

  const handleSave = async () => {
    if (!name.trim()) return;
    try {
      const updated = (await updateCollection.mutateAsync({
        id: collection.id,
        name: name.trim(),
        rules: rules.length > 0 ? rules : null,
        visibility,
      })) as CollectionSummary;
      toast.success("Collection updated");
      if (visibility === "public" && updated?.shareToken) {
        // Keep dialog closed; owner can copy from detail header.
      }
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update collection");
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit collection</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Input
            placeholder="Collection name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Visibility</p>
            <VisibilityToggle value={visibility} onChange={setVisibility} />
            <p className="text-[11px] text-muted-foreground">
              {visibility === "public"
                ? "Share link works. Making it private revokes the link."
                : "Make public to get a share link."}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Smart rules — match ALL of:
            </p>
            <RuleEditor rules={rules} onChange={setRules} />
            {isSmart && (
              <button
                onClick={() => setRules([])}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Remove all rules (convert to manual)
              </button>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || updateCollection.isPending}
          >
            {updateCollection.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Collection list ───────────────────────────────────────────────────────────
function CollectionList() {
  const [, setLocation] = useLocation();
  const { data: collections, isLoading } = useCollections();
  const deleteCollection = useDeleteCollection();

  const [showCreate, setShowCreate] = useState(false);
  const [editingCollection, setEditingCollection] = useState<CollectionSummary | null>(null);

  const handleDelete = async (id: number) => {
    try {
      await deleteCollection.mutateAsync(id);
      toast.success("Collection deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  return (
    <>
      <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <section className="flex items-center justify-between gap-4">
          <div>
            <h1 data-tour="collections-heading" className="text-3xl font-bold flex items-center gap-3">
              <FolderOpen className="w-8 h-8 text-primary" /> Collections
            </h1>
            <p className="text-muted-foreground mt-1">Named shelves to organise your library.</p>
          </div>
          <Button onClick={() => setShowCreate(true)} className="gap-1.5 shrink-0">
            <Plus className="w-4 h-4" /> New collection
          </Button>
        </section>

        {/* List */}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : !collections || collections.length === 0 ? (
          <div className="text-center py-20 bg-card rounded-2xl border border-dashed border-border">
            <FolderOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
            <p className="text-muted-foreground">No collections yet.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Create your first collection
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {collections.map((col) => {
              const isSmart = Array.isArray(col.rules) && col.rules.length > 0;
              return (
                <div
                  key={col.id}
                  className="bg-card border border-border rounded-xl p-4 flex gap-4 items-start hover:border-white/20 transition-colors cursor-pointer group"
                  onClick={() => setLocation(`/collections/${col.id}`)}
                >
                  <div className="shrink-0">
                    <PosterMosaic posters={col.posters} size={72} />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-semibold text-sm truncate">{col.name}</p>
                      {isSmart && (
                        <Badge variant="secondary" className="gap-1 text-[10px] px-1.5 py-0 h-4 shrink-0 bg-primary/15 text-primary border-primary/20">
                          <Zap className="w-2.5 h-2.5" /> Smart
                        </Badge>
                      )}
                      {(col.visibility ?? "private") === "public" ? (
                        <Badge variant="secondary" className="gap-1 text-[10px] px-1.5 py-0 h-4 shrink-0">
                          <Globe className="w-2.5 h-2.5" /> Public
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1 text-[10px] px-1.5 py-0 h-4 shrink-0 text-muted-foreground">
                          <Lock className="w-2.5 h-2.5" /> Private
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {col.movieCount} film{col.movieCount !== 1 ? "s" : ""}
                    </p>
                    {isSmart && col.rules && col.rules.length > 0 && (
                      <p className="text-[10px] text-muted-foreground truncate">
                        {col.rules.map(ruleDisplay).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => setEditingCollection(col)}
                      title={isSmart ? "Edit rules" : "Rename"}
                    >
                      {isSmart ? <Settings2 className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete "{col.name}"?</AlertDialogTitle>
                          <AlertDialogDescription>The collection will be deleted. Your films stay in the library.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(col.id)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CreateCollectionDialog open={showCreate} onClose={() => setShowCreate(false)} />
      {editingCollection && (
        <EditCollectionDialog
          collection={editingCollection}
          onClose={() => setEditingCollection(null)}
        />
      )}
    </>
  );
}

// ── Collection detail ─────────────────────────────────────────────────────────
function CollectionDetail({ id }: { id: number }) {
  const [, setLocation] = useLocation();
  const { data: collections } = useCollections();
  const { data: movies, isLoading } = useCollectionMovies(id);
  const collection = collections?.find((c) => c.id === id);
  const [editingCollection, setEditingCollection] = useState<CollectionSummary | null>(null);

  const isSmart = Array.isArray(collection?.rules) && (collection?.rules?.length ?? 0) > 0;

  return (
    <>
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/collections")} className="gap-2 text-muted-foreground">
            <ArrowLeft className="w-4 h-4" /> Collections
          </Button>
        </div>

        <section className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl font-bold">{collection?.name ?? "Collection"}</h1>
                {isSmart && (
                  <Badge className="gap-1.5 bg-primary/15 text-primary border-primary/20 hover:bg-primary/20">
                    <Zap className="w-3 h-3" /> Smart
                  </Badge>
                )}
                {(collection?.visibility ?? "private") === "public" ? (
                  <Badge variant="secondary" className="gap-1.5">
                    <Globe className="w-3 h-3" /> Public
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1.5 text-muted-foreground">
                    <Lock className="w-3 h-3" /> Private
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground mt-1">
                {collection?.movieCount ?? 0} film{(collection?.movieCount ?? 0) !== 1 ? "s" : ""}
                {isSmart && " · auto-populated"}
              </p>
            </div>
            {collection && (
              <div className="flex items-center gap-2 shrink-0">
                {(collection.visibility ?? "private") === "public" && collection.shareToken ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => void copyShareLink(collection.shareToken!)}
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    Copy share link
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 text-muted-foreground"
                    disabled
                    title="Make public to share"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    Make public to share
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setEditingCollection(collection)}
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  {isSmart ? "Edit rules" : "Edit"}
                </Button>
              </div>
            )}
          </div>

          {/* Rules summary */}
          {isSmart && collection?.rules && (
            <div className="flex flex-wrap gap-2">
              {collection.rules.map((rule, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 rounded-full px-3 py-1 text-xs text-primary"
                >
                  <Zap className="w-3 h-3" />
                  {ruleDisplay(rule)}
                </div>
              ))}
            </div>
          )}
        </section>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : !movies || movies.length === 0 ? (
          <div className="text-center py-20 bg-card rounded-2xl border border-dashed border-border">
            <Film className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
            {isSmart ? (
              <>
                <p className="text-muted-foreground">No films match these rules yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Films will appear here automatically as they match your rules.</p>
              </>
            ) : (
              <>
                <p className="text-muted-foreground">No films in this collection yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Open any film's detail page to add it here.</p>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4 md:gap-6">
            {movies.map((movie) => (
              <MoviePosterCard
                key={movie.id}
                id={movie.id}
                title={movie.title}
                posterPath={movie.posterPath}
                language={movie.originalLanguage}
                rating={movie.rating}
                year={movie.releaseYear}
              />
            ))}
          </div>
        )}
      </div>

      {editingCollection && (
        <EditCollectionDialog
          collection={editingCollection}
          onClose={() => setEditingCollection(null)}
        />
      )}
    </>
  );
}

// ── Router component ──────────────────────────────────────────────────────────
export default function CollectionsPage() {
  const params = useParams<{ id?: string }>();
  if (params.id) {
    return <CollectionDetail id={parseInt(params.id, 10)} />;
  }
  return <CollectionList />;
}
