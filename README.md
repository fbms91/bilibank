# Bilibank (app)

O Bilibank como app no iPhone: o mesmo painel que roda no Claude, instalado na tela de início pelo Safari.

- **Tela:** `painel/bilibank.html`, cópia exata do painel publicado no Claude. Na publicação, `scripts/montar.mjs` gera `public/index.html` com a casca de app (ícone, tela cheia, funciona sem internet).
- **Dados:** Supabase. Cada documento do painel (`config/base`, `fixas/<id>`, `lanc/<id>`) é uma linha da tabela `docs`. Só quem está logado lê e grava os próprios dados.
- **Lançar por voz:** a frase vai para `api/interpretar.js`, que chama a API do Claude no servidor. A chave do Claude nunca chega ao celular.
- **Ligação:** `public/bili-app.js` liga o painel às duas coisas. O painel não muda nada para virar app.

## Pôr no ar (uma vez)

### 1. Supabase
1. Crie o projeto, na região São Paulo.
2. Abra o **SQL Editor**, cole o conteúdo de `supabase/01-esquema.sql` e clique em **Run**.
3. Em **Authentication → Sign In / Providers**, desligue **Allow new users to sign up**. Assim ninguém mais cria acesso.
4. Crie o seu acesso em **Authentication → Users → Add user → Create new user**. Use seu e-mail e uma senha forte, e marque **Auto Confirm User**.
5. Copie seus dados atuais para o banco:
   1. O Claude gera o `02-dados.sql` com os números do dia da troca.
   2. Cole o arquivo no SQL Editor e clique em **Run**.
   3. O resultado mostra quantos documentos entraram em `config`, `fixas` e `lanc`.
   4. O arquivo pode rodar de novo sem duplicar nada.
6. Copie o endereço e a chave pública do projeto. Estão no botão **Connect**, no topo, ou em **Project Settings → API Keys**:
   - a **Project URL**;
   - a chave **publishable**, ou a **anon public** na aba de chaves antigas.

   A chave **secret** (ou **service_role**) nunca sai do Supabase.

### 2. Chave da API do Claude
1. Em console.anthropic.com, vá em **API Keys** e crie uma chave.
2. Em **Billing**, coloque crédito e um limite de gasto mensal.
3. Não mande a chave pelo chat: ela vai direto para o Vercel no passo 3.

### 3. Vercel
1. Clique em **Add New → Project** e importe o repositório `bilibank` do GitHub.
2. Antes de publicar, preencha em **Environment Variables**:

| Nome | Valor |
|---|---|
| `SUPABASE_URL` | Project URL do Supabase |
| `SUPABASE_ANON_KEY` | chave publishable (ou anon public) |
| `ANTHROPIC_API_KEY` | chave da API do Claude |
| `EMAIL_PERMITIDO` | seu e-mail de acesso; só ele pode usar a interpretação |

3. Clique em **Deploy**. A publicação monta o app e escreve `public/config.js` com o Supabase. A montagem para se a chave secreta for colocada por engano.

### 4. iPhone
1. Abra o endereço do Vercel no **Safari**.
2. Toque em **Compartilhar → Adicionar à Tela de Início**.
3. Abra pelo ícone **Bilibank** e entre com seu e-mail e senha. O app lembra o acesso.

## Depois da troca
- O app passa a ser o lugar dos dados. O painel dentro do Claude fica como cópia antiga: lance só pelo app, senão os dois se separam.
- Para o Claude continuar lendo e lançando pelo chat, conecte o Supabase ao projeto no Claude.
- Celular e computador se atualizam sozinhos quando um deles grava. Ao voltar para o app, ele relê tudo.

## Microfone
- No app instalado, o botão **Falar** tenta gravar direto.
- Se o iPhone não liberar, o botão vira o atalho do ditado: toque no microfone do teclado, fale e toque em **Terminei**.

## Quando o painel mudar
1. Copie o painel novo para `painel/bilibank.html`.
2. Mande para o GitHub. O Vercel publica sozinho, e o app no iPhone pega a versão nova na próxima abertura com internet.

Para testar a montagem localmente, rode `npm run montar`.

## Segurança
- **No navegador** ficam só o endereço e a chave pública do Supabase. Quem protege os dados é o login e as regras do banco: cada usuário só vê as próprias linhas.
- **No Vercel** fica a chave do Claude, só como variável de ambiente.
- **A interpretação** só atende quem está logado. Com `EMAIL_PERMITIDO`, atende só esse e-mail.
- **Recusas:** se o Claude recusar uma frase, a API tenta de novo no modelo reserva recomendado (fallback `default`, no próprio servidor da Anthropic).
- **Dados financeiros** (`*.sql` de dados, exportações) nunca entram neste repositório.
