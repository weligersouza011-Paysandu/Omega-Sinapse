# Pergunta a chave de API do Brevo (digitacao escondida) e grava em BREVO_API_KEY no .env local.
# A chave fica so no seu computador: nao passa pelo chat nem entra no git.
#
# Uso (na pasta do projeto):
#   powershell -ExecutionPolicy Bypass -File .\scripts\configurarChaveBrevo.ps1

$arquivo = Join-Path (Split-Path $PSScriptRoot -Parent) '.env'
if (-not (Test-Path $arquivo)) {
    Write-Host 'Arquivo .env nao encontrado na pasta do projeto.' -ForegroundColor Red
    exit 1
}

$segura = Read-Host 'Cole a chave de API do Brevo (comeca com xkeysib-) e aperte Enter (nada aparece na tela)' -AsSecureString
$ponteiro = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura)
try {
    $chave = ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponteiro)).Trim()
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiro)
}

if ($chave -notmatch '^xkeysib-\S{20,}$') {
    Write-Host 'Isso nao parece uma chave de API do Brevo (deve comecar com xkeysib-). Atencao: chave SMTP nao serve. Tente de novo.' -ForegroundColor Red
    exit 1
}

$linhas = Get-Content $arquivo
$achou = $false
$novas = foreach ($linha in $linhas) {
    if ($linha -match '^\s*BREVO_API_KEY=') { $achou = $true; "BREVO_API_KEY=$chave" } else { $linha }
}
if (-not $achou) { $novas = @($novas) + "BREVO_API_KEY=$chave" }
Set-Content -Path $arquivo -Value $novas -Encoding UTF8

Write-Host 'Chave salva no .env. Avise o Claude.' -ForegroundColor Green
