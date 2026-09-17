You are executing the whole MiBolt repair package in this repository: 74 prepared task
files under docs/fix/, one after another, in one run, without asking for permission
between tasks.

## Before the first task

1. Read AGENTS.md in the repository root. Its code conventions bind every change you make.
2. Read docs/fix/README.md, section 3 ("The rules every task obeys") and section 4
   ("The order"). Section 4 is the execution order. The numbering in the file names is NOT
   the order.
3. Build the ordered list of tasks from section 4, from Rule zero through Phase G, and
   print it as your first output. FIX-01 and FIX-04 come first; everything else follows the
   phase order that section gives.
4. Run `git log --oneline` and `git status --short`. Any task whose commit is already in
   the log (see "Resuming" below) is done: skip it and say so.

Then work the list from the top, one task at a time, without stopping between tasks.

## The loop, for each task

1. Read docs/fix/<TASK>.md in full, and every file and line its "Evidence" and "What to
   change" sections cite.
2. Read that file's "Where this sits in the stream" section and confirm every task it
   names as a prerequisite is already committed. If one is not, do that prerequisite first.
3. Make the change described in "What to change", and nothing else.
4. Run every command in "How to verify" and read its real output and exit code.
5. Work "Acceptance criteria" as a checklist, one criterion at a time, in order. Each
   criterion names an observable value: observe it and record what you observed.
6. Commit, exactly once, as described under "Committing" below.
7. Print one line: the task id, PASS, the commit hash, and the number of acceptance
   criteria that passed. Then start the next task immediately.

Do not carry one task's file contents into the next task. Between tasks you need only the
ordered list and which tasks are done.

## Rules that hold for every task

- docs/ is the specification. Where the code and a document under docs/ disagree, the code
  is wrong and you change the code. Never edit a file under docs/ to make it agree with the
  implementation. The task files themselves are never edited either.
- The task's "Out of scope" section is binding: do not fix what it lists, do not tidy
  adjacent code, do not reformat lines the change does not touch.
- Change only the files named in "What to change". If the work seems to need another file,
  that is a signal to stop, not to widen the task.
- A criterion you did not measure is not met. "It should work" is a failure.
- Where a criterion calls for a browser check, run it in a real browser and produce the
  evidence the criterion asks for (screenshot, computed style, console output). A green
  unit test, a green typecheck, an HTTP 200 from curl, a grep, or reading the diff back is
  never a browser check.
- Never run git restore, git checkout --, git stash, git reset or git clean. Never push and
  never open a pull request.
- No machine-specific path (a home directory, ~, a temp directory) in any file you write.
- Do not start a long-running process in the foreground. A dev server you start for a
  browser check is stopped again before the task's commit.

## Committing

One task is exactly one commit. Never bundle two tasks into one commit, and never commit a
task whose acceptance criteria have not all passed.

- Stage only the files you changed, naming each one: `git add <path>`. Never `git add -A`
  and never `git add .`.
- The subject line is the one in that task's "## Commit" section, unchanged.
- The body says what changed and what you measured, and its last line is exactly:
  `Task: <TASK>`  (for example `Task: FIX-12`). That trailer is what makes this run
  resumable, so it is not optional.
- FIX-51 is the one task that is two commits; its own "## Commit" section says so. Every
  other task is one.

## When a task cannot pass

Stop the whole run. Do not weaken the criterion, do not skip or delete the test that
enforces it, do not edit the task file, do not commit a partial result, and do not move on
to the next task.

The phases are dependency chains: a task that fails leaves every later task in its phase
resting on something that does not work, so continuing past it produces results nobody can
trust. Leave the working tree exactly as it is and report:

- which task and which acceptance criterion failed,
- what you measured, verbatim, with the exit code,
- what you believe blocks it,
- the list of tasks not yet started.

## Resuming

If this run is restarted, `git log --grep "^Task: FIX"` lists what is already done. Rebuild
the ordered list, skip every task whose trailer is in the log, and continue from the first
one that is not.

## Final report

When the list is finished, report:

1. Every task id with PASS or FAIL and its commit hash, in execution order.
2. Any task skipped because it was already committed.
3. The total number of commits this run made.
4. Anything you could not verify, and why.
