````## Auto-Filled Spec

[ROLE]

* Persona: Project Manager + security-minded mentor (friendly, a bit playful, but precise).
* Domain level: Senior Linux/VPS operations + hardening + “don’t-lock-yourself-out” recovery discipline.
* Approach (how I will think/work): Phase-based bootstrap → verify each change with a second SSH session → build a simple, explainable baseline → add security layers that are reversible.

[CONTEXT]

* Background summary: Brand-new Ubuntu 24.04 VPS. You coordinate. Codex runs terminal commands. We want a production-worthy baseline that’s secure and recoverable without becoming a self-inflicted prison.
* Audience: You + Codex.
* Success criteria (what “good” looks like):

  * SSH access is key-based, stable, and tested after every change.
  * Minimal attack surface (only required ports open).
  * Automatic security updates + basic intrusion protection.
  * Backups/snapshots plan exists and restore steps are written.
  * Everything is understandable and documented in one place.

[TASK]

* Primary objective (one sentence): Stand up a secure, recoverable Ubuntu 24.04 VPS baseline using a phased checklist that Codex can execute safely.
* Deliverables (explicit list):

  1. Architecture baseline (what runs where, what ports are open, how you administer).
  2. Step-by-step bootstrap checklist (phases, with verification gates).
  3. Codex execution prompts + command blocks per phase.
  4. Recovery plan (how not to get locked out + what to do if you do).
* Definition of Done (3–10 checklist items):

  * Admin user created, sudo working, SSH key login tested.
  * Root SSH login disabled (or restricted) *after* verification.
  * PasswordAuthentication disabled.
  * Firewall enabled with only necessary inbound ports.
  * Unattended security updates enabled and verified.
  * Basic brute-force protection enabled (fail2ban or equivalent).
  * Backups/snapshots plan created and first backup test run.
  * “Server README” created with key info + restore steps.

[INPUTS / SOURCE OF TRUTH]

* Authoritative inputs provided: Ubuntu 24.04, brand-new VPS, priorities: private/secure/production-worthy, recoverable, not lockout-prone, tools allowed (web/code/files = yes), quality bar careful + audited.
* Non-authoritative hints (if any): None.
* Assumptions (Minimal Assumptions):

  * You have provider console access (web/VNC/serial) for emergencies.
  * You can SSH from your local machine and can generate SSH keys if needed.
  * You’ll use one primary admin user (I’ll call it `admin` in commands; rename if desired).

[CONSTRAINTS]

* Must do: security + recovery-first, verify each change, keep system understandable.
* Must not do: risky lockout moves without a tested fallback; “mystery” security tweaks you can’t undo.
* Tone/style rules: professional, friendly, a bit playful.
* Length/format rules: actionable checklist + command blocks.
* Tools allowed (as per user): web browsing yes, code execution yes, file creation yes.
* Safety/privacy notes: don’t paste private keys or secrets into chat; keep credentials in a password manager.

[OUTPUT FORMAT]

* Exact structure: headings + short bullets + command blocks + “Codex prompt” blocks.

---

## Interpretation

We’re setting up a brand-new Ubuntu 24.04 VPS with a secure, production-ready baseline that won’t trap you outside the gates. I’ll give you a phased plan and checklist, plus copy/paste prompts for Codex to safely execute, with verification gates and a recovery playbook.

---

## Plan

* Phase 0: Inventory + “don’t get locked out” safety rails
* Phase 1: Create admin user + SSH keys + verify access
* Phase 2: Harden SSH (only after verified)
* Phase 3: Firewall + minimal exposed ports
* Phase 4: Updates + unattended security patches
* Phase 5: Brute-force protection + basic audit logging
* Phase 6: Backups/restore + documentation
* Phase 7: Optional production foundations (Docker/reverse proxy/Tailscale)

---

## Deliverables

### 1) Baseline Architecture (simple and future-proof)

Administration path (recommended):

* Primary: SSH with keys to `admin` user, then `sudo`.
* Recovery: Provider console access (your “break glass”).
* Optional hard mode later: Tailscale for admin access; restrict SSH to Tailnet only.

Network exposure (starting posture):

* Inbound open: `22/tcp` (SSH) only.
* Later (when hosting web): add `80/tcp` + `443/tcp`.
* Everything else closed by firewall.

Service layout:

* OS baseline: minimal packages + automatic security updates.
* Security layers: UFW firewall + fail2ban (or CrowdSec later).
* Backups: snapshot + file-level backups (restic) with restore instructions.
* Documentation: `/root/SERVER_README.md` (or `/home/admin/SERVER_README.md`) as source-of-truth.

---

