import type { DashboardSchema } from "@/types/dashboardStudio";

export const DASHBOARD_BACKGROUND_IMAGE_LIMIT = 400 * 1024;

const MAX_BACKGROUND_WIDTH = 2048;
const JPEG_QUALITIES = [0.82, 0.7, 0.6] as const;
const SHRINK_RATIO = 0.75;

export function resolveBackgroundImageTargetSize(imageWidth: number, imageHeight: number, canvasWidth: number) {
  const width = Math.max(1, Math.min(imageWidth, canvasWidth * 2, MAX_BACKGROUND_WIDTH));
  const scale = width / imageWidth;
  return { width: Math.round(width), height: Math.max(1, Math.round(imageHeight * scale)) };
}

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
};

async function decodeImageFile(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  }
  const objectUrl = URL.createObjectURL(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("图片解析失败，请更换文件"));
    element.src = objectUrl;
  });
  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    release: () => URL.revokeObjectURL(objectUrl)
  };
}

function renderCompressedDataUrl(source: CanvasImageSource, width: number, height: number, quality: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器不支持图片压缩");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

export async function compressDashboardBackgroundImage(file: File, canvasWidth: number): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("请选择图片文件");
  }
  const decoded = await decodeImageFile(file);
  try {
    let { width, height } = resolveBackgroundImageTargetSize(decoded.width, decoded.height, canvasWidth);
    for (const quality of JPEG_QUALITIES) {
      const dataUrl = renderCompressedDataUrl(decoded.source, width, height, quality);
      if (dataUrl.length <= DASHBOARD_BACKGROUND_IMAGE_LIMIT) return dataUrl;
      width = Math.max(480, Math.round(width * SHRINK_RATIO));
      height = Math.max(270, Math.round(height * SHRINK_RATIO));
    }
    throw new Error("图片过大，压缩后仍超过限制，请更换更简单的图片");
  } finally {
    decoded.release();
  }
}

export function resolveCanvasBackgroundStyle(canvas: DashboardSchema["canvas"]): Record<string, string> {
  const style: Record<string, string> = { backgroundColor: canvas.background };
  const image = canvas.backgroundImage;
  if (image?.dataUrl) {
    style.backgroundImage = `url("${image.dataUrl}")`;
    style.backgroundSize = image.fit === "fill" ? "100% 100%" : image.fit;
    style.backgroundPosition = "center";
    style.backgroundRepeat = "no-repeat";
  }
  return style;
}
