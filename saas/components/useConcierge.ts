import { useState } from 'react'

export function useConcierge() {
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  return {
    message,
    setMessage,
    loading,
    setLoading,
  }
}
