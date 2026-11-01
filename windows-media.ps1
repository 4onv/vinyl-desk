$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType=WindowsRuntime]
# Keep WinRT stream interfaces inside typed C#: PowerShell cannot project their inherited members.
$runtimeReference = [Reflection.Assembly]::Load('System.Runtime, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a').Location
$references = @('System.Runtime.WindowsRuntime.dll', "$env:windir\System32\WinMetadata\Windows.Foundation.winmd", "$env:windir\System32\WinMetadata\Windows.Storage.winmd", "$env:windir\System32\WinMetadata\Windows.Media.winmd", $runtimeReference)
$thumbnailCode = @'
using System;
using System.Threading.Tasks;
using Windows.Media.Control;
using Windows.Storage.Streams;
using Windows.Foundation;
public static class SideAThumbnail {
  private static bool Wait(IAsyncInfo operation) {
    var timer = System.Diagnostics.Stopwatch.StartNew();
    while (operation.Status == AsyncStatus.Started && timer.ElapsedMilliseconds < 4000) System.Threading.Thread.Sleep(20);
    if (operation.Status == AsyncStatus.Started) operation.Cancel();
    return operation.Status == AsyncStatus.Completed;
  }
  public static string Read(GlobalSystemMediaTransportControlsSessionMediaProperties props) {
    if (props.Thumbnail == null) return "";
    var operation = props.Thumbnail.OpenReadAsync();
    if (!Wait(operation)) return "";
    using (var stream = operation.GetResults()) {
      if (stream.Size == 0 || stream.Size > 2097152) return "";
      using (var reader = new DataReader(stream.GetInputStreamAt(0))) {
        var load = reader.LoadAsync((uint)stream.Size);
        if (!Wait(load)) return "";
        var bytes = new byte[load.GetResults()]; reader.ReadBytes(bytes);
        var mime = stream.ContentType;
        if (bytes.Length > 3 && bytes[0] == 137 && bytes[1] == 80) mime = "image/png";
        else if (bytes.Length > 2 && bytes[0] == 255 && bytes[1] == 216) mime = "image/jpeg";
        else if (mime != "image/webp" && mime != "image/gif" && mime != "image/bmp") return "";
        return "data:" + mime + ";base64," + Convert.ToBase64String(bytes);
      }
    }
  }
}
'@
$compiler = New-Object Microsoft.CSharp.CSharpCodeProvider
$parameters = New-Object System.CodeDom.Compiler.CompilerParameters
$parameters.GenerateInMemory = $true
$parameters.ReferencedAssemblies.AddRange([string[]]($references + @('System.dll', 'System.Core.dll')))
$compiled = $compiler.CompileAssemblyFromSource($parameters, $thumbnailCode)
if ($compiled.Errors.HasErrors) { throw (($compiled.Errors | ForEach-Object { $_.ErrorText }) -join '; ') }
$null = $compiled.CompiledAssembly
$compiler.Dispose()
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
$manager = $null
$coverKey = ''
$cover = ''
$coverChecked = [DateTime]::MinValue

function Await-WinRT($operation, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($operation))
  if (-not $task.Wait(7000)) { throw 'The music app did not respond in time.' }
  return $task.Result
}
function Get-AppName([string]$source) {
  if ($source -match 'Spotify') { return 'Spotify' }
  if ($source -match 'AppleMusic|Apple Music') { return 'Apple Music' }
  if ($source -match 'iTunes') { return 'iTunes' }
  if ($source -match 'msedge|MicrosoftEdge') { return 'Microsoft Edge' }
  if ($source -match 'chrome') { return 'Google Chrome' }
  if ($source -match 'firefox') { return 'Firefox' }
  if ($source -match 'ZuneMusic|MediaPlayer') { return 'Media Player' }
  if ($source -match 'VLC') { return 'VLC' }
  return $source
}
function Get-Cover($properties, [string]$key) {
  if ($script:coverKey -eq $key -and ($script:cover -or ([DateTime]::UtcNow - $script:coverChecked).TotalSeconds -lt 5)) { return $script:cover }
  $script:coverKey = $key; $script:cover = ''; $script:coverChecked = [DateTime]::UtcNow
  if (-not $properties.Thumbnail) { return '' }
  try {
    $script:cover = [SideAThumbnail]::Read($properties)
  } catch { $script:cover = '' }
  return $script:cover
}

