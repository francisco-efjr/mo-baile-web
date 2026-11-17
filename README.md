# Mo baile Web

Auditoria de tagueamento do Firebase Analytics no navegador: o **Relatório**
e o **Analytics** do [Mo baile](https://github.com/francisco-efjr/mo-baile)
rodando como site, com motor próprio em TypeScript. Não precisa instalar nada
e funciona em Windows, Linux e macOS.

> **Beta.** O Mo baile Web está em desenvolvimento e pode ter bugs. Se algo
> falhar, [relate o problema](https://github.com/francisco-efjr/mo-baile-web/issues/new?template=bug.yml)
> com dados fictícios.

## Como usar

Abra **<https://francisco-efjr.github.io/mo-baile-web/>**.

- **Relatório**: escolha (ou arraste) a spec da demanda em JSON e o log de
  eventos (logcat salvo, JSON do Firebase, JSON exportado pelo Mo baile ou
  TSV de uma exploração do Google Analytics),
  confira a plataforma e clique em **Auditar**. O resultado mostra
  validações, OK, divergentes, não disparadas, conformidade em %, eventos
  fora da spec e alertas, com Obtido × Esperado de cada parâmetro. Exporte em
  HTML, Markdown ou TSV, ou copie o resumo.
- **Importar Prints do Figma** (no quadro da spec): escolha a pasta com os
  prints dos cards e o site lê o texto no navegador (PaddleOCR) e monta o
  rascunho da spec com as mesmas regras do Mo baile. Revise as dúvidas com o
  print ao lado e use o rascunho na auditoria, ou baixe a spec, a revisão e o
  checklist. Na primeira vez, o site baixa o leitor de texto (46 MB), que fica
  guardado no navegador.
- **Analytics**: escolha um logcat salvo de um aparelho Android
  (`adb logcat -d > log.txt`) para ver os eventos e os parâmetros. Baixe em
  TSV ou JSON. O Android ao vivo pelo cabo (WebUSB) vem numa próxima versão.
- **Ajuda**: guias curtos de cada área, os mesmos de [`docs/ajuda/`](docs/ajuda/).

## Privacidade

**Seus arquivos não saem do navegador.** A spec e o log são lidos em memória
e auditados no seu computador. A página não faz chamada de rede
(`connect-src 'none'` na política de segurança), não usa CDN, fonte externa,
cookies nem telemetria. O site guarda só a escolha de tema, no próprio
navegador. A importação de prints baixa o leitor de texto do próprio site e
lê as imagens ali mesmo. Detalhes em [SECURITY.md](SECURITY.md).

## Rodar localmente

Precisa de Node 20 ou mais novo.

```bash
npm install
npm run dev        # http://127.0.0.1:5173
```

`npm run build` gera o site estático em `dist/`. O portão de qualidade e as
regras do projeto estão em [CONTRIBUTING.md](CONTRIBUTING.md) e
[AGENTS.md](AGENTS.md).

## Relação com o Mo baile

O [Mo baile](https://github.com/francisco-efjr/mo-baile) é um app de macOS
para quem escreve testes automatizados de apps mobile: espelho do aparelho,
hierarquia, Page Objects, rede HTTP, Analytics e Relatório. O Mo baile Web
traz só a parte de tagueamento para o navegador. As regras de auditoria são um
port do motor Python do Mo baile, com paridade provada por teste
([ARQUITETURA](docs/ARQUITETURA.md)). A importação de prints usa o mesmo leitor
de cards do Mo baile, mas o OCR é o PaddleOCR no navegador, e não o Vision do
macOS ([ADR 0002](docs/adr/0002-importacao-de-prints.md)). O espelho e a
escuta ao vivo continuam no app.

## Créditos e licença

Desenvolvido por Francisco Edson Ferreira Junior. Código aberto sob a
[licença MIT](LICENSE). A fonte JetBrains Mono segue a
[SIL Open Font License](public/fonts/OFL.txt) e os ícones vêm do Lucide
(licença ISC), como no design system do Mo baile.
