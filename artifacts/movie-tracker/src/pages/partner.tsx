import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  authFetch,
  ensureClerkApiSession,
  isDemoMode,
  exitDemoToSignIn,
} from "@/lib/demo-auth";
import { absoluteAppUrl } from "@/lib/app-url";
import { toast } from "sonner";
import {
  Loader2,
  Users,
  Link2,
  Copy,
  Share2,
  Shuffle,
  Unlink,
  ArrowRight,
  Heart,
  Play,
  Settings,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

async function shareOrCopyLink(url: string, title: string): Promise<"shared" | "copied" | "shown"> {
  let inIframe = false;
  try {
    inIframe = window.self !== window.top;
  } catch {
    inIframe = true;
  }

  if (!inIframe && typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      // Put the full URL in `text` too — some apps ignore or replace `url`.
      await navigator.share({ title, text: `${title}\n${url}`, url });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "shown";
    }
  }
  const copied = await copyText(url);
  return copied ? "copied" : "shown";
}

type PartnerInfo = {
  partnerLinkId: number;
  partnerUserId: string;
  displayName?: string | null;
  status: string;
  createdAt: string;
} | null;

type Invite = {
  code: string;
  expiresAt: string;
  path: string;
  recipientName?: string;
  contactId?: number;
};

type ActiveSession = {
  id: number;
  status: string;
  deckSize: number;
  createdAt: string;
  path: string;
};

type Contact = {
  id: number;
  displayName: string;
  partnerUserId: string | null;
  status: "pending" | "paired" | "expired";
  pendingInvite: { code: string; expiresAt: string; path: string } | null;
  sessions: ActiveSession[];
  updatedAt: string;
};

