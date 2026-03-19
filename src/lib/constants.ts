export const ACCEPTED_FILE_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
] as const;

export const ACCEPTED_EXTENSIONS = [".pdf", ".txt", ".md", ".docx"] as const;

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export const POLLING_INTERVAL = 3000; // 3 seconds
