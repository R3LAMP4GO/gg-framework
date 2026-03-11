import fs from "node:fs/promises";
import path from "node:path";
import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff", ".tif"]);

const MEDIA_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".tiff": "image/tiff",
  ".tif": "image/tiff",
};

// Matches Claude Code constants
const MAX_IMAGE_BYTES = 3_932_160; // 3.75 MB
const MAX_DIMENSION = 2000;

export interface ImageDimensions {
  originalWidth: number;
  originalHeight: number;
  displayWidth: number;
  displayHeight: number;
}

export interface ImageAttachment {
  fileName: string;
  filePath: string;
  mediaType: string;
  data: string; // base64
  dimensions?: ImageDimensions;
}

/** Detect image media type from raw buffer magic bytes. */
export function detectMediaType(buffer: Buffer): string {
  if (buffer.length < 4) return "image/png";
  // PNG: 137 80 78 71
  if (buffer[0] === 137 && buffer[1] === 80 && buffer[2] === 78 && buffer[3] === 71) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) {
    return "image/jpeg";
  }
  // GIF: 47 49 46
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return "image/gif";
  }
  // WEBP: RIFF....WEBP (bytes 8-11 = 87 69 66 80)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }
  // BMP: 42 4D
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return "image/bmp";
  }
  // TIFF: little-endian (49 49 2A 00) or big-endian (4D 4D 00 2A)
  if (
    (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
    (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a)
  ) {
    return "image/tiff";
  }
  return "image/png";
}

/** Detect media type from a base64 string. */
function detectMediaTypeFromBase64(data: string): string {
  try {
    const buf = Buffer.from(data, "base64");
    return detectMediaType(buf);
  } catch {
    return "image/png";
  }
}

/**
 * Lazily load sharp. Returns null if sharp is not available
 * (e.g. in environments where native modules can't be loaded).
 */
async function loadSharp(): Promise<typeof import("sharp") | null> {
  try {
    return (await import("sharp")).default;
  } catch {
    return null;
  }
}

interface ProcessedImage {
  buffer: Buffer;
  mediaType: string;
  dimensions?: ImageDimensions;
}

/**
 * Process an image buffer: resize if too large, compress if too heavy.
 * Mirrors Claude Code's multi-pass compression strategy.
 */
