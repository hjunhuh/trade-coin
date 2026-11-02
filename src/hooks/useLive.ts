import { useEffect, useState } from 'react'
import { useMarket } from '@/lib/market/feed'
import { equity, marginInUse } from '@/lib/trading/engine'
import { useAccount } from '@/lib/trading/store'

/** The account marked at live prices. */
export function useLiveAccount() {
  const account = useAccount((s) => s.account)
  const catchingUp = useAccount((s) => s.catchingUp)
  const price = useMarket((s) => s.price)
  const eq = equity(account, price)
  return {
    account,
    catchingUp,
    price,
    equity: eq,
    totalReturn: account.deposited > 0 ? eq / account.deposited - 1 : 0,
    unrealized: eq - account.balance,
    marginUsed: marginInUse(account),
  }
}

/** The current time, refreshed every `ms`. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}
