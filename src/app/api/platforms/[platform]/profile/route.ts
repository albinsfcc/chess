import { handleProfile } from "@/lib/platforms/server/routes";

export async function GET(request: Request, context: { params: Promise<{ platform: string }> }) {
  return handleProfile(request, (await context.params).platform);
}
