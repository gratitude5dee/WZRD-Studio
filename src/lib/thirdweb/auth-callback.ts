export const THIRDWEB_AUTH_CALLBACK_PARAMS = [
  'authResult',
  'authCookie',
  'walletId',
  'authProvider',
] as const;

const THIRDWEB_AUTH_ERROR_PARAMS = ['error', 'error_description'] as const;

export type ThirdwebAuthCallbackIssue =
  | {
      message: string;
      type: 'malformed';
    }
  | {
      message: string;
      type: 'provider-error';
    };

function createSearchParams(search: string) {
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
}

export function hasThirdwebAuthCallbackParams(search: string): boolean {
  const params = createSearchParams(search);
  return [...THIRDWEB_AUTH_CALLBACK_PARAMS, ...THIRDWEB_AUTH_ERROR_PARAMS].some((param) => params.has(param));
}

export function getThirdwebAuthCallbackIssue(search: string): ThirdwebAuthCallbackIssue | null {
  const params = createSearchParams(search);
  const providerError = params.get('error');
  if (providerError) {
    return {
      message: params.get('error_description') || 'Sign-in was not completed. Try again.',
      type: 'provider-error',
    };
  }

  const authResult = params.get('authResult');
  if (!authResult) {
    return null;
  }

  try {
    JSON.parse(decodeURIComponent(authResult));
    return null;
  } catch {
    return {
      message: 'Sign-in callback expired or was malformed. Try again.',
      type: 'malformed',
    };
  }
}

export function stripThirdwebAuthCallbackParams(search: string): string {
  const params = createSearchParams(search);
  for (const param of [...THIRDWEB_AUTH_CALLBACK_PARAMS, ...THIRDWEB_AUTH_ERROR_PARAMS]) {
    params.delete(param);
  }

  const nextSearch = params.toString();
  return nextSearch ? `?${nextSearch}` : '';
}
