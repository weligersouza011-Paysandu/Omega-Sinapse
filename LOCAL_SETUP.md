# LOCAL_SETUP — Synapse (Omega Track)

Guia passo a passo para rodar o projeto **Synapse** (Orçamentos / Obras) na sua
máquina: back-end **Node + Express + Prisma**, banco **Neon PostgreSQL** e
front-end **React + Vite + Tailwind**.

---

## 1. Pré-requisitos

| Ferramenta | Versão mínima |
| ---------- | ------------- |
| Node.js    | 18 (recomendado 20 LTS) |
| npm        | 9 |
| Conta Neon | banco PostgreSQL (plano free atende) |
| Conta Cloudinary | upload das fotos |

Verifique a instalação:

```bash
node -v
npm -v
```

---

## 2. Estrutura do repositório

```
Omega Sinapse/
├── prisma/
│   ├── schema.prisma          # fonte de verdade do banco (única!)
│   └── migrations/            # histórico versionado das migrações
├── src/                       # back-end (Routes -> Controllers -> Services -> Repositories)
├── frontend/                  # front-end (React + Vite + Tailwind)
├── render.yaml                # blueprint de deploy (Render)
├── .env.example               # modelo das variáveis de ambiente
└── LOCAL_SETUP.md             # este arquivo
```

---

## 3. Banco de dados (Neon)

1. Crie um projeto em <https://console.neon.tech>.
2. Copie a **connection string** (host com `-pooler`, que o Neon exibe por padrão).
   Ela já vem com `sslmode=require`.
3. Guarde-a para o passo 5.

> O schema é aplicado pelo Prisma — **não** existe mais script SQL manual
> (`sql/schema.sql` foi substituído por `prisma/schema.prisma` + migrações).

---

## 4. Cloudinary

1. Crie uma conta em <https://cloudinary.com>.
2. No *Dashboard*, copie `Cloud name`, `API Key` e `API Secret`.
3. Crie a pasta de destino (ou deixe o Cloudinary criá-la): `synapse/orcamentos`.

As fotos são sempre otimizadas pelo **Sharp** (rotação automática, redimensionamento
para no máximo 1920px e conversão para **WebP** qualidade 80) **antes** de subir
para o Cloudinary.

---

## 5. Back-end — instalação e configuração

Na raiz do projeto:

```bash
# 1) dependências (o postinstall já executa `prisma generate`)
npm install

# 2) variáveis de ambiente
#    Copie o modelo e preencha DATABASE_URL e as chaves do Cloudinary
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
```

Conteúdo mínimo esperado do `.env`:

```env
DATABASE_URL=postgresql://usuario:senha@ep-xxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
PORT=3000
NODE_ENV=development
JWT_SECRET=um-segredo-longo-e-aleatorio
JWT_EXPIRES_IN=8h
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

### Aplicar as migrações

```bash
# desenvolvimento: cria/aplica migrações e regenera o client
npm run prisma:migrate

# produção: apenas aplica as migrações já versionadas
npm run prisma:deploy

# conferir o estado das migrações
npm run prisma:status
```

> Se o seu banco Neon estiver com *connection pooling* e o `migrate` reclamar,
> use temporariamente a **URL direta** (host sem `-pooler`) em `DATABASE_URL`
> apenas durante a migração e depois volte para a URL *pooled*.

### Criar o primeiro usuário (ADMIN)

```bash
npm run criar-usuario -- --nome="Seu Nome" --matricula=23574 --email=seu@email.com --senha=1234 --perfil=ADMIN
```

A senha exige **no mínimo 4 caracteres**. O login aceita **matrícula** ou **e-mail**.

### Subir a API

```bash
npm start        # produção
npm run dev      # desenvolvimento (nodemon, recarrega ao salvar)
```

A API sobe em `http://localhost:3000`. Valide com:

```bash
curl http://localhost:3000/health
# {"status":"ok","banco":"conectado"}
```

---

## 6. Front-end — instalação e configuração

```bash
cd frontend
npm install
cp .env.example .env     # opcional em dev (o proxy do Vite já aponta para :3000)
npm run dev              # http://localhost:5173
```

Em desenvolvimento, o **proxy do Vite** encaminha tudo que começa com `/api`
para `http://localhost:3000` — não é necessário configurar CORS.

No deploy unificado (padrão), o Express serve os arquivos de `frontend/dist` e
o front-end usa a URL relativa `/api` — não é necessário definir
`VITE_API_URL` nem configurar CORS.

