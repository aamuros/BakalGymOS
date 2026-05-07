"use client";

import { Camera, CameraOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { parseMemberQrPayload } from "@/lib/member-qr";

const readerElementId = "member-qr-reader";

type Html5QrCodeInstance = {
  clear(): Promise<void>;
  render(
    onScanSuccess: (decodedText: string) => void,
    onScanFailure?: (errorMessage: string) => void,
  ): void;
};

export function QrScanner() {
  const router = useRouter();
  const scannerRef = useRef<Html5QrCodeInstance | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      void scannerRef.current?.clear();
    };
  }, []);

  async function stopScanner() {
    await scannerRef.current?.clear();
    scannerRef.current = null;
    setIsScanning(false);
  }

  async function startScanner() {
    setMessage(null);
    setIsScanning(true);

    try {
      const { Html5QrcodeScanner } = await import("html5-qrcode");
      const scanner = new Html5QrcodeScanner(
        readerElementId,
        {
          fps: 10,
          qrbox: { height: 240, width: 240 },
          rememberLastUsedCamera: true,
        },
        false,
      ) as Html5QrCodeInstance;

      scannerRef.current = scanner;
      scanner.render(async (decodedText) => {
        const token = parseMemberQrPayload(decodedText);

        if (!token) {
          setMessage("This QR code is not a GymLedger member card.");
          return;
        }

        await stopScanner();
        router.push(`/front-desk?qr=${encodeURIComponent(token)}#member-check-in`);
      });
    } catch {
      setIsScanning(false);
      setMessage("Camera scanning is not available in this browser. Enter the member ID manually.");
    }
  }

  return (
    <div className="rounded-2xl border border-ledger-line bg-white/70 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-black text-ledger-ink">QR scan</p>
          <p className="mt-1 text-sm font-bold text-ledger-moss">
            Scan a member card to open the check-in flow.
          </p>
        </div>
        {isScanning ? (
          <Button className="gap-2" onClick={stopScanner} variant="secondary">
            <CameraOff aria-hidden="true" className="size-4" />
            Stop
          </Button>
        ) : (
          <Button className="gap-2" onClick={startScanner}>
            <Camera aria-hidden="true" className="size-4" />
            Scan QR
          </Button>
        )}
      </div>
      <div className={isScanning ? "mt-4 overflow-hidden rounded-2xl bg-white" : "hidden"} id={readerElementId} />
      {message ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
          {message}
        </div>
      ) : null}
    </div>
  );
}
