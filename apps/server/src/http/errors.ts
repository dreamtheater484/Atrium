export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string = 'error',
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = 'That item') => new HttpError(404, `${what} doesn't exist or you can't see it.`, 'not_found');
export const forbidden = (msg = "You don't have access to do that.") => new HttpError(403, msg, 'forbidden');
export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, 'bad_request', details);
export const conflict = (msg: string, details?: unknown) => new HttpError(409, msg, 'conflict', details);
export const unauthorized = (msg = 'Sign in to continue.') => new HttpError(401, msg, 'unauthorized');
