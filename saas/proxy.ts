import { type NextRequest, NextResponse } from 'next/server';

/**
 * Next.js 16 Proxy
 * This replaces the deprecated middleware.ts
 */
export async function proxy(request: NextRequest) {
  // Returns a standard response to continue the request chain
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - api routes
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