Se o front-end for publicado como **Static Site separado**, defina
`VITE_API_URL` com a URL completa da API, incluindo o sufixo `/api`:

```env
VITE_API_URL=https://synapse-api.onrender.com/api
```

Build de produção:

```bash
npm run build          # Prisma Client + front-end (frontend/dist)
npm run build:backend  # apenas Prisma Client
npm run build:frontend # apenas front-end
npm run preview        # serve o build localmente para conferência
```

---

## 7. Deploy no Render

1. Faça o push do repositório para o GitHub/GitLab.
2. No Render: **New + → Blueprint** e aponte para o repositório — o `render.yaml`
   cria um único Web Service Node (`synapse-api`) que serve a API e o front-end
   compilado:
   - **Build:** `npm install --include=dev && npm run build:frontend:install && npm run build`
   - **Start:** `npm run prisma:deploy && npm start`
   - O front-end fica na mesma URL da API (ex.: `https://synapse-api.onrender.com`).
3. Preencha no painel as variáveis marcadas como `sync: false`:
   - `DATABASE_URL`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
4. `JWT_SECRET` é gerado automaticamente pelo Render.
5. Após o primeiro deploy, crie o usuário ADMIN apontando para o banco de produção
   (rode o `npm run criar-usuario` localmente com a `DATABASE_URL` de produção).
6. Configure um monitor de disponibilidade (Cron-job.org, UptimeRobot etc.) para
   chamar `GET https://<sua-api>/ping` a cada 10 minutos. A rota é pública, não
   consulta o banco e responde `{ "status": "pong", "timestamp": "..." }`,
   mantendo o serviço free tier ativo (anti-hibernação).

### Heroku (alternativa)

O repositório inclui `Procfile` (`web: npm start` e `release: npm run prisma:deploy`)
e o script `heroku-postbuild`, que instala e compila o front-end no build do Heroku.
Configure as mesmas variáveis de ambiente do Render e use o buildpack oficial do Node.js.

---

## 8. Comandos úteis

| Comando | Descrição |
| ------- | --------- |
| `npm start` | Sobe a API (Node) |
| `npm run dev` | Sobe a API com reload automático |
| `npm run build` | Gera Prisma Client e compila o front-end |
| `npm run criar-usuario -- --nome=... --matricula=... --email=... --senha=... --perfil=...` | Cria usuário |
| `npm run prisma:migrate` | Cria/aplica migração em desenvolvimento |
| `npm run prisma:deploy` | Aplica migrações em produção |
| `npm run prisma:generate` | Regenera o Prisma Client |
| `npm run prisma:status` | Mostra o estado das migrações |
| `npm run prisma:studio` | Abre o Prisma Studio (navegador de dados) |
| `cd frontend && npm run dev` | Sobe o front-end |

---

## 9. Solução de problemas

**`DATABASE_URL não definida`**
O arquivo `.env` na raiz não existe ou está vazio. Copie de `.env.example` e preencha.

**`Can't reach database server` / health retorna 503**
A URL do Neon está incorreta ou o projeto está suspenso (o free tier suspende após
inatividade — abra o console do Neon para reativar).

**`prisma generate` falhou no `npm install`**
Rode manualmente: `npm run prisma:generate`.

**401 ao chamar a API no front-end**
O token expirou (padrão 8h). O `axios` limpa o `localStorage` e redireciona para
`/login` automaticamente.

**Login retorna 500 mesmo com e-mail e senha corretos**
O `JWT_SECRET` não está definido no ambiente de produção. No Render, abra
**Environment** do serviço e adicione `JWT_SECRET` com um segredo longo e aleatório
(pode copiar o valor do `.env` local). Depois, faça um novo deploy/restart.

**403 ao gravar `art` ou `planejador_id`**
Regra de negócio (RBAC): `art` exige perfil PLANEJADOR/SUPERVISOR/ADMIN e
`planejador_id` exige SUPERVISOR/ADMIN.

---

## 10. Modo demonstração (front-end)

O arquivo `frontend/src/config/demo.js` contém a flag `MODO_DEMO`.
Com `MODO_DEMO = true`, o front-end ignora a API e usa dados em memória
(`frontend/src/services/demoApi.js`) — útil para avaliar a interface sem banco.

**Para operar com dados reais, defina `MODO_DEMO = false`.**
