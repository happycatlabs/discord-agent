#!/usr/bin/env bash
# Deploy a commit of this repo to the PM2 app running it, with a health check and automatic rollback.
#
#   scripts/deploy.sh [--ref <git-ref>] [--force] [--dry-run]
#
#   --force   redeploy even if the commit is already running (e.g. after editing .env)
#
# Run on the server from the repo root. After a healthy deploy it registers slash commands with
# Discord if their definitions changed since the last registration.
#
# Progress goes to stderr; the last line on stdout is
#   result=<deployed|unchanged|dry_run|rolled_back|rollback_failed|refused> from=<sha> to=<sha>
#   commands=<registered|unchanged|failed> reason=<code> next=<what to do>
#
# Exit codes:
#   0  deployed, unchanged or dry run
#   1  the new version failed and the previous version is running again
#   2  the new version failed and so did the rollback: the bot may be down
#   3  refused before changing anything (dirty tree, unknown ref, deploy already running, ...)
#   4  deployed and healthy, but Discord rejected the slash commands
#
# Environment:
#   DEPLOY_APP              PM2 app name (default: the name in ecosystem.config.js)
#   DEPLOY_HEALTH_SECONDS   how long the app must stay up without restarting (default: 30)
#
# Everything is inside main() so bash has read the whole script before the checkout changes this file.

set -uo pipefail

main() {
	local ref="origin/master" dry_run=false force=false
	while [ $# -gt 0 ]; do
		case "$1" in
		--ref)
			[ -n "${2:-}" ] || refuse "missing_ref" "--ref needs a git ref, e.g. --ref origin/master"
			ref="$2"
			shift 2
			;;
		--dry-run) dry_run=true; shift ;;
		--force) force=true; shift ;;
		-h | --help) sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
		*) refuse "unknown_argument" "unknown argument: $1" ;;
		esac
	done

	command -v bun >/dev/null || refuse "bun_missing" "bun is not on PATH"
	command -v pm2 >/dev/null || refuse "pm2_missing" "pm2 is not on PATH"
	[ -f package.json ] && git rev-parse --git-dir >/dev/null 2>&1 ||
		refuse "not_repo_root" "run this from the repo root"

	APP="${DEPLOY_APP:-$(bun -e 'console.log(require("./ecosystem.config.js").apps[0].name)')}"
	HEALTH_SECONDS="${DEPLOY_HEALTH_SECONDS:-30}"
	FROM="$(git rev-parse HEAD)"
	TO_SHORT="" FROM_SHORT="$(git rev-parse --short HEAD)" FAILURE=""

	LOCK_DIR="${TMPDIR:-/tmp}/discord-agent-deploy.lock"
	mkdir "$LOCK_DIR" 2>/dev/null || refuse "deploy_running" "another deploy is in progress (remove $LOCK_DIR if it is stale)"
	trap 'rmdir "$LOCK_DIR" 2>/dev/null' EXIT

	[ -z "$(git status --porcelain --untracked-files=no)" ] ||
		refuse "dirty_tree" "uncommitted changes in the checkout; commit or discard them first"
	app_status >/dev/null || refuse "app_not_found" "PM2 has no app named \"$APP\""
	# PM2 keeps the options the app was first started with; ecosystem.config.js changes don't reach it.
	# File watching would restart the app mid-checkout, before dependencies are installed.
	[ "$(app_watch)" = "false" ] || refuse "pm2_watch_enabled" \
		"PM2 is watching files for $APP; run: pm2 delete \"$APP\" && pm2 start ecosystem.config.js"

	git fetch -q origin || refuse "fetch_failed" "git fetch origin failed"
	local to
	to="$(git rev-parse --verify -q "${ref}^{commit}")" || refuse "unknown_ref" "no commit for ref \"$ref\""
	TO_SHORT="$(git rev-parse --short "$to")"

	if $dry_run; then
		log "would deploy $FROM_SHORT -> $TO_SHORT:"
		git log --oneline "$FROM..$to" >&2 || true
		local next="scripts/deploy.sh"
		[ "$to" = "$FROM" ] && next="none (already deployed)"
		finish 0 "dry_run" "next=$next"
	fi

	if [ "$to" = "$FROM" ] && ! $force && app_healthy_now; then
		sync_commands_and_finish "unchanged"
	fi

	if deploy_commit "$to"; then
		record "deployed"
		sync_commands_and_finish "deployed"
	fi

	local reason="$FAILURE"
	log "deploy of $TO_SHORT failed ($reason); rolling back to $FROM_SHORT"
	if deploy_commit "$FROM"; then
		record "rolled_back"
		finish 1 "rolled_back" "reason=$reason" "next=fix the failure, then deploy again"
	fi
	record "rollback_failed"
	finish 2 "rollback_failed" "reason=$reason" "rollback_reason=$FAILURE" \
		"next=bot may be down: check pm2 logs \"$APP\" now"
}

