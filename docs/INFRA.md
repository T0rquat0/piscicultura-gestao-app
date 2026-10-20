# Infraestrutura para ter cliente pagante — passo a passo

O código já está preparado para cada passo abaixo. O que falta depende de **conta, compra ou decisão** de vocês. Faça na ordem.

---

## 1. Domínio próprio
1. Comprar o domínio (ex.: `seunome.com.br` no Registro.br).
2. Vercel → projeto `piscicultura-gestao-app` → **Settings → Domains** → adicionar `app.seunome.com.br`. A Vercel mostra o registro de DNS a criar; crie-o no Registro.br e espere ficar verde.

## 2. Banco (Supabase) só para os clientes
O banco atual (`ppvliseblxpsepmeknnl`) fica para **testes e demonstração**. Os clientes ganham um banco novo e limpo.

1. Supabase → **New project**. Região: **South America (São Paulo)**. Guarde a senha do banco num lugar seguro (não no código).
2. Montar o banco de uma vez:
   - na pasta do projeto: `python tools/sql_completo.py > banco_novo.sql`
   - Supabase novo → **SQL Editor → New query** → colar o conteúdo inteiro → **Run**. Rodar **uma vez só**, com o banco vazio.
   - O teste `testes/sql/teste_banco_novo.mjs` confere que esse arquivo monta um banco completo, com a segurança ligada em todas as tabelas.
3. **Authentication → Providers → Email:** "Allow new users to sign up" **ligado**; "Confirm email" **ligado**; senha mínima **8**.
4. **Authentication → URL Configuration:**
   - Site URL: `https://app.seunome.com.br`
   - Redirect URLs: `https://app.seunome.com.br/**`
5. **Project Settings → API Keys:** copiar a chave **publishable** (pública). **Nunca** use a `service_role`/secret no app.
6. No código:
   - `js/config.js` → em `AMBIENTES`, acrescentar `'app.seunome.com.br': { nome: 'clientes', url: 'https://XXXX.supabase.co', chave: 'sb_publishable_...' }`
   - `api/ping.js` → acrescentar o banco novo em `PROJETOS` (mantém ele acordado).
   - Pull Request, testes (`python testes/rodar_tudo.py`) e merge.
   - O site antigo `piscicultura-gestao-app.vercel.app` continua no banco de testes; o domínio novo usa o banco dos clientes.
7. Administradores no banco novo (SQL Editor):
   ```sql
   insert into administradores (usuario_id) select id from auth.users where email = 'email@exemplo.com' on conflict do nothing;
   ```
   A pessoa precisa criar a conta no app (domínio novo) antes.
8. No painel do app (Mais → Administração do sistema), conferir os **preços dos pacotes** e **desligar o modo piloto** antes do primeiro cliente pagante.
9. **Plano do Supabase:** o grátis pausa depois de ~7 dias sem uso (o `api/ping.js` evita) e **não tem backup automático**. Para cliente pagante, use o plano **Pro**, que tem backup diário. A cópia em Mais → "Baixar cópia dos dados" serve de segunda garantia para cada fazenda.

## 3. E-mail próprio, em português
Hoje os e-mails de confirmação e de senha saem do Supabase, **em inglês** e com limite baixo de envios por hora.

1. Criar conta num serviço de envio (ex.: **Resend**) e verificar o domínio. O serviço mostra os registros de DNS (SPF/DKIM) a criar no Registro.br.
2. Supabase (banco dos clientes) → **Authentication → SMTP Settings** → ligar o SMTP próprio com os dados do serviço. Remetente sugerido: `nao-responda@seunome.com.br`, nome "Gestão de Piscicultura".
3. **Authentication → Emails** → trocar os textos pelos modelos em português desta pasta (o assunto está na primeira linha de cada arquivo):
   - "Confirm signup" → `docs/emails/confirmar_cadastro.html`
   - "Reset password" → `docs/emails/recuperar_senha.html`
   - "Change email address" → `docs/emails/trocar_email.html`
4. Testar: criar uma conta nova e pedir "Esqueci minha senha"; os dois e-mails devem chegar em português.

## 4. Termos de uso e política de privacidade (LGPD)
As páginas `termos.html` e `privacidade.html` já existem como **MINUTA** (aparecem com aviso amarelo). Para ligar:
1. Preencher tudo o que está entre colchetes `[ ]`: razão social, CNPJ, endereço, encarregado de dados (DPO) e e-mail, prazos, foro, serviço de e-mail e de pagamento.
2. **Revisar com um advogado**, principalmente o limite de responsabilidade e, se houver cliente pessoa física, o Código de Defesa do Consumidor.
3. Em `js/config.js`, trocar `export const TERMOS_VERSAO = null;` pela data da versão, ex.: `'2026-11-01'`.
4. A partir daí:
   - o cadastro pede o aceite ("Li e aceito…");
   - quem já tem conta vê a tela de aceite no próximo acesso;
   - o aviso de minuta some e a data da versão aparece nas páginas;
   - a versão aceita e a data ficam gravadas na conta de cada pessoa.
5. Mudou o texto depois? Troque a data em `TERMOS_VERSAO`: todos aceitam de novo.

## 5. Empresa e nota fiscal
CNPJ aberto e emissão de nota de serviço: confirmar com o contador (atividade, regime e se a nota é emitida pela prefeitura ou pelo serviço de pagamento).

---

### Conferência final antes do primeiro cliente pagante
- [ ] Domínio no ar com HTTPS
- [ ] Banco dos clientes montado com `banco_novo.sql`, Supabase Pro, Site URL/Redirect com o domínio
- [ ] `js/config.js` e `api/ping.js` com o banco dos clientes
- [ ] Administradores cadastrados no banco novo
- [ ] Preços dos pacotes conferidos e **modo piloto desligado**
- [ ] SMTP próprio e e-mails em português testados
- [ ] Termos e privacidade preenchidos, revisados e `TERMOS_VERSAO` definido
- [ ] Forma de pagamento definida (Bloco 3 — cobrança)
