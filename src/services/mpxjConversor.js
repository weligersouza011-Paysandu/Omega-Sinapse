'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const AppError = require('../errors/AppError');

/**
 * Conversão de cronogramas do MS Project (.mpp ou .xml) para JSON com o MPXJ
 * (biblioteca Java instalada em vendor/mpxj pelo scripts/instalarMpxj.js).
 *
 * Cada conversão roda em um processo Java separado, com memória limitada e
 * tempo máximo; as conversões são enfileiradas (uma por vez) para não
 * disputar memória com a API no plano gratuito do Render.
 *
 * Variáveis: MPXJ_JAVA (executável java), MPXJ_CLASSPATH, MPXJ_XMX (ex.: 256m),
 * MPXJ_TIMEOUT_MS (padrão 90000).
 */

const DIRETORIO = path.join(__dirname, '..', '..', 'vendor', 'mpxj');
const CLASSE = 'org.mpxj.sample.MpxjConvert';
const TEMPO_MAXIMO_MS = Number(process.env.MPXJ_TIMEOUT_MS || 90000);

function executavelJava() {
  if (process.env.MPXJ_JAVA) return process.env.MPXJ_JAVA;
  const embutido = path.join(DIRETORIO, 'jre', 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
  return fs.existsSync(embutido) ? embutido : 'java';
}

function classpath() {
  return process.env.MPXJ_CLASSPATH || path.join(DIRETORIO, 'lib', '*');
}

/** Estado da instalação (para o /health e mensagens de erro). */
function disponibilidade() {
  const java = executavelJava();
  const bibliotecas = process.env.MPXJ_CLASSPATH ? true : fs.existsSync(path.join(DIRETORIO, 'lib', 'mpxj.jar'));
  return { bibliotecas, java: java === 'java' ? 'sistema' : 'embutido', disponivel: bibliotecas };
}

let fila = Promise.resolve();

function executar(entrada, saida) {
  return new Promise((resolve, reject) => {
    const processo = spawn(
      executavelJava(),
      [
        `-Xmx${process.env.MPXJ_XMX || '256m'}`,
        '-XX:+UseSerialGC',
        '-XX:TieredStopAtLevel=1',
        '-Djava.awt.headless=true',
        '-cp',
        classpath(),
        CLASSE,
        entrada,
        saida,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }
    );
    let erros = '';
    processo.stderr.on('data', (parte) => {
      if (erros.length < 4000) erros += parte.toString();
    });
    processo.stdout.on('data', () => {});
    const limite = setTimeout(() => {
      processo.kill('SIGKILL');
      reject(new AppError(504, 'A leitura do cronograma excedeu o tempo limite. Tente novamente ou envie o arquivo salvo como XML do MS Project.'));
    }, TEMPO_MAXIMO_MS);
    processo.on('error', (err) => {
      clearTimeout(limite);
      if (err.code === 'ENOENT') {
        reject(new AppError(503, 'O leitor de arquivos do MS Project (Java/MPXJ) não está instalado no servidor. Avise o administrador.'));
      } else {
        reject(err);
      }
    });
    processo.on('close', (codigo) => {
      clearTimeout(limite);
      if (codigo === 0 && fs.existsSync(saida)) return resolve();
      const linha = erros
        .split('\n')
        .map((l) => l.trim())
        .find((l) => /exception|error|erro/i.test(l));
      console.error(`[mpxj] Falha na conversão (código ${codigo}): ${erros.slice(0, 1500)}`);
      return reject(
        new AppError(
          422,
          `Não foi possível ler o arquivo do MS Project${linha ? ` (${linha.replace(/^.*?:\s*/, '').slice(0, 160)})` : ''}. ` +
            'Confira se é um .mpp válido (MS Project 2007 ou mais novo) ou envie o cronograma salvo como XML.'
        )
      );
    });
  });
}

/**
 * Converte o arquivo enviado e devolve o JSON do MPXJ.
 * @param {Buffer} buffer
 * @param {string} nomeArquivo usado só para a extensão (.mpp ou .xml)
 */
async function converterProjeto(buffer, nomeArquivo = 'cronograma.mpp') {
  if (!disponibilidade().disponivel) {
    throw new AppError(503, 'O leitor de arquivos do MS Project (MPXJ) não está instalado no servidor. Avise o administrador.');
  }
  const extensao = /\.xml$/i.test(nomeArquivo) ? '.xml' : '.mpp';

  const tarefa = fila.then(async () => {
    const pasta = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'synapse-mpp-'));
    const entrada = path.join(pasta, `cronograma${extensao}`);
    const saida = path.join(pasta, 'cronograma.json');
    try {
      await fs.promises.writeFile(entrada, buffer);
      await executar(entrada, saida);
      const texto = await fs.promises.readFile(saida, 'utf8');
      try {
        return JSON.parse(texto);
      } catch {
        throw new AppError(422, 'O conteúdo convertido do cronograma é inválido.');
      }
    } finally {
      fs.promises.rm(pasta, { recursive: true, force: true }).catch(() => {});
    }
  });
  // A fila segue mesmo se esta conversão falhar.
  fila = tarefa.catch(() => {});
  return tarefa;
}

module.exports = { converterProjeto, disponibilidade };
