import "server-only";
import { randomUUID } from "node:crypto";
import { badRequest } from "./http";
import { supabaseAdmin } from "./supabase-admin";

// Bank-transfer slips in the private `payment-slips` bucket, under
// '<org_id>/<lease_id>/<random uuid>.<ext>'. The type is decided from the
// file's first bytes, never from its name or the browser's Content-Type.
// Callers authorize first (the org and lease come from a visible lease).

type SlipType = {
  ext: "jpg" | "png" | "pdf";
  contentType: string;
  magic: number[];
};

export const SLIP_BUCKET = "payment-slips";
export const MAX_SLIP_BYTES = 5 * 1024 * 1024;
const SIGNED_URL_SECONDS = 60;

const SLIP_TYPES: SlipType[] = [
  { ext: "jpg", contentType: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  {
    ext: "png",
    contentType: "image/png",
    magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  // "%PDF-"
  {
    ext: "pdf",
    contentType: "application/pdf",
    magic: [0x25, 0x50, 0x44, 0x46, 0x2d],
  },
];

/** JPEG, PNG or PDF by magic bytes, else null. */
export const detectSlipType = (bytes: Uint8Array): SlipType | null =>
  SLIP_TYPES.find((type) =>
    type.magic.every((byte, index) => bytes[index] === byte),
  ) ?? null;

/** Validates (<= 5 MB, JPEG/PNG/PDF) and uploads; returns the object path. */
export const uploadSlip = async (
  orgId: string,
  leaseId: string,
  file: File,
): Promise<string> => {
  if (file.size === 0) {
    throw badRequest("slip: File is empty");
  }
  if (file.size > MAX_SLIP_BYTES) {
    throw badRequest("slip: File is larger than 5 MB");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectSlipType(bytes);
  if (!type) {
    throw badRequest("slip: Only JPEG, PNG or PDF files are accepted");
  }
  const path = `${orgId}/${leaseId}/${randomUUID()}.${type.ext}`;
  const { error } = await supabaseAdmin()
    .storage.from(SLIP_BUCKET)
    .upload(path, bytes, { contentType: type.contentType, upsert: false });
  if (error) {
    throw new Error(`Slip upload failed: ${error.message}`);
  }
  return path;
};

export const removeSlip = async (path: string): Promise<void> => {
  const { error } = await supabaseAdmin()
    .storage.from(SLIP_BUCKET)
    .remove([path]);
  if (error) {
    throw new Error(`Slip removal failed: ${error.message}`);
  }
};

/** Short-lived (60 s) signed download URL. Caller must have authorized the read. */
export const signedSlipUrl = async (path: string): Promise<string> => {
  const { data, error } = await supabaseAdmin()
    .storage.from(SLIP_BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) {
    throw new Error(`Could not sign slip URL: ${error.message}`);
  }
  return data.signedUrl;
};
