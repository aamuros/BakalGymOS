"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";

type ReportsExportButtonProps = {
  filename: string;
  rows: Array<Record<string, string | number | null>>;
};

function csvEscape(value: string | number | null) {
  const text = value === null ? "" : String(value);

  if (!/[",\n\r]/.test(text)) {
    return text;
  }

  return `"${text.replaceAll('"', '""')}"`;
}

export function ReportsExportButton({ filename, rows }: ReportsExportButtonProps) {
  function exportCsv() {
    if (!rows.length) {
      return;
    }

    const headers = Object.keys(rows[0] ?? {});
    const csv = [
      headers.map(csvEscape).join(","),
      ...rows.map((row) => headers.map((header) => csvEscape(row[header] ?? null)).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <Button
      className="gap-2"
      disabled={!rows.length}
      onClick={exportCsv}
      title={rows.length ? "Export CSV" : "No rows to export"}
      variant="secondary"
    >
      <Download aria-hidden="true" className="size-4" />
      CSV
    </Button>
  );
}
