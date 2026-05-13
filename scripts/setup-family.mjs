/**
 * One-time setup script:
 *   1. Creates auth users for each family member (Sébastien, Julie, Auxence, Callixte, Théoxane, Eudoxe).
 *   2. Creates their profile row (linked to the Lecaudey family).
 *   3. Creates a private space (parents ↔ child) for each child.
 *   4. Adds parents + child as members of that private space.
 *
 * Usage:
 *   cp .env.example .env.local
 *   # fill NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   node scripts/setup-family.mjs
 *
 * Run the SQL migration first (supabase/migrations/0001_init.sql + 0002_seed_family.sql)
 * via the Supabase SQL editor.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// --- Load .env.local manually (no dotenv dep) ---
try {
  const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] ??= m[2].trim().replace(/^"|"$/g, "");
  }
} catch {
  // ignore — env may be set externally
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis.");
  process.exit(1);
}

const FAMILY_ID = "00000000-0000-0000-0000-00000000fa01";

// Default password — chacun le changera après première connexion.
const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD ?? "Lecaudey2026!";

const FAMILY = [
  { full_name: "Sébastien Lecaudey", email: "sebastien@lecaudey.family", role: "parent", emoji: "👨", year: 1965, currency: "EUR" },
  { full_name: "Julie Lecaudey",     email: "julie@lecaudey.family",     role: "parent", emoji: "👩", year: 1968, currency: "EUR" },
  { full_name: "Auxence Lecaudey",   email: "auxence@lecaudey.family",   role: "child",  emoji: "🧑", year: 2001, currency: "EUR" },
  { full_name: "Callixte Lecaudey",  email: "callixte@lecaudey.family",  role: "child",  emoji: "👩‍🎓", year: 2003, currency: "EUR" },
  { full_name: "Théoxane Lecaudey",  email: "theoxane@lecaudey.family",  role: "child",  emoji: "👩‍🎨", year: 2005, currency: "EUR" },
  { full_name: "Eudoxe Lecaudey",    email: "eudoxe@lecaudey.family",    role: "child",  emoji: "🧒", year: 2010, currency: "EUR" },
];

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureFamily() {
  const { error } = await admin
    .from("families")
    .upsert({ id: FAMILY_ID, name: "Lecaudey", default_currency: "EUR" });
  if (error) throw error;
}

async function ensureUser(member) {
  // Try fetch existing user by listing — admin listUsers paginates.
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = list.users.find((u) => u.email === member.email);
  if (existing) return existing;

  const { data, error } = await admin.auth.admin.createUser({
    email: member.email,
    password: DEFAULT_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: member.full_name },
  });
  if (error) throw error;
  return data.user;
}

async function ensureProfile(user, member) {
  const { error } = await admin.from("profiles").upsert({
    id: user.id,
    family_id: FAMILY_ID,
    full_name: member.full_name,
    role: member.role,
    preferred_currency: member.currency,
    avatar_emoji: member.emoji,
    birth_year: member.year,
  });
  if (error) throw error;
}

async function ensurePrivateSpace(child, parents) {
  const name = `Espace ${child.full_name.split(" ")[0]}`;
  const { data: existing } = await admin
    .from("spaces")
    .select("id")
    .eq("owner_child_id", child.id)
    .eq("kind", "private")
    .maybeSingle();

  let spaceId = existing?.id;
  if (!spaceId) {
    const { data, error } = await admin
      .from("spaces")
      .insert({
        family_id: FAMILY_ID,
        name,
        kind: "private",
        default_currency: "EUR",
        owner_child_id: child.id,
        created_by: parents[0]?.id ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    spaceId = data.id;
  }

  const memberRows = [child, ...parents].map((p) => ({
    space_id: spaceId,
    profile_id: p.id,
  }));
  const { error: smErr } = await admin
    .from("space_members")
    .upsert(memberRows, { onConflict: "space_id,profile_id" });
  if (smErr) throw smErr;
}

async function main() {
  console.log("→ Vérif/création famille…");
  await ensureFamily();

  const created = [];
  for (const m of FAMILY) {
    console.log(`→ ${m.full_name} (${m.email})`);
    const user = await ensureUser(m);
    await ensureProfile(user, m);
    created.push({ ...m, id: user.id });
  }

  const parents = created.filter((m) => m.role === "parent");
  const children = created.filter((m) => m.role === "child");

  console.log("→ Espaces privés enfant ↔ parents…");
  for (const c of children) {
    console.log(`  · ${c.full_name}`);
    await ensurePrivateSpace(c, parents);
  }

  console.log("\n✅ Famille initialisée !");
  console.log("\nIdentifiants (mot de passe par défaut: " + DEFAULT_PASSWORD + "):");
  for (const m of created) {
    console.log(`  ${m.email}  →  ${m.full_name} (${m.role})`);
  }
  console.log("\n⚠️  Chaque membre devrait changer son mot de passe à la première connexion.");
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
