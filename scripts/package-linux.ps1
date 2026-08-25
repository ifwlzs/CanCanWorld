[CmdletBinding()]
param(
  # 版本号用于发布目录和归档名；留空时由项目版本与 Git 提交生成。
  [string]$Version = '',
  # 本地调试脚本时跳过测试，但仍执行生产构建；正式发布不应使用。
  [switch]$SkipCheck
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

if (-not $Version) {
  $package = Get-Content -LiteralPath (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json
  $commit = (& git rev-parse --short=12 HEAD).Trim()
  if ($LASTEXITCODE -ne 0) { throw '读取 Git 提交失败' }
  $Version = "$($package.version)-$commit"
}
if ($Version -notmatch '^[0-9A-Za-z._-]+$') { throw '版本号只能包含字母、数字、点、下划线和连字符' }

$releaseRoot = Join-Path $repoRoot 'release'
$packageName = "cancanworld-$Version-linux-x64"
$stage = Join-Path $releaseRoot $packageName
$archive = Join-Path $releaseRoot "$packageName.tar.gz"
$checksumFile = "$archive.sha256"

# 发布目录固定在仓库 release 下，删除前再次核对绝对路径，避免参数污染影响其他目录。
$resolvedReleaseRoot = [IO.Path]::GetFullPath($releaseRoot)
$resolvedStage = [IO.Path]::GetFullPath($stage)
if (-not $resolvedStage.StartsWith($resolvedReleaseRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw '发布暂存目录越出 release 边界'
}
if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
if (Test-Path -LiteralPath $checksumFile) { Remove-Item -LiteralPath $checksumFile -Force }

if (-not $SkipCheck) {
  & bun run check
  if ($LASTEXITCODE -ne 0) { throw '质量门禁失败，停止生成发布包' }
} else {
  & bun run build
  if ($LASTEXITCODE -ne 0) { throw '生产构建失败，停止生成发布包' }
}

New-Item -ItemType Directory -Force -Path (Join-Path $stage 'bin'), (Join-Path $stage 'public'), (Join-Path $stage 'migrations'), (Join-Path $stage 'config'), (Join-Path $stage 'deploy') | Out-Null

# 交叉编译为兼容常规 glibc Linux x64 的 Bun 独立可执行文件，服务器无需安装 Node 或 Bun。
& bun build backend/src/index.ts --compile --target=bun-linux-x64-baseline --outfile (Join-Path $stage 'bin/cancanworld-server')
if ($LASTEXITCODE -ne 0) { throw '后端 Linux 可执行文件编译失败' }
& bun build backend/src/db/migrate.ts --compile --target=bun-linux-x64-baseline --outfile (Join-Path $stage 'bin/cancanworld-migrate')
if ($LASTEXITCODE -ne 0) { throw '迁移器 Linux 可执行文件编译失败' }

Copy-Item -Path 'frontend/dist/*' -Destination (Join-Path $stage 'public') -Recurse -Force
Copy-Item -Path 'backend/migrations/*' -Destination (Join-Path $stage 'migrations') -Force
Copy-Item -LiteralPath '.env.example' -Destination (Join-Path $stage 'config/cancanworld.env.example') -Force
Copy-Item -LiteralPath 'deploy/install.sh' -Destination (Join-Path $stage 'deploy/install.sh') -Force
Copy-Item -LiteralPath 'deploy/cancanworld.service' -Destination (Join-Path $stage 'deploy/cancanworld.service') -Force
Copy-Item -LiteralPath 'deploy/nginx.conf' -Destination (Join-Path $stage 'deploy/nginx.conf') -Force
Copy-Item -LiteralPath 'README.md' -Destination (Join-Path $stage 'README.md') -Force
[IO.File]::WriteAllText((Join-Path $stage 'VERSION'), "$Version`n", [Text.UTF8Encoding]::new($false))

# PowerShell 在 Windows 上复制后统一校正 Linux 文本文件换行。
foreach ($relativePath in @('deploy/install.sh', 'deploy/cancanworld.service', 'deploy/nginx.conf')) {
  $path = Join-Path $stage $relativePath
  $content = [IO.File]::ReadAllText($path).Replace("`r`n", "`n")
  [IO.File]::WriteAllText($path, $content, [Text.UTF8Encoding]::new($false))
}

Push-Location -LiteralPath $releaseRoot
try {
  & tar -czf (Split-Path -Leaf $archive) $packageName
  if ($LASTEXITCODE -ne 0) { throw 'tar.gz 打包失败' }
} finally {
  Pop-Location
}

$hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText($checksumFile, "$hash  $(Split-Path -Leaf $archive)`n", [Text.UTF8Encoding]::new($false))
Write-Output "发布包：$archive"
Write-Output "SHA-256：$hash"
