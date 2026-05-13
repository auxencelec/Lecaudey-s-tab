export type Role = "parent" | "child";
export type SpaceKind = "private" | "group";
export type AdvanceStatus = "open" | "partial" | "closed";
export type Frequency = "weekly" | "biweekly" | "monthly";

export type Profile = {
  id: string;
  family_id: string;
  full_name: string;
  role: Role;
  preferred_currency: string;
  avatar_emoji: string | null;
  birth_year: number | null;
  created_at: string;
};

export type Family = {
  id: string;
  name: string;
  default_currency: string;
  created_at: string;
};

export type Space = {
  id: string;
  family_id: string;
  name: string;
  kind: SpaceKind;
  default_currency: string;
  owner_child_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type SpaceMember = {
  space_id: string;
  profile_id: string;
  added_at: string;
};

export type Transaction = {
  id: string;
  space_id: string;
  created_by: string;
  concerns_id: string | null;
  amount: number;
  currency: string;
  category:
    | "argent_de_poche"
    | "vacances"
    | "loyer"
    | "transport"
    | "cadeau"
    | "avance"
    | "remboursement"
    | "autre";
  description: string | null;
  occurred_on: string;
  created_at: string;
};

export type Advance = {
  id: string;
  family_id: string;
  space_id: string | null;
  debtor_id: string;
  creditor_id: string;
  amount: number;
  currency: string;
  remaining: number;
  description: string | null;
  status: AdvanceStatus;
  source_transaction_id: string | null;
  created_at: string;
  closed_at: string | null;
};

export type Allowance = {
  id: string;
  family_id: string;
  child_id: string;
  amount: number;
  currency: string;
  frequency: Frequency;
  day_of_period: number;
  active: boolean;
  last_paid_on: string | null;
  created_at: string;
};
