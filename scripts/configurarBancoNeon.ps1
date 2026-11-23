# Pergunta a connection string do Neon (digitacao escondida) e grava em DATABASE_URL no .env.
# A string fica so no seu computador: nao passa pelo chat nem entra no git.
# Tambem cria o JWT_SECRET (segredo do login) se ele ainda nao existir.
#
# Uso (na pasta do projeto):
#   powershell -ExecutionPolicy Bypass -File .\scripts\configurarBancoNeon.ps1

$arquivo = Join-Path (Split-Path $PSScriptRoot -Parent) '.env'
if (-not (Test-Path $arquivo)) {
    Write-Host 'Arquivo .env nao encontrado na pasta do projeto.' -ForegroundColor Red
    exit 1
}

$segura = Read-Host 'Cole a connection string do Neon e aperte Enter (nada aparece na tela)' -AsSecureString
$ponteiro = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura)
try {
    $url = ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponteiro)).Trim().Trim('"').Trim("'")
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiro)
}

if ($url -match '^psql\s+') { $url = ($url -replace '^psql\s+', '').Trim().Trim("'").Trim('"') }

if ($url -notmatch '^postgres(ql)?://[^:\s]+:[^@\s]+@[^/\s]+/\S+') {
    Write-Host 'Isso nao parece uma connection string do Neon (deve comecar com postgresql:// e ter usuario, senha, host e nome do banco). Tente de novo.' -ForegroundColor Red
    exit 1
}
if ($url -notmatch 'sslmode=') {
    $url = $url + $(if ($url.Contains('?')) { '&sslmode=require' } else { '?sslmode=require' })
}
if ($url -notmatch '-pooler') {
    Write-Host 'Aviso: o endereco nao tem "-pooler". O ideal e usar a string "Pooled connection" do Neon, mas vou gravar assim mesmo.' -ForegroundColor Yellow
}

$linhas = Get-Content $arquivo
$temUrl = $false
$temJwt = $false
$novas = foreach ($linha in $linhas) {
    if ($linha -match '^\s*DATABASE_URL=') { $temUrl = $true; "DATABASE_URL=$url" }
    elseif ($linha -match '^\s*JWT_SECRET=(.+)$') { $temJwt = $true; $linha }
    elseif ($linha -match '^\s*JWT_SECRET=\s*$') { $linha }
    else { $linha }
}
$novas = @($novas)
if (-not $temUrl) { $novas += "DATABASE_URL=$url" }

if (-not $temJwt) {
    $bytes = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $segredo = ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
    $novas = $novas | Where-Object { $_ -notmatch '^\s*JWT_SECRET=\s*$' }
    $novas = @($novas) + "JWT_SECRET=$segredo"
    Write-Host 'JWT_SECRET criado.' -ForegroundColor DarkGray
}

Set-Content -Path $arquivo -Value $novas -Encoding UTF8
Write-Host 'DATABASE_URL salva no .env.' -ForegroundColor Green
Write-Host 'Proximo passo: avise o Claude para aplicar as migracoes e subir o sistema.'
