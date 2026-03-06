"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { authClient } from "@/lib/auth-client";

type CandidateStatus = "voting" | "accepted" | "declined";
type VoteValue = "check" | "x" | "maybe";

type Candidate = {
  id: string;
  status: CandidateStatus;
  sourceMarkdown: string;
  discordMessageUrl: string;
  createdAt: string;
  currentRoundNumber: number | null;
  yesVotes: number;
  noVotes: number;
  maybeVotes: number;
  myVote: VoteValue | null;
};

function preserveMarkdownLineBreaks(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const transformed: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const nextLine = lines[i + 1];
    const shouldForceBreak =
      line.trim().length > 0 &&
      nextLine !== undefined &&
      nextLine.trim().length > 0;

    transformed.push(shouldForceBreak ? `${line}  ` : line);
  }

  return transformed.join("\n");
}

function formatDate(value: string): string {
  const date = new Date(value);
  return date.toLocaleString();
}

export function BoardClient({
  discordUserId,
  canVote,
  canModerate,
  initialCandidates,
}: {
  discordUserId: string;
  canVote: boolean;
  canModerate: boolean;
  initialCandidates: Candidate[];
}) {
  const [candidates, setCandidates] = useState<Candidate[]>(initialCandidates);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signOutPending, setSignOutPending] = useState(false);

  const refreshCandidates = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setError(null);
    }

    const candidateResponse = await fetch("/api/candidates", { cache: "no-store" });

    if (!candidateResponse.ok) {
      const payload = (await candidateResponse.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? "Failed to load candidates.");
    }

    const candidatePayload = (await candidateResponse.json()) as { candidates: Candidate[] };
    setCandidates(candidatePayload.candidates);
  }, []);

  useEffect(() => {
    refreshCandidates({ silent: true }).catch((requestError) => {
      setError(requestError instanceof Error ? requestError.message : "Load failed.");
    });
  }, [refreshCandidates]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      refreshCandidates({ silent: true }).catch(() => {});
    }, 10000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshCandidates({ silent: true }).catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshCandidates]);

  const castVote = useCallback(
    async (candidateId: string, vote: VoteValue) => {
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

        setCandidates((current) =>
          current.map((candidate) =>
            candidate.id === candidateId
              ? {
                  ...candidate,
                  myVote: vote,
                }
              : candidate
          )
        );
        await refreshCandidates({ silent: true });
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

        setCandidates((current) =>
          current.map((candidate) =>
            candidate.id === candidateId
              ? {
                  ...candidate,
                  myVote: null,
                }
              : candidate
          )
        );
        await refreshCandidates({ silent: true });
      } catch (restartError) {
        setError(restartError instanceof Error ? restartError.message : "Restart failed.");
      } finally {
        setBusyId(null);
      }
    },
    [refreshCandidates]
  );

  const deleteEntry = useCallback(
    async (candidateId: string) => {
      const confirmed = window.confirm("Delete this candidate from the board?");
      if (!confirmed) {
        return;
      }

      setBusyId(candidateId);
      setError(null);

      try {
        const response = await fetch(`/api/candidates/${candidateId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };
          throw new Error(payload.error ?? "Unable to delete candidate.");
        }

        setCandidates((current) => current.filter((candidate) => candidate.id !== candidateId));
        await refreshCandidates({ silent: true });
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : "Delete failed.");
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
            onDelete={deleteEntry}
          />
          <Column
            title="Accepted"
            items={grouped.accepted}
            busyId={busyId}
            canVote={false}
            canModerate={canModerate}
            onVote={castVote}
            onRestart={restartVote}
            onDelete={deleteEntry}
          />
          <Column
            title="Declined"
            items={grouped.declined}
            busyId={busyId}
            canVote={false}
            canModerate={canModerate}
            onVote={castVote}
            onRestart={restartVote}
            onDelete={deleteEntry}
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
  onDelete,
}: {
  title: string;
  items: Candidate[];
  busyId: string | null;
  canVote: boolean;
  canModerate: boolean;
  onVote: (candidateId: string, vote: VoteValue) => void;
  onRestart: (candidateId: string) => void;
  onDelete: (candidateId: string) => void;
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
          const cardVoteClass =
            candidate.maybeVotes > 0
              ? " card-voted-maybe"
              : candidate.myVote === "check"
                ? " card-voted-check"
                : candidate.myVote === "x"
                  ? " card-voted-x"
                  : "";

          return (
            <article className={`card${cardVoteClass}`} key={candidate.id}>
              <div className="card-head">
                <span className="badge">Round {candidate.currentRoundNumber ?? "-"}</span>
                <a className="meta-link" href={candidate.discordMessageUrl} target="_blank" rel="noreferrer">
                  Open Discord source
                </a>
              </div>

              <div className="markdown">
                <ReactMarkdown>{preserveMarkdownLineBreaks(candidate.sourceMarkdown)}</ReactMarkdown>
              </div>

              <div className="vote-row">
                <span className="vote-pill">{formatDate(candidate.createdAt)}</span>
                <span className="vote-pill">Checks: {candidate.yesVotes}</span>
                <span className="vote-pill">Xs: {candidate.noVotes}</span>
                <span className="vote-pill">Maybes: {candidate.maybeVotes}</span>
              </div>

              <div className="vote-row">
                <button
                  className={`btn btn-ok${candidate.myVote === "check" ? " btn-selected" : ""}`}
                  type="button"
                  onClick={() => onVote(candidate.id, "check")}
                  disabled={!canVote || !votingOpen || isBusy || candidate.myVote === "check"}
                >
                  Checkmark
                </button>
                <button
                  className={`btn btn-bad${candidate.myVote === "x" ? " btn-selected" : ""}`}
                  type="button"
                  onClick={() => onVote(candidate.id, "x")}
                  disabled={!canVote || !votingOpen || isBusy || candidate.myVote === "x"}
                >
                  X
                </button>
                <button
                  className={`btn btn-maybe${candidate.myVote === "maybe" ? " btn-selected" : ""}`}
                  type="button"
                  onClick={() => onVote(candidate.id, "maybe")}
                  disabled={!canVote || !votingOpen || isBusy || candidate.myVote === "maybe"}
                >
                  Maybe
                </button>
                {canModerate ? (
                  <button className="btn" type="button" onClick={() => onRestart(candidate.id)} disabled={isBusy}>
                    Restart Re-vote
                  </button>
                ) : null}
                {canModerate ? (
                  <button
                    className="btn btn-delete"
                    type="button"
                    onClick={() => onDelete(candidate.id)}
                    disabled={isBusy}
                  >
                    Delete
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
