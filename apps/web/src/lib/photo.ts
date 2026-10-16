import type { BaseCV } from "@cv-maker/shared";

const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_STORED_DIMENSION = 900;
const OUTPUT_SIZE = 560;

export const squareCropGeometry = (
  width: number,
  height: number,
  positionX = 50,
  positionY = 50,
  zoom = 1.15,
) => {
  const safeZoom = Math.max(1, Math.min(3, zoom));
  const size = Math.min(width, height) / safeZoom;
  return {
    sourceX: Math.max(0, width - size) * (Math.max(0, Math.min(100, positionX)) / 100),
    sourceY: Math.max(0, height - size) * (Math.max(0, Math.min(100, positionY)) / 100),
    size,
  };
};

const loadImage = (source: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error("This image could not be read."));
  image.src = source;
});

const canvasContext = (width: number, height: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser could not prepare the photo.");
  return { canvas, context };
};

export const prepareProfilePhoto = async (file: File): Promise<string> => {
  if (!file.type.startsWith("image/")) throw new Error("Choose a JPG, PNG, or WebP image.");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("The photo must be smaller than 8 MB.");

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(sourceUrl);
    const scale = Math.min(1, MAX_STORED_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const { canvas, context } = canvasContext(width, height);
    context.fillStyle = "#f4f3ee";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.8);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
};

export const cropProfilePhoto = async (photo: NonNullable<BaseCV["photo"]>): Promise<string> => {
  const image = await loadImage(photo.dataUrl);
  const { sourceX, sourceY, size } = squareCropGeometry(
    image.naturalWidth,
    image.naturalHeight,
    photo.positionX,
    photo.positionY,
    photo.zoom,
  );
  const { canvas, context } = canvasContext(OUTPUT_SIZE, OUTPUT_SIZE);
  context.fillStyle = "#f4f3ee";
  context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  context.drawImage(image, sourceX, sourceY, size, size, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  return canvas.toDataURL("image/jpeg", 0.9);
};
