import { sum } from '../../../../lib/builder-canary-sum.mjs';
export const dynamic = 'force-dynamic';
export async function GET() { return Response.json({ total: sum(2, 3) }); }