export async function processImage(
  buffer: Buffer,
  originalFormat?: string,
): Promise<ProcessedImage> {
  const sharp = await loadSharp();

  // Detect actual format from bytes
  const detectedType = detectMediaType(buffer);
  const format = detectedType.split("/")[1] === "jpeg" ? "jpeg" : detectedType.split("/")[1];

  if (!sharp) {
    // No sharp available — return raw with detected type
    return { buffer, mediaType: detectedType };
  }

  const metadata = await sharp(buffer).metadata();
  const resolvedFormat = metadata.format === "jpg" ? "jpeg" : (metadata.format ?? format);
  const mediaType =
    resolvedFormat === "jpeg"
      ? "image/jpeg"
      : resolvedFormat === "png"
        ? "image/png"
        : resolvedFormat === "webp"
          ? "image/webp"
          : resolvedFormat === "gif"
            ? "image/gif"
            : detectedType;

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (!width || !height) {
    // Can't determine dimensions — try JPEG compression if too large
    if (buffer.length > MAX_IMAGE_BYTES) {
      const compressed = await sharp(buffer).jpeg({ quality: 80 }).toBuffer();
      return { buffer: compressed, mediaType: "image/jpeg" };
    }
    return { buffer, mediaType };
  }

  let displayWidth = width;
  let displayHeight = height;

  // If within both size and dimension limits, return as-is
  if (
    buffer.length <= MAX_IMAGE_BYTES &&
    displayWidth <= MAX_DIMENSION &&
    displayHeight <= MAX_DIMENSION
  ) {
    return {
      buffer,
      mediaType,
      dimensions: {
        originalWidth: width,
        originalHeight: height,
        displayWidth,
        displayHeight,
      },
    };
  }

  const needsResize = displayWidth > MAX_DIMENSION || displayHeight > MAX_DIMENSION;
  const isPng = resolvedFormat === "png";

  // Phase 1: If only oversized in bytes (not dimensions), try compression
  if (!needsResize && buffer.length > MAX_IMAGE_BYTES) {
    if (isPng) {
      const pngCompressed = await sharp(buffer)
        .png({ compressionLevel: 9, palette: true })
        .toBuffer();
      if (pngCompressed.length <= MAX_IMAGE_BYTES) {
        return {
          buffer: pngCompressed,
          mediaType: "image/png",
          dimensions: {
            originalWidth: width,
            originalHeight: height,
            displayWidth,
            displayHeight,
          },
        };
      }
    }
    // Try JPEG at decreasing quality
    for (const quality of [80, 60, 40, 20]) {
      const jpegBuf = await sharp(buffer).jpeg({ quality }).toBuffer();
      if (jpegBuf.length <= MAX_IMAGE_BYTES) {
        return {
          buffer: jpegBuf,
          mediaType: "image/jpeg",
          dimensions: {
            originalWidth: width,
            originalHeight: height,
            displayWidth,
            displayHeight,
          },
        };
      }
    }
  }

  // Phase 2: Resize if dimensions exceed limits
  if (displayWidth > MAX_DIMENSION) {
    displayHeight = Math.round((displayHeight * MAX_DIMENSION) / displayWidth);
    displayWidth = MAX_DIMENSION;
  }
  if (displayHeight > MAX_DIMENSION) {
    displayWidth = Math.round((displayWidth * MAX_DIMENSION) / displayHeight);
    displayHeight = MAX_DIMENSION;
  }

  let resized = await sharp(buffer)
    .resize(displayWidth, displayHeight, { fit: "inside", withoutEnlargement: true })
    .toBuffer();

  // If resized is within limit, return
  if (resized.length <= MAX_IMAGE_BYTES) {
    return {
      buffer: resized,
      mediaType,
      dimensions: {
        originalWidth: width,
        originalHeight: height,
        displayWidth,
        displayHeight,
      },
    };
  }

  // Phase 3: Resized but still too large — compress
  if (isPng) {
    const pngCompressed = await sharp(buffer)
      .resize(displayWidth, displayHeight, { fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9, palette: true })
      .toBuffer();
    if (pngCompressed.length <= MAX_IMAGE_BYTES) {
      return {
        buffer: pngCompressed,
        mediaType: "image/png",
        dimensions: {
          originalWidth: width,
          originalHeight: height,
          displayWidth,
          displayHeight,
        },
      };
    }
  }

  for (const quality of [80, 60, 40, 20]) {
    const jpegBuf = await sharp(buffer)
      .resize(displayWidth, displayHeight, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
    if (jpegBuf.length <= MAX_IMAGE_BYTES) {
      return {
        buffer: jpegBuf,
        mediaType: "image/jpeg",
        dimensions: {
          originalWidth: width,
          originalHeight: height,
          displayWidth,
          displayHeight,
        },
      };
    }
  }

  // Phase 4: Last resort — resize to 1000px and JPEG quality 20
  const fallbackWidth = Math.min(displayWidth, 1000);
  const fallbackHeight = Math.round((displayHeight * fallbackWidth) / Math.max(displayWidth, 1));
  const lastResort = await sharp(buffer)
    .resize(fallbackWidth, fallbackHeight, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 20 })
    .toBuffer();

  return {
    buffer: lastResort,
    mediaType: "image/jpeg",
    dimensions: {
      originalWidth: width,
      originalHeight: height,
      displayWidth: fallbackWidth,
      displayHeight: fallbackHeight,
    },
  };
}

