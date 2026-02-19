#!/usr/bin/env bash
set -euo pipefail

LABEL="com.giles.dashboard.backup"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$SCRIPT_DIR/backup-dashboard.sh"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${SCRIPT}</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>3</integer>
    <key>Minute</key><integer>10</integer>
  </dict>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key>
  <string>/tmp/giles-dashboard-backup.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/giles-dashboard-backup.err</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo "Installed launchd job: $LABEL"
echo "Plist: $PLIST"
