// Reads and checks the two images from a multipart or JSON request body.
// The bytes stay in memory for this request only; nothing here logs them.

import { createHash } from "node:crypto";
import { detectImageType, imageSize } from "./image";
import {
  MAX_IMAGE_BYTES,
  MAX_LONG_SIDE_PX,
  READ_STONE_FIELDS,
  type AcceptedImageType,
  type ReadStoneErrorCode,
  type ReadStoneField,
} from "./types";

export type StoneImage = {
  field: ReadStoneField;
  bytes: Uint8Array;
  type: AcceptedImageType;
  width: number;
  height: number;
  sha256: string;
};

export type InputProblem = { status: 400 | 413 | 415; code: ReadStoneErrorCode; message: string };

/** Two 4 MB images as base64 in JSON, plus room for the JSON or multipart wrapping. */
export const MAX_BODY_BYTES = Math.ceil((2 * MAX_IMAGE_BYTES * 4) / 3) + 64 * 1024;

const LABEL: Record<ReadStoneField, string> = {
  straightened: "The straightened photo",
  contrast: "The contrast photo",
};

const megabytes = (n: number) => `${(n / (1024 * 1024)).toFixed(1)} MB`;

const EXACTLY_TWO =
  "Send exactly two images, named straightened and contrast, as multipart/form-data or JSON.";

function problem(status: InputProblem["status"], code: ReadStoneErrorCode, message: string): { problem: InputProblem } {
  return { problem: { status, code, message } };
}

async function readBodyCapped(request: Request, max: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!request.body) return new Uint8Array(new ArrayBuffer(0));
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

type RawImage = { field: ReadStoneField; bytes: Uint8Array; declaredType: string };

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

function decodeBase64Image(field: ReadStoneField, value: unknown): RawImage | { problem: InputProblem } {
  if (typeof value !== "string") return problem(400, "bad_request", EXACTLY_TWO);
  let declaredType = "";
  let data = value;
  const dataUrl = value.match(/^data:([^;,]*)(;base64)?,/);
  if (dataUrl) {
    if (!dataUrl[2]) return problem(400, "bad_request", `${LABEL[field]} must be base64 encoded.`);
    declaredType = dataUrl[1];
    data = value.slice(dataUrl[0].length);
  }
  data = data.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!BASE64.test(data) || data.length === 0) {
    return problem(400, "bad_request", `${LABEL[field]} isn't valid base64.`);
  }
  if (Math.floor((data.length * 3) / 4) > MAX_IMAGE_BYTES + 3) {
    return problem(413, "too_large", `${LABEL[field]} is over 4 MB. Shrink it to ${MAX_LONG_SIDE_PX} px on the long side and try again.`);
  }
  return { field, bytes: new Uint8Array(Buffer.from(data, "base64")), declaredType };
}

async function rawImagesFromBody(
  body: Uint8Array<ArrayBuffer>,
  contentType: string,
): Promise<RawImage[] | { problem: InputProblem }> {
  const mediaType = contentType.split(";")[0].trim().toLowerCase();

  if (mediaType === "multipart/form-data") {
    let form: FormData;
    try {
      form = await new Response(body, { headers: { "content-type": contentType } }).formData();
    } catch {
      return problem(400, "bad_request", "Couldn't read the upload. Try sending the photos again.");
    }
    const keys = [...new Set(form.keys())];
    if (keys.length !== 2 || !READ_STONE_FIELDS.every((f) => form.getAll(f).length === 1)) {
      return problem(400, "bad_request", EXACTLY_TWO);
    }
    const images: RawImage[] = [];
    for (const field of READ_STONE_FIELDS) {
      const value = form.get(field);
      if (typeof value === "string" || value === null) return problem(400, "bad_request", EXACTLY_TWO);
      images.push({ field, bytes: new Uint8Array(await value.arrayBuffer()), declaredType: value.type });
    }
    return images;
  }

  if (mediaType === "application/json") {
    let json: unknown;
    try {
      json = JSON.parse(new TextDecoder().decode(body));
    } catch {
      return problem(400, "bad_request", "The request body isn't valid JSON.");
    }
    if (!json || typeof json !== "object" || Array.isArray(json)) return problem(400, "bad_request", EXACTLY_TWO);
    const record = json as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length !== 2 || !READ_STONE_FIELDS.every((f) => f in record)) {
      return problem(400, "bad_request", EXACTLY_TWO);
    }
    const images: RawImage[] = [];
    for (const field of READ_STONE_FIELDS) {
      const decoded = decodeBase64Image(field, record[field]);
      if ("problem" in decoded) return decoded;
      images.push(decoded);
    }
    return images;
  }

  return problem(415, "bad_request", "Send the photos as multipart/form-data or as JSON.");
}

function checkImage(raw: RawImage): StoneImage | { problem: InputProblem } {
  const label = LABEL[raw.field];
  if (raw.bytes.byteLength > MAX_IMAGE_BYTES) {
    return problem(
      413,
      "too_large",
      `${label} is ${megabytes(raw.bytes.byteLength)}; the limit is 4 MB. Shrink it to ${MAX_LONG_SIDE_PX} px on the long side and try again.`,
    );
  }
  const type = detectImageType(raw.bytes);
  if (!type) return problem(415, "bad_image", `${label} isn't a JPEG, PNG or WebP image.`);
  const declared = raw.declaredType.toLowerCase();
  if (declared && declared !== "application/octet-stream" && declared !== type) {
    return problem(415, "bad_image", `${label} is labeled ${declared} but the file is ${type}. Send it again without renaming it.`);
  }
  const size = imageSize(raw.bytes, type);
  if (!size) return problem(415, "bad_image", `Couldn't read the size of ${label.toLowerCase()}. Save it again as a JPEG and retry.`);
  const longSide = Math.max(size.width, size.height);
  if (longSide > MAX_LONG_SIDE_PX) {
    return problem(
      413,
      "too_large",
      `${label} is ${longSide} px on its long side; the limit is ${MAX_LONG_SIDE_PX} px. Shrink it and try again.`,
    );
  }
  return {
    field: raw.field,
    bytes: raw.bytes,
    type,
    width: size.width,
    height: size.height,
    sha256: createHash("sha256").update(raw.bytes).digest("hex"),
  };
}

export async function readStoneImages(
  request: Request,
): Promise<{ images: [StoneImage, StoneImage] } | { problem: InputProblem }> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    return problem(413, "too_large", `These photos add up to ${megabytes(declaredLength)}; each must be under 4 MB. Shrink them and try again.`);
  }
  const body = await readBodyCapped(request, MAX_BODY_BYTES);
  if (!body) return problem(413, "too_large", "These photos are too big to send. Each must be under 4 MB; shrink them and try again.");

  const raw = await rawImagesFromBody(body, request.headers.get("content-type") ?? "");
  if ("problem" in raw) return raw;

  const checked: StoneImage[] = [];
  for (const image of raw) {
    const result = checkImage(image);
    if ("problem" in result) return result;
    checked.push(result);
  }
  return { images: [checked[0], checked[1]] };
}

/** Cache key for the pair: SHA-256 over both image hashes. */
export function pairHash(images: [StoneImage, StoneImage]): string {
  return createHash("sha256").update(`${images[0].sha256}:${images[1].sha256}`).digest("hex");
}

export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
}