while ($null -ne ($line = [Console]::ReadLine())) {
  $request = $null
  try {
    $request = $line | ConvertFrom-Json
    if (-not $manager) { $manager = Await-WinRT ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]) }
    $sessions = @($manager.GetSessions())
    $selected = $sessions | Where-Object { $_.SourceAppUserModelId -ceq $request.sessionId } | Select-Object -First 1
    if ($request.command -ne 'state') {
      if (-not $selected) { throw 'This player is no longer available. Start a song in the music app, then select it again.' }
      $controls = $selected.GetPlaybackInfo().Controls
      $operation = switch ($request.command) {
        'play' { if (-not $controls.IsPlayEnabled) { throw 'This player does not allow remote play.' }; $selected.TryPlayAsync() }
        'pause' { if (-not $controls.IsPauseEnabled) { throw 'This player does not allow remote pause.' }; $selected.TryPauseAsync() }
        'next' { if (-not $controls.IsNextEnabled) { throw 'This player does not allow skipping forward.' }; $selected.TrySkipNextAsync() }
        'previous' { if (-not $controls.IsPreviousEnabled) { throw 'This player does not allow skipping back.' }; $selected.TrySkipPreviousAsync() }
        'seek' {
          if (-not $controls.IsPlaybackPositionEnabled) { throw 'This player does not allow seeking.' }
          $timeline = $selected.GetTimelineProperties()
          $seconds = [Math]::Max($timeline.MinSeekTime.TotalSeconds, [Math]::Min($timeline.MaxSeekTime.TotalSeconds, [double]$request.position))
          $selected.TryChangePlaybackPositionAsync([long]($seconds * 10000000))
        }
        default { throw 'Unknown playback command.' }
      }
      if (-not (Await-WinRT $operation ([bool]))) { throw 'The music app did not accept that control. Try its own playback controls.' }
    }
    $list = @($sessions | ForEach-Object {
      @{ id = $_.SourceAppUserModelId; name = (Get-AppName $_.SourceAppUserModelId) }
    } | Sort-Object -Property { $_.id } -Unique)
    $track = $null
    if ($selected) {
      $props = Await-WinRT ($selected.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $info = $selected.GetPlaybackInfo()
      $timeline = $selected.GetTimelineProperties()
      $playing = $info.PlaybackStatus.ToString() -eq 'Playing'
      $position = $timeline.Position.TotalSeconds
      if ($playing -and $timeline.LastUpdatedTime.Year -gt 2000) {
        $position += [Math]::Max(0, ([DateTimeOffset]::Now - $timeline.LastUpdatedTime).TotalSeconds)
      }
      $duration = [Math]::Max(0, $timeline.EndTime.TotalSeconds)
      $track = @{
        id = $selected.SourceAppUserModelId; app = (Get-AppName $selected.SourceAppUserModelId)
        title = $props.Title; artist = $props.Artist; album = $props.AlbumTitle
        cover = (Get-Cover $props ($selected.SourceAppUserModelId + '|' + $props.Title + '|' + $props.Artist + '|' + $props.AlbumTitle))
        playing = $playing; position = [Math]::Max(0, [Math]::Min($duration, $position)); duration = $duration
        controls = @{ play = [bool]$info.Controls.IsPlayEnabled; pause = [bool]$info.Controls.IsPauseEnabled; next = [bool]$info.Controls.IsNextEnabled; previous = [bool]$info.Controls.IsPreviousEnabled; seek = [bool]$info.Controls.IsPlaybackPositionEnabled }
      }
    }
    $response = @{ id = $request.id; result = @{ available = $true; sessions = $list; track = $track } }
  } catch {
    $response = @{ id = $request.id; error = $_.Exception.Message }
  }
  [Console]::WriteLine(($response | ConvertTo-Json -Depth 6 -Compress))
}
