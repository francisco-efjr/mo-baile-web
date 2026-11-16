# Instruções para agentes

Vale para qualquer agente ou assistente que trabalhe neste repositório. O Mo
baile Web é a parte de tagueamento do [Mo baile](https://github.com/francisco-efjr/mo-baile)
(Analytics e Relatório) rodando como site, com motor próprio em TypeScript.
Arquitetura em [docs/ARQUITETURA.md](docs/ARQUITETURA.md), decisões em
[docs/adr/](docs/adr/), paridade com o motor Python em
[docs/PARIDADE.md](docs/PARIDADE.md).

## Regras

- **O motor é a fonte da verdade.** Regra de auditoria mora em `src/engine/`,
  nunca na interface (`src/ui/`). A interface só chama o contrato de
  `src/engine/index.ts`.
- **Paridade com o Mo baile.** As regras são um port do motor Python do Mo
  baile. Toda mudança de regra mantém `test/parity.test.ts` verde. Se a regra
  mudar no Mo baile, regenere o gabarito (`tools/golden/README.md`) e porte a
  mudança. Diferença proposital entra em `docs/PARIDADE.md`, com motivo.
- **Nada sai do navegador.** Sem chamada de rede, CDN, telemetria ou
  analytics. A CSP de `index.html` tem `connect-src 'none'` e só sai com ADR
  novo. Arquivos que a pessoa escolhe são lidos em memória e nunca enviados.
- **Privacidade.** Dados de teste sintéticos (app de exemplo `DemoApp`, hosts
  `*.demoapp.test`). Nenhum dado de pessoa ou empresa no código, nos testes,
  nas capturas ou nas mensagens de commit. Commits com o e-mail noreply do
  GitHub. O crédito ao autor fica no LICENSE, no README e no rodapé do site.
- **Identidade do Mo baile.** Tokens e componentes de
  `src/engine/assets/design_system.css` (o design system do relatório do Mo
  baile), paleta Praia, ícone e voz do produto (português do Brasil, direto,
  "você", botões com verbo no infinitivo). O aviso de produto em
  desenvolvimento e o link para relatar bug ficam sempre visíveis.
- **Versionamento:** todo push leva versão nova em SemVer (`VERSION`,
  `package.json`, seção no `CHANGELOG.md`), com `node tools/version.mjs bump`.
  A tag `vX.Y.Z`, enviada sozinha, publica o site no GitHub Pages.
- **Portão de qualidade antes de qualquer commit:** `npm run check` (versão,
  tipos, testes do motor e paridade, build) e `npm run e2e` (Playwright no
  Chrome instalado).
- **Dependência nova** só com aprovação do dono, com versão exata publicada há
  pelo menos duas semanas. Ações do GitHub fixadas por SHA.
- **Ajuda dentro do site:** `docs/ajuda/*.md`, no formato dos guias do Mo baile
  (seis seções fixas). Mudou o que uma tela faz? Atualize o guia no mesmo PR.
