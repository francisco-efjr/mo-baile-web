---
area: importar-prints
titulo: Importar Prints do Figma
resumo: Monte o rascunho da spec lendo os prints dos cards, aqui no navegador.
precisa: a pasta com os prints dos cards "Anotações" do Figma (PNG ou JPG)
---

## O que é

A importação lê o texto dos prints dos cards "Anotações" do Figma e monta o rascunho da spec: o evento, os parâmetros e as variações de cada card. As regras são as mesmas do Mo baile. A leitura do texto (OCR) acontece neste navegador e os prints não saem do seu computador.

> Dica: o OCR pode trocar uma letra ou pular uma linha. Por isso o rascunho sempre vem com a lista do que conferir. Revise antes de confiar na auditoria.

## Quando usar

- Quando a demanda chegou só com os prints do Figma e ainda não existe a spec em JSON.
- Para começar a spec de uma tela nova sem digitar card por card.
- Para gerar o checklist de conferência das telas, card a card.

## Passo a passo

1. Abra **Relatório** e, no quadro **Spec da demanda**, clique em **Importar Prints do Figma…**.
2. Clique em **Escolher Pasta…** e escolha a pasta com os prints, ou clique em **Escolher Prints…**, ou arraste a pasta para o quadro.
3. Em **Projeto**, escreva o nome da demanda (se ficar vazio, vale o nome da pasta) e escolha a **Plataforma**.
4. Clique em **Ler Prints**. Na primeira vez, o site baixa o leitor de texto (46 MB), que fica guardado neste navegador.
5. Revise a lista **Com Dúvidas**: cada item mostra o print ao lado do que o leitor pediu para conferir.
6. Clique em **Usar na Auditoria** para carregar o rascunho como a spec, ou baixe a spec, a revisão e o checklist.

## Exemplo prático

Você recebeu a pasta `DemoApp-cadastro` com 12 prints do Figma. Clique em **Importar Prints do Figma…**, escolha a pasta, escreva `DemoApp cadastro` em **Projeto** e clique em **Ler Prints**. O resumo mostra 12 prints lidos e 5 pontos para conferir. No print `07.png`, o leitor avisa "parâmetro 'screen name' lido como 'screen_name'": abra o print, confirme e siga. Clique em **Baixar Spec**, ajuste o que precisar no JSON e escolha a spec corrigida em **Escolher Spec…** antes de auditar.

## Recursos

- **Pasta, prints ou arrastar**: entram os PNG e JPG da própria pasta, em ordem de nome. Subpastas e outros arquivos ficam de fora, com o motivo.
- **Progresso e Cancelar**: mostra o download do leitor e cada print lido. Cancelar para na hora.
- **Revisão**: Com Dúvidas e Todos, com a miniatura do print (clique para abrir maior), o evento lido e o que conferir.
- **Usar na Auditoria**: o rascunho vira a spec do quadro **Spec da demanda**.
- **Baixar Spec, Revisão e Checklist**: o JSON da spec e os dois Markdown, os mesmos que o Mo baile grava ao importar.

## Problemas comuns

- **O leitor demora.** Cada print leva por volta de 1 a 2 segundos. Uma pasta com 50 prints leva cerca de 1 minuto. Mantenha a aba aberta.
- **Todo dia ele baixa os 46 MB de novo.** Em janela privada, ou com os dados do site bloqueados, o navegador não guarda o leitor. Use uma janela normal.
- **O print em HEIC ou TIFF ficou de fora.** O navegador não abre esses formatos. Exporte os prints do Figma em PNG.
- **Um card veio sem evento ou com parâmetro estranho.** Abra o print pela miniatura, confira e corrija na spec baixada. Se o print estiver nítido e o erro se repetir, relate o problema com um print fictício.
