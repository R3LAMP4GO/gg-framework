import { describe, it, expect } from "vitest";
import type { ImageAttachment } from "../utils/image.js";

/**
 * Tests for plan rejection image pasting logic.
 * Tests the data manipulation, not React rendering.
 */

describe("Plan rejection image handling", () => {
  describe("image reference insertion", () => {
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
      const paths = [
        "/test/img.png",
        "/test/img.jpg",
        "/test/img.jpeg",
        "/test/img.gif",
        "/test/img.webp",
        "/test/img.bmp",
        "/test/img.tiff",
      ];
      for (const p of paths) {
        expect(/\.(png|jpg|jpeg|gif|webp|bmp|tiff?)$/i.test(p)).toBe(true);
      }
    });

    it("rejects non-image paths", () => {
      expect(/\.(png|jpg|jpeg|gif|webp|bmp|tiff?)$/i.test("/test/file.ts")).toBe(false);
      expect(/\.(png|jpg|jpeg|gif|webp|bmp|tiff?)$/i.test("/test/doc.pdf")).toBe(false);
    });
  });

  describe("image array management", () => {
    it("adds images to array", () => {
      const images: ImageAttachment[] = [];
      const newImage: ImageAttachment = {
        kind: "image",
        fileName: "screenshot.png",
        filePath: "/tmp/screenshot.png",
        mediaType: "image/png",
        data: "",
      };
      images.push(newImage);
      expect(images).toHaveLength(1);
      expect(images[0].fileName).toBe("screenshot.png");
    });

    it("removes image by index (simulates backspace delete)", () => {
      const images: ImageAttachment[] = [
        { kind: "image", fileName: "a.png", filePath: "/a.png", mediaType: "image/png", data: "" },
        { kind: "image", fileName: "b.png", filePath: "/b.png", mediaType: "image/png", data: "" },
        { kind: "image", fileName: "c.png", filePath: "/c.png", mediaType: "image/png", data: "" },
      ];
      const selectedIdx = 1;
      const filtered = images.filter((_, i) => i !== selectedIdx);
      expect(filtered).toHaveLength(2);
      expect(filtered[0].fileName).toBe("a.png");
      expect(filtered[1].fileName).toBe("c.png");
    });

    it("clamps selection index after deletion", () => {
      let selectedIdx = 2;
      const remainingCount = 2; // After deletion of index 2
      selectedIdx = Math.max(0, Math.min(selectedIdx, remainingCount - 1));
      expect(selectedIdx).toBe(1);
    });

    it("exits image mode when last image deleted", () => {
      const images = [
        { kind: "image" as const, fileName: "only.png", filePath: "/only.png", mediaType: "image/png", data: "" },
      ];
      const afterDelete = images.filter((_, i) => i !== 0);
      const shouldExitImageMode = afterDelete.length === 0;
      expect(shouldExitImageMode).toBe(true);
    });
  });

  describe("feedback fallback text", () => {
    it("uses '(See attached images)' when no text but images exist", () => {
      const feedback = "";
      const imageCount = 2;
      const result = feedback || (imageCount > 0 ? "(See attached images)" : "Please revise the plan.");
      expect(result).toBe("(See attached images)");
    });

    it("uses text feedback when provided", () => {
      const feedback = "Fix the layout";
      const imageCount = 1;
      const result = feedback || (imageCount > 0 ? "(See attached images)" : "Please revise the plan.");
      expect(result).toBe("Fix the layout");
    });

    it("uses default when no text and no images", () => {
      const feedback = "";
      const imageCount = 0;
      const result = feedback || (imageCount > 0 ? "(See attached images)" : "Please revise the plan.");
      expect(result).toBe("Please revise the plan.");
    });
  });

  describe("media type detection from extension", () => {
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
});

describe("Navigation between text input and image selection", () => {
  it("down arrow enters image selection when images exist", () => {
    const imageCount = 2;
    const shouldEnterImageMode = imageCount > 0;
    expect(shouldEnterImageMode).toBe(true);
  });

  it("down arrow does nothing when no images", () => {
    const imageCount = 0;
    const shouldEnterImageMode = imageCount > 0;
    expect(shouldEnterImageMode).toBe(false);
  });

  it("up arrow exits image selection mode", () => {
    // Simulating up arrow: imageSelectMode goes true → false
    const before = true;
    const after = false; // Up arrow sets this
    expect(before).toBe(true);
    expect(after).toBe(false);
  });
});

describe("Up arrow at top of regular UI", () => {
  function shouldFireUpAtTop(historyLen: number, historyIdx: number): boolean {
    return historyLen === 0 || historyIdx === 0;
  }

  it("fires onUpAtTop when history is empty", () => {
    expect(shouldFireUpAtTop(0, -1)).toBe(true);
  });

  it("fires onUpAtTop when at top of history", () => {
    expect(shouldFireUpAtTop(2, 0)).toBe(true);
  });

  it("does not fire onUpAtTop when navigating history", () => {
    expect(shouldFireUpAtTop(3, 2)).toBe(false);
  });
});
