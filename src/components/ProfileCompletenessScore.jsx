import React from "react";
import { Link } from "react-router-dom";
import { Circle } from "lucide-react";

const CHECKS = [
  { key: "avatar_url", label: "Profile photo", weight: 15 },
  { key: "bio", label: "Bio / practice statement", weight: 20 },
  { key: "discipline", label: "Discipline set", weight: 10 },
  { key: "chapter", label: "AFC chapter", weight: 10 },
  { key: "based_in", label: "Location", weight: 5 },
  { key: "website", label: "Website link", weight: 10 },
  { key: "instagram", label: "Instagram handle", weight: 5 },
  { key: "portfolio_works", label: "At least one portfolio work", weight: 25, check: (v) => Array.isArray(v) && v.length > 0 },
];

export default function ProfileCompletenessScore({ profile }) {
  if (!profile) return null;

  const completed = CHECKS.filter((c) => c.check ? c.check(profile[c.key]) : !!profile[c.key]);
  const score = completed.reduce((sum, c) => sum + c.weight, 0);
  const missing = CHECKS.filter((c) => !(c.check ? c.check(profile[c.key]) : !!profile[c.key]));

  const color = score >= 80 ? "text-green-600" : score >= 50 ? "text-primary" : "text-yellow-600";
  const barColor = score >= 80 ? "bg-green-500" : score >= 50 ? "bg-primary" : "bg-yellow-500";

  if (score === 100) return (
    <div className="border border-green-600 p-5 mb-8">
      <p className="font-mono-caps text-[11px] text-green-600">Profile complete ✓ — Your profile is fully optimised.</p>
    </div>
  );

  return (
    <div className="border border-border p-5 mb-8">
      <div className="flex items-center justify-between mb-3">
        <p className="font-mono-caps text-[11px] text-muted-foreground">Profile Completeness</p>
        <span className={`font-heading text-2xl ${color}`}>{score}%</span>
      </div>
      <div className="h-1.5 bg-muted w-full mb-4">
        <div className={`h-1.5 ${barColor} transition-all duration-700`} style={{ width: `${score}%` }} />
      </div>
      {missing.length > 0 && (
        <div>
          <p className="font-mono-caps text-[10px] text-muted-foreground mb-2">Complete to improve your profile:</p>
          <ul className="space-y-1.5">
            {missing.slice(0, 3).map((c) => (
              <li key={c.key} className="flex items-center gap-2">
                <Circle className="h-3 w-3 text-muted-foreground" />
                <span className="font-mono-caps text-[11px] text-muted-foreground">{c.label}</span>
                <span className="font-mono-caps text-[10px] text-primary">+{c.weight}%</span>
              </li>
            ))}
          </ul>
          <Link to="/profile/edit" className="mt-4 inline-block font-mono-caps text-[11px] text-primary hover:underline">Complete your profile →</Link>
        </div>
      )}
    </div>
  );
}