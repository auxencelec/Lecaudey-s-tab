"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="min-h-dvh flex items-center justify-center px-6 bg-white">
      <div className="w-full max-w-sm">
        <div className="mb-10">
          <div className="w-12 h-12 rounded-2xl bg-accent-600 text-white flex items-center justify-center text-2xl shadow-lg shadow-accent-600/20 mb-6">
            ✦
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Bienvenue</h1>
          <p className="text-ink-500 mt-1.5">
            Connecte-toi à l&apos;espace famille
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1.5">
              Email
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-ink-50 rounded-2xl px-4 py-3.5 text-ink-900 placeholder-ink-400 focus:bg-white focus:ring-2 focus:ring-accent-500 outline-none transition"
              placeholder="prenom@lecaudey.family"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1.5">
              Mot de passe
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-ink-50 rounded-2xl px-4 py-3.5 text-ink-900 placeholder-ink-400 focus:bg-white focus:ring-2 focus:ring-accent-500 outline-none transition"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="text-sm text-bad-600 bg-bad-500/10 rounded-xl px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-ink-900 hover:bg-ink-800 disabled:opacity-50 text-white font-medium py-3.5 rounded-2xl transition active:scale-[0.98]"
          >
            {loading ? "Connexion…" : "Continuer"}
          </button>
        </form>

        <p className="text-xs text-center text-ink-400 mt-8">
          Pas de compte ? Demande à un parent.
        </p>
      </div>
    </main>
  );
}
