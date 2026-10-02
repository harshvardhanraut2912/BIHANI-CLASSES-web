"use client";

import { useState } from "react";
import { getInitials } from "./helpers";

/**
 * Shows the student's avatar_url image if present and loadable,
 * otherwise falls back to a gradient circle with their initials.
 */
export default function Avatar({ profile, imgClassName, fallbackClassName }) {
  const [errored, setErrored] = useState(false);

  if (profile?.avatar_url && !errored) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={profile.avatar_url}
        alt={profile.full_name || "Student"}
        className={imgClassName}
        onError={() => setErrored(true)}
      />
    );
  }

  return <div className={fallbackClassName}>{getInitials(profile?.full_name)}</div>;
}