### 2) Bootstrap Checklist (with verification gates)

**Golden rule:** keep TWO sessions open during risky steps. One “current working session”, one “test session”. Don’t close the working one until the test session succeeds.

Phase 0 — Access + Baseline snapshot

* [ ] Confirm you have provider console access.
* [ ] SSH in with the initial credentials (often `root`).
* [ ] Record baseline: OS version, IPs, hostname, disk.
* [ ] Update packages (safe, reversible).
* [ ] (Optional) Take a provider snapshot right here (best “undo button”).

Phase 1 — Create admin user + keys + verify

* [ ] Create user `admin`, add to sudo.
* [ ] Install your SSH public key to `/home/admin/.ssh/authorized_keys`.
* [ ] Test SSH login as `admin` in a NEW session.
* [ ] Confirm `sudo` works for `admin`.

Phase 2 — SSH hardening (only after Phase 1 passes)

* [ ] Disable password auth.
* [ ] Disable root SSH login (or restrict to keys only as an intermediate step).
* [ ] Restart SSH.
* [ ] Test login again as `admin`.
* [ ] Keep provider console available in case of typo.

Phase 3 — Firewall

* [ ] Allow SSH (22) before enabling firewall.
* [ ] Enable UFW.
* [ ] Verify you can still SSH in.
* [ ] Later: allow 80/443 only when you actually run web.

Phase 4 — Automatic updates

* [ ] Enable unattended-upgrades for security updates.
* [ ] Verify it’s active and configured.

Phase 5 — Brute-force protection + logging sanity

* [ ] Install and enable fail2ban for sshd.
* [ ] Ensure logs are persistent enough (journald settings optional).

Phase 6 — Backups + restore rehearsal + documentation

* [ ] Decide backup approach: snapshots + restic to object storage.
* [ ] Run a first backup.
* [ ] Document restore commands and where backups live.
* [ ] Create `SERVER_README.md` with: users, ports, services, backup method, recovery steps.

Phase 7 — Optional “production foundations”

* [ ] Docker + compose (if you’ll run services in containers).
* [ ] Reverse proxy (Caddy or Nginx) if hosting web.
* [ ] Tailscale if you want private admin access (and eventually close SSH to public).

---

### 3) Codex Execution Prompts + Command Blocks

Below are “paste into Codex” prompts. Codex should run commands and show output, but it must NOT guess facts (IPs, usernames) unless you tell it.

#### Codex Prompt — Phase 0 (inventory + safe updates)

```bash
# GOAL: Baseline inventory and safe updates on brand-new Ubuntu 24.04 VPS.
# RULES: Do not change SSH config yet. Print command outputs.

set -e

echo "== Baseline =="
lsb_release -a || cat /etc/os-release
uname -a
hostnamectl
ip -br a
df -hT
free -h
uptime

echo "== Updates =="
apt-get update
apt-get -y upgrade
apt-get -y install curl git ufw fail2ban unattended-upgrades ca-certificates gnupg lsb-release jq htop tmux
````

#### Codex Prompt — Phase 1 (create admin user + SSH key)

Assumption: username `admin`. If you want a different name, replace it everywhere.

```bash
# GOAL: Create admin user, add sudo, install SSH key.
# REQUIRED INPUT: Paste YOUR PUBLIC KEY (ssh-ed25519 ...).
# SAFETY: Do NOT disable root login yet. We'll test admin login first.

set -e
USERNAME="admin"

adduser --gecos "" "$USERNAME"
usermod -aG sudo "$USERNAME"

install -d -m 700 "/home/$USERNAME/.ssh"
# Paste your public key between the quotes:
PUBKEY="PASTE_YOUR_PUBLIC_KEY_HERE"
echo "$PUBKEY" > "/home/$USERNAME/.ssh/authorized_keys"
chown -R "$USERNAME:$USERNAME" "/home/$USERNAME/.ssh"
chmod 600 "/home/$USERNAME/.ssh/authorized_keys"

echo "Now: open a NEW terminal and test:"
echo "  ssh $USERNAME@<server-ip>"
echo "Then test sudo:"
echo "  sudo -v"
```

#### Codex Prompt — Phase 2 (SSH hardening)

This is where lockouts happen if done sloppy. Keep the original session open.

```bash
# GOAL: Harden SSH after admin login + sudo has been verified in a separate session.
# SAFETY: Validate sshd config before restarting.

set -e

SSHD="/etc/ssh/sshd_config"
cp -a "$SSHD" "${SSHD}.bak.$(date +%F_%H%M%S)"

