# Dashboard Recovery Runbook

## 1) Local source of truth
This project is protected by git history. To recover quickly:

```bash
cd /Users/giles/Desktop/giles-hq-dashboard
git log --oneline -n 20
```

Restore a known-good point:

```bash
git checkout <commit-or-tag>
```

## 2) Nightly backup archives
Backup script:

```bash
/Users/giles/Desktop/giles-hq-dashboard/scripts/backup-dashboard.sh
```

Archives are stored in:

`/Users/giles/Desktop/giles-hq-dashboard-backups`

Policy:
- Excludes `.next`, `node_modules`, `.git`
- Keeps latest 30 backups (rolling)

## 3) Optional nightly automation (macOS launchd)
Install:

```bash
bash /Users/giles/Desktop/giles-hq-dashboard/scripts/install-backup-launchd.sh
```

Runs daily at 03:10 local time.

## 4) Off-machine backup (recommended)
Add a private remote and push:

```bash
cd /Users/giles/Desktop/giles-hq-dashboard
git remote add origin <your-private-repo-url>
git push -u origin main --tags
```

Without this step, backups remain local to this machine.
