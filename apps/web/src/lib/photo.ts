import type { BaseCV } from "@cv-maker/shared";

const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_STORED_DIMENSION = 900;
const OUTPUT_SIZE = 560;

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
  const side = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = (image.naturalWidth - side) * ((photo.positionX ?? 50) / 100);
  const sourceY = (image.naturalHeight - side) * ((photo.positionY ?? 50) / 100);
  const { canvas, context } = canvasContext(OUTPUT_SIZE, OUTPUT_SIZE);
  context.fillStyle = "#f4f3ee";
  context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  context.drawImage(image, sourceX, sourceY, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  return canvas.toDataURL("image/jpeg", 0.9);
};
