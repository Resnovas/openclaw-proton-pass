#!/usr/bin/env bash
#
# install.sh — install the OpenClaw Proton Pass secret provider.
#
#   ./install.sh                 install to ~/.local/bin, register the systemd unit
#   ./install.sh --prefix DIR    install the executables somewhere else
#   ./install.sh --no-systemd    skip the user service (for non-systemd hosts)
#   ./install.sh --check         report what is installed and what is missing
#   ./install.sh --uninstall     remove the executables and the unit, keep configs
#
# --uninstall removes the systemd unit only when that unit launches the copy
# being removed, so uninstalling one prefix never disables another's service.
#
# Configuration files are never overwritten: an existing secret map or proxy
# route file is left exactly as it is, because it is the one piece of state a
# reinstall must not disturb.

set -euo pipefail

SRC="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PREFIX="${PREFIX:-$HOME/.local/bin}"
CONFIG_DIR="${OPENCLAW_PROTONPASS_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/proton-pass-cli}"
UNIT_DIR="${OPENCLAW_PROTONPASS_UNIT_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user}"
UNIT="openclaw-mcp-auth-proxy.service"
WANT_SYSTEMD=1
MODE=install

BINARIES=(
    openclaw-protonpass-resolver
    openclaw-pass-run
    openclaw-mcp-auth-proxy
)

say()  { printf '%s\n' "$*"; }
ok()   { printf '  ok    %s\n' "$*"; }
warn() { printf '  warn  %s\n' "$*"; }
bad()  { printf '  MISS  %s\n' "$*"; }
die()  { printf 'install.sh: %s\n' "$*" 1>&2; exit 1; }

while [ "$#" -gt 0 ]; do
    case "$1" in
        --prefix)     PREFIX="${2:?--prefix needs a directory}"; shift 2 ;;
        --prefix=*)   PREFIX="${1#*=}"; shift ;;
        --no-systemd) WANT_SYSTEMD=0; shift ;;
        --check)      MODE=check; shift ;;
        --uninstall)  MODE=uninstall; shift ;;
        -h|--help)    sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *)            die "unknown option: $1" ;;
    esac
done

have() { command -v "$1" >/dev/null 2>&1; }

find_pass_cli() {
    if [ -n "${PASS_CLI:-}" ]; then printf '%s\n' "$PASS_CLI"; return 0; fi
    if have pass-cli; then command -v pass-cli; return 0; fi
    for c in "$HOME/.local/bin/pass-cli" /usr/local/bin/pass-cli /usr/bin/pass-cli; do
        [ -x "$c" ] && { printf '%s\n' "$c"; return 0; }
    done
    return 1
}

check_prerequisites() {
    local failed=0

    if have python3; then
        ok "python3 $(python3 -c 'import sys;print(".".join(map(str,sys.version_info[:3])))')"
    else
        bad "python3 not found (the resolver and proxy are Python)"; failed=1
    fi

    if have bash; then ok "bash ${BASH_VERSION%%(*}"; else bad "bash not found"; failed=1; fi

    if pass_cli="$(find_pass_cli)"; then
        ok "pass-cli at $pass_cli"
    else
        bad "pass-cli not found — install it from https://protonpass.github.io/pass-cli"
        failed=1
    fi

    if have systemctl; then ok "systemd available"; else warn "no systemctl; use --no-systemd"; fi

    case ":$PATH:" in
        *":$PREFIX:"*) ok "$PREFIX is on PATH" ;;
        *) warn "$PREFIX is not on PATH — add it, or reference the scripts by absolute path" ;;
    esac

    return "$failed"
}

do_check() {
    say "Prerequisites"
    check_prerequisites || true
    say ""
    say "Installed files"
    for b in "${BINARIES[@]}"; do
        if [ -x "$PREFIX/$b" ]; then ok "$PREFIX/$b"; else bad "$PREFIX/$b"; fi
    done
    if [ -f "$UNIT_DIR/$UNIT" ]; then ok "$UNIT_DIR/$UNIT"; else bad "$UNIT_DIR/$UNIT"; fi
    say ""
    say "Configuration"
    for f in openclaw-secret-map.json openclaw-mcp-proxy.json; do
        if [ -f "$CONFIG_DIR/$f" ]; then ok "$CONFIG_DIR/$f"; else bad "$CONFIG_DIR/$f"; fi
    done
    if [ -f "$CONFIG_DIR/openclaw-agent-pat" ]; then
        ok "$CONFIG_DIR/openclaw-agent-pat"
    else
        bad "$CONFIG_DIR/openclaw-agent-pat — create with: pass-cli agent create openclaw-gateway --expiration 1y --vault OpenClaw"
    fi
    say ""
    if have systemctl; then
        say "Service"
        # is-enabled/is-active exit non-zero for a disabled or stopped unit and
        # print nothing at all when the unit is absent, so capture rather than
        # pipe: under `set -o pipefail` a pipe would report both states at once.
        local enabled active
        enabled="$(systemctl --user is-enabled "$UNIT" 2>/dev/null || true)"
        active="$(systemctl --user is-active "$UNIT" 2>/dev/null || true)"
        say "  enabled: ${enabled:-not installed}"
        say "  active:  ${active:-not installed}"
    fi
}

