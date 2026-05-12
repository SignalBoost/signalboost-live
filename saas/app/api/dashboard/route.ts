export async function GET() {
  return Response.json({
    stats: {
      projects: 12,
      automations: 5,
      content: 24,
    },
  });
}
