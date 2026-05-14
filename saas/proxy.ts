import { type NextRequest, NextResponse } from 'next/server';

// In Next.js 16, the function MUST be named 'proxy'
export async function proxy(request: NextRequest) {
  const response = NextResponse.next();
  
  // Your logic here (e.g., Auth checks or headers)
  
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
