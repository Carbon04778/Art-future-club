import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Search, Check } from "lucide-react";

const ROLES = [
  { value: "user", label: "Member", hint: "Standard access" },
  { value: "editor", label: "Editor", hint: "Can write and publish articles" },
  { value: "admin", label: "Admin", hint: "Full access" },
];

/**
 * Assign roles to people who already have an account.
 *
 * Accounts cannot be created from here, and deliberately so: creating a login
 * requires a privileged key that must never be present in a browser. Invite
 * people through Supabase → Authentication → Users → Invite user, or have
 * them register on the site; then promote them here.
 *
 * Requires migration 010, which adds 'editor' to the allowed roles.
 */
export default function AdminMembersPanel() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const load = () => {
    setLoading(true);
    base44.entities.Profile
      ? base44.entities.Profile.list("-created_date", 500)
          .then(setMembers)
          .catch(() => setMembers([]))
          .finally(() => setLoading(false))
      : setLoading(false);
  };

  useEffect(load, []);

  const changeRole = async (member, role) => {
    if (role === member.role) return;
    setError("");
    setDone("");
    setSavingId(member.id);
    try {
      await base44.entities.Profile.update(member.id, { role });
      setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, role } : m)));
      setDone(`${member.email} is now ${ROLES.find((r) => r.value === role)?.label}.`);
    } catch (e) {
      const msg = String(e?.message || e);
      setError(
        /row-level security|policy|service_role/i.test(msg)
          ? "Roles can only be changed from the Supabase SQL editor. Run migration 010, then use: update public.profiles set role = 'editor' where email = '…';"
          : /check constraint/i.test(msg)
          ? "The 'editor' role is not enabled yet. Run migration 010_editor_role.sql in Supabase."
          : msg
      );
    } finally {
      setSavingId(null);
    }
  };

  const filtered = members.filter((m) =>
    `${m.email || ""} ${m.full_name || ""}`.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="border border-border bg-card p-6">
      <h3 className="font-heading text-2xl tracking-[-0.01em]">Members &amp; roles</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Editors can write and publish editorial articles. They cannot moderate
        the forum, read enquiries, or see the newsletter list.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        People must have an account before they appear here. Invite them from
        Supabase → Authentication → Users, or ask them to register.
      </p>

      <div className="relative mt-6">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email"
          className="w-full border border-border bg-background py-3 pl-10 pr-4 text-base outline-none focus:border-primary"
        />
      </div>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      {done && (
        <p className="mt-4 flex items-center gap-2 text-sm text-primary">
          <Check className="h-4 w-4" /> {done}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {members.length === 0 ? "No members yet." : "No one matches that search."}
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-border border-t border-border">
          {filtered.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-4 py-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-body text-sm">{m.full_name || m.email}</p>
                {m.full_name && (
                  <p className="truncate font-mono-caps text-[10px] text-muted-foreground">
                    {m.email}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {savingId === m.id && (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                )}
                <select
                  value={m.role || "user"}
                  disabled={savingId === m.id}
                  onChange={(e) => changeRole(m, e.target.value)}
                  className="border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
