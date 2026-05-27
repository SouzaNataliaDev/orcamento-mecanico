# Orcamento Mecanico

Site simples para criar um orcamento de oficina e enviar a mensagem pronta pelo WhatsApp.

## Como abrir

Abra o arquivo `index.html` no navegador.

Para usar como app instalavel, rode com servidor local:

```bash
PATH="$PWD/.tools/node/bin:$PATH" npm start
```

Depois acesse `http://localhost:3000`.

No Android/Chrome ou desktop/Chrome, use o botao `Instalar app` quando ele aparecer. No iPhone/Safari, use compartilhar e depois `Adicionar a Tela de Inicio`.

Para validar o JavaScript:

```bash
PATH="$PWD/.tools/node/bin:$PATH" npm run check
```

Para gerar novamente os icones do app:

```bash
PATH="$PWD/.tools/node/bin:$PATH" npm run generate-icons
```

Para criar/recriar o repositorio Git local:

```bash
PATH="$PWD/.tools/node/bin:$PATH" npm run init-repo
```

## O que ja esta pronto

- Dados do cliente e do veiculo
- Lista de servicos e pecas
- Calculo automatico de subtotal, desconto e total
- Previa da mensagem do WhatsApp
- Botao para abrir o WhatsApp com o orcamento preenchido
- Layout responsivo para celular e computador
- PWA instalavel com icone, manifesto e cache offline basico

## Proximos passos possiveis

- Adicionar logo e dados da oficina
- Gerar PDF do orcamento
- Salvar historico de orcamentos
- Criar login para mais de um mecanico
