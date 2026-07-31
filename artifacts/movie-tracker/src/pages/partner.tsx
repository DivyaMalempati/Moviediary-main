import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAuthHeaders, isDemoMode, exitDemoToSignIn } from "@/lib/demo-auth";
import { toast } from "sonner";
import {
  Loader2,
  Users,
  Link2,
  Copy,
  Shuffle,
  Unlink,
  ArrowRight,
  Heart,
  Play,
  Settings,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type PartnerInfo = {
  partnerLinkId: number;
  partnerUserId: string;
  status: string;
  createdAt: string;
} | null;

type Invite = {
  code: string;
  expiresAt: string;
  path: string;
};

type ActiveSession = {
  id: number;
  status: string;
  deckSize: number;
  createdAt: string;
  path: string;
};

function inviteUrl(path: string) {
  return `${window.location.origin}${BASE}${path}`;
}

export default function PartnerPage() {
  const [, setLocation] = useLocation();
  const [partner, setPartner] = useState<PartnerInfo>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sessionShareUrl, setSessionShareUrl] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [partnerRes, sessionsRes] = await Promise.all([
        fetch(`${BASE}/api/partners`, {
          headers: await getAuthHeaders(),
          credentials: "include",
        }),
        fetch(`${BASE}/api/match-sessions`, {
          headers: await getAuthHeaders(),
          credentials: "include",
        }),
      ]);
      if (partnerRes.status === 401 || partnerRes.status === 403) {
        setPartner(null);
        setSessions([]);
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
    setBusy(true);
    try {
      const res = await fetch(`${BASE}/api/partners/invite`, {
        method: "POST",
        headers: await getAuthHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
      });
      if (res.status === 401 || res.status === 403) {
        toast.error("Sign in to invite someone to movie night");
        return;
      }
      if (!res.ok) throw new Error("invite failed");
      const data = (await res.json()) as Invite;
      setInvite(data);
      toast.success("Invite link ready — send it to your friend");
    } catch {
      toast.error("Couldn’t create invite");
    } finally {
      setBusy(false);
    }
  };

  const join = async (code?: string) => {
    const raw = (code ?? joinCode).trim();
    if (!raw) return;
    setBusy(true);
    try {
      const res = await fetch(`${BASE}/api/partners/join`, {
        method: "POST",
        headers: await getAuthHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
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
      const res = await fetch(`${BASE}/api/partners`, {
        method: "DELETE",
        headers: await getAuthHeaders(),
        credentials: "include",
      });
      if (!res.ok && res.status !== 204) throw new Error("unlink failed");
      toast.success("Movie-night pair cleared");
      setPartner(null);
      setSessions([]);
      setSessionShareUrl(null);
    } catch {
      toast.error("Couldn’t clear pair");
    } finally {
      setBusy(false);
    }
  };

  const startMatch = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${BASE}/api/match-sessions`, {
        method: "POST",
        headers: await getAuthHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error((err as { error?: string }).error ?? "Couldn’t start movie night");
        return;
      }
      const data = (await res.json()) as { id: number };
      const url = inviteUrl(`/match/${data.id}`);
      setSessionShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Movie-night link copied — share it so you can both swipe");
      } catch {
        toast.success("Deck ready — share the link below so they can join");
      }
      setLocation(`/match/${data.id}`);
    } catch {
      toast.error("Couldn’t start movie night");
    } finally {
      setBusy(false);
    }
  };

  const copyInvite = async () => {
    if (!invite) return;
    const url = inviteUrl(invite.path);
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied");
    } catch {
      toast.message(url);
    }
  };

  const copySession = async (path: string) => {
    const url = inviteUrl(path);
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Movie-night link copied");
    } catch {
      toast.message(url);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 py-8 space-y-8">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
            Together
          </p>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            Movie night ritual
          </h1>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            Before Friday night — or whenever friends meet up — share a link and swipe the same
            deck. Each of you keeps your own genres and languages in Preferences. You don&apos;t
            type what they like. You both swipe, and mutual likes become tonight&apos;s shortlist.
          </p>
        </div>

        <ol className="grid gap-3 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="font-mono text-foreground/80">1.</span>
            <span>
              Each person sets their own genres &amp; languages in{" "}
              <Link href="/profile" className="text-foreground underline-offset-2 hover:underline">
                Preferences
              </Link>
              {" "}— never fill in for each other
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-mono text-foreground/80">2.</span>
            Share an invite so they join this movie night
          </li>
          <li className="flex gap-2">
            <span className="font-mono text-foreground/80">3.</span>
            Start the deck (built from both of your tastes) and swipe together
          </li>
          <li className="flex gap-2">
            <span className="font-mono text-foreground/80">4.</span>
            When you both like a film, it&apos;s a match — pick from those for tonight
          </li>
        </ol>

        {isDemoMode() && (
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 space-y-2">
            <p className="text-sm text-sky-50">
              Demo session — you can try the invite and swipe ritual here. Sign in on both devices
              for a real movie night with friends.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => exitDemoToSignIn()}
            >
              Sign in instead
            </Button>
          </div>
        )}

        {partner ? (
          <section className="space-y-5">
            <div className="rounded-xl border border-border bg-secondary/40 p-4 space-y-2">
              <p className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Heart className="w-3.5 h-3.5" /> Ready for tonight
              </p>
              <p className="text-sm">
                You&apos;re paired. Start a deck whenever you want to decide what to watch.
              </p>
              <p className="text-xs text-muted-foreground">
                Paired {new Date(partner.createdAt).toLocaleDateString("en-IN")}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={startMatch} disabled={busy} className="gap-2">
                <Play className="w-4 h-4" />
                Start movie night
              </Button>
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

            {sessionShareUrl && (
              <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Send this so they can swipe the same deck
                </p>
                <p className="text-xs break-all text-muted-foreground">{sessionShareUrl}</p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-2"
                  onClick={() => {
                    void navigator.clipboard.writeText(sessionShareUrl).then(
                      () => toast.success("Copied"),
                      () => toast.message(sessionShareUrl),
                    );
                  }}
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy again
                </Button>
              </div>
            )}

            {sessions.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold">Open movie nights</h2>
                <ul className="space-y-2">
                  {sessions.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">Deck · {s.deckSize} films</p>
                        <p className="text-[11px] text-muted-foreground">
                          Started {new Date(s.createdAt).toLocaleString("en-IN")}
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
                        Open
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        ) : (
          <section className="space-y-6">
            <div className="space-y-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Link2 className="w-4 h-4" /> Invite someone
              </h2>
              <p className="text-xs text-muted-foreground">
                They open the link, sign in with their own account (and their own Preferences), and
                you&apos;re ready to swipe.
              </p>
              <Button onClick={createInvite} disabled={busy}>
                Create invite link
              </Button>
              {invite && (
                <div className="rounded-xl border border-border bg-secondary/40 p-4 space-y-3">
                  <p className="font-mono text-lg tracking-wide">{invite.code}</p>
                  <p className="text-xs text-muted-foreground break-all">
                    {typeof window !== "undefined" ? inviteUrl(invite.path) : invite.path}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Expires {new Date(invite.expiresAt).toLocaleDateString("en-IN")}
                  </p>
                  <Button size="sm" variant="secondary" onClick={copyInvite} className="gap-2">
                    <Copy className="w-3.5 h-3.5" />
                    Copy invite link
                  </Button>
                </div>
              )}
            </div>

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
          </section>
        )}

        <Link
          href="/swipe"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          Solo swipe instead <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </Layout>
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
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${BASE}/api/partners/join`, {
          method: "POST",
          headers: await getAuthHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
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
    <Layout>
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 px-4 text-center">
        {status === "joining" && <Loader2 className="w-8 h-8 animate-spin text-primary" />}
        <p className="text-sm text-muted-foreground">{message}</p>
        {status === "error" && (
          <Button variant="outline" onClick={() => setLocation("/partner")}>
            Open Together
          </Button>
        )}
      </div>
    </Layout>
  );
}
