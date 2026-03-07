"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function HomePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("title", title || selectedFile.name || "Untitled");

      const res = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Upload failed");
      }

      const data = await res.json();
      router.push(`/d/${data.publicId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto max-w-4xl px-6 py-16">
      <div className="mx-auto max-w-2xl space-y-12">
        <header className="space-y-4 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Upload PDF. Route signers. Done.
          </h1>
          <p className="text-lg text-muted-foreground">
            Send documents for signature in minutes. No friction, no complexity.
          </p>
        </header>

        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle>New document</CardTitle>
            <CardDescription>
              Add a title and select your PDF to get started.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpload} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Document title</Label>
                <Input
                  id="title"
                  placeholder="e.g. Contract Agreement 2024"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="file">PDF file</Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="file"
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                    className="rounded-xl file:mr-4 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground file:hover:bg-primary/90"
                  />
                </div>
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <Button
                type="submit"
                size="lg"
                className="w-full rounded-xl"
                disabled={!selectedFile || isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                {isSubmitting ? "Uploading…" : "Upload"}
              </Button>
            </form>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
