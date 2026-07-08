import { FormEvent, useState } from "react";
import { useIdentity } from "../lib/identity";
import { getUserByUsername } from "../lib/sleeperApi";
import { Button } from "./ui/Button";

const UsernameGate = ({ children }: { children: React.ReactNode }) => {
  const { username, ready, setUsername } = useIdentity();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ready) return null;
  if (username) return <>{children}</>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const candidate = input.trim();
    if (!candidate) return;
    setBusy(true);
    try {
      const user = await getUserByUsername(candidate);
      if (!user?.user_id) throw new Error("Username not found on Sleeper.");
      setUsername(candidate);
    } catch {
      setError("That username doesn't exist on Sleeper.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-3 rounded-2xl border border-ink-200 bg-white p-7 shadow-lg"
      >
        <h1 className="text-2xl font-semibold tracking-tight">Welcome</h1>
        <p className="text-sm text-ink-500">
          Enter your Sleeper username to load your league. Saved on this device.
        </p>
        <input
          autoFocus
          autoComplete="username"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Sleeper username"
          className="w-full rounded-md border border-ink-300 px-3 py-2.5 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 sm:py-2 sm:text-sm"
        />
        <Button
          type="submit"
          disabled={busy || !input.trim()}
          className="w-full"
        >
          {busy ? "Checking..." : "Continue"}
        </Button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </div>
  );
};

export default UsernameGate;
