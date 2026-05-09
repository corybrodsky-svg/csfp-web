import { NextResponse } from "next/server";
import {
  applySimVitalsAuthCookies,
  buildSimVitalsAttachmentPath,
  ensureSimVitalsAttachmentsBucket,
  getAuthenticatedSimVitalsContext,
  getErrorMessage,
  getSimVitalsAttachmentContentType,
  getSimVitalsAttachmentUrl,
  jsonNoStore,
  normalizeSimVitalsAttachmentFileName,
  sanitizeSimVitalsFileName,
  SIMVITALS_ATTACHMENTS_BUCKET,
  unauthorizedSimVitalsResponse,
  validateSimVitalsAttachmentFile,
} from "../_lib";

export const dynamic = "force-dynamic";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function buildDownloadName(path: string, filename: string) {
  return sanitizeSimVitalsFileName(filename || path.split("/").pop() || "simvitals-attachment");
}

export async function GET(request: Request) {
  let context: Awaited<ReturnType<typeof getAuthenticatedSimVitalsContext>> = null;

  try {
    context = await getAuthenticatedSimVitalsContext();
    if (!context) return unauthorizedSimVitalsResponse();

    const { searchParams } = new URL(request.url);
    const path = asText(searchParams.get("path"));
    const filename = asText(searchParams.get("filename"));
    const mode = asText(searchParams.get("mode")).toLowerCase() === "preview" ? "preview" : "download";

    if (!path || !path.startsWith("simvitals/")) {
      return applySimVitalsAuthCookies(
        jsonNoStore({ ok: false, error: "Attachment path is required." }, { status: 400 }),
        context
      );
    }

    const downloadResult = await context.db.storage.from(SIMVITALS_ATTACHMENTS_BUCKET).download(path);
    if (downloadResult.error || !downloadResult.data) {
      return applySimVitalsAuthCookies(
        jsonNoStore(
          { ok: false, error: downloadResult.error?.message || "Could not load SimVitals attachment." },
          { status: 404 }
        ),
        context
      );
    }

    const file = downloadResult.data;
    const arrayBuffer = await file.arrayBuffer();
    const contentType = getSimVitalsAttachmentContentType(path, file.type || "application/octet-stream");
    const dispositionType = mode === "preview" ? "inline" : "attachment";
    const response = new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `${dispositionType}; filename="${buildDownloadName(path, filename)}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });

    return applySimVitalsAuthCookies(response, context);
  } catch (error) {
    return applySimVitalsAuthCookies(
      jsonNoStore(
        { ok: false, error: `Could not load SimVitals attachment: ${getErrorMessage(error)}` },
        { status: 500 }
      ),
      context
    );
  }
}

export async function POST(request: Request) {
  let context: Awaited<ReturnType<typeof getAuthenticatedSimVitalsContext>> = null;

  try {
    context = await getAuthenticatedSimVitalsContext();
    if (!context) return unauthorizedSimVitalsResponse();

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return applySimVitalsAuthCookies(
        jsonNoStore({ ok: false, error: "Attachment file is required." }, { status: 400 }),
        context
      );
    }

    const validationError = validateSimVitalsAttachmentFile({
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
    });
    if (validationError) {
      return applySimVitalsAuthCookies(
        jsonNoStore({ ok: false, error: validationError }, { status: 400 }),
        context
      );
    }

    await ensureSimVitalsAttachmentsBucket();

    const storagePath = buildSimVitalsAttachmentPath(context.viewer.id, file.name);
    const uploadContentType = getSimVitalsAttachmentContentType(file.name, file.type || "application/octet-stream");
    const uploadResult = await context.db.storage
      .from(SIMVITALS_ATTACHMENTS_BUCKET)
      .upload(storagePath, file, {
        cacheControl: "3600",
        contentType: uploadContentType,
        upsert: false,
      });

    if (uploadResult.error) {
      return applySimVitalsAuthCookies(
        jsonNoStore(
          { ok: false, error: uploadResult.error.message || "Could not upload SimVitals attachment." },
          { status: 500 }
        ),
        context
      );
    }

    const fileName = normalizeSimVitalsAttachmentFileName(file.name);
    const attachment = {
      fileName,
      path: storagePath,
      url: getSimVitalsAttachmentUrl(storagePath, fileName),
      mimeType: uploadContentType,
      size: file.size,
      uploadedAt: new Date().toISOString(),
      uploadedBy: context.viewer.displayName,
    };

    return applySimVitalsAuthCookies(
      jsonNoStore({ ok: true, attachment }, { status: 201 }),
      context
    );
  } catch (error) {
    return applySimVitalsAuthCookies(
      jsonNoStore(
        { ok: false, error: `Could not upload SimVitals attachment: ${getErrorMessage(error)}` },
        { status: 500 }
      ),
      context
    );
  }
}
