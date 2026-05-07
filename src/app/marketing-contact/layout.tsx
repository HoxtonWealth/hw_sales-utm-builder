import { ClerkProvider } from "@clerk/nextjs";

export default function MarketingContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ClerkProvider>{children}</ClerkProvider>;
}
