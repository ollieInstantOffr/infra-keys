import { z } from "zod";
import { fail, ok, route } from "@/lib/api";
import { AuthError, verifyCrossDeviceCode } from "@/lib/auth/magic-link";
import { createSession } from "@/lib/auth/session";

const schema = z.object({ code: z.string().min(6).max(8) });

export const POST = route<{ code: string }>(
  async ({ body }) => {
    try {
      const { userId, isFirstDevice } = await verifyCrossDeviceCode(body.code);
      await createSession(userId);
      return ok({ next: isFirstDevice ? "/setup/touch-id" : "/unlock" });
    } catch (error) {
      if (error instanceof AuthError) {
        return fail(error.message, error.code === "RATE_LIMITED" ? 429 : 400, {
          code: error.code,
        });
      }
      throw error;
    }
  },
  { schema, auth: false },
);
