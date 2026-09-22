/** Minimal upload shape from Nest FileInterceptor (memory storage). */
export interface UploadedExcelFile {
  buffer: Buffer;
}

/** Image upload shape for inventory / branding-style files. */
export interface UploadedImageFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname?: string;
}
