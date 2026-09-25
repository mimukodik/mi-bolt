"""Focused checks for deploy/stack.sh's per-worktree locking and slot reuse.

Each test builds its own sandbox in a temp dir: a throwaway git repo with one
commit and a linked worktree (`git worktree add`), holding a copy of the
script under test plus a fake deploy/compose.sh that only appends its
arguments and COMPOSE_PROJECT_NAME to a log file and exits 0.
MIBOLT_STACK_SLOTS_DIR points into the temp dir, so no test ever touches the
real slot ledger under $HOME. Never runs real Docker.

The script under test is $STACK_SH, default this repository's deploy/stack.sh,
so the same tests can run against an older revision.

Run with: uv run --no-project python deploy/tests/test-stack.py
"""

import hashlib
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import tempfile
import time
import unittest

REPO_ROOT = Path(__file__).resolve().parents[2]
STACK_SH = Path(os.environ.get("STACK_SH", str(REPO_ROOT / "deploy" / "stack.sh")))

# deploy/stack.sh's own constants: LOCK_STALE_SECONDS is the age a pid-less
# lock must reach before it is reclaimed; LOCK_WAIT_SECONDS is
# LOCK_RETRY_TRIES (50) * LOCK_RETRY_INTERVAL (0.1s), the full time
# acquire_lock spends retrying a contended lock before it gives up.
LOCK_STALE_SECONDS = 5
LOCK_WAIT_SECONDS = 5.0


def _run(worktree: Path, env: dict, *args: str, timeout: float = 15) -> subprocess.CompletedProcess:
    return subprocess.run(
        [str(worktree / "deploy" / "stack.sh"), *args],
        cwd=str(worktree), env=env, capture_output=True, text=True, timeout=timeout)


def _repo_root(worktree: Path) -> str:
    # Mirrors deploy/stack.sh's own REPO_ROOT computation exactly:
    #   here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    #   REPO_ROOT="$(cd "${here}/.." && pwd)"
    out = subprocess.run(
        ["bash", "-c", f'cd {shlex.quote(str(worktree / "deploy"))} && cd .. && pwd'],
        capture_output=True, text=True, check=True)
    return out.stdout.strip()


def _lock_dir_for(worktree: Path, slots_dir: Path) -> Path:
    digest = hashlib.sha1(_repo_root(worktree).encode()).hexdigest()[:12]
    return slots_dir / f".lock-{digest}"


def _lock_dir_for_string(worktree_str: str, slots_dir: Path) -> Path:
    # Same hash lock_dir_for (deploy/stack.sh) computes, but over the literal
    # string handed to it rather than a resolved worktree path: cmd_prune
    # passes a stale slot's recorded owner_path straight through, unresolved,
    # so this is what a test needs when that owner_path never exists on disk
    # for _repo_root to `cd` into.
    digest = hashlib.sha1(worktree_str.encode()).hexdigest()[:12]
    return slots_dir / f".lock-{digest}"


def _kill(proc: subprocess.Popen) -> None:
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=5)


