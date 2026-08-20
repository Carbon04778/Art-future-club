import React, { useState } from "react";
import { Lock, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Password field with a show/hide toggle.
 *
 * A single component rather than the toggle repeated in five places across
 * Login, Register and ResetPassword — so the behaviour, the icon and the
 * accessible label can only ever be changed in one place.
 *
 * The toggle is a button, not a checkbox, and is excluded from the tab order
 * so it does not sit between the two password fields when someone tabs
 * through the form.
 */
export default function PasswordInput({
  id,
  value,
  onChange,
  placeholder = "••••••••",
  autoComplete = "current-password",
  autoFocus = false,
  required = true,
  className = "",
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Lock
        className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        required={required}
        // Extra right padding so long passwords never run under the toggle.
        className={`h-12 pl-10 pr-11 ${className}`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        // Not in the tab order: tabbing should move between fields, not stop
        // on a display toggle.
        tabIndex={-1}
        aria-label={visible ? "Hide password" : "Show password"}
        title={visible ? "Hide password" : "Show password"}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
