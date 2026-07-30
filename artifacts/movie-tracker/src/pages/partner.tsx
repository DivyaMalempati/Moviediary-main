import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAuthHeaders, isDemoMode } from "@/lib/demo-auth";
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
    if (isDemoMode()) {
      setPartner(null);
      setSessions([]);
      setLoading(false);
      return;
    }
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
      if (partnerRes.status === 403) {
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
      toast.error("Couldn’t load partner link");
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
      if (res.status === 403) {
        toast.error("Sign in to invite your spouse");
        return;
      }
      if (!res.ok) throw new Error("invite failed");
      const data = (await res.json()) as Invite;
      setInvite(data);
      toast.success("Share link ready");
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
      toast.success("You’re linked — ready to watch together");
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
      toast.success("Unlinked");
      setPartner(null);
      setSessions([]);
      setSessionShareUrl(null);
    } catch {
      toast.error("Couldn’t unlink");
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
        toast.error((err as { error?: string }).error ?? "Couldn’t start watch-together");
        return;
      }
      const data = (await res.json()) as { id: number };
      const url = inviteUrl(`/match/${data.id}`);
      setSessionShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Watch-together link copied — send it to your spouse");
      } catch {
        toast.success("Watch-together deck ready — share the link below");
      }
      setLocation(`/match/${data.id}`);
    } catch {
      toast.error("Couldn’t start watch-together");
    } finally {
      setBusy(false);
    }
  };

  const copyInvite = async () => {
    if (!invite) return;
    const url = inviteUrl(invite.path);
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied");
    } catch {
      toast.message(url);
    }
  };

  const copySession = async (path: string) => {
    const url = inviteUrl(path);
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Watch-together link copied");
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
            Watch with your spouse
          </h1>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            Link another Cinevault account with a share link, then play a shared deck —
            when you both like a film, it&apos;s a match you can log to both diaries.
          </p>
        </div>

        <ol className="grid gap-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="font-mono text-foreground/80">1.</span>
            Share a link so they sign in and link accounts
          </li>
          <li className="flex gap-2">
            <span className="font-mono text-foreground/80">2.</span>
            Start watch-together and send them the session link
          </li>
          <li className="flex gap-2">
            <span className="font-mono text-foreground/80">3.</span>
            Swipe the same films — celebrate mutual likes
          </li>
        </ol>

        {isDemoMode() && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 space-y-3">
            <p className="text-sm text-amber-100">
              You&apos;re in demo mode. Together needs two signed-in accounts (you + spouse).
            </p>
            <Link href="/sign-in">
              <Button size="sm" className="bg-white text-black hover:bg-white/90">
                Sign in to use Together
              </Button>
            </Link>
          </div>
        )}

        {partner ? (
          <section className="space-y-5">
            <div className="rounded-xl border border-border bg-secondary/40 p-4 space-y-2">
              <p className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Heart className="w-3.5 h-3.5" /> Linked
              </p>
              <p className="text-sm">
                You&apos;re connected and ready to watch together.
              </p>
              <p className="text-xs text-muted-foreground">
                Linked {new Date(partner.createdAt).toLocaleDateString("en-IN")}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={startMatch} disabled={busy} className="gap-2">
                <Play className="w-4 h-4" />
                Play watch-together
              </Button>
              <Button variant="outline" onClick={unlink} disabled={busy} className="gap-2">
                <Unlink className="w-4 h-4" />
                Unlink
              </Button>
            </div>

            {sessionShareUrl && (
              <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Session link for your spouse
                </p>
                <p className="text-xs break-all text-muted-foreground">{sessionShareUrl}</p>
                <Button size="sm" variant="secondary" className="gap-2" onClick={() => {
                  void navigator.clipboard.writeText(sessionShareUrl).then(
                    () => toast.success("Copied"),
                    () => toast.message(sessionShareUrl),
                  );
                }}>
                  <Copy className="w-3.5 h-3.5" />
                  Copy again
                </Button>
              </div>
            )}

            {sessions.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold">Open sessions</h2>
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
                      <Button size="sm" variant="secondary" onClick={() => copySession(s.path)} className="gap-1">
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
                <Link2 className="w-4 h-4" /> Invite with a share link
              </h2>
              <p className="text-xs text-muted-foreground">
                They open the link, sign in to their own account, and you&apos;re linked.
              </p>
              <Button onClick={createInvite} disabled={busy || isDemoMode()}>
                Create share link
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
                    Copy share link
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
                  disabled={isDemoMode()}
                />
                <Button onClick={() => join()} disabled={busy || !joinCode.trim() || isDemoMode()}>
                  Link
                </Button>
              </div>
            </div>
          </section>
        )}

        <Link href="/swipe" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
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
  const [message, setMessage] = useState("Linking accounts…");

  useEffect(() => {
    if (!code) {
      setStatus("error");
      setMessage("Missing invite code");
      return;
    }
    if (isDemoMode()) {
      setStatus("error");
      setMessage("Sign in to redeem a spouse invite");
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
          setMessage((err as { error?: string }).error ?? "Couldn’t redeem invite");
          return;
        }
        setStatus("done");
        toast.success("You’re linked — ready to watch together");
        setLocation("/partner");
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMessage("Couldn’t redeem invite");
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
