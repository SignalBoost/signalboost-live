// saas/lib/supabaseClient.ts

// Enhanced mock engine to satisfy authentication and database table calls
const mockSingleResult = {
  data: { credits: 750 }, // Matches the default balance we want to show on screen
  error: null
};

const mockQueryBuilder = {
  select: () => mockQueryBuilder,
  eq: () => mockQueryBuilder,
  single: async () => mockSingleResult
};

export const supabase = {
  auth: {
    getUser: async () => ({ data: { user: { id: "mock-user-id" } }, error: null }),
    signOut: async () => ({ error: null }),
    onAuthStateChange: () => ({ 
      data: { subscription: { unsubscribe: () => {} } } 
    })
  },
  // Mocks database operations like .from('users').select('credits').eq(...)
  from: (tableName: string) => mockQueryBuilder
};
