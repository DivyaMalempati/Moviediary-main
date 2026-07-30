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

export default function PartnerPage() {
  const [, setLocation] = useLocation();
  const [partner, setPartner] = useState<PartnerInfo>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (isDemoMode()) {
      setPartner(null);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${BASE}/api/partners`, {
        headers: await getAuthHeaders(),
        credentials: "include",
      });
      if (res.status === 403) {
        setPartner(null);
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error("Failed to load partner");
      const data = (await res.json()) as { partner: PartnerInfo };
      setPartner(data.partner);
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
        toast.error("Sign in to invite a partner");
        return;
      }
      if (!res.ok) throw new Error("invite failed");
      const data = (await res.json()) as Invite;
      setInvite(data);
      toast.success("Invite ready — share the code");
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
      toast.success("Partner linked!");
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
      toast.success("Partner unlinked");
      setPartner(null);
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
        toast.error((err as { error?: string }).error ?? "Couldn’t start match deck");
        return;
      }
      const data = (await res.json()) as { id: number };
      setLocation(`/match/${data.id}`);
    } catch {
      toast.error("Couldn’t start match deck");
    } finally {
      setBusy(false);
    }
  };

  const copyInvite = async () => {
    if (!invite) return;
    const url = `${window.location.origin}${BASE}${invite.path}`;
    try {
      await navigator.clipboard.writeText(`${invite.code}\n${url}`);
      toast.success("Invite copied");
    } catch {
      toast.message(invite.code);
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
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            Watch with a partner
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Link profiles, swipe the same deck, and celebrate when you both like a film.
          </p>
        </div>

        {isDemoMode() && (
          <p className="text-sm text-amber-200/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
            Partner matching needs a signed-in account. Exit demo mode and sign in first.
          </p>
        )}

        {partner ? (
          <section className="space-y-4">
            <div className="rounded-xl border border-border bg-secondary/40 p-4 space-y-2">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Linked</p>
              <p className="font-mono text-sm break-all">{partner.partnerUserId}</p>
              <p className="text-xs text-muted-foreground">
                Since {new Date(partner.createdAt).toLocaleDateString("en-IN")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={startMatch} disabled={busy} className="gap-2">
                <Shuffle className="w-4 h-4" />
                Start match deck
              </Button>
              <Button variant="outline" onClick={unlink} disabled={busy} className="gap-2">
                <Unlink className="w-4 h-4" />
                Unlink
              </Button>
            </div>
          </section>
        ) : (
          <section className="space-y-6">
            <div className="space-y-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Link2 className="w-4 h-4" /> Create invite
              </h2>
              <Button onClick={createInvite} disabled={busy || isDemoMode()}>
                Generate pair code
              </Button>
              {invite && (
                <div className="rounded-xl border border-border bg-secondary/40 p-4 space-y-3">
                  <p className="font-mono text-lg tracking-wide">{invite.code}</p>
                  <p className="text-xs text-muted-foreground break-all">
                    {typeof window !== "undefined"
                      ? `${window.location.origin}${BASE}${invite.path}`
                      : invite.path}
                  </p>
                  <Button size="sm" variant="secondary" onClick={copyInvite} className="gap-2">
                    <Copy className="w-3.5 h-3.5" />
                    Copy invite
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h2 className="text-sm font-semibold">Join with a code</h2>
              <div className="flex gap-2">
                <Input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="reel-a1b2c3d4"
                  className="font-mono"
                  disabled={isDemoMode()}
                />
                <Button onClick={() => join()} disabled={busy || !joinCode.trim() || isDemoMode()}>
                  Join
                </Button>
              </div>
            </div>
          </section>
        )}

        <Link href="/swipe" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          Back to solo swipe <ArrowRight className="w-3.5 h-3.5" />
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
  const [message, setMessage] = useState("Linking partner…");

  useEffect(() => {
    if (!code) {
      setStatus("error");
      setMessage("Missing invite code");
      return;
    }
    if (isDemoMode()) {
      setStatus("error");
      setMessage("Sign in to redeem a partner invite");
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
        toast.success("Partner linked!");
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
            Open partner page
          </Button>
        )}
      </div>
    </Layout>
  );
}
