"use client";

import { Download, Printer } from "lucide-react";
import { toPng } from "html-to-image";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type MemberCardActionsProps = {
  cardElementId: string;
  memberName: string;
};

export function MemberCardActions({ cardElementId, memberName }: MemberCardActionsProps) {
  const [error, setError] = useState<string | null>(null);

  async function downloadCard() {
    const cardElement = document.getElementById(cardElementId);

    if (!cardElement) {
      return;
    }

    setError(null);

    try {
      const dataUrl = await toPng(cardElement, {
        cacheBust: true,
        pixelRatio: 2,
      });
      const link = document.createElement("a");

      link.download = `${memberName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-member-card.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      setError("Unable to download the card image.");
    }
  }

  function printCard() {
    setError(null);
    window.print();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <Button className="gap-2" onClick={printCard} variant="secondary">
          <Printer aria-hidden="true" className="size-4" />
          Print
        </Button>
        <Button className="gap-2" onClick={downloadCard}>
          <Download aria-hidden="true" className="size-4" />
          Download
        </Button>
      </div>
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {error}
        </div>
      ) : null}
    </div>
  );
}
