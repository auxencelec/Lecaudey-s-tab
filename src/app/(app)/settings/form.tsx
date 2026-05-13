"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SUPPORTED_CURRENCIES } from "@/lib/utils";
import type { Profile } from "@/lib/db.types";
import Avatar from "@/components/Avatar";

export default function SettingsForm({
  me,
  email,
}: {
  me: Profile;
  email: string;
}) {
  const router = useRouter();
  const [currency, setCurrency] = useState(me.preferred_currency);
  const [avatar, setAvatar] = useState(me.avatar_emoji ?? "👤");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // Password change
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSaved, setPwdSaved] = useState(false);

  async function save() {
    setLoading(true);
    const supabase = createClient();
    await supabase
      .from("profiles")
      .update({ preferred_currency: currency, avatar_emoji: avatar })
      .eq("id", me.id);
    setSavedAt(Date.now());
    setLoading(false);
    router.refresh();
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdError(null);
    setPwdSaved(false);

    if (newPassword.length < 8) {
      setPwdError("Le mot de passe doit faire au moins 8 caractères.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setPwdLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPwdLoading(false);

    if (error) {
      setPwdError(error.message);
      return;
    }

    setPwdSaved(true);
    setNewPassword("");
    setConfirmPassword("");
    setTimeout(() => setPwdSaved(false), 4000);
  }

  return (
    <div className="space-y-7">
      {/* Identity */}
      <div className="text-center py-4">
        <Avatar emoji={avatar} size="xl" className="mx-auto" />
        <h2 className="text-xl font-semibold tracking-tight mt-3">
          {me.full_name}
        </h2>
        <p className="text-sm text-ink-500 mt-0.5">
          {me.role === "parent" ? "Parent" : "Enfant"} · {email}
        </p>
      </div>

      {/* Avatar emoji */}
      <Field label="Avatar">
        <input
          type="text"
          value={avatar}
          onChange={(e) => setAvatar(e.target.value.slice(0, 2))}
          maxLength={2}
          className="w-16 bg-ink-50 rounded-xl px-3 py-2 text-center text-xl focus:bg-white focus:ring-2 focus:ring-accent-500 outline-none transition"
        />
      </Field>

      {/* Currency */}
      <Field
        label="Devise d'affichage"
        hint="Tous les soldes et totaux seront convertis dans cette devise."
      >
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="w-full bg-ink-50 rounded-2xl px-4 py-3 focus:bg-white focus:ring-2 focus:ring-accent-500 outline-none transition font-medium"
        >
          {SUPPORTED_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={loading}
          className="bg-ink-900 hover:bg-ink-800 disabled:opacity-50 text-white font-medium px-5 py-3 rounded-2xl transition active:scale-[0.98]"
        >
          {loading ? "…" : "Enregistrer"}
        </button>
        {savedAt && (
          <span className="text-sm text-good-600">Enregistré ✓</span>
        )}
      </div>

      <hr className="border-ink-100" />

      {/* Password change */}
      <form onSubmit={changePassword} className="space-y-3">
        <h3 className="text-xs uppercase tracking-widest text-ink-400 font-medium">
          Mot de passe
        </h3>
        <Field label="Nouveau mot de passe">
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full bg-ink-50 rounded-2xl px-4 py-3 focus:bg-white focus:ring-2 focus:ring-accent-500 outline-none transition"
          />
        </Field>
        <Field label="Confirmer">
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full bg-ink-50 rounded-2xl px-4 py-3 focus:bg-white focus:ring-2 focus:ring-accent-500 outline-none transition"
          />
        </Field>

        {pwdError && (
          <div className="text-sm text-bad-600 bg-bad-500/10 rounded-xl px-3 py-2">
            {pwdError}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pwdLoading || !newPassword || !confirmPassword}
            className="bg-ink-900 hover:bg-ink-800 disabled:opacity-50 text-white font-medium px-5 py-3 rounded-2xl transition active:scale-[0.98]"
          >
            {pwdLoading ? "…" : "Changer le mot de passe"}
          </button>
          {pwdSaved && (
            <span className="text-sm text-good-600">Mis à jour ✓</span>
          )}
        </div>
      </form>

      <hr className="border-ink-100" />

      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="w-full bg-ink-50 hover:bg-bad-500/10 hover:text-bad-600 text-ink-700 font-medium py-3.5 rounded-2xl transition"
        >
          Se déconnecter
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-500 mb-2 px-1">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-ink-400 mt-1.5 px-1">{hint}</p>}
    </div>
  );
}
