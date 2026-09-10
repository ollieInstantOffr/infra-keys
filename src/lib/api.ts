import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";

type RouteContext = { params: Promise<Record<string, string> | undefined> };

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

type Ctx<TBody, TUser> = {
  user: TUser;
  body: TBody;
  req: Request;
  params: Record<string, string>;
};

/**
 * Wraps a handler so auth, body parsing and error shaping stay in one place.
 *
 * The overloads matter: with `auth: false` the handler can be reached signed
 * out, so `user` is typed nullable there and non-null everywhere else.
 */
export function route<TBody = undefined>(
  handler: (ctx: Ctx<TBody, CurrentUser>) => Promise<Response>,
  options?: { schema?: ZodType<TBody>; auth?: true },
): (req: Request, context: RouteContext) => Promise<Response>;
export function route<TBody = undefined>(
  handler: (ctx: Ctx<TBody, CurrentUser | null>) => Promise<Response>,
  options: { schema?: ZodType<TBody>; auth: false },
): (req: Request, context: RouteContext) => Promise<Response>;
export function route<TBody = undefined>(
  handler: (ctx: Ctx<TBody, never>) => Promise<Response>,
  options: { schema?: ZodType<TBody>; auth?: boolean } = {},
) {
  const requireAuth = options.auth !== false;

  return async (req: Request, context: RouteContext): Promise<Response> => {
    try {
      const user = await getCurrentUser();
      if (requireAuth && !user) return fail("Sign in to continue.", 401);

      let body = undefined as TBody;
      if (options.schema) {
        const raw = await req.json().catch(() => ({}));
        body = options.schema.parse(raw);
      }

      const params = (await context?.params) ?? {};
      return await handler({ user: user as never, body, req, params });
    } catch (error) {
      if (error instanceof ZodError) {
        return fail(error.issues[0]?.message ?? "That request wasn't valid.", 422);
      }
      const message =
        error instanceof Error ? error.message : "Something went wrong.";
      if (message === "UNAUTHENTICATED") return fail("Sign in to continue.", 401);
      console.error("keys · route error", error);
      return fail(message, 400);
    }
  };
}
