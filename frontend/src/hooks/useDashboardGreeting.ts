import { useEffect, useState } from 'react';
import { readStoredUser, subscribeToStoredUser } from '../lib/authUser';
import { getDashboardGreeting, readFirstLoginFlag } from '../lib/greeting';

/**
 * Greeting for the signed-in user's dashboard heading. Follows profile name
 * changes and re-checks the clock each minute so a long-open dashboard moves
 * from morning to afternoon on its own.
 */
export const useDashboardGreeting = (): string => {
  const [name, setName] = useState(() => readStoredUser()?.name ?? '');
  const [now, setNow] = useState(() => new Date());

  useEffect(() => subscribeToStoredUser((user) => setName(user.name)), []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return getDashboardGreeting(name, readFirstLoginFlag(), now);
};
