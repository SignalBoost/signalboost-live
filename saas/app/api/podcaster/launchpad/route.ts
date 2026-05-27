import { POST as launchpadPost } from '@/app/api/launchpad/podcast/route'

export async function POST(req: Request) {
  return launchpadPost(req)
}
