@echo off
rem Curio pipeline CLI for Windows shells (PowerShell, cmd). Git Bash runs
rem the bin/curio script instead. The Python environment is managed by uv and
rem kept outside the plugin directory, which is replaced on every update.
setlocal
set "ROOT=%~dp0.."
where uv >nul 2>nul || (echo curio: uv is required ^(https://docs.astral.sh/uv/^) - run /curio:setup 1>&2 & exit /b 127)
if not defined UV_PROJECT_ENVIRONMENT set "UV_PROJECT_ENVIRONMENT=%LOCALAPPDATA%\curio\venv"
set "VIRTUAL_ENV="
uv run --frozen --quiet --project "%ROOT%\pipeline" curio %*
