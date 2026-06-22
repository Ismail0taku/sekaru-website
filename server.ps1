$port = 8080
$root = Join-Path (Split-Path $MyInvocation.MyCommand.Path) "."
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "Server running at http://localhost:$port/"
while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $file = $ctx.Request.Url.LocalPath.TrimStart('/')
    if ($file -eq '') { $file = 'index.html' }
    $path = Join-Path $root $file
    if (Test-Path $path -PathType Leaf) {
        $data = [System.IO.File]::ReadAllBytes($path)
        $ctx.Response.ContentType = "text/html; charset=utf-8"
        $ctx.Response.OutputStream.Write($data, 0, $data.Length)
    } else {
        $ctx.Response.StatusCode = 404
    }
    $ctx.Response.Close()
}
