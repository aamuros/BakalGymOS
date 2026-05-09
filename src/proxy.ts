import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  canAccessModule,
  getDefaultPathForRole,
  isAppRole,
  type AppRole,
} from "@/lib/auth/permissions";
import { protectedModuleHrefs } from "@/lib/modules";

function getProtectedRoute(pathname: string) {
  const route = protectedModuleHrefs.find(
    (href) => pathname === href || pathname.startsWith(`${href}/`),
  );

  return route;
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const pathname = request.nextUrl.pathname;
  const requestedModule = getProtectedRoute(pathname);
  const isAppIndex = pathname === "/";
  const isUnauthorized = pathname === "/unauthorized";

  if (!requestedModule && pathname !== "/login" && !isAppIndex && !isUnauthorized) {
    return response;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (requestedModule || isUnauthorized) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(redirectUrl);
    }

    return response;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .single();

  const role = profile?.status === "active" && isAppRole(profile.role) ? (profile.role as AppRole) : null;

  if (!role) {
    if (pathname !== "/unauthorized") {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/unauthorized";
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }

    return response;
  }

  if (pathname === "/login" || isAppIndex) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = getDefaultPathForRole(role);
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  if (requestedModule && !canAccessModule(role, requestedModule)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/unauthorized";
    redirectUrl.searchParams.set("next", requestedModule);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/unauthorized",
    "/front-desk/:path*",
    "/owner-dashboard/:path*",
    "/members/:path*",
    "/payments/:path*",
    "/balances/:path*",
    "/entry-reconciliation/:path*",
    "/shifts/:path*",
    "/exceptions/:path*",
    "/notifications/:path*",
    "/reports/:path*",
    "/audit-logs/:path*",
    "/settings/:path*",
  ],
};
