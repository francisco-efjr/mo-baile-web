# Inventário de funcionalidades (ponta a ponta)

Os specs rodam no site construído (`vite build` + `vite preview` em
`127.0.0.1:4173`), no Chrome instalado, nos projetos `desktop` e `celular`.
A fonte do esperado é o gabarito do motor Python do Mo baile em `test/golden/`
(campos `summary`, `markdown`, `tsv`, `error` e o `.analytics.json`) e os
textos do código de `src/ui/`. Dados: só o corpus sintético de `test/corpus/`
(app `DemoApp`, hosts `*.demoapp.test`). Apoio comum em `e2e/apoio.ts`.

| ID | Funcionalidade | Superfície | Risco | Dados sintéticos | Spec |
|---|---|---|---|---|---|
| F-01 | Página: título, selo Beta, aviso de privacidade, link de relato, rodapé com versão, nenhuma requisição externa | `site.ts`, `index.html` (CSP) | Alto | exemplo embutido | `F-01-pagina.spec.ts` |
| F-02 | Exemplo embutido: Experimentar com um Exemplo e Auditar | Relatório | Alto | caso 01 | `F-02-exemplo.spec.ts` |
| F-03 | Relatório por arquivos: resumo, filtro por status, busca, detalhe Esperado × Obtido, plataforma, log JSON | Relatório | Alto | casos 11, 20, 08 | `F-03-relatorio-arquivos.spec.ts` |
| F-04 | Erros: mensagem do motor perto do campo, Auditar sem arquivo, resultado desatualizado | Relatório | Alto | casos 13, 14, 15, 19, 22, 23, 02, 03 | `F-04-erros.spec.ts` |
| F-05 | Exportações: Baixar HTML, Markdown, TSV e Ver HTML (CSP por hash) | Relatório | Alto | caso 01 | `F-05-exportacoes.spec.ts` |
| F-06 | Analytics: contagem, busca, detalhe JSON, exportar TSV e JSON | Analytics | Médio | casos 01, 18, 15 | `F-06-analytics.spec.ts` |
| F-07 | Ajuda: guias e seis seções, endereço direto | Ajuda | Baixo | docs/ajuda | `F-07-ajuda.spec.ts` |
| F-08 | Tema (claro, escuro, sistema, memória) e ausência de rolagem horizontal no celular | todas | Médio | casos 11, 01 | `F-08-tema-celular.spec.ts` |
| F-09 | Segurança do conteúdo: HTML hostil dos dados nunca executa nem vira elemento | Relatório, Analytics, pré-visualização | Alto | caso 17 | `F-09-seguranca-conteudo.spec.ts` |
| F-11 | Importar Prints do Figma: pasta ou prints, leitura com progresso, Cancelar, revisão das dúvidas com o print, Baixar Spec, Revisão e Checklist, Usar na Auditoria, erros (sem imagem, imagem falsa, HEIC), celular sem rolagem horizontal | Relatório (`src/ui/importacao.ts`) | Alto | 6 cards fictícios em `e2e/fixtures/prints/` | `F-11-importar-prints.spec.ts` |
| F-10 | OCR dos prints no navegador: mesma spec da leitura perfeita, modelos só do próprio site, cache, cancelar, arquivo falso | `src/ocr/` (página de teste `e2e/paginas/ocr.html`, só no build `MOBAILE_E2E=1`) | Alto | 6 cards fictícios em `e2e/fixtures/prints/` | `F-10-ocr-navegador.spec.ts` |

## Risco alto: cenário feliz, negativo e fonte do esperado

**F-01**
- Feliz: a página abre com título "Mo baile Web", botão Beta, aviso "Seus arquivos não saem deste navegador.", link Relatar um Problema com `template=bug.yml&area=<aba>` e rodapé `versão <VERSION> (beta)`. Fonte: `src/ui/site.ts` e arquivo `VERSION`.
- Negativo: nenhuma requisição fora de `127.0.0.1:4173` durante o uso (abas, exemplo, download). Fonte: `AGENTS.md` ("Nada sai do navegador") e `connect-src 'none'`.

**F-02**
- Feliz: o exemplo audita sozinho e mostra 42,9% e 7/3/2/2/3/1 (validações, OK, divergentes, não disparadas, fora da spec, alertas). Fonte: `test/golden/01-exemplo-loja.json` (`summary`); `src/exemplos/index.ts` usa o caso 01.
- Negativo: antes do clique há "Nenhuma auditoria ainda" e nenhum resultado.

**F-03**
- Feliz: caso 11 por arquivos mostra o `summary` do gabarito; os filtros Divergentes, Não Disparadas, OK e Todas mostram 2, 3, 5 e 10 linhas; o detalhe de uma divergente mostra Obtido e Esperado do primeiro check que falhou. Fonte: `test/golden/11-variacoes-e-fluxos.json`.
- Negativo: busca sem resultado mostra "Nenhuma validação com esse filtro" e Mostrar Todas restaura as 10 linhas.

**F-04**
- Feliz (do erro): spec inválida (13, 14, 19, 22), log sem eventos (15) e falha interna (23) mostram o texto exato de `error.message` do gabarito no campo certo. Fonte: `test/golden/<caso>.json`.
- Negativo: Auditar sem spec foca "Escolher Spec…"; com spec e sem log foca "Escolher Log…"; nenhum resultado aparece.

**F-05**
- Feliz: `.md` igual ao `markdown` do gabarito e `.tsv` igual ao `tsv`; nomes `relatorio_demoapp_android_DD-MM-AAAA.<ext>`; Ver HTML mostra o relatório com folha de estilo aplicada dentro do iframe isolado.
- Negativo: sem auditoria os botões de exportar não existem.

**F-09**
- Feliz: com o caso 17 o texto hostil aparece literal e nenhum `<script>`, `img[src=x]` ou `svg[onload]` entra no DOM da página nem do iframe.
- Negativo: nenhum diálogo (`alert`) dispara, nenhum erro de página, nenhuma requisição externa. Fonte: `test/golden/17-html-hostil.json` e a regra de escape do motor.
