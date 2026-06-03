import { useCallback, useRef, useState } from "react";

/**
 * Gravador de fluxo. Enquanto ativo, cada ação real disparada no modal do
 * emulador (toque/arraste/tecla/texto/url/rotação) vira uma linha da mini-DSL.
 * Insere `wait <ms>` entre ações conforme o tempo real decorrido, p/ que o
 * replay reproduza o ritmo original.
 *
 * Uso: const rec = useRecorder(); rec.start(); ... rec.record("tap 0.5 0.5"); rec.stop()
 */
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [lines, setLines] = useState([]); // linhas da DSL (sem os waits — gerados ao montar o texto)
  const last = useRef(0); // performance.now() da última ação registrada

  const start = useCallback(() => {
    setLines([]);
    last.current = performance.now();
    setRecording(true);
  }, []);

  const stop = useCallback(() => {
    setRecording(false);
    return true;
  }, []);

  // registra uma ação; insere wait pelo tempo decorrido desde a última
  const record = useCallback((line) => {
    setLines((prev) => {
      const now = performance.now();
      const gap = Math.round(now - last.current);
      last.current = now;
      const out = [...prev];
      // só registra a espera se já houver ao menos uma ação e o intervalo for relevante
      if (out.length && gap >= 250) out.push(`wait ${Math.min(gap, 10000)}`);
      out.push(line);
      return out;
    });
  }, []);

  const reset = useCallback(() => setLines([]), []);

  // texto final do roteiro (pronto p/ salvar / rodar)
  const toScript = useCallback(() => lines.join("\n"), [lines]);

  return { recording, lines, count: lines.filter((l) => !l.startsWith("wait")).length, start, stop, record, reset, toScript };
}
