# Contribuindo com o Phone Farm

Valeu por querer ajudar! Issues e PRs são bem-vindos — em português ou inglês.

## Rodar localmente

```bash
git clone https://github.com/Wellington-HMV/phone-farm.git
cd phone-farm && npm install && (cd server && npm install)
npm start                 # http://localhost:4000 (sem Android SDK = modo mock)
```

Dev com hot reload: `cd server && npm run dev` + `npm run dev` (porta 5173).

## Antes do PR

- `cd server && npm test` passando.
- `npm run build` sem erro.
- Mudança de UI? Coloque um print no PR.
- Um assunto por PR, commits no estilo `feat: …`, `fix: …`, `docs: …`.

## Por onde começar

Veja as issues com a etiqueta
[`good first issue`](https://github.com/Wellington-HMV/phone-farm/labels/good%20first%20issue)
e o [`PLANO.md`](./PLANO.md) (itens `[ ]` são trabalho em aberto).

## Escopo

Phone Farm é para QA, testes e automação de **apps próprios**. PRs voltados a fraude,
multi-conta ou burla de Termos de Serviço de terceiros não serão aceitos.
