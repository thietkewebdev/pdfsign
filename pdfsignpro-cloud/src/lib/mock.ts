export const mockDocument = {
  id: "demo-public-id",
  name: "Contract Agreement 2024.pdf",
  status: "ACTIVE" as const,
  createdAt: "2024-03-15T10:30:00Z",
  pageCount: 12,
};

export const mockSigners = [
  {
    id: "signer-a",
    name: "Alice Johnson",
    email: "alice@example.com",
    status: "SIGNED" as const,
    signedAt: "2024-03-15T10:45:00Z",
    ip: "192.168.1.100",
  },
  {
    id: "signer-b",
    name: "Bob Smith",
    email: "bob@example.com",
    status: "ACTIVE" as const,
    signedAt: null,
    ip: null,
  },
  {
    id: "signer-c",
    name: "Carol Williams",
    email: "carol@example.com",
    status: "PENDING" as const,
    signedAt: null,
    ip: null,
  },
];

export const mockVersions = [
  {
    id: "v1",
    timestamp: "2024-03-15T10:30:00Z",
    action: "Document uploaded",
    email: "user@example.com",
    ip: "192.168.1.1",
  },
  {
    id: "v2",
    timestamp: "2024-03-15T10:45:00Z",
    action: "Document signed by Alice Johnson",
    email: "alice@example.com",
    ip: "192.168.1.100",
  },
];

export const mockThumbnails = Array.from({ length: 12 }, (_, i) => ({
  id: `page-${i + 1}`,
  pageNumber: i + 1,
  label: `Page ${i + 1}`,
}));
