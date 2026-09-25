const A4_RATIO = Math.SQRT2

export async function cropImageToA4(image: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(image)
  try {
    const width = Math.min(bitmap.width, Math.round(bitmap.height / A4_RATIO))
    const height = Math.min(bitmap.height, Math.round(bitmap.width * A4_RATIO))
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    try {
      const context = canvas.getContext("2d")
      if (!context) throw new Error("Could not crop translated image")
      context.fillStyle = "white"
      context.fillRect(0, 0, width, height)
      context.drawImage(bitmap, (bitmap.width - width) / 2, (bitmap.height - height) / 2,
        width, height, 0, 0, width, height)
      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => blob?.type === "image/jpeg"
          ? resolve(blob)
          : reject(new Error("Could not encode translated image as JPEG")), "image/jpeg", 0.9)
      })
    } finally {
      canvas.width = 0
      canvas.height = 0
    }
  } finally {
    bitmap.close()
  }
}
