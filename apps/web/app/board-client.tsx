"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { authClient } from "@/lib/auth-client";

type CandidateStatus = "voting" | "accepted" | "declined";

type Candidate = {
  id: string;
  status: CandidateStatus;
  sourceMarkdown: string;
  discordMessageUrl: string;
  createdAt: string;
  currentRoundNumber: number | null;
  yesVotes: number;
  noVotes: number;
};

function formatDate(value: string): string {
  const date = new Date(value);
  return date.toLocaleString();
}

export function BoardClient({
  discordUserId,
  canVote,
  canModerate,
}: {
  discordUserId: string;
  canVote: boolean;
  canModerate: boolean;
}) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signOutPending, setSignOutPending] = useState(false);

  const refreshCandidates = useCallback(async () => {
    setError(null);

    const candidateResponse = await fetch("/api/candidates", { cache: "no-store" });

    if (!candidateResponse.ok) {
      const payload = (await candidateResponse.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? "Failed to load candidates.");
    }

    const candidatePayload = (await candidateResponse.json()) as { candidates: Candidate[] };
    setCandidates(candidatePayload.candidates);
  }, []);

  useEffect(() => {
    refreshCandidates().catch((requestError) => {
      setError(requestError instanceof Error ? requestError.message : "Load failed.");
    });
  }, [refreshCandidates]);

  const castVote = useCallback(
    async (candidateId: string, vote: "check" | "x") => {
      setBusyId(candidateId);
      setError(null);

      try {
        const response = await fetch(`/api/candidates/${candidateId}/vote`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ vote }),
        });

        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };
          throw new Error(payload.error ?? "Unable to submit vote.");
        }

        await refreshCandidates();
      } catch (voteError) {
        setError(voteError instanceof Error ? voteError.message : "Vote failed.");
      } finally {
        setBusyId(null);
      }
    },
    [refreshCandidates]
  );

  const restartVote = useCallback(
    async (candidateId: string) => {
      const reason = window.prompt("Optional restart reason:") ?? "";
      setBusyId(candidateId);
      setError(null);

      try {
        const response = await fetch(`/api/candidates/${candidateId}/restart`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ reason }),
        });

        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };
          throw new Error(payload.error ?? "Unable to restart vote.");
        }

        await refreshCandidates();
      } catch (restartError) {
        setError(restartError instanceof Error ? restartError.message : "Restart failed.");
      } finally {
        setBusyId(null);
      }
    },
    [refreshCandidates]
  );

  const grouped = useMemo(() => {
    return {
      voting: candidates.filter((candidate) => candidate.status === "voting"),
      accepted: candidates.filter((candidate) => candidate.status === "accepted"),
      declined: candidates.filter((candidate) => candidate.status === "declined"),
    };
  }, [candidates]);

  const handleSignOut = useCallback(async () => {
    setError(null);
    setSignOutPending(true);
    try {
      await authClient.signOut();
      window.location.assign("/sign-in?callbackURL=%2F");
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : "Sign out failed.");
    } finally {
      setSignOutPending(false);
    }
  }, []);

  return (
    <main>
      {error ? <p className="notice">{error}</p> : null}
      <section className="board-shell">
        <header className="board-header">
          <div>
            <h1 className="board-title">Recruitment Board</h1>
            <p className="board-subtitle">
              Forwarded Discord posts flow here, voting is role-gated, and outcomes auto-finalize.
            </p>
          </div>
          <div className="header-actions">
            <span className="badge">User: {discordUserId}</span>
            <button className="btn" type="button" onClick={handleSignOut} disabled={signOutPending}>
              {signOutPending ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </header>

        <div className="columns">
          <Column
            title="Voting"
            items={grouped.voting}
            busyId={busyId}
            canVote={canVote}
            canModerate={canModerate}
            onVote={castVote}
            onRestart={restartVote}
          />
          <Column
            title="Accepted"
            items={grouped.accepted}
            busyId={busyId}
            canVote={false}
            canModerate={canModerate}
            onVote={castVote}
            onRestart={restartVote}
          />
          <Column
            title="Declined"
            items={grouped.declined}
            busyId={busyId}
            canVote={false}
            canModerate={canModerate}
            onVote={castVote}
            onRestart={restartVote}
          />
        </div>
      </section>
    </main>
  );
}

function Column({
  title,
  items,
  busyId,
  canVote,
  canModerate,
  onVote,
  onRestart,
}: {
  title: string;
  items: Candidate[];
  busyId: string | null;
  canVote: boolean;
  canModerate: boolean;
  onVote: (candidateId: string, vote: "check" | "x") => void;
  onRestart: (candidateId: string) => void;
}) {
  return (
    <section className="column">
      <h2>
        {title} <span className="badge">{items.length}</span>
      </h2>
      <div className="candidate-list">
        {items.length === 0 ? <p className="board-subtitle">No candidates in this section.</p> : null}
        {items.map((candidate) => {
          const isBusy = busyId === candidate.id;
          const votingOpen = candidate.status === "voting";

          return (
            <article className="card" key={candidate.id}>
              <div className="card-head">
                <span className="badge">Round {candidate.currentRoundNumber ?? "-"}</span>
                <a className="meta-link" href={candidate.discordMessageUrl} target="_blank" rel="noreferrer">
                  Open Discord source
                </a>
              </div>

              <div className="markdown">
                <ReactMarkdown>{candidate.sourceMarkdown}</ReactMarkdown>
              </div>

              <div className="vote-row">
                <span className="vote-pill">{formatDate(candidate.createdAt)}</span>
                <span className="vote-pill">Checks: {candidate.yesVotes}</span>
                <span className="vote-pill">Xs: {candidate.noVotes}</span>
              </div>

              <div className="vote-row">
                <button
                  className="btn btn-ok"
                  type="button"
                  onClick={() => onVote(candidate.id, "check")}
                  disabled={!canVote || !votingOpen || isBusy}
                >
                  Checkmark
                </button>
                <button
                  className="btn btn-bad"
                  type="button"
                  onClick={() => onVote(candidate.id, "x")}
                  disabled={!canVote || !votingOpen || isBusy}
                >
                  X
                </button>
                {canModerate ? (
                  <button className="btn" type="button" onClick={() => onRestart(candidate.id)} disabled={isBusy}>
                    Restart Re-vote
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
