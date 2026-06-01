import Link from "next/link";
import { CATEGORY_MAP, formatMoney, cn } from "@/lib/utils";
import type { Profile, Transaction } from "@/lib/db.types";
import Avatar from "@/components/Avatar";
import { format, parseISO, isToday, isYesterday } from "date-fns";
import { fr } from "date-fns/locale";

type BadgeTone = "warm" | "good" | "ink";
type Story = {
  actor: Profile | null;
  phrase: string;
  badge: { label: string; tone: BadgeTone } | null;
};

function shorten(name: string | undefined): string {
  return name ? name.split(" ")[0] : "?";
}

/**
 * Turn a raw transaction into a clear, conversational story for the viewer.
 * "Auxence a payé un billet TGV — 45 € à rembourser."
 */
function describe(
  tx: Transaction,
  viewer: Profile,
  profilesById: Map<string, Profile>,
  parentIds: Set<string>,
  childIds: Set<string>
): Story {
  const amount = Number(tx.amount);
  const cat = CATEGORY_MAP[tx.category];
  const concerns = tx.concerns_id ? profilesById.get(tx.concerns_id) ?? null : null;
  const creator = profilesById.get(tx.created_by) ?? null;

  const concernsIsChild = concerns ? childIds.has(concerns.id) : false;
  const concernsIsParent = concerns ? parentIds.has(concerns.id) : false;
  const creatorIsChild = creator ? childIds.has(creator.id) : false;

  const obj = (tx.description || cat?.label || "").toLowerCase().trim();
  const objPhrase = obj
    ? ` — ${tx.description ?? cat?.label}`
    : cat
    ? ` (${cat.label.toLowerCase()})`
    : "";

  // ---- Child expense (reimbursable) ----
  if (concernsIsChild && amount < 0) {
    const isMe = concerns?.id === viewer.id;
    const subj = isMe ? "Tu" : shorten(concerns?.full_name);
    const verb = isMe ? "as payé" : "a payé";
    return {
      actor: concerns,
      phrase: `${subj} ${verb}${objPhrase}`,
      badge: { label: "à rembourser", tone: "warm" },
    };
  }

  // ---- Parent → child credits ----
  if (concernsIsChild && amount > 0) {
    const isMeChild = concerns?.id === viewer.id;
    const subjGiver = creator
      ? shorten(creator.full_name)
      : "Un parent";
    const recipient = isMeChild ? "toi" : shorten(concerns?.full_name);

    switch (tx.category) {
      case "argent_de_poche":
        return {
          actor: creator,
          phrase: `${subjGiver} a donné de l'argent de poche à ${recipient}`,
          badge: null,
        };
      case "cadeau":
        return {
          actor: creator,
          phrase: `${subjGiver} a fait un cadeau à ${recipient}`,
          badge: null,
        };
      case "avance":
        return {
          actor: creator,
          phrase: `${subjGiver} a avancé de l'argent à ${recipient}`,
          badge: { label: `${recipient} doit rembourser`, tone: "warm" },
        };
      case "remboursement":
        return {
          actor: creator,
          phrase: `${subjGiver} a remboursé ${recipient}`,
          badge: { label: "soldé", tone: "good" },
        };
      default:
        return {
          actor: creator,
          phrase: `${subjGiver} a envoyé de l'argent à ${recipient}`,
          badge: null,
        };
    }
  }

  // ---- Child → parent (reimbursement) ----
  if (
    concernsIsParent &&
    amount > 0 &&
    creatorIsChild &&
    tx.category === "remboursement"
  ) {
    const isMeChild = creator?.id === viewer.id;
    const subj = isMeChild ? "Tu" : shorten(creator?.full_name);
    const verb = isMeChild ? "as remboursé" : "a remboursé";
    const target = concerns?.id === viewer.id ? "toi" : shorten(concerns?.full_name);
    return {
      actor: creator,
      phrase: `${subj} ${verb} ${target}`,
      badge: { label: "soldé", tone: "good" },
    };
  }

  // ---- Fallback ----
  const fallback = `${shorten(creator?.full_name)} : ${tx.description || cat?.label || "transaction"}`;
  return { actor: creator, phrase: fallback, badge: null };
}

function dayLabel(iso: string): string {
  const d = parseISO(iso);
  if (isToday(d)) return "Aujourd'hui";
  if (isYesterday(d)) return "Hier";
  return format(d, "EEEE d MMMM", { locale: fr });
}

export function HistoryItem({
  tx,
  viewer,
  profilesById,
  parentIds,
  childIds,
}: {
  tx: Transaction;
  viewer: Profile;
  profilesById: Map<string, Profile>;
  parentIds: Set<string>;
  childIds: Set<string>;
}) {
  const story = describe(tx, viewer, profilesById, parentIds, childIds);
  const cat = CATEGORY_MAP[tx.category];
  const amount = Number(tx.amount);
  const displayAmount = formatMoney(Math.abs(amount), tx.currency);
  const actor = story.actor;

  return (
    <Link
      href={`/transactions/${tx.id}`}
      className="flex items-center gap-3 py-3 px-3 -mx-3 rounded-2xl hover:bg-ink-50 active:bg-ink-100 transition"
    >
      {actor ? (
        <Avatar emoji={actor.avatar_emoji} url={actor.avatar_url} size="md" />
      ) : (
        <div className="w-11 h-11 rounded-full bg-ink-100 flex items-center justify-center text-lg">
          {cat?.emoji ?? "📌"}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-ink-900 leading-snug">{story.phrase}</div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-sm font-semibold tabular-nums text-ink-900">
            {displayAmount}
          </span>
          {story.badge && (
            <span
              className={cn(
                "text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wider",
                story.badge.tone === "warm" &&
                  "bg-warm-500/15 text-warm-700",
                story.badge.tone === "good" &&
                  "bg-good-500/15 text-good-700",
                story.badge.tone === "ink" && "bg-ink-100 text-ink-600"
              )}
            >
              {story.badge.label}
            </span>
          )}
        </div>
      </div>
      <div className="text-xs text-ink-400 whitespace-nowrap">
        {cat?.emoji}
      </div>
    </Link>
  );
}

export { dayLabel };
