# Staging LAB acceptance branch

This branch is for isolated, non-spending LAB customer acceptance testing. Vercel Preview must use branch-scoped Supabase URL and anon key, and must not inherit a functional production service-role key. Never invoke paid provider jobs. Do not merge this staging marker into production.