class StackScriptTests(unittest.TestCase):
    def _sandbox(self, branch: str = "wt-branch"):
        root = Path(tempfile.mkdtemp(prefix="stack-sh-test-"))
        self.addCleanup(shutil.rmtree, root, ignore_errors=True)

        origin = root / "origin"
        subprocess.run(["git", "init", "-q", "-b", "main", str(origin)], check=True)
        subprocess.run(["git", "-C", str(origin), "config", "user.email", "test@example.com"], check=True)
        subprocess.run(["git", "-C", str(origin), "config", "user.name", "Test"], check=True)
        (origin / "README.md").write_text("sandbox\n")
        subprocess.run(["git", "-C", str(origin), "add", "."], check=True)
        subprocess.run(["git", "-C", str(origin), "commit", "-q", "-m", "init"], check=True)

        worktree = root / "worktree"
        subprocess.run(
            ["git", "-C", str(origin), "worktree", "add", "-b", branch, str(worktree)],
            check=True)

        deploy_dir = worktree / "deploy"
        deploy_dir.mkdir()
        shutil.copy(STACK_SH, deploy_dir / "stack.sh")
        (deploy_dir / "stack.sh").chmod(0o755)

        compose_log = root / "compose.log"
        compose_sh = deploy_dir / "compose.sh"
        compose_sh.write_text(
            "#!/usr/bin/env bash\n"
            "printf '%s COMPOSE_PROJECT_NAME=%s\\n' \"$*\" \"${COMPOSE_PROJECT_NAME:-}\" "
            f">> {shlex.quote(str(compose_log))}\n"
            "exit 0\n")
        compose_sh.chmod(0o755)

        slots_dir = root / "slots"
        env = dict(os.environ)
        env["MIBOLT_STACK_SLOTS_DIR"] = str(slots_dir)

        return worktree, compose_log, slots_dir, env

    # (a) a lock dir whose pid file names a dead process is reclaimed, and the
    # run proceeds to claim a slot. Proves lock_is_stale's liveness check
    # (lock_is_stale, deploy/stack.sh) and acquire_lock's call to
    # reclaim_lock on a contended mkdir.
    def test_dead_pid_lock_is_reclaimed(self) -> None:
        worktree, _compose_log, slots_dir, env = self._sandbox()
        lock_dir = _lock_dir_for(worktree, slots_dir)
        lock_dir.mkdir(parents=True)
        (lock_dir / "pid").write_text("2147483647\n")  # a pid that cannot exist

        result = _run(worktree, env, "claim")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "1")
        self.assertTrue((slots_dir / "1").is_dir())
        self.assertFalse(lock_dir.exists())

    # (b) a lock held by a live process is never reclaimed: the run waits out
    # the full retry budget and exits 1 with the timeout message, and the
    # lock dir is still there afterwards.
    def test_live_pid_lock_is_not_reclaimed_and_times_out(self) -> None:
        worktree, _compose_log, slots_dir, env = self._sandbox()
        lock_dir = _lock_dir_for(worktree, slots_dir)
        lock_dir.mkdir(parents=True)
        holder = subprocess.Popen(["sleep", "30"])
        self.addCleanup(_kill, holder)
        (lock_dir / "pid").write_text(f"{holder.pid}\n")

        result = _run(worktree, env, "claim", timeout=LOCK_WAIT_SECONDS + 10)

        self.assertEqual(result.returncode, 1)
        self.assertIn("timed out waiting for the per-worktree lock", result.stderr)
        self.assertTrue(lock_dir.is_dir())
        self.assertFalse((slots_dir / "1").exists())

    # (c) a pid-less lock (no pid file at all, the state an older run or a
    # mid-acquire race can leave) is only stale once it has outlived
    # LOCK_STALE_SECONDS: a fresh one is not reclaimed while a claim is
    # blocked waiting on it, one aged past the threshold with os.utime is
    # reclaimed at once.
    def test_pidless_lock_stale_only_after_age_threshold(self) -> None:
        worktree, _compose_log, slots_dir, env = self._sandbox()
        lock_dir = _lock_dir_for(worktree, slots_dir)
        lock_dir.mkdir(parents=True)

        young = subprocess.Popen(
            [str(worktree / "deploy" / "stack.sh"), "claim"],
            cwd=str(worktree), env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            time.sleep(LOCK_STALE_SECONDS - 2)
            self.assertIsNone(young.poll(), "a young pid-less lock must not be reclaimed yet")
            self.assertFalse((slots_dir / "1").exists())
        finally:
            _kill(young)

        old_time = time.time() - LOCK_STALE_SECONDS - 1
        os.utime(lock_dir, (old_time, old_time))
        result = _run(worktree, env, "claim")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "1")
        self.assertTrue((slots_dir / "1").is_dir())

    # (d) after the worktree's branch changes, reusing its already-claimed
    # slot keeps the project= value the owner file already carries, rather
    # than recomputing it from the new branch name. Proves reuse_project_name
    # is called from ensure_state's find_existing_slot branch.
    def test_reused_slot_keeps_owner_project_name_after_branch_change(self) -> None:
        worktree, _compose_log, slots_dir, env = self._sandbox(branch="feature-a")
        first = _run(worktree, env, "claim")
        self.assertEqual(first.returncode, 0, first.stderr)
        slot = first.stdout.strip()
        owner_file = slots_dir / slot / "owner"
        original_project = next(
            line.split("=", 1)[1] for line in owner_file.read_text().splitlines()
            if line.startswith("project="))

        state_file = worktree / "deploy" / ".worktree-stack.env"
        state_file.unlink()  # simulates a state file lost without releasing the slot
        subprocess.run(
            ["git", "-C", str(worktree), "checkout", "-q", "-b", "feature-b"], check=True)

        second = _run(worktree, env, "claim")
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual(second.stdout.strip(), slot, "must reuse the same slot")

        new_state = state_file.read_text()
        self.assertIn(f"COMPOSE_PROJECT_NAME={original_project}\n", new_state)
        self.assertNotIn("feature-b", original_project)

    # (e) reset with a live lock held on this worktree must not reach compose
    # down: it has to wait for (and fail to get) the lock first. Proves
    # cmd_reset's acquire_lock call comes before its "${COMPOSE_SH}" down -v.
    def test_reset_with_live_lock_does_not_call_compose_down(self) -> None:
        worktree, compose_log, slots_dir, env = self._sandbox()
        claim = _run(worktree, env, "claim")
        self.assertEqual(claim.returncode, 0, claim.stderr)

        lock_dir = _lock_dir_for(worktree, slots_dir)
        lock_dir.mkdir(parents=True)
        holder = subprocess.Popen(["sleep", "30"])
        self.addCleanup(_kill, holder)
        (lock_dir / "pid").write_text(f"{holder.pid}\n")

        result = _run(worktree, env, "reset", "--yes", timeout=LOCK_WAIT_SECONDS + 10)

        self.assertEqual(result.returncode, 1)
        self.assertIn("timed out waiting for the per-worktree lock", result.stderr)
        self.assertFalse(
            compose_log.exists(), "compose.sh must not have been invoked while the lock was held")

    # (f) two concurrent `stack.sh claim` runs in the same worktree must
    # serialize on ensure_state's check-claim-write sequence and end up
    # sharing one slot, never leaking a second one for the same worktree.
    def test_concurrent_claims_in_one_worktree_get_one_slot(self) -> None:
        worktree, _compose_log, slots_dir, env = self._sandbox()
        procs = [
            subprocess.Popen(
                [str(worktree / "deploy" / "stack.sh"), "claim"],
                cwd=str(worktree), env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            for _ in range(2)
        ]
        outs = [p.communicate(timeout=15) for p in procs]

        for proc, (_out, err) in zip(procs, outs):
            self.assertEqual(proc.returncode, 0, err)
        slots = sorted(d.name for d in slots_dir.iterdir() if d.is_dir() and not d.name.startswith("."))
        self.assertEqual(slots, ["1"], f"expected exactly one claimed slot, got {slots}")
        self.assertEqual({out.strip() for out, _err in outs}, {"1"})

    # (g) a leaked reclaim mutex (the `.reclaim` dir reclaim_lock takes as
    # its own mkdir-mutex) whose pid file names a dead process, sitting
    # beside a stale lock (also a dead pid), must not wedge acquire_lock
    # forever: reclaim_lock reclaims the leaked mutex itself on its own
    # `mkdir "${mutex}"` failure, and the run goes on to claim slot 1. Proves
    # reclaim_lock's `lock_is_stale "${mutex}"` check reclaims a leaked
    # mutex with a dead pid instead of leaving it to wedge every retry.
    def test_leaked_reclaim_mutex_with_dead_pid_is_reclaimed(self) -> None:
        worktree, _compose_log, slots_dir, env = self._sandbox()
        lock_dir = _lock_dir_for(worktree, slots_dir)
        lock_dir.mkdir(parents=True)
        (lock_dir / "pid").write_text("2147483647\n")  # a pid that cannot exist
        mutex_dir = Path(f"{lock_dir}.reclaim")
        mutex_dir.mkdir()
        (mutex_dir / "pid").write_text("2147483646\n")  # a different dead pid

        result = _run(worktree, env, "claim")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "1")
        self.assertTrue((slots_dir / "1").is_dir())
        self.assertFalse(lock_dir.exists())
        self.assertFalse(mutex_dir.exists())

    # (h) a reclaim mutex held by a live process must never be removed, even
    # while the lock dir it guards looks stale (dead pid): the run waits out
    # the full retry budget and exits 1 with the timeout message, and the
    # mutex dir is still there afterwards. Proves reclaim_lock's
    # `lock_is_stale "${mutex}"` check runs, and is honoured, before
    # `rm -rf "${mutex}"` is ever reached.
    def test_live_reclaim_mutex_is_not_removed_and_times_out(self) -> None:
        worktree, _compose_log, slots_dir, env = self._sandbox()
        lock_dir = _lock_dir_for(worktree, slots_dir)
        lock_dir.mkdir(parents=True)
        (lock_dir / "pid").write_text("2147483647\n")  # stale-looking: dead pid
        mutex_dir = Path(f"{lock_dir}.reclaim")
        mutex_dir.mkdir()
        holder = subprocess.Popen(["sleep", "30"])
        self.addCleanup(_kill, holder)
        (mutex_dir / "pid").write_text(f"{holder.pid}\n")

        result = _run(worktree, env, "claim", timeout=LOCK_WAIT_SECONDS + 10)

        self.assertEqual(result.returncode, 1)
        self.assertIn("timed out waiting for the per-worktree lock", result.stderr)
        self.assertTrue(mutex_dir.is_dir())

    # (i) cmd_prune must not abandon every remaining stale slot when one
    # slot's lock is contended: it skips the locked slot, reports why, and
    # still prunes the other stale slot. Proves cmd_prune's `attempt_lock`
    # skip moves the loop on to the next slot on lock contention, instead
    # of the exiting acquire_lock aborting the whole prune.
    def test_prune_skips_locked_slot_and_prunes_the_rest(self) -> None:
        worktree, compose_log, slots_dir, env = self._sandbox()
        slots_dir.mkdir(parents=True, exist_ok=True)

        owner_a = str(Path(tempfile.gettempdir()) / "stack-sh-test-gone-a")
        owner_b = str(Path(tempfile.gettempdir()) / "stack-sh-test-gone-b")
        project_a = "mi-bolt-wt1-locked-slot"
        project_b = "mi-bolt-wt2-free-slot"

        slot_a = slots_dir / "1"
        slot_a.mkdir()
        (slot_a / "owner").write_text(
            f"worktree={owner_a}\nbranch=branch-a\nproject={project_a}\n")

        slot_b = slots_dir / "2"
        slot_b.mkdir()
        (slot_b / "owner").write_text(
            f"worktree={owner_b}\nbranch=branch-b\nproject={project_b}\n")

        lock_dir_a = _lock_dir_for_string(owner_a, slots_dir)
        lock_dir_a.mkdir(parents=True)
        holder = subprocess.Popen(["sleep", "30"])
        self.addCleanup(_kill, holder)
        (lock_dir_a / "pid").write_text(f"{holder.pid}\n")

        result = _run(worktree, env, "prune", "--yes", timeout=LOCK_WAIT_SECONDS + 15)

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("slot 1 is locked by another run; skipping", result.stderr)
        self.assertTrue(slot_a.is_dir(), "the locked slot must be kept, not pruned")
        self.assertFalse(slot_b.exists(), "the unlocked stale slot must still be pruned")

        log_text = compose_log.read_text() if compose_log.exists() else ""
        self.assertIn(f"COMPOSE_PROJECT_NAME={project_b}", log_text)
        self.assertNotIn(f"COMPOSE_PROJECT_NAME={project_a}", log_text)


if __name__ == "__main__":
    unittest.main()
