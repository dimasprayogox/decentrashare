import { describe, expect, test } from 'bun:test';

describe('Feature: file upload filtering and size limits', () => {
  test('given the upload middleware is configured, when its settings are inspected, then the file size limit is 100MB and max 10 files', async () => {
    const { uploadMiddleware } = await import('../../../src/middlewares/upload.middleware');

    // Multer exposes limits on the instance
    const limits = (uploadMiddleware as any).limits;
    expect(limits.fileSize).toBe(100 * 1024 * 1024);
    expect(limits.files).toBe(10);
  });

  test('given a PDF file, when the file filter runs, then the file is accepted', async () => {
    const { uploadMiddleware } = await import('../../../src/middlewares/upload.middleware');
    const fileFilter = (uploadMiddleware as any).fileFilter;

    await new Promise<void>((resolve, reject) => {
      fileFilter({}, { mimetype: 'application/pdf', originalname: 'test.pdf' }, (err: any, accepted: boolean) => {
        try {
          expect(err).toBeNull();
          expect(accepted).toBe(true);
          resolve();
        } catch (e) { reject(e); }
      });
    });
  });

  test('given a JPEG image, when the file filter runs, then the file is accepted', async () => {
    const { uploadMiddleware } = await import('../../../src/middlewares/upload.middleware');
    const fileFilter = (uploadMiddleware as any).fileFilter;

    await new Promise<void>((resolve, reject) => {
      fileFilter({}, { mimetype: 'image/jpeg', originalname: 'photo.jpg' }, (err: any, accepted: boolean) => {
        try {
          expect(err).toBeNull();
          expect(accepted).toBe(true);
          resolve();
        } catch (e) { reject(e); }
      });
    });
  });

  test('given a PNG image, when the file filter runs, then the file is accepted', async () => {
    const { uploadMiddleware } = await import('../../../src/middlewares/upload.middleware');
    const fileFilter = (uploadMiddleware as any).fileFilter;

    await new Promise<void>((resolve, reject) => {
      fileFilter({}, { mimetype: 'image/png', originalname: 'screenshot.png' }, (err: any, accepted: boolean) => {
        try {
          expect(err).toBeNull();
          expect(accepted).toBe(true);
          resolve();
        } catch (e) { reject(e); }
      });
    });
  });

  test('given a MP4 video, when the file filter runs, then the file is accepted', async () => {
    const { uploadMiddleware } = await import('../../../src/middlewares/upload.middleware');
    const fileFilter = (uploadMiddleware as any).fileFilter;

    await new Promise<void>((resolve, reject) => {
      fileFilter({}, { mimetype: 'video/mp4', originalname: 'clip.mp4' }, (err: any, accepted: boolean) => {
        try {
          expect(err).toBeNull();
          expect(accepted).toBe(true);
          resolve();
        } catch (e) { reject(e); }
      });
    });
  });

  test('given an MP3 audio file, when the file filter runs, then the file is accepted', async () => {
    const { uploadMiddleware } = await import('../../../src/middlewares/upload.middleware');
    const fileFilter = (uploadMiddleware as any).fileFilter;

    await new Promise<void>((resolve, reject) => {
      fileFilter({}, { mimetype: 'audio/mpeg', originalname: 'song.mp3' }, (err: any, accepted: boolean) => {
        try {
          expect(err).toBeNull();
          expect(accepted).toBe(true);
          resolve();
        } catch (e) { reject(e); }
      });
    });
  });

  test('given a JSON file, when the file filter runs, then the file is rejected', async () => {
    const { uploadMiddleware } = await import('../../../src/middlewares/upload.middleware');
    const fileFilter = (uploadMiddleware as any).fileFilter;

    await new Promise<void>((resolve, reject) => {
      fileFilter({}, { mimetype: 'application/json', originalname: 'data.json' }, (err: any, accepted: boolean) => {
        try {
          expect(err).toBeInstanceOf(Error);
          expect(accepted).toBe(false);
          resolve();
        } catch (e) { reject(e); }
      });
    });
  });

  test('given a plain text file, when the file filter runs, then the file is rejected', async () => {
    const { uploadMiddleware } = await import('../../../src/middlewares/upload.middleware');
    const fileFilter = (uploadMiddleware as any).fileFilter;

    await new Promise<void>((resolve, reject) => {
      fileFilter({}, { mimetype: 'text/plain', originalname: 'readme.txt' }, (err: any, accepted: boolean) => {
        try {
          expect(err).toBeInstanceOf(Error);
          expect(accepted).toBe(false);
          resolve();
        } catch (e) { reject(e); }
      });
    });
  });

  test('given an executable file, when the file filter runs, then the file is rejected with a descriptive error', async () => {
    const { uploadMiddleware } = await import('../../../src/middlewares/upload.middleware');
    const fileFilter = (uploadMiddleware as any).fileFilter;

    await new Promise<void>((resolve, reject) => {
      fileFilter({}, { mimetype: 'application/x-msdownload', originalname: 'malware.exe' }, (err: any, accepted: boolean) => {
        try {
          expect(err).toBeInstanceOf(Error);
          expect(err.message).toContain('Unsupported file type');
          expect(err.message).toContain('malware.exe');
          expect(accepted).toBe(false);
          resolve();
        } catch (e) { reject(e); }
      });
    });
  });

  test('given a ZIP archive, when the file filter runs, then the file is rejected', async () => {
    const { uploadMiddleware } = await import('../../../src/middlewares/upload.middleware');
    const fileFilter = (uploadMiddleware as any).fileFilter;

    await new Promise<void>((resolve, reject) => {
      fileFilter({}, { mimetype: 'application/zip', originalname: 'archive.zip' }, (err: any, accepted: boolean) => {
        try {
          expect(err).toBeInstanceOf(Error);
          expect(err.message).toContain('Unsupported file type');
          expect(accepted).toBe(false);
          resolve();
        } catch (e) { reject(e); }
      });
    });
  });

  test('given an MP3 file with octet-stream MIME type, when the file filter runs, then it falls back to extension check and accepts', async () => {
    const { uploadMiddleware } = await import('../../../src/middlewares/upload.middleware');
    const fileFilter = (uploadMiddleware as any).fileFilter;

    await new Promise<void>((resolve, reject) => {
      fileFilter({}, { mimetype: 'application/octet-stream', originalname: 'track.mp3' }, (err: any, accepted: boolean) => {
        try {
          expect(err).toBeNull();
          expect(accepted).toBe(true);
          resolve();
        } catch (e) { reject(e); }
      });
    });
  });

  test('given a WAV file with octet-stream MIME type, when the file filter runs, then it falls back to extension check and accepts', async () => {
    const { uploadMiddleware } = await import('../../../src/middlewares/upload.middleware');
    const fileFilter = (uploadMiddleware as any).fileFilter;

    await new Promise<void>((resolve, reject) => {
      fileFilter({}, { mimetype: 'application/octet-stream', originalname: 'audio.wav' }, (err: any, accepted: boolean) => {
        try {
          expect(err).toBeNull();
          expect(accepted).toBe(true);
          resolve();
        } catch (e) { reject(e); }
      });
    });
  });

  test('given a CSV file, when the file filter runs, then the file is accepted', async () => {
    const { uploadMiddleware } = await import('../../../src/middlewares/upload.middleware');
    const fileFilter = (uploadMiddleware as any).fileFilter;

    await new Promise<void>((resolve, reject) => {
      fileFilter({}, { mimetype: 'text/csv', originalname: 'data.csv' }, (err: any, accepted: boolean) => {
        try {
          expect(err).toBeNull();
          expect(accepted).toBe(true);
          resolve();
        } catch (e) { reject(e); }
      });
    });
  });

  test('given an unsupported WebP image, when the file filter runs, then the file is rejected', async () => {
    const { uploadMiddleware } = await import('../../../src/middlewares/upload.middleware');
    const fileFilter = (uploadMiddleware as any).fileFilter;

    await new Promise<void>((resolve, reject) => {
      fileFilter({}, { mimetype: 'image/webp', originalname: 'image.webp' }, (err: any, accepted: boolean) => {
        try {
          expect(err).toBeInstanceOf(Error);
          expect(accepted).toBe(false);
          resolve();
        } catch (e) { reject(e); }
      });
    });
  });

  test('given an iPhone MOV video file, when the file filter runs, then the file is accepted', async () => {
    const { uploadMiddleware } = await import('../../../src/middlewares/upload.middleware');
    const fileFilter = (uploadMiddleware as any).fileFilter;

    await new Promise<void>((resolve, reject) => {
      fileFilter({}, { mimetype: 'video/quicktime', originalname: 'video.mov' }, (err: any, accepted: boolean) => {
        try {
          expect(err).toBeNull();
          expect(accepted).toBe(true);
          resolve();
        } catch (e) { reject(e); }
      });
    });
  });

  test('given an iPhone HEIC image file, when the file filter runs, then the file is accepted', async () => {
    const { uploadMiddleware } = await import('../../../src/middlewares/upload.middleware');
    const fileFilter = (uploadMiddleware as any).fileFilter;

    await new Promise<void>((resolve, reject) => {
      fileFilter({}, { mimetype: 'image/heic', originalname: 'photo.heic' }, (err: any, accepted: boolean) => {
        try {
          expect(err).toBeNull();
          expect(accepted).toBe(true);
          resolve();
        } catch (e) { reject(e); }
      });
    });
  });
});

