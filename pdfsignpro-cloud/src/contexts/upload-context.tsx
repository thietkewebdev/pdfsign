"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

interface UploadContextValue {
  file: File | null;
  fileName: string;
  setFile: (file: File | null) => void;
}

const UploadContext = createContext<UploadContextValue | null>(null);

export function UploadProvider({ children }: { children: ReactNode }) {
  const [file, setFileState] = useState<File | null>(null);

  const setFile = useCallback((f: File | null) => {
    setFileState(f);
  }, []);

  return (
    <UploadContext.Provider
      value={{
        file,
        fileName: file?.name ?? "document.pdf",
        setFile,
      }}
    >
      {children}
    </UploadContext.Provider>
  );
}

export function useUpload() {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error("useUpload must be used within UploadProvider");
  return ctx;
}
