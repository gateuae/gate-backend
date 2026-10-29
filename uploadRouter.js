import { createUploadthing } from "uploadthing/express";

const f = createUploadthing();

/**
 * UploadThing File Router for Gate Hypermarket
 * Handles image uploads for Admin Panel (Hero banners, Flyers, Blogs, Stores)
 * and Resume / CV uploads for public career applicants.
 */
export const uploadRouter = {
  // Image uploader for Admin Panel (stores, blogs, flyers, hero banners, rich editor)
  imageUploader: f({
    image: {
      maxFileSize: "32MB",
      maxFileCount: 60,
    },
  })
    .middleware(async ({ req }) => {
      // Return metadata to attach to the file in onUploadComplete
      return { uploadedAt: new Date().toISOString() };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("[UploadThing] Image upload complete:", file.url || file.ufsUrl);
      return {
        url: file.ufsUrl || file.url,
        key: file.key,
        name: file.name,
      };
    }),

  // Resume / CV uploader for Career Applicants on public website
  resumeUploader: f({
    blob: {
      maxFileSize: "16MB",
      maxFileCount: 1,
    },
  })
    .middleware(async ({ req }) => {
      return { type: "job_resume", uploadedAt: new Date().toISOString() };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("[UploadThing] Resume upload complete:", file.url || file.ufsUrl);
      return {
        url: file.ufsUrl || file.url,
        key: file.key,
        name: file.name,
      };
    }),
};

