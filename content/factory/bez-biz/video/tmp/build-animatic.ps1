$ErrorActionPreference = "Stop"

$ffmpeg = "C:\Users\user\tools\ffmpeg\bin\ffmpeg.exe"
$root = "c:\Users\user\safe-business\content\video"
$tmp = Join-Path $root "tmp"
$out = Join-Path $root "clip-01-text-animatic.mp4"

function FfPath($p) {
    return ($p -replace '\\', '/') -replace '^([A-Za-z]):', '$1\:'
}

$fontBold = FfPath "C:\Windows\Fonts\arialbd.ttf"

# W x H at 1.25x target for zoompan headroom
$srcW = 1350
$srcH = 2400
$outW = 1080
$outH = 1920
$fps = 25

$cream    = "0xF3EEE6"
$graphite = "0x2E2B28"
$coral    = "0xC97B63"

$scenes = @(
    @{ n = 1; txt = "scene1.txt";        dur = 3; bg = $cream;    fg = $graphite },
    @{ n = 2; txt = "scene2.txt";        dur = 3; bg = $cream;    fg = $graphite },
    @{ n = 3; txt = "scene3.txt";        dur = 4; bg = $cream;    fg = $graphite },
    @{ n = 4; txt = "scene4.txt";        dur = 4; bg = $cream;    fg = $graphite },
    @{ n = 5; txt = "scene5.txt";        dur = 4; bg = $cream;    fg = $graphite },
    @{ n = 6; txt = "scene6.txt";        dur = 4; bg = $cream;    fg = $graphite }
)

Write-Host "=== 1. PNG cards (scenes 1-6) ===" -ForegroundColor Cyan
foreach ($s in $scenes) {
    $png = Join-Path $tmp ("scene{0}.png" -f $s.n)
    $txtPath = FfPath (Join-Path $tmp $s.txt)
    $vf = "drawtext=fontfile='$fontBold':textfile='$txtPath':fontcolor=$($s.fg):fontsize=92:line_spacing=24:x=(w-text_w)/2:y=(h-text_h)/2," +
          "drawbox=x=(w-320)/2:y=(h/2)+170:w=320:h=10:color=$coral@1.0:t=fill"
    & $ffmpeg -y -f lavfi -i "color=c=$($s.bg):s=${srcW}x${srcH}:d=1" -vf $vf -frames:v 1 $png
}

Write-Host "=== 2. Final screen PNG (scene 7) ===" -ForegroundColor Cyan
$png7 = Join-Path $tmp "scene7.png"
$titlePath = FfPath (Join-Path $tmp "scene7_title.txt")
$subPath = FfPath (Join-Path $tmp "scene7_sub.txt")
$vf7 = "drawtext=fontfile='$fontBold':textfile='$titlePath':fontcolor=${cream}:fontsize=118:x=(w-text_w)/2:y=(h/2)-260," +
       "drawtext=fontfile='$fontBold':textfile='$subPath':fontcolor=${coral}:fontsize=58:line_spacing=28:x=(w-text_w)/2:y=(h/2)-40"
& $ffmpeg -y -f lavfi -i "color=c=${graphite}:s=${srcW}x${srcH}:d=1" -vf $vf7 -frames:v 1 $png7

Write-Host "=== 3. Per-scene clips with Ken Burns zoom ===" -ForegroundColor Cyan
$durations = @(3,3,4,4,4,4,3)
for ($i = 1; $i -le 7; $i++) {
    $png = Join-Path $tmp ("scene{0}.png" -f $i)
    $mp4 = Join-Path $tmp ("scene{0}.mp4" -f $i)
    $dur = $durations[$i-1]
    $frames = $dur * $fps
    $zoom = "zoompan=z='min(zoom+0.0009,1.14)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${outW}x${outH}:fps=$fps"
    & $ffmpeg -y -loop 1 -i $png -vf $zoom -t $dur -r $fps -pix_fmt yuv420p -c:v libx264 -preset veryfast -crf 18 $mp4
}

Write-Host "=== 4. Concat with crossfade transitions ===" -ForegroundColor Cyan
$td = 0.5
$inputs = @()
for ($i = 1; $i -le 7; $i++) { $inputs += "-i"; $inputs += (Join-Path $tmp ("scene{0}.mp4" -f $i)) }

$cum = [double]$durations[0]
$filters = @()
$prevLabel = "0:v"
for ($i = 2; $i -le 7; $i++) {
    $offset = $cum - $td
    $curIndex = $i - 1
    $outLabel = if ($i -eq 7) { "vout" } else { "v$i" }
    $filters += "[$prevLabel][${curIndex}:v]xfade=transition=fade:duration=${td}:offset=${offset}[$outLabel]"
    $cum = $cum + $durations[$i-1] - $td
    $prevLabel = $outLabel
}
$filterComplex = ($filters -join ";")

& $ffmpeg -y @inputs -filter_complex $filterComplex -map "[vout]" -r $fps -pix_fmt yuv420p -c:v libx264 -preset medium -crf 18 $out

Write-Host "=== Done: $out ===" -ForegroundColor Green
