# Pergunta a senha de app do Gmail (digitacao escondida) e grava em SMTP_PASS no .env.
# A senha fica so no seu computador: nao passa pelo chat nem entra no git.
#
# Uso (na pasta do projeto):
#   powershell -ExecutionPolicy Bypass -File .\scripts\configurarSenhaEmail.ps1

$arquivo = Join-Path (Split-Path $PSScriptRoot -Parent) '.env'
if (-not (Test-Path $arquivo)) {
    Write-Host 'Arquivo .env nao encontrado na pasta do projeto.' -ForegroundColor Red
    exit 1
}

$segura = Read-Host 'Cole a senha de app de 16 letras e aperte Enter (nada aparece na tela)' -AsSecureString
$ponteiro = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura)
try {
    $senha = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponteiro) -replace '\s', ''
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiro)
}

if ($senha.Length -ne 16) {
    Write-Host "A senha de app tem 16 letras e a que voce colou tem $($senha.Length). Tente de novo." -ForegroundColor Red
    exit 1
}

$linhas = Get-Content $arquivo
$achou = $false
$novas = foreach ($linha in $linhas) {
    if ($linha -match '^\s*SMTP_PASS=') { $achou = $true; "SMTP_PASS=$senha" } else { $linha }
}
if (-not $achou) { $novas = @($novas) + "SMTP_PASS=$senha" }
Set-Content -Path $arquivo -Value $novas -Encoding UTF8

Write-Host 'Senha salva no .env. Agora rode: npm.cmd run email:teste' -ForegroundColor Green
