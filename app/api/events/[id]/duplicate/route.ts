import { createRelatedEvent } from "../create-follow-up/route";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<unknown> }
) {
  return createRelatedEvent(request, context, "duplicate");
}
