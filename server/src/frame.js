// Encolhe frames p/ a grade ao vivo ficar leve: PNG cheio (~1.4MB @1080p) ->
// JPEG redimensionado (~30-80KB). Usa sharp; se faltar, devolve o PNG original.

let sharp = null;
let tried = false;

async function getSharp() {
  if (tried) return sharp;
  tried = true;
  try {
    sharp = (await import("sharp")).default;
  } catch (e) {
    console.warn("[frame] sharp indisponível — frames sem downscale (PNG cheio):", e.message);
    sharp = null;
  }
  return sharp;
}

/**
 * @param png   Buffer PNG do screencap (ou null)
 * @param w     largura alvo (px); 0/undefined = mantém original
 * @param q     qualidade JPEG (1-100)
 * @returns {{ buf: Buffer, type: "jpeg"|"png" }|null}
 */
export async function shrink(png, { w = 0, q = 60 } = {}) {
  if (!png || !png.length) return null;
  if (!w) return { buf: png, type: "png" };
  const s = await getSharp();
  if (!s) return { buf: png, type: "png" };
  try {
    const buf = await s(png).resize({ width: w, withoutEnlargement: true }).jpeg({ quality: q }).toBuffer();
    return { buf, type: "jpeg" };
  } catch {
    return { buf: png, type: "png" };
  }
}
