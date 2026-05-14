$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Utf8 = [Text.Encoding]::UTF8
$LauncherName = $Utf8.GetString([Convert]::FromBase64String("QUnjg6njgrjjgqrjgqLjg5fjg6rotbfli5UuYmF0"))
$ShortcutName = $Utf8.GetString([Convert]::FromBase64String("5L2Q5Lyv5Lqu44GuQUnjgobjgpPjgZ/jgY/jg6njgrjjgqoubG5r"))
$Description = $Utf8.GetString([Convert]::FromBase64String("5L2Q5Lyv5Lqu44GuQUnjgobjgpPjgZ/jgY/jg6njgrjjgqrjgpLotbfli5U="))

$LauncherPath = Join-Path $ProjectDir $LauncherName
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $DesktopPath $ShortcutName

$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $LauncherPath
$Shortcut.WorkingDirectory = $ProjectDir
$Shortcut.Description = $Description
$Shortcut.Save()

Write-Host "Created shortcut: $ShortcutPath"
