import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isMarketingPublic = createRouteMatcher([
  "/marketing-contact/sign-in(.*)",
  "/marketing-contact/sign-up(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isMarketingPublic(req)) {
    await auth.protect();
  }
});

// Matcher is intentionally narrow: Clerk only runs on the Marketing Contact
// section. Every other route in this app (/, /admin, /email-hub, /asset-hub,
// /content-hub, all /api/* outside this section, all crons) is unaffected.
export const config = {
  matcher: ["/marketing-contact/:path*", "/api/marketing-contact/:path*"],
};
