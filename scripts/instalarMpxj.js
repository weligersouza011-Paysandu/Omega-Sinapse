#!/usr/bin/env node
'use strict';

/**
 * Instala o leitor de cronogramas do MS Project (.mpp) em `vendor/mpxj`:
 *  - Java (Eclipse Temurin JRE 21) — versão fixa, conferida por SHA-256;
 *  - MPXJ (biblioteca Java open source que lê .mpp/.xml) — versão fixa do
 *    pacote oficial no PyPI, conferida por SHA-256; só os .jar necessários.
 *
 * Executado no build (npm run build). Idempotente: não baixa de novo se a
 * versão instalada já for a esperada. Falhas não interrompem o build (exceto
 * com MPXJ_OBRIGATORIO=true): sem o leitor, apenas o upload de .mpp fica
 * indisponível e o /health informa o motivo.
 *
 * Variáveis: MPXJ_PULAR_JRE=true usa o Java do sistema (ou MPXJ_JAVA).
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const DESTINO = path.join(__dirname, '..', 'vendor', 'mpxj');
const MARCADOR = path.join(DESTINO, 'versao.json');

const MPXJ = {
  versao: '16.10.0',
  url: 'https://files.pythonhosted.org/packages/b3/c8/f8e5e9a3dcda9f0cc078714f64e8d5f73ba62a45d9b95d5bc41f5c5ee839/mpxj-16.10.0-py3-none-any.whl',
  sha256: '5cc44621b58c9d218afd26f4a4a6baa614b41d207a69f8f4ff16a8f6d6f2e5cd',
};
/** Bibliotecas do pacote que não são usadas na leitura de .mpp/.xml. */
const JARS_DISPENSAVEIS = /sqlite|junit|opentest4j|apiguardian|jgoodies/i;

const JRE = {
  versao: 'jdk-21.0.13+9',
  linux_x64: {
    url: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.13%2B9/OpenJDK21U-jre_x64_linux_hotspot_21.0.13_9.tar.gz',
    sha256: 'a535a1df9c6284d9618872984e026ae0352d1f7e9e0605425c0e6114f47351dd',
  },
};

function log(mensagem) {
  console.log(`[mpxj] ${mensagem}`);
}

async function baixar(url, sha256) {
  const resposta = await fetch(url, { redirect: 'follow' });
  if (!resposta.ok) throw new Error(`download falhou (${resposta.status}) em ${url}`);
  const buffer = Buffer.from(await resposta.arrayBuffer());
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  if (sha256 && hash !== sha256) throw new Error(`checksum inválido para ${url} (esperado ${sha256}, obtido ${hash})`);
  return buffer;
}

/** Extrai entradas de um .zip (o .whl é um zip) sem dependências externas. */
function extrairZip(buffer, filtro, destino) {
  let fimDiretorio = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      fimDiretorio = i;
      break;
    }
  }
  if (fimDiretorio < 0) throw new Error('arquivo zip inválido');
  const total = buffer.readUInt16LE(fimDiretorio + 10);
  let posicao = buffer.readUInt32LE(fimDiretorio + 16);
  const extraidos = [];
  for (let n = 0; n < total; n += 1) {
    if (buffer.readUInt32LE(posicao) !== 0x02014b50) throw new Error('diretório zip corrompido');
    const metodo = buffer.readUInt16LE(posicao + 10);
    const tamanhoComprimido = buffer.readUInt32LE(posicao + 20);
    const tamNome = buffer.readUInt16LE(posicao + 28);
    const tamExtra = buffer.readUInt16LE(posicao + 30);
    const tamComentario = buffer.readUInt16LE(posicao + 32);
    const local = buffer.readUInt32LE(posicao + 42);
    const nome = buffer.toString('utf8', posicao + 46, posicao + 46 + tamNome);
    posicao += 46 + tamNome + tamExtra + tamComentario;

    const alvo = filtro(nome);
    if (!alvo) continue;
    const inicioDados = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const comprimido = buffer.subarray(inicioDados, inicioDados + tamanhoComprimido);
    const conteudo = metodo === 0 ? comprimido : metodo === 8 ? zlib.inflateRawSync(comprimido) : null;
    if (!conteudo) throw new Error(`compressão não suportada em ${nome}`);
    fs.writeFileSync(path.join(destino, alvo), conteudo);
    extraidos.push(alvo);
  }
  return extraidos;
}

