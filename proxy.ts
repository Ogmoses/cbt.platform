import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refreshes the Supabase auth cookie on every request (required for
 * @supabase/ssr — without this, sessions silently go stale) and redirects
 * signed-out visitors away from the three portals. Role-specific access
 * (e.g. a teacher hitting /admin) is still enforced by RLS + each page's
 * own checks — this only answers "is anyone signed in at all".
 *
 * Next.js 16 renamed the `middleware.ts` file convention to `proxy.ts`
 * (and the exported function from `middleware` to `proxy`) — this is that
 * file under its current name. The runtime is fixed to Node.js here,
 * which @supabase/ssr's cookie handling is fine with.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: auth } = await supabase.auth.getUser();

  const isProtected = ["/admin", "/teacher", "/student", "/profile", "/owner"].some((p) => request.nextUrl.pathname.startsWith(p));
  if (isProtected && !auth.user) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
