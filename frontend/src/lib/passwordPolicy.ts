export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

export type PasswordRequirementKey = 'minimum' | 'uppercase' | 'lowercase' | 'number' | 'symbol';

export interface PasswordRequirement {
  key: PasswordRequirementKey;
  label: string;
  met: boolean;
}

export const passwordRequirements = (password: string): PasswordRequirement[] => [
  { key: 'minimum', label: `Minimum ${PASSWORD_MIN_LENGTH} characters`, met: password.length >= PASSWORD_MIN_LENGTH },
  { key: 'uppercase', label: 'At least one uppercase letter', met: /[A-Z]/.test(password) },
  { key: 'lowercase', label: 'At least one lowercase letter', met: /[a-z]/.test(password) },
  { key: 'number', label: 'At least one number', met: /[0-9]/.test(password) },
  // Matches Laravel Password::symbols(): Unicode separators, symbols, or punctuation.
  { key: 'symbol', label: 'At least one special character', met: /[\p{Z}\p{S}\p{P}]/u.test(password) },
];

export const isPasswordValid = (password: string): boolean => (
  password.length <= PASSWORD_MAX_LENGTH
  && passwordRequirements(password).every((requirement) => requirement.met)
);

export const passwordValidationMessage = (password: string): string | undefined => {
  if (password.length > PASSWORD_MAX_LENGTH) return `Password must not exceed ${PASSWORD_MAX_LENGTH} characters.`;
  const unmet = passwordRequirements(password).find((requirement) => !requirement.met)?.key;

  switch (unmet) {
    case 'minimum': return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
    case 'uppercase': return 'Password must contain at least one uppercase letter.';
    case 'lowercase': return 'Password must contain at least one lowercase letter.';
    case 'number': return 'Password must contain at least one number.';
    case 'symbol': return 'Password must contain at least one special character.';
    default: return undefined;
  }
};
