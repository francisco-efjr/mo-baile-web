# Changelog

Todas as mudanças relevantes do Mo baile Web ficam aqui, da mais nova para a
mais antiga. O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e a numeração segue o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [0.1.0] - 2026-11-16

### Adicionado

- Primeira versão (beta) do Mo baile Web: a parte de tagueamento do Mo baile
  como site, sem instalar nada e sem mandar arquivo para lugar nenhum.
- **Relatório:** escolher a spec da demanda (JSON) e o log (logcat salvo, JSON
  do Firebase ou JSON exportado pelo Mo baile), auditar e ver o resultado com o
  percentual de conformidade, os cartões por status, a tabela com esperado ×
  obtido, o que ficou fora da spec e os alertas; exportar o relatório HTML
  (o mesmo do Mo baile, com pré-visualização no site), Markdown e TSV.
- **Analytics:** ler um logcat salvo do Android e ver os eventos do Firebase,
  com busca, detalhe dos parâmetros e exportação em TSV e JSON.
- **Ajuda** com guias curtos e "Experimentar com um Exemplo".
- **Motor próprio em TypeScript**, port das regras do Mo baile, com paridade
  provada por gabarito gerado pelo motor Python (23 casos sintéticos, relatório
  HTML idêntico byte a byte).
- Identidade do Mo baile (design system do relatório, paleta Praia clara e
  escura), selo Beta e Relatar um Problema.
- Privacidade: a página não faz chamada de rede (CSP `connect-src 'none'`), e
  o relatório roda na pré-visualização com scripts e estilos liberados só por
  hash.
