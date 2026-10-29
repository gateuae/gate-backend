import { UTApi, UTFile } from 'uploadthing/server';

export function getUploadThingToken() {
  let token = process.env.UPLOADTHING_TOKEN || '';
  token = token.trim();
  if ((token.startsWith("'") && token.endsWith("'")) || (token.startsWith('"') && token.endsWith('"'))) {
    token = token.slice(1, -1).trim();
  }
  return token;
}

/**
 * Returns a UTApi instance configured with UPLOADTHING_TOKEN if available.
 */
export function getUTApi() {
  const token = getUploadThingToken();
  return new UTApi({ apiKey: token });
}

export function isUploadThingConfigured() {
  const token = getUploadThingToken();
  return Boolean(token && token.length > 0 && !token.includes('your_uploadthing_token_here'));
}

/**
 * Uploads a single file (from Multer memory buffer) directly to UploadThing cloud.
 * No files are saved to the Node.js server disk.
 */
export async function uploadToUploadThing(file, subfolder = '') {
  if (!file) {
    throw new Error('No file provided for upload.');
  }

  if (!isUploadThingConfigured()) {
    throw new Error(
      'Upload failed: UPLOADTHING_TOKEN is not configured. Please set UPLOADTHING_TOKEN in your backend .env file to enable uploads.'
    );
  }

  const utapi = getUTApi();
  const buffer = file.buffer;
  if (!buffer) {
    throw new Error('Unable to read file buffer for UploadThing upload.');
  }

  let lastErr = null;
  // Try up to 2 attempts with brief backoff in case of transient network issue
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const utFile = new UTFile(
        [buffer],
        file.originalname || file.name || 'uploaded-file',
        { type: file.mimetype }
      );

      const response = await utapi.uploadFiles([utFile]);
      const res = response?.[0];

      if (res && res.data) {
        const fileData = res.data;
        const fileUrl = fileData.ufsUrl || fileData.url;

        return {
          success: true,
          url: fileUrl,
          key: fileData.key,
          filename: fileData.name || file.originalname,
          size: fileData.size,
          provider: 'uploadthing',
        };
      }

      if (res?.error) {
        lastErr = new Error(res.error.message || 'UploadThing rejected the file upload.');
      }
    } catch (err) {
      lastErr = err;
    }

    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  console.error('[UploadThing] Error during upload:', lastErr);
  throw lastErr || new Error('UploadThing file upload failed.');
}

/**
 * Uploads multiple files (e.g. flyer pages) directly to UploadThing in batch.
 * No files are saved to the Node.js server disk.
 */
export async function uploadMultipleToUploadThing(files, subfolder = 'flyers') {
  if (!files || files.length === 0) {
    return { success: true, files: [] };
  }

  if (!isUploadThingConfigured()) {
    throw new Error(
      'Upload failed: UPLOADTHING_TOKEN is not configured. Please set UPLOADTHING_TOKEN in your backend .env file to enable uploads.'
    );
  }

  try {
    const utapi = getUTApi();
    const utFiles = files.map((file) => {
      return new UTFile([file.buffer], file.originalname || 'file', { type: file.mimetype });
    });

    const responses = await utapi.uploadFiles(utFiles);
    const results = [];
    const errors = [];

    responses.forEach((res, index) => {
      const originalFile = files[index];
      if (res.error) {
        errors.push(`${originalFile.originalname}: ${res.error.message}`);
      } else if (res.data) {
        results.push({
          url: res.data.ufsUrl || res.data.url,
          key: res.data.key,
          filename: res.data.name || originalFile.originalname,
          originalname: originalFile.originalname,
          page_number: index + 1,
          size: res.data.size,
          provider: 'uploadthing',
        });
      }
    });

    if (results.length === 0 && errors.length > 0) {
      throw new Error(`UploadThing batch upload failed: ${errors.join(', ')}`);
    }

    return {
      success: true,
      message: `${results.length} file(s) uploaded successfully to UploadThing.`,
      files: results,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (err) {
    console.error('[UploadThing] Multi-upload error:', err);
    throw err;
  }
}

/**
 * Safely removes a file from UploadThing by its key or URL.
 */
export async function deleteFileFromStorage(fileUrl) {
  if (!fileUrl || typeof fileUrl !== 'string' || !isUploadThingConfigured()) return;

  try {
    let key = fileUrl;
    if (fileUrl.includes('/f/')) {
      key = fileUrl.split('/f/')[1]?.split('?')[0];
    }
    if (key) {
      const utapi = getUTApi();
      await utapi.deleteFiles(key);
      console.log(`[UploadThing] Deleted file with key: ${key}`);
    }
  } catch (err) {
    console.warn('[UploadThing] Failed to delete file:', err.message);
  }
}
