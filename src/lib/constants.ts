export const ACCEPTED_FILE_TYPES = [
  // Documents
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  // Text
  "text/plain",
  "text/markdown",
  "text/html",
  // Books
  "application/epub+zip", // .epub
] as const;

export const ACCEPTED_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".pptx",
  ".xlsx",
  ".txt",
  ".md",
  ".html",
  ".htm",
  ".epub",
] as const;

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export const POLLING_INTERVAL = 3000; // 3 seconds
