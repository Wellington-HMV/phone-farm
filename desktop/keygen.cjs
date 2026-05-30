// Gerador de chave (uso do VENDEDOR). O cliente manda o ID da instalação; você roda:
//   node keygen.cjs <installId>
// e devolve a chave pra ele ativar.
const { keyFor } = require("./trial.cjs");
const id = process.argv[2];
if (!id) {
  console.error("uso: node keygen.cjs <installId>");
  process.exit(1);
}
console.log(keyFor(id));
