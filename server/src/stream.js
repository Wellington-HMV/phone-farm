// Stream MJPEG de um device: captura frames (screencap) em loop, opcionalmente
// encolhe (transform), e empurra como multipart/x-mixed-replace.
// O <img> do browser renderiza nativo, sem decode no cliente.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param res        resposta HTTP
 * @param capture    async () => Buffer|null      (1 frame PNG cru)
 * @param opts.fps   frames por segundo (default 3)
 * @param opts.transform async (png) => {buf,type} (default: PNG cru)
 */
export function startMjpeg(res, capture, { fps = 3, transform = null } = {}) {
  const boundary = "phonefarmframe";
  res.writeHead(200, {
    "Content-Type": `multipart/x-mixed-replace; boundary=${boundary}`,
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    Connection: "keep-alive",
  });

  let alive = true;
  const interval = Math.max(100, Math.round(1000 / fps));
  res.on("close", () => { alive = false; });

  (async () => {
    while (alive) {
      const t0 = Date.now();
      let frame = null;
      try {
        const png = await capture();
        frame = transform ? await transform(png) : png && { buf: png, type: "png" };
      } catch {
        frame = null;
      }
      if (!alive) break;
      if (frame && frame.buf && frame.buf.length) {
        res.write(
          `--${boundary}\r\nContent-Type: image/${frame.type}\r\nContent-Length: ${frame.buf.length}\r\n\r\n`
        );
        res.write(frame.buf);
        res.write("\r\n");
      }
      const elapsed = Date.now() - t0;
      await sleep(Math.max(0, interval - elapsed));
    }
    try { res.end(); } catch {}
  })();
}
