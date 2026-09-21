/**
 * Session flag set from the verify-otp response. The server decides whether a
 * login is the account's first; this only remembers the answer for the tab's
 * session so a dashboard refresh keeps the same greeting.
 */
export const FIRST_LOGIN_STORAGE_KEY = 'isFirstLogin';

export const readFirstLoginFlag = (): boolean => {
  try {
    return sessionStorage.getItem(FIRST_LOGIN_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

/**
 * "Welcome, <name>" on the first login, otherwise a greeting for the viewer's
 * local time: morning 05:00-11:59, afternoon 12:00-17:59, evening 18:00-04:59.
 * Without a name the salutation stands alone rather than guessing one.
 */
export const getDashboardGreeting = (
  name: string | null | undefined,
  isFirstLogin: boolean,
  now: Date = new Date(),
): string => {
  const hour = now.getHours();
  const salutation = isFirstLogin
    ? 'Welcome'
    : hour >= 5 && hour < 12
      ? 'Good morning'
      : hour >= 12 && hour < 18
        ? 'Good afternoon'
        : 'Good evening';
  const displayName = name?.trim();

  return displayName ? `${salutation}, ${displayName}` : salutation;
};