do_uninstall() {
    # Only disturb a unit that actually launches the copy being removed. A
    # unit pointing somewhere else belongs to a different installation, and
    # deleting it here would silently break that one.
    local unit_removed=0
    local exec_marker="$PREFIX/openclaw-mcp-auth-proxy"
    [ "$PREFIX" = "$HOME/.local/bin" ] && exec_marker="%h/.local/bin/openclaw-mcp-auth-proxy"
    if [ -f "$UNIT_DIR/$UNIT" ] && grep -qF "$exec_marker" "$UNIT_DIR/$UNIT"; then
        have systemctl && systemctl --user disable --now "$UNIT" 2>/dev/null || true
        rm -f "$UNIT_DIR/$UNIT"
        have systemctl && systemctl --user daemon-reload 2>/dev/null || true
        unit_removed=1
    fi

    for b in "${BINARIES[@]}"; do rm -f "$PREFIX/$b"; done

    if [ "$unit_removed" = 1 ]; then
        say "Removed the executables from $PREFIX and the service unit."
    else
        say "Removed the executables from $PREFIX."
        if [ -f "$UNIT_DIR/$UNIT" ]; then
            say "Left $UNIT_DIR/$UNIT alone: it does not launch this copy."
        fi
    fi
    say "Left in place: $CONFIG_DIR (your secret map, routes and agent token)."
}

do_install() {
    say "Checking prerequisites"
    check_prerequisites || die "prerequisites missing; fix the MISS lines above and re-run"
    say ""

    say "Installing executables to $PREFIX"
    mkdir -p "$PREFIX"
    for b in "${BINARIES[@]}"; do
        install -m 0755 "$SRC/bin/$b" "$PREFIX/$b"
        ok "$PREFIX/$b"
    done
    say ""

    say "Preparing $CONFIG_DIR"
    mkdir -p "$CONFIG_DIR"
    chmod 0700 "$CONFIG_DIR"
    for f in openclaw-secret-map.json openclaw-mcp-proxy.json; do
        if [ -f "$CONFIG_DIR/$f" ]; then
            ok "$f already exists, left untouched"
        else
            install -m 0600 "$SRC/examples/$f" "$CONFIG_DIR/$f"
            ok "$f seeded from the example — edit it before use"
        fi
    done
    say ""

    if [ "$WANT_SYSTEMD" = 1 ] && have systemctl; then
        say "Registering the MCP auth proxy service"
        mkdir -p "$UNIT_DIR"
        if [ "$PREFIX" = "$HOME/.local/bin" ]; then
            # The shipped unit uses %h, so a default install needs no rewriting.
            install -m 0644 "$SRC/systemd/$UNIT" "$UNIT_DIR/$UNIT"
        else
            sed "s|%h/.local/bin/openclaw-mcp-auth-proxy|$PREFIX/openclaw-mcp-auth-proxy|" \
                "$SRC/systemd/$UNIT" > "$UNIT_DIR/$UNIT"
            chmod 0644 "$UNIT_DIR/$UNIT"
        fi
        systemctl --user daemon-reload
        ok "$UNIT_DIR/$UNIT"
        say ""
    fi

    cat <<NEXT
Installed. Three things remain, and only you can do them:

1. Create the vault and the agent token that the Gateway authenticates with:

     pass-cli agent create openclaw-gateway --expiration 1y --vault OpenClaw

   Save the printed token, readable only by you:

     install -m 0600 /dev/stdin $CONFIG_DIR/openclaw-agent-pat <<< '<token>'

2. Map your secret ids to vault references in:

     $CONFIG_DIR/openclaw-secret-map.json

3. Register the provider with OpenClaw, then restart the Gateway:

     openclaw config set secrets.providers.protonpass.source exec
     openclaw config set secrets.providers.protonpass.command $PREFIX/openclaw-protonpass-resolver
     openclaw config set secrets.providers.protonpass.jsonOnly true
     openclaw config set secrets.providers.protonpass.timeoutMs 60000

   Verify end to end with:

     echo '{"protocolVersion":1,"provider":"protonpass","ids":["YOUR_ID"]}' \\
       | $PREFIX/openclaw-protonpass-resolver

Only if you use remote (HTTP) MCP servers that need a bearer token, add routes to
$CONFIG_DIR/openclaw-mcp-proxy.json and start the proxy:

     systemctl --user enable --now $UNIT

The README covers all three consumption paths in full.
NEXT
}

case "$MODE" in
    install)   do_install ;;
    check)     do_check ;;
    uninstall) do_uninstall ;;
esac
