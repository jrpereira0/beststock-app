# BestStock — aplicativo da loja

Aplicativo para iPhone e Android (Expo / React Native) usado dentro da loja: contar o estoque, mesmo sem internet, e lançar entradas e perdas. Usa o mesmo banco, os mesmos logins e as mesmas regras do site (`beststock`). Compras, consumo, produtos, fornecedores, financeiro e o painel da rede ficam no site.

## O que tem

- **Entrar** com o e-mail e a senha do site. Loja bloqueada, login sem perfil ou login de administrador não entram (mesmas mensagens do site).
- **Início**: contagem em andamento, dia de contagem, avisos do administrador e pedidos atrasados (só para o gerente).
- **Contagem**: abre a contagem de hoje (ou continua a que está em andamento), lista por categoria com busca, botões − e +, "Acabou em" quando o número é zero, avisos de número estranho, "só o que falta", marcar os que faltam como zero e fechar com as mesmas regras do site (em branco não é zero).
- **Sem internet**: cada número vai primeiro para o aparelho e é enviado quando a conexão volta (também depois de fechar e abrir o app). A contagem já aberta abre sem internet. Abrir uma contagem nova e fechar precisam de internet.
- **Entrada e perda**: entrada em embalagens (vira unidade de contagem) com a pergunta "o resto ainda vem?" quando chega menos que o pedido; perda em unidade de contagem. A entrada passa pela função `register_movements` do banco, que também dá baixa nos pedidos em aberto.
- **Gerente e funcionário**: o app não mostra valores para ninguém; o funcionário não vê pedidos atrasados.

## Rodar no celular (Expo Go)

1. Instale o **Expo Go** no celular (App Store ou Google Play).
2. Crie o arquivo `.env.local` com a URL e a chave **pública** do Supabase (as mesmas `NEXT_PUBLIC_…` do site):

   ```
   EXPO_PUBLIC_SUPABASE_URL=...
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
   ```

   Nunca coloque a `SUPABASE_SECRET_KEY` aqui: tudo que está no app pode ser lido por quem tem o app.
3. `npm install` e `npx expo start`. Leia o QR code com a câmera (iPhone) ou com o Expo Go (Android). Celular e computador na mesma rede Wi-Fi; se não conectar, use `npx expo start --tunnel`.

## Testes

```bash
npm test            # regras da contagem, fila sem internet, entrada e perda
npm run typecheck
npm run lint
```

Teste com o banco de verdade, numa loja de teste que é apagada no final (precisa do `.env.local` do site, com a chave secreta, só no computador):

```bash
node --env-file=../beststock/.env.local scripts/teste-ui.mjs criar <pasta-temporaria>/teste-ui.json
node --env-file=../beststock/.env.local scripts/teste-banco.mjs <pasta-temporaria>/teste-ui.json
node --env-file=../beststock/.env.local scripts/teste-ui.mjs apagar
```

## Publicar nas lojas

Ainda não há conta Apple (US$ 99/ano) nem Google Play (US$ 25). Quando houver, o EAS gera as versões na nuvem, sem Mac: `npx eas-cli@latest build`.
