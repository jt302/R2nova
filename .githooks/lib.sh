# Shared by git hooks.
cd "$(git rev-parse --show-toplevel)"
export PATH="${CARGO_HOME:-$HOME/.cargo}/bin:${PNPM_HOME:-$HOME/Library/pnpm}:$HOME/.local/share/pnpm:/opt/homebrew/bin:/usr/local/bin:$PATH"
