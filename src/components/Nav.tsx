"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const leftLinks = [
  { href: "/", label: "Link Builder" },
  { href: "/content-hub", label: "Content Hub" },
  { href: "/email-hub", label: "Email Hub" },
  { href: "/asset-hub", label: "Asset Hub" },
];

const rightLinks = [
  { href: "/marketing-contact", label: "Marketing Activities" },
  { href: "/admin", label: "Admin" },
];

export default function Nav() {
  const pathname = usePathname();

  function renderLink({ href, label }: { href: string; label: string }) {
    const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
          active
            ? "bg-gray-900 text-white"
            : "text-stone-600 hover:bg-stone-100"
        }`}
      >
        {label}
      </Link>
    );
  }

  return (
    <nav className="border-b border-stone-200 bg-white">
      <div className="mx-auto max-w-7xl flex items-center gap-6 px-4 py-3">
        <span className="text-sm font-bold text-gray-900">Marketing IO</span>
        <div className="flex gap-1">{leftLinks.map(renderLink)}</div>
        <div className="ml-auto flex gap-1">{rightLinks.map(renderLink)}</div>
      </div>
    </nav>
  );
}
