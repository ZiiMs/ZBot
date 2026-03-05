"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignInClient({ callbackURL }: { callbackURL: string }) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startDiscordSignIn() {
    setError(null);
    setIsPending(true);

    try {
      const response = await authClient.signIn.social({
        provider: "discord",
        callbackURL,
        disableRedirect: true,
      });

      if (response.error) {
        throw new Error(response.error.message ?? "Discord sign-in failed.");
      }

      const redirectUrl = response.data?.url;
      if (!redirectUrl) {
        throw new Error("No provider redirect URL returned by auth server.");
      }

      window.location.assign(redirectUrl);
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "Discord sign-in failed.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <button className="btn btn-accent" type="button" onClick={startDiscordSignIn} disabled={isPending}>
        {isPending ? "Redirecting..." : "Continue with Discord"}
      </button>
      {error ? <p className="notice" style={{ marginTop: "0.75rem" }}>{error}</p> : null}
    </>
  );
}