# Stop, switch code, clean-install, load-check, start, wait for health. Sets FAILURE on error.
deploy_commit() {
	local sha="$1"
	FAILURE=""
	log "stopping $APP"
	pm2 stop "$APP" >/dev/null 2>&1
	log "checking out $(git rev-parse --short "$sha")"
	git checkout -q --detach "$sha" || { FAILURE="checkout_failed"; return 1; }
	log "installing dependencies"
	rm -rf node_modules
	bun install --frozen-lockfile >&2 || { FAILURE="install_failed"; return 1; }
	log "checking dependencies load"
	bun -e '
		// Import every dependency that has a root entry point. Subpath-only packages
		// (e.g. discord-api-types, imported as discord-api-types/v10) are skipped.
		const deps = Object.keys(require("./package.json").dependencies ?? {});
		for (const name of deps) {
			const pkg = await Bun.file(`node_modules/${name}/package.json`).json();
			const exp = pkg.exports;
			const subpathOnly =
				exp && typeof exp === "object" && !("." in exp) && Object.keys(exp).some((k) => k.startsWith("."));
			if (subpathOnly) continue;
			await import(name);
		}
		process.exit(0);
	' >&2 || { FAILURE="dependencies_failed_to_load"; return 1; }
	log "starting $APP"
	pm2 start "$APP" --update-env >/dev/null 2>&1 || { FAILURE="start_failed"; return 1; }
	wait_healthy || { FAILURE="unhealthy"; return 1; }
}

# Healthy = online for HEALTH_SECONDS with no restarts during the window.
wait_healthy() {
	local start_restarts status restarts uptime waited=0
	read -r status start_restarts uptime < <(app_status)
	log "waiting ${HEALTH_SECONDS}s for $APP to stay up"
	while [ "$waited" -lt $((HEALTH_SECONDS + 30)) ]; do
		sleep 1
		waited=$((waited + 1))
		read -r status restarts uptime < <(app_status)
		[ "$restarts" -gt "$start_restarts" ] && { log "$APP restarted during the health check"; return 1; }
		case "$status" in errored | stopped | "waiting restart" | waiting*) log "$APP is $status"; return 1 ;; esac
		[ "$status" = "online" ] && [ "$uptime" -ge "$HEALTH_SECONDS" ] && { log "$APP is healthy"; return 0; }
	done
	log "$APP did not become healthy (status=$status)"
	return 1
}

app_healthy_now() {
	local status restarts uptime
	read -r status restarts uptime < <(app_status)
	[ "$status" = "online" ]
}

# Prints "<status> <restart count> <uptime seconds>" for APP, or fails if PM2 doesn't know it.
app_status() {
	pm2 jlist 2>/dev/null | APP="$APP" bun -e '
		const apps = JSON.parse(await Bun.stdin.text());
		const app = apps.find((a) => a.name === process.env.APP);
		if (!app) process.exit(1);
		const env = app.pm2_env;
		const uptime = env.status === "online" ? Math.floor((Date.now() - env.pm_uptime) / 1000) : 0;
		console.log(env.status, env.restart_time, uptime);
	'
}

# Register slash commands if their definitions changed, then print the result and exit.
sync_commands_and_finish() {
	local result="$1" output
	log "syncing slash commands"
	if output="$(bun scripts/deploy-commands.ts --if-changed 2>&1)"; then
		printf '%s\n' "$output" | sed 's/^/deploy:   /' >&2
		local commands
		commands="$(printf '%s\n' "$output" | sed -n 's/^commands=//p' | tail -1)"
		finish 0 "$result" "commands=${commands:-unchanged}" "next=none"
	fi
	printf '%s\n' "$output" | sed 's/^/deploy:   /' >&2
	finish 4 "$result" "commands=failed" "reason=command_registration_failed" \
		"next=fix the error above, then run scripts/deploy.sh again"
}

# Prints "true" if PM2 file watching is on for APP.
app_watch() {
	pm2 jlist 2>/dev/null | APP="$APP" bun -e '
		const apps = JSON.parse(await Bun.stdin.text());
		const app = apps.find((a) => a.name === process.env.APP);
		console.log(Boolean(app?.pm2_env?.watch));
	'
}

record() {
	mkdir -p data
	printf '%s %s from=%s to=%s\n' "$(date -u +%FT%TZ)" "$1" "$FROM_SHORT" "$TO_SHORT" >>data/deploy-history.log
}

log() { printf 'deploy: %s\n' "$*" >&2; }

# One line of key=value pairs; values with spaces are double-quoted.
emit() {
	local out="" pair key value
	for pair in "$@"; do
		key="${pair%%=*}" value="${pair#*=}"
		case "$value" in *" "*) value="\"$value\"" ;; esac
		out="$out${out:+ }$key=$value"
	done
	echo "$out"
}

refuse() {
	log "$2"
	emit "result=refused" "reason=$1" "from=${FROM_SHORT:-unknown}" "to=${TO_SHORT:-unknown}" "next=$2"
	exit 3
}

finish() {
	local code="$1" result="$2"
	shift 2
	emit "result=$result" "from=$FROM_SHORT" "to=$TO_SHORT" "$@"
	exit "$code"
}

main "$@"
