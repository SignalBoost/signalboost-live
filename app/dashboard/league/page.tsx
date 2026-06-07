import Link from 'next/link'
import { DataTable } from '@/components/saas/DataTable'

const teams = [
  { id: 'team-1', name: 'North City FC', division: 'Premier', status: 'Active', owner: 'Maya Chen' },
  { id: 'team-2', name: 'River United', division: 'Premier', status: 'Active', owner: 'Jon Bell' },
  { id: 'team-3', name: 'Eastside Academy', division: 'Development', status: 'Draft', owner: 'Priya Shah' },
]

const matches = [
  { id: 'match-1', home: 'North City FC', away: 'River United', kickoff: 'Jun 14, 7:30 PM', status: 'Scheduled' },
  { id: 'match-2', home: 'Eastside Academy', away: 'North City FC', kickoff: 'Jun 18, 6:00 PM', status: 'Scheduled' },
  { id: 'match-3', home: 'River United', away: 'Eastside Academy', kickoff: 'Jun 22, 8:00 PM', status: 'Draft' },
]

const rankings = [
  { id: 'rank-1', position: '1', team: 'North City FC', points: '42', movement: '+2' },
  { id: 'rank-2', position: '2', team: 'River United', points: '39', movement: '-1' },
  { id: 'rank-3', position: '3', team: 'Eastside Academy', points: '31', movement: '0' },
]

const content = [
  { id: 'content-1', title: 'Matchday preview', type: 'Article', channel: 'Web', status: 'Published' },
  { id: 'content-2', title: 'Top-five ranking movement', type: 'Newsletter', channel: 'Email', status: 'Review' },
  { id: 'content-3', title: 'Sponsor highlight reel', type: 'Video', channel: 'Social', status: 'Growth only' },
]

const forms = [
  { title: 'Create team', fields: ['Name', 'Division', 'Owner email'] },
  { title: 'Schedule match', fields: ['Home team', 'Away team', 'Kickoff'] },
  { title: 'Publish content', fields: ['Title', 'Type', 'Channel'] },
]

export default function LeagueOperationsPage() {
  return (
    <main className="min-h-screen text-white">
      <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(255,215,0,.18),transparent_35%),linear-gradient(135deg,#111827,#05070b)] p-6 md:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#FFD700]">League CRUD workspace</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-black md:text-6xl">Manage teams, matches, rankings, and content from one responsive cockpit.</h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-white/65">These UI patterns map directly to the Express REST resources under <code className="rounded bg-black/40 px-2 py-1 text-[#FFD700]">/api/teams</code>, <code className="rounded bg-black/40 px-2 py-1 text-[#FFD700]">/api/matches</code>, <code className="rounded bg-black/40 px-2 py-1 text-[#FFD700]">/api/rankings</code>, and <code className="rounded bg-black/40 px-2 py-1 text-[#FFD700]">/api/content</code>.</p>
          </div>
          <Link href="/pricing" className="rounded-full bg-[#FFD700] px-5 py-3 text-center font-black text-black no-underline">Unlock Growth widgets</Link>
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        {forms.map((form) => (
          <form key={form.title} className="rounded-3xl border border-white/10 bg-white/[.04] p-5">
            <h2 className="text-xl font-black">{form.title}</h2>
            <div className="mt-4 grid gap-3">
              {form.fields.map((field) => (
                <label key={field} className="grid gap-2 text-sm text-white/55">
                  {field}
                  <input className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-white/25 focus:border-[#FFD700]/60" placeholder={field} />
                </label>
              ))}
            </div>
            <button className="mt-5 w-full rounded-full bg-white px-4 py-3 font-black text-black transition hover:bg-[#FFD700]" type="button">Save draft</button>
          </form>
        ))}
      </section>

      <section className="mt-6 grid gap-6">
        <DataTable title="Teams" description="Create, edit, archive, and assign ownership for clubs or league participants." rows={teams} columns={[{ key: 'name', header: 'Team' }, { key: 'division', header: 'Division' }, { key: 'status', header: 'Status' }, { key: 'owner', header: 'Owner' }]} />
        <DataTable title="Matches" description="Schedule fixtures and keep status-aware match cards synced to public content." rows={matches} columns={[{ key: 'home', header: 'Home' }, { key: 'away', header: 'Away' }, { key: 'kickoff', header: 'Kickoff' }, { key: 'status', header: 'Status' }]} />
        <DataTable title="Rankings" description="Moderate rankings with points, position, and movement metadata." rows={rankings} columns={[{ key: 'position', header: '#' }, { key: 'team', header: 'Team' }, { key: 'points', header: 'Points' }, { key: 'movement', header: 'Movement' }]} />
        <DataTable title="Content" description="Plan public posts, sponsor packages, newsletters, and social clips." rows={content} columns={[{ key: 'title', header: 'Title' }, { key: 'type', header: 'Type' }, { key: 'channel', header: 'Channel' }, { key: 'status', header: 'Status' }]} />
      </section>
    </main>
  )
}
