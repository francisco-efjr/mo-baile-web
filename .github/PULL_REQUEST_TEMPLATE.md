## O que muda

## Por quê

## Como testei

## Checklist

- [ ] `npm run check` passou (versão, tipos, motor e paridade, build)
- [ ] `npm run e2e` passou
- [ ] Versão subida com `node tools/version.mjs bump ...` e seção no `CHANGELOG.md`
- [ ] Regra nova ou alterada está no motor (`src/engine/`), com paridade ou divergência registrada em `docs/PARIDADE.md`
- [ ] Mudou o que uma tela faz? Guia em `docs/ajuda/` atualizado
- [ ] Sem dado real de pessoa, cliente ou empresa no diff, nos testes e nas capturas
- [ ] Nenhuma chamada de rede nova
