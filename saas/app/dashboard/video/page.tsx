const [tier, setTier]                   = useState<SubscriptionTier>('free')

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => {
        const t = d?.tier || d?.plan || 'free'
        if (['free','demo','launch','growth','command','paid'].includes(t)) setTier(t as SubscriptionTier)
      })
      .catch(() => {})
  }, [])
