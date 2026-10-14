$ErrorActionPreference = "Stop"

Write-Host "=== HF VIDEO DRAFT ===" -ForegroundColor Cyan
$secureToken = $null
$tokenDialog = $null

try {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    $tokenDialog = New-Object System.Windows.Forms.Form
    $tokenDialog.Text = "Hugging Face token"
    $tokenDialog.Width = 520
    $tokenDialog.Height = 170
    $tokenDialog.StartPosition = "CenterScreen"
    $tokenDialog.TopMost = $true

    $label = New-Object System.Windows.Forms.Label
    $label.Text = "Paste the Hugging Face token, then click Continue."
    $label.Left = 12
    $label.Top = 12
    $label.Width = 470
    $tokenDialog.Controls.Add($label)

    $tokenBox = New-Object System.Windows.Forms.TextBox
    $tokenBox.Left = 12
    $tokenBox.Top = 40
    $tokenBox.Width = 470
    $tokenBox.UseSystemPasswordChar = $true
    $tokenDialog.Controls.Add($tokenBox)

    $continueButton = New-Object System.Windows.Forms.Button
    $continueButton.Text = "Continue"
    $continueButton.Left = 382
    $continueButton.Top = 78
    $continueButton.Width = 100
    $continueButton.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $tokenDialog.AcceptButton = $continueButton
    $tokenDialog.Controls.Add($continueButton)

    $cancelButton = New-Object System.Windows.Forms.Button
    $cancelButton.Text = "Cancel"
    $cancelButton.Left = 292
    $cancelButton.Top = 78
    $cancelButton.Width = 80
    $cancelButton.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $tokenDialog.CancelButton = $cancelButton
    $tokenDialog.Controls.Add($cancelButton)

    if ($tokenDialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
        throw "Token input was cancelled."
    }

    $secureToken = ConvertTo-SecureString $tokenBox.Text -AsPlainText -Force
    $tokenBox.Clear()
} finally {
    if ($tokenDialog) {
        $tokenDialog.Dispose()
    }
}

$tokenPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
$token = $null
$output = Join-Path $PSScriptRoot "clip-01-hf-draft.bin"

try {
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPtr)
    if ([string]::IsNullOrWhiteSpace($token)) {
        throw "Token is empty."
    }

    $headers = @{ Authorization = "Bearer $token" }
    $body = @{
        inputs = "Vertical 9:16 documentary-realism video, a small tidy nail studio, a woman owner calmly checks a paper calendar beside a folder of business documents on a desk, soft natural daylight, subtle handheld camera movement, realistic everyday atmosphere, no readable text, no logos, no brand marks, no warnings, no overlays"
        parameters = @{
            num_frames = 25
            guidance_scale = 6
            num_inference_steps = 20
            negative_prompt = "text, logo, watermark, warning, panic, distorted hands, extra fingers"
        }
    } | ConvertTo-Json -Depth 5

    $model = "Lightricks/LTX-Video-0.9.8-13B-distilled"
    $uri = "https://router.huggingface.co/hf-inference/models/$model"
    Write-Host "Sending one request to HF..." -ForegroundColor Cyan

    try {
        $response = Invoke-WebRequest -Uri $uri -Method Post -Headers $headers -ContentType "application/json" -Body $body -OutFile $output -PassThru
        $contentType = [string]$response.Headers["Content-Type"]
        Write-Host "HTTP $($response.StatusCode)" -ForegroundColor Green
        Write-Host "Content-Type: $contentType"

        if ($contentType -notmatch "video|octet-stream") {
            Write-Host "Response is not a video; deleting the file." -ForegroundColor Red
            Remove-Item $output -Force
        } else {
            Write-Host "Draft saved: $output ($((Get-Item $output).Length) bytes)" -ForegroundColor Green
        }
    } catch {
        if ($_.Exception.Response) {
            $status = [int]$_.Exception.Response.StatusCode
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object IO.StreamReader($stream)
            Write-Host "HTTP $status" -ForegroundColor Red
            Write-Host $reader.ReadToEnd() -ForegroundColor Red
        } else {
            Write-Host "ERROR $($_.Exception.Message)" -ForegroundColor Red
        }

        if (Test-Path $output) {
            Remove-Item $output -Force
        }
    }
} finally {
    if ($tokenPtr) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPtr)
    }
    $token = $null
    if ($secureToken) {
        $secureToken.Dispose()
    }
}