function plataforma() {
  if (process.env.MPXJ_PLATAFORMA) return process.env.MPXJ_PLATAFORMA; // testes
  return `${process.platform === 'win32' ? 'windows' : process.platform}_${process.arch}`;
}

async function instalar() {
  const pularJre = process.env.MPXJ_PULAR_JRE === 'true' || Boolean(process.env.MPXJ_JAVA);
  const chaveJre = plataforma() === 'linux_x64' ? 'linux_x64' : null;
  const esperado = { mpxj: MPXJ.versao, jre: pularJre || !chaveJre ? null : JRE.versao };

  try {
    const atual = JSON.parse(fs.readFileSync(MARCADOR, 'utf8'));
    if (atual.mpxj === esperado.mpxj && atual.jre === esperado.jre) {
      log(`já instalado (MPXJ ${atual.mpxj}${atual.jre ? `, Java ${atual.jre}` : ''}).`);
      return;
    }
  } catch {
    // Sem instalação anterior.
  }

  fs.rmSync(DESTINO, { recursive: true, force: true });
  fs.mkdirSync(path.join(DESTINO, 'lib'), { recursive: true });

  log(`baixando MPXJ ${MPXJ.versao}…`);
  const wheel = await baixar(MPXJ.url, MPXJ.sha256);
  const jars = extrairZip(
    wheel,
    (nome) => {
      const m = nome.match(/^mpxj\/lib\/([^/]+\.jar)$/);
      return m && !JARS_DISPENSAVEIS.test(m[1]) ? m[1] : null;
    },
    path.join(DESTINO, 'lib')
  );
  if (!jars.includes('mpxj.jar')) throw new Error('mpxj.jar não encontrado no pacote');
  log(`${jars.length} bibliotecas instaladas.`);

  if (esperado.jre) {
    log(`baixando Java ${JRE.versao} (${chaveJre})…`);
    const pacote = await baixar(JRE[chaveJre].url, JRE[chaveJre].sha256);
    // Caminhos relativos (cwd = destino): evita que o tar trate "C:" como host remoto.
    const temporario = path.join(DESTINO, 'jre.tar.gz');
    fs.writeFileSync(temporario, pacote);
    const destinoJre = path.join(DESTINO, 'jre');
    fs.mkdirSync(destinoJre, { recursive: true });
    execFileSync('tar', ['-xzf', 'jre.tar.gz', '-C', 'jre', '--strip-components=1'], { stdio: 'inherit', cwd: DESTINO });
    fs.rmSync(temporario, { force: true });
    if (!fs.existsSync(path.join(destinoJre, 'bin', 'java'))) throw new Error('java não encontrado após extrair o JRE');
    log('Java instalado.');
  } else {
    log(pularJre ? 'Java do sistema será usado (MPXJ_PULAR_JRE/MPXJ_JAVA).' : `sem JRE pré-definido para ${plataforma()}: será usado o Java do sistema.`);
  }

  fs.writeFileSync(MARCADOR, JSON.stringify({ ...esperado, instalado_em: new Date().toISOString() }, null, 2));
  log('leitor de .mpp pronto.');
}

instalar().catch((err) => {
  console.warn(`[mpxj] ⚠️ Não foi possível instalar o leitor de .mpp: ${err.message}`);
  console.warn('[mpxj] O sistema funciona, mas o upload de cronogramas .mpp ficará indisponível.');
  if (process.env.MPXJ_OBRIGATORIO === 'true') process.exit(1);
});
