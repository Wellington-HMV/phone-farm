// Escolhe a fonte de devices: adb real se disponível + tiver device; senão mock.
// Force com env FORCE_MOCK=1 (sempre mock) ou FORCE_ADB=1 (sempre adb).

import { createMockSource } from "./mockSource.js";
import { createAdbSource, adbAvailable } from "./adbSource.js";

export async function chooseSource() {
  const mockN = Number(process.env.MOCK_N) || 12; // quantidade de devices fake

  if (process.env.FORCE_MOCK === "1") {
    console.log(`[source] FORCE_MOCK → mock (${mockN} devices)`);
    return createMockSource(mockN);
  }
  if (process.env.FORCE_ADB === "1") {
    console.log("[source] FORCE_ADB → adb");
    return createAdbSource();
  }

  const hasAdb = await adbAvailable();
  if (!hasAdb) {
    console.log("[source] adb não encontrado → mock (instale platform-tools p/ devices reais)");
    return createMockSource(mockN);
  }

  // adb disponível → usa sempre. Emuladores e devices USB aparecem aqui ao bootar.
  const adb = createAdbSource();
  const found = await adb.list();
  console.log(`[source] adb ok (${found.length} device(s) agora) → adb`);
  return adb;
}
