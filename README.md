# BestStock — aplicativo da loja

Aplicativo para iPhone e Android (Expo / React Native) do BestStock: o site da loja no celular, com a contagem funcionando mesmo sem internet. Usa o mesmo banco, os mesmos logins e as mesmas regras do site (`beststock`). O painel do administrador da rede ainda fica só no site.

## O que tem

O app espelha o site para a loja, com as mesmas abas: **Início, Inventário, Entradas, Compras** (só gerente) e **Mais**. Tudo lê e grava no mesmo banco: o que muda no app aparece no site e vice-versa (ao abrir a tela ou puxar para atualizar).

- **Entrar** com o e-mail e a senha do site. Loja bloqueada ou login sem perfil não entram (mesmas mensagens do site). Com o endereço do site configurado, o login passa pelo site e vale a trava de 8 senhas erradas.
- **Início**: contagem em andamento, dia de contagem, avisos do administrador, pedidos atrasados e, para o gerente, o resumo do estoque com valores.
- **Inventário**: abrir a contagem (hoje ou dias atrás), contar com − e +, "Acabou em", avisos de número estranho, marcar os que faltam como zero, fechar; histórico; contagem fechada e reabrir (gerente).
- **Sem internet**: cada número da contagem vai primeiro para o aparelho e é enviado quando a conexão volta. As telas já abertas mostram o que foi guardado.
- **Entradas**: histórico de 90 dias, excluir lançamento, registrar entrada (com "o resto ainda vem?"), perda e **entrada pela nota fiscal** (XML).
- **Compras** (gerente): lista de compras igual à do site, copiar ou mandar pelo WhatsApp, confirmar o envio, pedidos a caminho, cancelar e registrar pedido feito por fora.
- **Mais** (gerente): consumo (classes A, B e C), produtos, fornecedores, financeiro e configurações (período de contagem e logins da loja).
- **Gerente e funcionário**: o funcionário não vê valores nem compras; os valores nem são calculados no aparelho dele.

As contas que não dependem de servidor (compra sugerida, pedidos, nota fiscal, cobrança) são copiadas do site para `src/lib/site` por `node scripts/copiar-do-site.mjs`. Não edite esses arquivos aqui: mude no site e copie de novo.

O que depende da chave secreta fica no servidor do site, nas rotas `api/app/login` e `api/app/logins`.

## Rodar no celular (Expo Go)

1. Instale o **Expo Go** no celular (App Store ou Google Play).
2. Crie o arquivo `.env.local` com a URL e a chave **pública** do Supabase (as mesmas `NEXT_PUBLIC_…` do site):

   ```
   EXPO_PUBLIC_SUPABASE_URL=...
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
   EXPO_PUBLIC_SITE_URL=https://endereco-do-site
   ```

   `EXPO_PUBLIC_SITE_URL` é o endereço do site publicado (com as rotas `api/app`). Sem ele, o app entra direto pelo Supabase e os logins da loja só são criados pelo site.

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
node --experimental-strip-types --env-file=../beststock/.env.local scripts/teste-banco.mjs <pasta-temporaria>/teste-ui.json
node scripts/teste-rotas.mjs <pasta-temporaria>/teste-ui.json http://localhost:3000   # com o site rodando
node --env-file=../beststock/.env.local scripts/teste-ui.mjs apagar
```

## Publicar nas lojas

Ainda não há conta Apple (US$ 99/ano) nem Google Play (US$ 25). Quando houver, o EAS gera as versões na nuvem, sem Mac: `npx eas-cli@latest build`.
