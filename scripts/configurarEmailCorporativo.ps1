# Configura, no .env LOCAL, o envio pelo servidor de e-mail da propria empresa (SMTP).
# Pergunta a senha da caixa (digitacao escondida) e grava so no seu computador:
# ela nao passa pelo chat nem entra no git.
#
# O envio pelo Brevo (BREVO_API_KEY) e o SMTP antigo ficam comentados, nao apagados,
# para voce poder voltar atras.
#
# Uso (na pasta do projeto):
#   powershell -ExecutionPolicy Bypass -File .\scripts\configurarEmailCorporativo.ps1

$arquivo = Join-Path (Split-Path $PSScriptRoot -Parent) '.env'
if (-not (Test-Path $arquivo)) {
    Write-Host 'Arquivo .env nao encontrado na pasta do projeto.' -ForegroundColor Red
    exit 1
}

$caixa = 'weliger.souza@omegaservice.com.br'
$servidor = 'smtp.omegaservice.com.br'

$segura = Read-Host "Digite a senha da caixa $caixa e aperte Enter (nada aparece na tela)" -AsSecureString
$ponteiro = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura)
try {
    $senha = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponteiro)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiro)
}
if ([string]::IsNullOrWhiteSpace($senha)) {
    Write-Host 'Senha vazia. Tente de novo.' -ForegroundColor Red
    exit 1
}

# Comenta o que vai ser substituido (mantem o valor, so desativa).
$substituir = 'BREVO_API_KEY','SMTP_HOST','SMTP_PORT','SMTP_SECURE','SMTP_USER','SMTP_PASS','EMAIL_FROM'
$novas = foreach ($linha in (Get-Content $arquivo)) {
    $nome = ($linha -split '=',2)[0].Trim()
    if ($substituir -contains $nome) { "#antigo# $linha" } else { $linha }
}

$novas = @($novas) + @(
    '',
    '# --- E-mail pela caixa corporativa (SMTP da propria empresa) ---',
    "SMTP_HOST=$servidor",
    'SMTP_PORT=587',
    'SMTP_SECURE=false',
    "SMTP_USER=$caixa",
    "SMTP_PASS=$senha",
    "EMAIL_FROM=Omega Sinapse <$caixa>"
)
Set-Content -Path $arquivo -Value $novas -Encoding UTF8

Write-Host 'Pronto: .env configurado para enviar pelo servidor da empresa.' -ForegroundColor Green
Write-Host 'Proximo passo: avise o Claude para rodar o teste.'
