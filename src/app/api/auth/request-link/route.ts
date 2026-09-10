import { z } from "zod";
import { fail, ok, route } from "@/lib/api";
import { AuthError, requestMagicLink } from "@/lib/auth/magic-link";

const schema = z.object({ email: z.string().min(3).max(320) });

export const POST = route<{ email: string }>(
  async ({ body }) => {
    try {
      const result = await requestMagicLink(body.email);
      return ok(result);
    } catch (error) {
      if (error instanceof AuthError) {
        return fail(error.message, error.code === "RATE_LIMITED" ? 429 : 400, {
          code: error.code,
          retryAfter: error.retryAfter,
        });
      }
      throw error;
    }
  },
  { schema, auth: false },
);
