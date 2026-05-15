// saas/lib/supabaseClient.ts

// Complete mock engine to satisfy auth profile fields and query chaining
const mockSingleResult = {
  data: { credits: 750 },
  error: null
};

const mockQueryBuilder = {
  select: () => mockQueryBuilder,
  eq: () => mockQueryBuilder,
  single: async () => mockSingleResult
};

export const supabase = {
  auth: {
    // Added email property to satisfy components extraction inside Topbar.tsx
    getUser: async () => ({ 
      data: { 
        user: { 
          id: "mock-user-id",
          email: "sandbox-developer@signalboostapp.com" 
        } 
      }, 
      error: null 
    }),
    signOut: async () => ({ error: null }),
    onAuthStateChange: () => ({ 
      data: { subscription: { unsubscribe: () => {} } } 
    })
  },
  from: (tableName: string) => mockQueryBuilder
};
