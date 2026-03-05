import { SignInClient } from "./sign-in-client";

interface SignInPageProps {
  searchParams: Promise<{
    callbackURL?: string;
  }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const callbackURL = params.callbackURL || "/";

  return (
    <main>
      <section className="board-shell" style={{ maxWidth: 560, margin: "2.5rem auto" }}>
        <header className="board-header">
          <div>
            <h1 className="board-title">Sign in Required</h1>
            <p className="board-subtitle">Authenticate with Discord to access the recruitment board.</p>
          </div>
        </header>
        <div style={{ padding: "1rem 1.25rem" }}>
          <SignInClient callbackURL={callbackURL} />
        </div>
      </section>
    </main>
  );
}
