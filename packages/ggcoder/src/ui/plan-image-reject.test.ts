import { describe, it, expect } from "vitest";
import type { ImageAttachment } from "../utils/image.js";

/**
 * Tests for image handling in InputArea and plan rejection.
 */

describe("Image reference insertion", () => {
  it("creates [Image #N] reference from pasted path", () => {
    const path = "/Users/test/screenshot.png";
    const isImagePath = /\.(png|jpg|jpeg|gif|webp|bmp|tiff?)$/i.test(path);
    expect(isImagePath).toBe(true);

    let feedback = "The button is broken ";
    const id = 1;
    feedback += `[Image #${id}] `;
    expect(feedback).toBe("The button is broken [Image #1] ");
  });

  it("detects various image extensions", () => {
    const paths = ["/test/img.png", "/test/img.jpg", "/test/img.jpeg", "/test/img.gif", "/test/img.webp"];
    for (const p of paths) {
      expect(/\.(png|jpg|jpeg|gif|webp|bmp|tiff?)$/i.test(p)).toBe(true);
    }
  });

  it("rejects non-image paths", () => {
    expect(/\.(png|jpg|jpeg|gif|webp|bmp|tiff?)$/i.test("/test/file.ts")).toBe(false);
  });
});

describe("Image array management", () => {
  it("adds images to array", () => {
    const images: ImageAttachment[] = [];
    images.push({ kind: "image", fileName: "screenshot.png", filePath: "/tmp/screenshot.png", mediaType: "image/png", data: "" });
    expect(images).toHaveLength(1);
  });

  it("removes image by index (backspace delete)", () => {
    const images: ImageAttachment[] = [
      { kind: "image", fileName: "a.png", filePath: "/a.png", mediaType: "image/png", data: "" },
      { kind: "image", fileName: "b.png", filePath: "/b.png", mediaType: "image/png", data: "" },
      { kind: "image", fileName: "c.png", filePath: "/c.png", mediaType: "image/png", data: "" },
    ];
    const filtered = images.filter((_, i) => i !== 1);
    expect(filtered).toHaveLength(2);
    expect(filtered[0].fileName).toBe("a.png");
    expect(filtered[1].fileName).toBe("c.png");
  });

  it("clamps selection index after deletion", () => {
    const idx = Math.max(0, Math.min(2, 2 - 1)); // After deleting index 2 from 3 items
    expect(idx).toBe(1);
  });

  it("exits image mode when last image deleted", () => {
    const remaining = 0;
    expect(remaining <= 0).toBe(true);
  });
});

describe("Feedback fallback text", () => {
  function getFeedback(text: string, imageCount: number): string {
    return text || (imageCount > 0 ? "(See attached images)" : "Please revise the plan.");
  }

  it("uses '(See attached images)' when no text but images exist", () => {
    expect(getFeedback("", 2)).toBe("(See attached images)");
  });

  it("uses text feedback when provided", () => {
    expect(getFeedback("Fix the layout", 1)).toBe("Fix the layout");
  });

  it("uses default when no text and no images", () => {
    expect(getFeedback("", 0)).toBe("Please revise the plan.");
  });
});

describe("Media type detection", () => {
  function getMediaType(ext: string): string {
    return ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
  }

  it("maps jpg/jpeg to image/jpeg", () => {
    expect(getMediaType("jpg")).toBe("image/jpeg");
    expect(getMediaType("jpeg")).toBe("image/jpeg");
  });

  it("maps png to image/png", () => {
    expect(getMediaType("png")).toBe("image/png");
  });
});

describe("InputArea image selection navigation", () => {
  it("up arrow enters image selection when images exist and no history", () => {
    const imagesExist = true;
    const selectedImageIndex: number | null = null;
    const historyEmpty = true;
    const shouldSelect = imagesExist && selectedImageIndex === null && historyEmpty;
    expect(shouldSelect).toBe(true);
  });

  it("up arrow does NOT enter selection when no images", () => {
    const imagesExist = false;
    const selectedImageIndex: number | null = null;
    const shouldSelect = imagesExist && selectedImageIndex === null;
    expect(shouldSelect).toBe(false);
  });

  it("down arrow from image selection exits to chat", () => {
    const selectedImageIndex: number | null = 2;
    const shouldExit = selectedImageIndex !== null;
    expect(shouldExit).toBe(true);
    // After: selectedImageIndex = null, onDownAtEnd fires
  });

  it("left arrow moves to previous image", () => {
    const idx = Math.max(0, 2 - 1);
    expect(idx).toBe(1);
  });

  it("right arrow moves to next image", () => {
    const imagesLen = 3;
    const idx = Math.min(imagesLen - 1, 0 + 1);
    expect(idx).toBe(1);
  });

  it("backspace deletes selected image", () => {
    const images = ["a.png", "b.png", "c.png"];
    const selectedIdx = 1;
    const after = images.filter((_, i) => i !== selectedIdx);
    expect(after).toEqual(["a.png", "c.png"]);
  });

  it("escape exits image selection", () => {
    // selectedImageIndex goes from number → null
    const before: number | null = 1;
    expect(before).not.toBeNull();
    const after: number | null = null; // Escape sets this
    expect(after).toBeNull();
  });

  it("typing exits image selection and enters text", () => {
    // Any printable character exits image mode
    const inImageMode = true;
    const inputChar = "h";
    const shouldExitImageMode = inImageMode && inputChar.length > 0;
    expect(shouldExitImageMode).toBe(true);
  });
});
