"use client";

import Link from "next/link";

interface BackLinkProps {
  label: string;
  href?: string;
  onClick?: () => void;
  className?: string;
}

const BASE_CLASSNAME = "mb-3 text-xs font-medium text-text-muted hover:text-text-secondary";

export function BackLink({ label, href, onClick, className }: BackLinkProps) {
  const classNames = className ? `${BASE_CLASSNAME} ${className}` : BASE_CLASSNAME;

  if (href) {
    return (
      <Link href={href} className={classNames}>
        ← {label}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={classNames}>
      ← {label}
    </button>
  );
}
