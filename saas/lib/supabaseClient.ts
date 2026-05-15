// saas/lib/supabaseClient.ts

const mockSingleResult = {
  data: { credits: 750 },
  error: null
};

// Fixed: Added (...args: any[]) to functions so TypeScript allows passing columns, values, etc.
const mockQueryBuilder = {
  select: (...args: any[]) => mockQueryBuilder,
  eq: (...args: any[]) => mockQueryBuilder,
  single: async () => mockSingleResult
};

export const supabase = {
  auth: {
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
