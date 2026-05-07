"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { uploadGcashProof } from "@/app/(app)/front-desk/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type GcashProofUploadFormProps = {
  proofId: string;
};

export function GcashProofUploadForm({ proofId }: GcashProofUploadFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setServerError(null);
    formData.set("proofId", proofId);

    startTransition(async () => {
      const result = await uploadGcashProof(formData);

      if (result.error) {
        setServerError(result.error);
        return;
      }

      formRef.current?.reset();
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="grid gap-3" ref={formRef}>
      {serverError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {serverError}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`gcash_reference_${proofId}`}>Reference number</Label>
          <Input
            autoComplete="off"
            id={`gcash_reference_${proofId}`}
            maxLength={80}
            name="referenceNumber"
            placeholder="Optional"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`gcash_sender_${proofId}`}>Sender name</Label>
          <Input
            autoComplete="name"
            id={`gcash_sender_${proofId}`}
            maxLength={120}
            name="senderName"
            placeholder="Optional"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <div className="space-y-2">
          <Label htmlFor={`gcash_file_${proofId}`}>Proof image</Label>
          <Input
            accept="image/jpeg,image/png,image/webp"
            id={`gcash_file_${proofId}`}
            name="proofImage"
            required
            type="file"
          />
          <p className="text-xs font-bold text-ledger-moss">JPEG, PNG, or WebP only. Max 5 MB.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`gcash_mobile_${proofId}`}>Sender mobile</Label>
          <Input
            autoComplete="tel"
            id={`gcash_mobile_${proofId}`}
            maxLength={40}
            name="senderMobile"
            placeholder="Optional"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button className="gap-2" disabled={isPending} type="submit">
          <Upload aria-hidden="true" className="size-4" />
          {isPending ? "Uploading..." : "Upload proof"}
        </Button>
      </div>
    </form>
  );
}
