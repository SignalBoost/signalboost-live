// saas/lib/supabaseClient.ts

// Temporary sandbox mock interface to pass TypeScript build verification
export const supabase = {
  auth: {
    getUser: async () => ({ data: { user: null }, error: null }),
    signOut: async () => ({ error: null }),
    onAuthStateChange: () => ({ 
      data: { subscription: { unsubscribe: () => {} } } 
    })
  }
};