export default function PartnerPage() {
  const [, setLocation] = useLocation();
  const [partner, setPartner] = useState<PartnerInfo>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [expandedContactId, setExpandedContactId] = useState<number | null>(null);
  const [recipientName, setRecipientName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sessionShareUrl, setSessionShareUrl] = useState<string | null>(null);
  const [showResumePrompt, setShowResumePrompt] = useState(false);

  const refresh = useCallback(async () => {
    try {
      await ensureClerkApiSession();
      const [partnerRes, sessionsRes, contactsRes] = await Promise.all([
        authFetch(`${BASE}/api/partners`),
        authFetch(`${BASE}/api/match-sessions`),
        authFetch(`${BASE}/api/partners/contacts`),
      ]);
      if (partnerRes.status === 401 || partnerRes.status === 403) {
        setPartner(null);
        setSessions([]);
        setContacts([]);
        setLoading(false);
        return;
      }
      if (!partnerRes.ok) throw new Error("Failed to load partner");
      const data = (await partnerRes.json()) as { partner: PartnerInfo };
      setPartner(data.partner);

      if (sessionsRes.ok) {
        const sData = (await sessionsRes.json()) as { sessions: ActiveSession[] };
        setSessions(sData.sessions ?? []);
      } else {
        setSessions([]);
      }

      if (contactsRes.ok) {
        const cData = (await contactsRes.json()) as { contacts: Contact[] };
        setContacts(cData.contacts ?? []);
      } else {
        setContacts([]);
      }
    } catch {
      toast.error("Couldn’t load movie night");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createInvite = async () => {
    if (isDemoMode()) {
      exitDemoToSignIn();
      return;
    }
    const name = recipientName.trim();
    if (!name) {
      toast.error("Add a name for who you’re inviting (e.g. Priya)");
      return;
    }
    setBusy(true);
    try {
      const sessionOk = await ensureClerkApiSession();
      if (!sessionOk) {
        toast.error("Sign in again to create a Together invite");
        return;
      }
      const res = await authFetch(`${BASE}/api/partners/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientName: name }),
      });
      if (res.status === 401 || res.status === 403) {
        toast.error("Sign in to invite someone for movie night");
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(
          (err as { error?: string }).error ??
            (res.status >= 500
              ? "Server couldn’t create the invite — refresh and try once more"
              : "Couldn’t create invite"),
        );
        return;
      }
      const data = (await res.json()) as Invite;
      setInvite(data);
      setRecipientName("");
      const url = absoluteAppUrl(data.path);
      const result = await shareOrCopyLink(
        url,
        `Join me on Cinevault for movie night`,
      );
      if (result === "shared") {
        toast.success(`Invite ready for ${data.recipientName ?? name} — shared`);
      } else if (result === "copied") {
        toast.success(`Invite link copied for ${data.recipientName ?? name}`);
      } else {
        toast.success(`Invite ready for ${data.recipientName ?? name} — copy the link below`);
      }
      await refresh();
    } catch (err) {
      console.error("[together] createInvite", err);
      toast.error("Couldn’t create invite");
    } finally {
      setBusy(false);
    }
  };

  const join = async (code?: string) => {
    if (isDemoMode()) {
      exitDemoToSignIn();
      return;
    }
    const raw = (code ?? joinCode).trim();
    if (!raw) return;
    setBusy(true);
    try {
      await ensureClerkApiSession();
      const res = await authFetch(`${BASE}/api/partners/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: raw.toLowerCase() }),
      });
      const err = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error((err as { error?: string }).error ?? "Couldn’t join");
        return;
      }
      toast.success("You’re in — start a movie night when you’re ready");
      setJoinCode("");
      setInvite(null);
      await refresh();
    } catch {
      toast.error("Couldn’t join with that code");
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    setBusy(true);
    try {
      const res = await authFetch(`${BASE}/api/partners`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("unlink failed");
      toast.success("Movie-night pair cleared");
      setPartner(null);
      setSessions([]);
      setSessionShareUrl(null);
      await refresh();
    } catch {
      toast.error("Couldn’t clear pair");
    } finally {
      setBusy(false);
    }
  };

  const doCreateNewSession = async () => {
    setBusy(true);
    try {
      await ensureClerkApiSession();
      const res = await authFetch(`${BASE}/api/match-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error((err as { error?: string }).error ?? "Couldn't start movie night");
        return;
      }
      const data = (await res.json()) as { id: number };
      const url = absoluteAppUrl(`/match/${data.id}`);
      setSessionShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Movie-night link copied — share it so you can both swipe");
      } catch {
        toast.success("Deck ready — share the link below so they can join");
      }
      setLocation(`/match/${data.id}`);
      await refresh();
    } catch {
      toast.error("Couldn't start movie night");
    } finally {
      setBusy(false);
      setShowResumePrompt(false);
    }
  };

  const startMatch = async () => {
    if (isDemoMode()) {
      exitDemoToSignIn();
      return;
    }
    // If there's already an active session, prompt the user to resume or start fresh.
    if (sessions.length > 0) {
      setShowResumePrompt(true);
      return;
    }
    await doCreateNewSession();
  };

  const copyInvite = async (path?: string) => {
    const p = path ?? invite?.path;
    if (!p) return;
    const url = absoluteAppUrl(p);
    const result = await shareOrCopyLink(url, "Join me on Cinevault for movie night");
    if (result === "shared") toast.success("Invite shared");
    else if (result === "copied") toast.success("Invite link copied");
    else toast.message(url);
  };

  const copySession = async (path: string) => {
    const url = absoluteAppUrl(path);
    const result = await shareOrCopyLink(url, "Join our Cinevault movie night");
    if (result === "shared") toast.success("Movie-night link shared");
    else if (result === "copied") toast.success("Movie-night link copied");
    else toast.message(url);
  };

  if (loading) {
    return (
      <>
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </>
    );
  }

  const partnerLabel = partner?.displayName?.trim() || "your partner";

  return (
    <>
      {/* Resume-or-start-fresh dialog */}
      {showResumePrompt && sessions.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 space-y-4 shadow-2xl">
            <div className="space-y-1.5">
              <h2 className="text-base font-semibold">Unfinished session</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                You have an unfinished movie-night deck with {partnerLabel}. Resume where you left
                off, or start a new one?
              </p>
            </div>
            <div className="space-y-2">
              <Button
                className="w-full gap-2"
                onClick={() => {
                  setShowResumePrompt(false);
                  setLocation(sessions[0].path);
                }}
              >
                <Play className="w-4 h-4" />
                Resume session
              </Button>
              <Button
                variant="outline"
                className="w-full"
                disabled={busy}
                onClick={() => void doCreateNewSession()}
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Start fresh
              </Button>
              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => setShowResumePrompt(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-lg mx-auto px-4 py-8 space-y-8 pb-28">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
            Together
          </p>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            Movie night ritual
          </h1>
          {!partner && (
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Name who you’re inviting, share a link, then swipe the same deck. Mutual likes become
              tonight&apos;s shortlist.
            </p>
          )}
        </div>

        {isDemoMode() && (
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 space-y-2">
            <p className="text-sm text-sky-50">
              Movie night needs a signed-in account on both devices — guest sessions can&apos;t form
              durable pairs.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => exitDemoToSignIn()}
            >
              Sign in to use Together
            </Button>
          </div>
        )}

        {partner && (
          <section className="space-y-5">
            <div className="rounded-2xl border-2 border-primary/40 bg-primary/10 p-5 space-y-4">
              <div className="space-y-1.5">
                <p className="text-xs uppercase tracking-widest text-primary flex items-center gap-1.5 font-semibold">
                  <Heart className="w-3.5 h-3.5" /> Paired with {partnerLabel}
                </p>
                <p className="text-sm text-foreground/90 leading-relaxed">
                  Tap below to open the shared movie deck. Swipe there —{" "}
                  <span className="font-medium">not</span> the bottom &quot;Swipe&quot; tab (that one
                  is solo only).
                </p>
              </div>
              <Button
                size="lg"
                onClick={startMatch}
                disabled={busy}
                className="w-full h-12 text-base gap-2 bg-white text-black hover:bg-white/90"
              >
                {busy ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Play className="w-5 h-5" />
                )}
                Start movie night &amp; swipe
              </Button>
            </div>

            {sessions.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold">Swipe sessions with {partnerLabel}</h2>
                <ul className="space-y-2">
                  {sessions.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">Deck · {s.deckSize} films</p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(s.createdAt).toLocaleString("en-IN")}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => copySession(s.path)}
                        className="gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        Share
                      </Button>
                      <Button size="sm" onClick={() => setLocation(s.path)} className="gap-1">
                        <Shuffle className="w-3 h-3" />
                        Swipe
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {sessionShareUrl && (
              <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Send this so they can swipe the same deck
                </p>
                <p className="text-xs break-all text-muted-foreground">{sessionShareUrl}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild className="gap-2">
                <Link href="/profile">
                  <Settings className="w-4 h-4" />
                  My preferences
                </Link>
              </Button>
              <Button variant="outline" onClick={unlink} disabled={busy} className="gap-2">
                <Unlink className="w-4 h-4" />
                Clear pair
              </Button>
            </div>
          </section>
        )}

        <section className="space-y-6">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Link2 className="w-4 h-4" />{" "}
              {partner ? "Invite someone else" : "Invite someone"}
            </h2>
            <p className="text-xs text-muted-foreground">
              Name who you’re sending this to — we’ll keep their nights and swipe sessions here.
              {partner
                ? " Joining a new invite clears your current pair."
                : ""}
            </p>
            <Input
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="Their name (e.g. Priya)"
              maxLength={60}
            />
            <Button onClick={createInvite} disabled={busy || !recipientName.trim()}>
              Create invite link
            </Button>
            {invite && (
              <div className="rounded-xl border border-border bg-secondary/40 p-4 space-y-3">
                <p className="text-sm font-medium">
                  Invite for {invite.recipientName ?? "friend"}
                </p>
                <p className="font-mono text-lg tracking-wide">{invite.code}</p>
                <Input
                  readOnly
                  value={typeof window !== "undefined" ? absoluteAppUrl(invite.path) : invite.path}
                  className="font-mono text-xs h-9"
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Invite link"
                />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => copyInvite()} className="gap-2">
                    <Share2 className="w-3.5 h-3.5" />
                    Share / copy link
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const url = absoluteAppUrl(invite.path);
                      const ok = await copyText(url);
                      if (ok) toast.success("Invite link copied");
                      else toast.message(url);
                    }}
                    className="gap-2"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy
                  </Button>
                </div>
              </div>
            )}
          </div>

          {!partner && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold">Or enter their invite code</h2>
              <div className="flex gap-2">
                <Input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="reel-a1b2c3d4"
                  className="font-mono"
                />
                <Button onClick={() => join()} disabled={busy || !joinCode.trim()}>
                  Join
                </Button>
              </div>
            </div>
          )}
        </section>

        {contacts.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">People you’ve invited</h2>
            <ul className="space-y-2">
              {contacts.map((c) => {
                const open = expandedContactId === c.id;
                return (
                  <li
                    key={c.id}
                    className="rounded-xl border border-border bg-card overflow-hidden"
                  >
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-3 py-3 text-left hover:bg-secondary/40 transition-colors"
                      onClick={() => setExpandedContactId(open ? null : c.id)}
                    >
                      {open ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{c.displayName}</p>
                        <p className="text-[11px] text-muted-foreground capitalize">
                          {c.status}
                          {c.sessions.length
                            ? ` · ${c.sessions.length} swipe session${c.sessions.length === 1 ? "" : "s"}`
                            : ""}
                        </p>
                      </div>
                      {c.pendingInvite && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 text-xs gap-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            void copyInvite(c.pendingInvite!.path);
                          }}
                        >
                          <Copy className="w-3 h-3" />
                          Link
                        </Button>
                      )}
                    </button>
                    {open && (
                      <div className="px-3 pb-3 space-y-2 border-t border-border/60 pt-2">
                        {c.sessions.length === 0 ? (
                          <p className="text-xs text-muted-foreground pl-6">
                            {c.status === "pending"
                              ? "Waiting for them to open the invite."
                              : "No swipe sessions yet — start a movie night when you’re paired."}
                          </p>
                        ) : (
                          c.sessions.map((s) => (
                            <div
                              key={s.id}
                              className="flex items-center gap-2 rounded-lg bg-secondary/30 px-3 py-2 ml-6"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium">
                                  {s.status === "active" ? "Active" : "Past"} · {s.deckSize} films
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  {new Date(s.createdAt).toLocaleString("en-IN")}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                onClick={() => setLocation(s.path)}
                              >
                                Open
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <Link
          href="/swipe"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          Solo swipe instead <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </>
  );
}

/** Landing page for /pair/:code — redeem invite then redirect to /partner. */
export function PairInvitePage() {
  const params = useParams();
  const code = params.code ?? "";
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<"joining" | "error" | "done">("joining");
  const [message, setMessage] = useState("Joining movie night…");

  useEffect(() => {
    if (!code) {
      setStatus("error");
      setMessage("Missing invite code");
      return;
    }
    if (isDemoMode()) {
      setStatus("error");
      setMessage("Sign in to join a movie-night invite");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await ensureClerkApiSession();
        const res = await authFetch(`${BASE}/api/partners/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: code.toLowerCase() }),
        });
        const err = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setStatus("error");
          setMessage((err as { error?: string }).error ?? "Couldn’t join invite");
          return;
        }
        setStatus("done");
        toast.success("You’re in — start a movie night when you’re ready");
        setLocation("/partner");
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMessage("Couldn’t join invite");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, setLocation]);

  return (
    <>
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 px-4 text-center">
        {status === "joining" && <Loader2 className="w-8 h-8 animate-spin text-primary" />}
        <p className="text-sm text-muted-foreground">{message}</p>
        {status === "error" && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {isDemoMode() && (
              <Button onClick={() => exitDemoToSignIn()}>Sign in</Button>
            )}
            <Button variant="outline" onClick={() => setLocation("/partner")}>
              Open Together
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