/** Check if a file path points to an image based on extension. */
export function isImagePath(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

function resolvePath(filePath: string, cwd: string): string {
  let resolved = filePath.trim();
  // Strip surrounding quotes
  if (
    (resolved.startsWith("'") && resolved.endsWith("'")) ||
    (resolved.startsWith('"') && resolved.endsWith('"'))
  ) {
    resolved = resolved.slice(1, -1);
  }
  // Strip file:// prefix
  if (resolved.startsWith("file://")) {
    resolved = resolved.slice(7);
  }
  // Resolve home dir
  if (resolved.startsWith("~/")) {
    resolved = path.join(process.env.HOME ?? "/", resolved.slice(2));
  } else if (!path.isAbsolute(resolved)) {
    resolved = path.join(cwd, resolved);
  }
  return resolved;
}

/**
 * Extract image file paths from input text by checking if tokens resolve
 * to existing image files on disk. Returns verified paths and the remaining text.
 */
export async function extractImagePaths(
  text: string,
  cwd: string,
): Promise<{ imagePaths: string[]; cleanText: string }> {
  const imagePaths: string[] = [];
  const cleanParts: string[] = [];

  // Try the entire input as a single path first
  const wholePath = resolvePath(text, cwd);
  if (isImagePath(wholePath) && (await fileExists(wholePath))) {
    return { imagePaths: [wholePath], cleanText: "" };
  }

  // Split on whitespace and check each token
  const tokens = text.split(/\s+/);
  for (const token of tokens) {
    if (!token) continue;
    const resolved = resolvePath(token, cwd);
    if (isImagePath(resolved) && (await fileExists(resolved))) {
      imagePaths.push(resolved);
    } else {
      cleanParts.push(token);
    }
  }

  return { imagePaths, cleanText: cleanParts.join(" ") };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

/** Read an image file, process it (resize/compress), and return as ImageAttachment. */
export async function readImageFile(filePath: string): Promise<ImageAttachment> {
  const buffer = await fs.readFile(filePath);
  const processed = await processImage(buffer);
  const data = processed.buffer.toString("base64");
  return {
    fileName: path.basename(filePath),
    filePath,
    mediaType: processed.mediaType,
    data,
    dimensions: processed.dimensions,
  };
}

/** Get a platform-specific message when no image is found on clipboard. */
export function getNoImageMessage(): string {
  const messages: Record<string, string> = {
    darwin:
      "No image found in clipboard. Use Cmd + Ctrl + Shift + 4 to copy a screenshot to clipboard.",
    linux:
      "No image found in clipboard. Use appropriate screenshot tool to copy a screenshot to clipboard.",
    win32:
      "No image found in clipboard. Use Print Screen to copy a screenshot to clipboard.",
  };
  return messages[process.platform] ?? messages.linux;
}

/** Detect if running inside WSL. */
let _isWSL: boolean | null = null;
async function isWSL(): Promise<boolean> {
  if (_isWSL !== null) return _isWSL;
  try {
    const procVersion = await fs.readFile("/proc/version", "utf-8");
    _isWSL = /microsoft/i.test(procVersion);
  } catch {
    _isWSL = false;
  }
  return _isWSL;
}

/**
 * Try to read image data from the system clipboard.
 * Supports macOS (osascript), Linux (xclip / wl-paste), and WSL (PowerShell).
 * Returns null if no image is on the clipboard.
 */
export async function getClipboardImage(): Promise<ImageAttachment | null> {
  if (process.platform === "darwin") {
    return getClipboardImageMacOS();
  }
  if (process.platform === "linux") {
    // Try WSL first if applicable
    if (await isWSL()) {
      const wslResult = await getClipboardImageWSL();
      if (wslResult) return wslResult;
    }
    return getClipboardImageLinux();
  }
  return null;
}

/** macOS clipboard image extraction via osascript. */
function getClipboardImageMacOS(): Promise<ImageAttachment | null> {
  return new Promise((resolve) => {
    // Check if clipboard has image data
    execFile("osascript", ["-e", "clipboard info"], (err, stdout) => {
      if (err || (!stdout.includes("PNGf") && !stdout.includes("TIFF"))) {
        resolve(null);
        return;
      }

      // Determine format — prefer PNG
      const isPng = stdout.includes("PNGf");
      const clipClass = isPng ? "PNGf" : "TIFF";
      const ext = isPng ? "png" : "tiff";

      // Write clipboard image to temp file, then read as base64
      const tmpPath = `/tmp/ggcoder-clipboard-${Date.now()}.${ext}`;
      const writeScript = [
        `set imgData to the clipboard as «class ${clipClass}»`,
        `set filePath to POSIX file "${tmpPath}"`,
        `set fileRef to open for access filePath with write permission`,
        `write imgData to fileRef`,
        `close access fileRef`,
      ].join("\n");

      execFile("osascript", ["-e", writeScript], async (writeErr) => {
        if (writeErr) {
          resolve(null);
          return;
        }
        try {
          const rawBuffer = await fs.readFile(tmpPath);
          await fs.unlink(tmpPath).catch(() => {});
          const processed = await processImage(rawBuffer);
          resolve({
            fileName: `clipboard.${ext}`,
            filePath: tmpPath,
            mediaType: processed.mediaType,
            data: processed.buffer.toString("base64"),
            dimensions: processed.dimensions,
          });
        } catch {
          resolve(null);
        }
      });
    });
  });
}

/** Linux clipboard image extraction via xclip or wl-paste. */
async function getClipboardImageLinux(): Promise<ImageAttachment | null> {
  const tmpPath = `/tmp/ggcoder-clipboard-${Date.now()}.png`;

  // Try xclip first (X11)
  try {
    const { exitCode: checkCode } = await execSafe(
      'xclip -selection clipboard -t TARGETS -o 2>/dev/null | grep -qE "image/(png|jpeg|jpg|gif|webp)"',
    );
    if (checkCode === 0) {
      const { exitCode: saveCode } = await execSafe(
        `xclip -selection clipboard -t image/png -o > "${tmpPath}" 2>/dev/null`,
      );
      if (saveCode === 0) {
        return await readClipboardTmpFile(tmpPath);
      }
    }
  } catch {
    // xclip not available, try wl-paste
  }

  // Try wl-paste (Wayland)
  try {
    const { exitCode: checkCode } = await execSafe(
      'wl-paste --list-types 2>/dev/null | grep -qE "image/(png|jpeg|jpg|gif|webp)"',
    );
    if (checkCode === 0) {
      const { exitCode: saveCode } = await execSafe(
        `wl-paste --type image/png > "${tmpPath}" 2>/dev/null`,
      );
      if (saveCode === 0) {
        return await readClipboardTmpFile(tmpPath);
      }
    }
  } catch {
    // wl-paste not available
  }

  return null;
}

/** WSL clipboard image extraction via PowerShell. */
async function getClipboardImageWSL(): Promise<ImageAttachment | null> {
  const tmpPath = `/tmp/ggcoder-clipboard-${Date.now()}.png`;
  try {
    // Use PowerShell to save clipboard image as PNG
    const psScript = `
      Add-Type -AssemblyName System.Windows.Forms;
      $img = [System.Windows.Forms.Clipboard]::GetImage();
      if ($img -ne $null) {
        $img.Save('$(wslpath -w "${tmpPath}")', [System.Drawing.Imaging.ImageFormat]::Png);
        Write-Output 'OK';
      }
    `.replace(/\n\s*/g, " ");
    const { exitCode, stdout } = await execSafe(
      `powershell.exe -NoProfile -Command "${psScript}" 2>/dev/null`,
    );
    if (exitCode === 0 && stdout.includes("OK")) {
      return await readClipboardTmpFile(tmpPath);
    }
  } catch {
    // PowerShell not available
  }
  return null;
}

/** Helper to check if clipboard has an image on the current platform without extracting it. */
export async function clipboardHasImage(): Promise<boolean> {
  if (process.platform === "darwin") {
    return new Promise((resolve) => {
      execFile("osascript", ["-e", "clipboard info"], (err, stdout) => {
        resolve(!err && (stdout.includes("PNGf") || stdout.includes("TIFF")));
      });
    });
  }
  if (process.platform === "linux") {
    // Check WSL first
    if (await isWSL()) {
      try {
        const { exitCode, stdout } = await execSafe(
          `powershell.exe -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::ContainsImage()" 2>/dev/null`,
        );
        if (exitCode === 0 && stdout.trim() === "True") return true;
      } catch {
        /* PowerShell not available */
      }
    }
    try {
      const { exitCode } = await execSafe(
        'xclip -selection clipboard -t TARGETS -o 2>/dev/null | grep -qE "image/(png|jpeg|jpg|gif|webp)"',
      );
      if (exitCode === 0) return true;
    } catch {
      /* xclip not available */
    }
    try {
      const { exitCode } = await execSafe(
        'wl-paste --list-types 2>/dev/null | grep -qE "image/(png|jpeg|jpg|gif|webp)"',
      );
      if (exitCode === 0) return true;
    } catch {
      /* wl-paste not available */
    }
  }
  return false;
}

/** Read a tmp clipboard file, process, and clean up. */
async function readClipboardTmpFile(tmpPath: string): Promise<ImageAttachment | null> {
  try {
    const rawBuffer = await fs.readFile(tmpPath);
    await fs.unlink(tmpPath).catch(() => {});
    if (rawBuffer.length === 0) return null;
    const processed = await processImage(rawBuffer);
    return {
      fileName: "clipboard.png",
      filePath: tmpPath,
      mediaType: processed.mediaType,
      data: processed.buffer.toString("base64"),
      dimensions: processed.dimensions,
    };
  } catch {
    return null;
  }
}

/** Execute a shell command and return exit code without throwing. */
async function execSafe(
  command: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execAsync(command, { timeout: 5000 });
    return { exitCode: 0, stdout, stderr };
  } catch (err: any) {
    return {
      exitCode: err.code ?? 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
    };
  }
}
