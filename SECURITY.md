# Segurança

O Mo baile Web é um site estático: o motor roda no seu navegador e nenhum
arquivo que você escolhe sai do seu computador. A página não faz chamada de
rede (`connect-src 'none'` na CSP) e não usa CDN, cookies nem telemetria.

A única exceção é a importação de prints. Na primeira vez, o leitor de texto
(um worker) baixa os modelos do OCR, cerca de 46 MB, do próprio endereço do
site. Cada arquivo é conferido pelo sha256 antes de ser usado e fica guardado
no navegador. Os prints são lidos ali mesmo e nunca são enviados. Revisão em
[docs/revisao/seguranca-ocr-fase2.md](docs/revisao/seguranca-ocr-fase2.md).

## Como relatar uma falha de segurança

Não abra issue pública. Use o relato privado do GitHub:
[Security › Report a vulnerability](https://github.com/francisco-efjr/mo-baile-web/security/advisories/new).
Descreva o que acontece, como reproduzir e o impacto. Use dados fictícios.

Limite conhecido: as regras da spec aceitam expressão regular (`re:`), como no
Mo baile. Uma spec feita de propósito para isso (por exemplo `(a+)+$`) pode
travar a aba que a carrega. Nada sai do navegador; fechar a aba resolve. Só
abra spec de quem você confia.

O que conta como falha: arquivo enviado para fora do navegador, execução de
script vindo de uma spec ou de um log (XSS), relatório HTML exportado que
executa conteúdo do log, ou dependência com vulnerabilidade conhecida.