# Apply conservative hardening (key-based auth, no root login, no passwords)
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' "$SSHD"
sed -i 's/^#\?KbdInteractiveAuthentication .*/KbdInteractiveAuthentication no/' "$SSHD"
sed -i 's/^#\?PermitRootLogin .*/PermitRootLogin no/' "$SSHD"
sed -i 's/^#\?PubkeyAuthentication .*/PubkeyAuthentication yes/' "$SSHD"

# Nice-to-haves
grep -q '^MaxAuthTries' "$SSHD" || echo 'MaxAuthTries 3' >> "$SSHD"
grep -q '^ClientAliveInterval' "$SSHD" || echo 'ClientAliveInterval 300' >> "$SSHD"
grep -q '^ClientAliveCountMax' "$SSHD" || echo 'ClientAliveCountMax 2' >> "$SSHD"

sshd -t
systemctl restart ssh

echo "IMPORTANT: Test a NEW SSH login now as admin before closing any sessions."
```

#### Codex Prompt — Phase 3 (Firewall)

```bash
# GOAL: Enable UFW safely.
# SAFETY: Ensure SSH is allowed BEFORE enabling.

set -e

ufw allow OpenSSH
ufw status verbose || true
ufw --force enable
ufw status verbose
```

#### Codex Prompt — Phase 4 (Unattended upgrades)

```bash
# GOAL: Enable automatic security updates.

set -e

dpkg-reconfigure -f noninteractive unattended-upgrades
systemctl status unattended-upgrades --no-pager || true

echo "Config files worth reviewing:"
echo "  /etc/apt/apt.conf.d/20auto-upgrades"
echo "  /etc/apt/apt.conf.d/50unattended-upgrades"
```

#### Codex Prompt — Phase 5 (fail2ban basic)

```bash
# GOAL: Basic brute-force protection for SSH.
# NOTE: We keep it simple; tune later.

set -e

systemctl enable --now fail2ban
fail2ban-client status

# Create minimal jail override for sshd if not present
cat >/etc/fail2ban/jail.d/sshd.local <<'EOF'
[sshd]
enabled = true
maxretry = 5
findtime = 10m
bantime = 1h
EOF

systemctl restart fail2ban
fail2ban-client status sshd || true
```

---

### 4) Recovery Plan (aka “how to not cry into your keyboard”)

Before risky steps (SSH/firewall):

- Keep provider console access ready.
- Keep a root/admin session open while testing changes in a second session.
- Always run `sshd -t` before restarting SSH.

If you get locked out:

- Use provider console → log in → restore `/etc/ssh/sshd_config` from the backup file we created.
- Restart SSH: `systemctl restart ssh`
- Re-test from your local machine.

“Break-glass” idea (optional later):

- A second admin user with a separate SSH key stored offline.
- Snapshots before major changes.

---

### 5) What you should document (SERVER_README.md)

Put this on the server and treat it as truth:

- Hostname, OS version, provider, IPs
- Admin users and how to access
- Open ports and why
- Where services live (systemd vs docker)
- Backup location + how to restore
- “Last changed” log (tiny changelog)

Codex can create it once you’re ready.

---

## Self-Check

Definition of Done:

- Admin user created, sudo working, SSH key login tested: PASS (covered in Phase 1, requires you to test)
- Root SSH login disabled after verification: PASS (Phase 2)
- PasswordAuthentication disabled: PASS (Phase 2)
- Firewall enabled with only necessary inbound ports: PASS (Phase 3)
- Unattended security updates enabled and verified: PASS (Phase 4)
- Brute-force protection enabled: PASS (Phase 5)
- Backups/restore plan created and first backup test run: FAIL (not executed yet; Phase 6 still to do)
- Server README created: FAIL (not executed yet; add in Phase 6)

Constraints:

- Secure + recoverable + not lockout-prone: PASS (verification gates + backups of configs + console recovery)
- No invented facts/results: PASS (everything is conditional and requires real command output)
- Tools allowed: PASS

---

## Optional Decisions

A) Admin access strategy

- A1: Keep public SSH on 22 with keys + fail2ban (simplest)
- A2: Add Tailscale and later restrict SSH to Tailnet only (more private)
- A3: Keep SSH public but IP-allowlist it (best if your home IP is stable)

B) Intrusion protection

- B1: fail2ban (simple, good baseline)
- B2: CrowdSec (stronger community intelligence, more moving parts)

C) Backups

- C1: Provider snapshots only (easy, coarse)
- C2: Snapshots + restic to object storage (best practice for real recovery)

Next logical move: run Phase 0 and Phase 1 with Codex, then paste back the outputs of the inventory commands and confirm you successfully SSH in as `admin` with `sudo` before we harden SSH.```
