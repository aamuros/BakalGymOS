import { NextResponse } from "next/server";

import { requireCurrentProfile } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

const allowedRoles = new Set(["owner", "admin", "manager", "front_desk"]);

type ProofImageRouteProps = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: ProofImageRouteProps) {
  const profile = await requireCurrentProfile();

  if (!allowedRoles.has(profile.role)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { id } = await params;
  const supabase = await createClient();
  const { data: proof, error: proofError } = await supabase
    .from("gcash_proofs")
    .select("storage_path, mime_type, file_name")
    .eq("id", id)
    .single();

  if (proofError || !proof?.storage_path || proof.storage_path.startsWith("pending-proofs/")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from("gcash-proofs")
    .download(proof.storage_path);

  if (error || !data) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(data, {
    headers: {
      "Cache-Control": "private, max-age=60",
      "Content-Disposition": `inline; filename="${proof.file_name ?? "gcash-proof"}"`,
      "Content-Type": proof.mime_type ?? data.type ?? "application/octet-stream",
    },
  });
}
