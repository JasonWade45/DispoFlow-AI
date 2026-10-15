import { NextRequest, NextResponse } from "next/server";
import { validateDgSend } from "@/lib/dispo-genius";
import {
  GhlError,
  asRecord,
  asString,
  ghlPost,
  resolveLocationId,
} from "@/lib/dispo-genius-server";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validated = validateDgSend(body);
  if (validated.ok === false) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const { phone, name, email, message } = validated.value;

  const token = process.env.DISPOGENIUS_PIT_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "DispoGenius token is not configured. Set the DISPOGENIUS_PIT_TOKEN env var." },
      { status: 503 },
    );
  }

  try {
    const locationId = await resolveLocationId(token, process.env.DISPOGENIUS_LOCATION_ID || "");

    const upsert = asRecord(
      await ghlPost("/contacts/", token, ["2021-07-28"], {
        locationId,
        phone,
        ...(name ? { name } : {}),
        ...(email ? { email } : {}),
        source: "DispoFlow",
      }),
    );
    const contactId = asString(asRecord(upsert.contact).id);
    if (!contactId) {
      return NextResponse.json(
        { error: "DispoGenius did not return a contact id for this phone number." },
        { status: 502 },
      );
    }

    const sent = asRecord(
      await ghlPost("/conversations/messages", token, ["2021-04-15"], {
        type: "SMS",
        contactId,
        message,
      }),
    );

    return NextResponse.json({
      ok: true,
      contactId,
      conversationId: asString(sent.conversationId),
      messageId: asString(sent.messageId),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to reach DispoGenius";
    console.error("DispoGenius send error:", error);
    const status =
      error instanceof GhlError && error.status >= 400 && error.status < 600 ? error.status : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}
