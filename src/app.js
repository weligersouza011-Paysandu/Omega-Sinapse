'use strict';

const path = require('path');
const express = require('express');
const prisma = require('./config/prisma');
const { estadoCloudinary } = require('./config/cloudinary');
const { disponibilidade: disponibilidadeMpxj } = require('./services/mpxjConversor');
const orcamentoRoutes = require('./routes/orcamentoRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const authRoutes = require('./routes/authRoutes');
const usuarioRoutes = require('./routes/usuarioRoutes');
const obraRoutes = require('./routes/obraRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const tarefaRoutes = require('./routes/tarefaRoutes');
const cronogramaRoutes = require('./routes/cronogramaRoutes');
const contratoRoutes = require('./routes/contratoRoutes');
const { autenticar, acessoCliente } = require('./middlewares/auth');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------------
// Autenticação (JWT)
// As rotas /api/* são protegidas pelo middleware `autenticar`, que valida o
// token e popula req.user = { id, perfil, nome, email }.
// Envie o token no header:  Authorization: Bearer <token>
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Ping-pong anti-hibernação
// Endpoint PÚBLICO e intencionalmente leve (não consulta banco nem serviços
// externos). Deve ser chamado periodicamente por Cron-job.org, UptimeRobot ou
// equivalente para manter o dyno/servidor free tier ativo.
// ---------------------------------------------------------------------------
app.get('/ping', (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.status(200).json({
    status: 'pong',
    timestamp: new Date().toISOString(),
  });
});

// Healthcheck que valida a conexão real com o Neon (via Prisma).
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.status(200).json({
      status: 'ok',
      banco: 'conectado',
      // Diagnóstico sem segredos: indica se o Cloudinary está utilizável.
      armazenamento: estadoCloudinary.configurado ? 'configurado' : 'indisponivel',
      ...(estadoCloudinary.configurado ? {} : { armazenamento_problemas: estadoCloudinary.problemas }),
      // Leitor de cronogramas do MS Project (Java + MPXJ instalados no build).
      leitor_mpp: disponibilidadeMpxj().situacao,
      ...(disponibilidadeMpxj().erro ? { leitor_mpp_erro: disponibilidadeMpxj().erro } : {}),
    });
  } catch (err) {
    console.error('[health] Falha ao consultar o banco:', err.message);
    return res.status(503).json({ status: 'degradado', banco: 'indisponivel' });
  }
});

// Rotas públicas (login)
app.use('/api/auth', authRoutes);

// Rotas protegidas por JWT
// Perfil CLIENTE: só consulta e só nas APIs das páginas liberadas (acessoCliente).
app.use('/api/orcamentos', autenticar, acessoCliente('orcamentos'), orcamentoRoutes);
// Governança ISO 9001: gestão de usuários (RBAC ADMIN aplicado nas rotas internas).
app.use('/api/usuarios', autenticar, acessoCliente(), usuarioRoutes);
// Ciclo operacional de execução (obras): status, planejador, OSI e Ata de Partida.
app.use('/api/obras', autenticar, acessoCliente('obras', 'planejamento', 'medicao'), obraRoutes);
// Dashboard executivo de planejamento (obras, mapa, Curva S e restrições 6WLA).
app.use('/api/dashboard', autenticar, acessoCliente('planejamento'), dashboardRoutes);
// Gestão de demandas e carga da equipe de planejamento.
app.use('/api/tarefas', autenticar, acessoCliente('demandas'), tarefaRoutes);
// Ingestão e versionamento de cronogramas (base da Curva S, CPM e 6WLA).
app.use('/api/cronogramas', autenticar, acessoCliente('obras', 'planejamento'), cronogramaRoutes);
// Contratos com a Vale e Termos Aditivos (base da medição e projeção financeira).
app.use('/api/contratos', autenticar, acessoCliente('medicao'), contratoRoutes);
app.use('/api/uploads', autenticar, acessoCliente(), uploadRoutes);

// ---------------------------------------------------------------------------
// Front-end (build do Vite) — deploy unificado
// Em produção, o build do front-end deve existir em `frontend/dist`.
// Em desenvolvimento, o Vite continua rodando separadamente em :5173.
// ---------------------------------------------------------------------------
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
const frontendIndex = path.join(frontendDist, 'index.html');

app.use(express.static(frontendDist));

// SPA fallback: qualquer rota não-API que não seja um arquivo estático recebe
// o index.html, permitindo que o React Router assuma o roteamento no cliente.
app.get('*', (req, res, next) => {
  // Mantém o contrato JSON para rotas de API inexistentes.
  if (req.path === '/api' || req.path.startsWith('/api/')) {
    return next();
  }

  return res.sendFile(frontendIndex, (err) => {
    if (!err) return undefined;
    // Sem build do front-end, deixa o 404 padrão da API responder.
    if (err.code === 'ENOENT') return next();
    return next(err);
  });
});

// 404 + tratamento global de erros (sempre por último)
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
