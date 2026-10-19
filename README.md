# Bilibank (app)

O Bilibank como app no iPhone: o mesmo painel que roda no Claude, instalado na tela de início pelo Safari.

- **Tela:** `painel/bilibank.html`, cópia exata do painel publicado no Claude. Na publicação, `scripts/montar.mjs` gera `public/index.html` com a casca de app (ícone, tela cheia, funciona sem internet).
- **Dados:** Supabase. Cada documento do painel (`config/base`, `fixas/<id>`, `lanc/<id>`) é uma linha da tabela `docs`. Só quem está logado lê e grava os próprios dados.
- **Acesso:** um único login. O primeiro acesso cria a senha pela função `primeiro-acesso`; depois disso o próprio banco recusa qualquer cadastro novo.
- **Lançar por voz:** sem a chave do Claude, o app entende as frases com o leitor do próprio painel. Com a chave, a frase vai para `api/interpretar.js`, que chama a API do Claude no servidor.
- **Ligação:** `public/bili-app.js` liga o painel a tudo isso. O painel não muda nada para virar app.

## Pôr no ar

### Parte do Filipe (só cliques)
1. Entrar em supabase.com com **Continue with GitHub**. Depois, conectar o **Supabase** no Claude, em Configurações → Conectores.
2. Entrar em vercel.com com **Continue with GitHub**. Tocar em **Add New → Project**, escolher **bilibank** e tocar em **Deploy**. Mandar o endereço para o Claude.
3. No iPhone:
   1. Abrir o endereço no **Safari**.
   2. Tocar em **Compartilhar → Adicionar à Tela de Início**.
   3. Abrir pelo ícone, tocar em **Primeiro acesso** e criar a senha.

### Parte do Claude (pelo conector do Supabase)
1. Criar o projeto na região São Paulo.
2. Rodar `supabase/01-esquema.sql`.
3. Publicar a função `supabase/functions/primeiro-acesso` com a verificação de JWT desligada. Ela mesma só aceita o primeiro acesso.
4. Copiar os dados atuais:
   1. Exportar o banco do painel no Claude para uma pasta fora do repositório.
   2. Gerar o SQL com `node scripts/gerar-migracao.mjs <pasta> <saida.sql>` e rodá-lo no projeto.
   3. Pode rodar antes do primeiro acesso: os dados ficam em `docs_import` (cópia do que veio do Claude) e o primeiro login adota tudo.
5. Pôr a Project URL e a chave **publishable** em `public/config.js` e mandar para o GitHub. O Vercel publica sozinho a cada envio.

### Depois, se quiser: interpretação pelo Claude
1. No Vercel, em **Settings → Environment Variables**, preencher:

| Nome | Valor |
|---|---|
| `ANTHROPIC_API_KEY` | chave da API do Claude, criada em console.anthropic.com com limite de gasto |
| `SUPABASE_URL` | Project URL do Supabase (a mesma do `config.js`) |
| `SUPABASE_ANON_KEY` | chave publishable (a mesma do `config.js`) |
| `EMAIL_PERMITIDO` | e-mail do acesso; só ele pode usar a interpretação |

2. Publicar de novo. A chave do Claude nunca vai pelo chat nem para o código.

## Depois da troca
- O app passa a ser o lugar dos dados. O painel dentro do Claude fica como cópia antiga: lance só pelo app, senão os dois se separam.
- Com o conector do Supabase, o Claude continua lendo e lançando pelo chat.
- Celular e computador se atualizam sozinhos quando um deles grava. Ao voltar para o app, ele relê tudo.

## Microfone
- No app instalado, o botão **Falar** tenta gravar direto.
- Se o iPhone não liberar, o botão vira o atalho do ditado: toque no microfone do teclado, fale e toque em **Terminei**.

## Quando o painel mudar
1. Copie o painel novo para `painel/bilibank.html`.
2. Mande para o GitHub. O Vercel publica sozinho, e o app no iPhone pega a versão nova na próxima abertura com internet.

Para testar a montagem localmente, rode `npm run montar`.

## Segurança
- **No navegador** ficam só o endereço e a chave pública (publishable) do Supabase. Quem protege os dados é o login e as regras do banco: cada usuário só vê as próprias linhas.
- **Um acesso só:** o banco recusa qualquer cadastro depois do primeiro.
- **Dados protegidos:** apagar o acesso não apaga os dados; o banco impede enquanto houver documentos.
- **No Vercel** fica a chave do Claude, só como variável de ambiente. A interpretação só atende quem está logado e, com `EMAIL_PERMITIDO`, só esse e-mail.
- **Recusas:** se o Claude recusar uma frase, a API tenta de novo no modelo reserva recomendado (fallback `default`, no próprio servidor da Anthropic).
- **Dados financeiros** (`*.sql` de dados, exportações) nunca entram neste repositório.
