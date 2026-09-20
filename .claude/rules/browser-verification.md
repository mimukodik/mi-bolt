# Browser verification

Loaded at launch as a project rule (no `paths` scope, so it reaches every
subagent except the built-in Explore and Plan agents). Referenced from
`.claude/CLAUDE.md` and from `code-standards.md`.

## Browser verification (always mandatory)

Nothing that a person can see or click may be reported as done, working, or
fixed until it has been exercised in a real browser through
`mcp__chrome-devtools__*` subagents. This applies to every change that reaches
a rendered surface: UI components and pages, routes and navigation, actions or
server code whose result the UI displays, auth and session gating, styling, and
generated HTML deliverables. A passing typecheck, a green test run, and a read
of the diff are necessary but never sufficient.

**Required for every user-facing change:**

1. Orchestrator: start the app with `npm start` (`ng serve`). There is no
   database — the backend is MSW, served in-process. A spawned agent neither
   starts nor stops that server; the port is a shared resource per
   `.claude/rules/parallel-spawns.md`.
2. Open the affected screen with `new_page` + `navigate_page`.
3. Drive the actual changed behavior with `click`, `fill`, `press_key`:
   perform the user flow the change touches, do not just look at the page.
4. `take_snapshot` for structure and `take_screenshot` for the visual result,
   before and after the interaction when the change alters state.
5. `list_console_messages`: zero errors required. Check
   `list_network_requests` for failed calls behind the change.
6. Exercise the states the change created, including the negative ones
   (signed out, local mode, empty list, error path).
7. Capture a screenshot of any failure mode and report it rather than hiding
   it.
8. Orchestrator: stop every server the verification started; the agent closes
   its own browser page.

Steps 2 to 7 are done by the `real-browser-sonnet` agent (`model: sonnet`),
never by the orchestrator itself; the agent does not start or stop servers.

**A change is exempt only when it cannot reach a browser at all**, for example a
build script, a commit-message convention, or a doc with no rendered output.
If I think a change is exempt, I say so explicitly and say why.

**What does NOT count as browser verification, for any change:**

- File existence on disk, `ls`, `wc -l`, other file-size checks, or reading
  the diff back.
- A green typecheck, unit test, or vitest run.
- An HTTP 200 from `curl` or a smoke-test request.
- A grep of the stylesheet for a `docs/design/yettel.md` token or recipe
  value.
- A subagent asserting it "should work" without a snapshot, a screenshot, and
  a console-message check to show for it.

Visual plus interactive verification through a real browser is required before
reporting "done" or "working" for any user-facing change in this workspace.

### HTML report verification

Whenever the user requests an HTML report of any kind (architecture report,
dashboard, generated static site, single HTML artifact, interactive
visualization), verification through `mcp__chrome-devtools__*` subagents is
**mandatory** before reporting completion. The "does NOT count" list above
applies to HTML reports too.

Spawn the `real-browser-sonnet` agent (`model: sonnet`) for this verification.
Its definition in `.claude/agents/real-browser-sonnet.md` carries the step
loop, screenshot rules, and report format; give it the URL, the spec, and the
report directory, and save its final message as `report.md` in that directory.

Required subagent verification steps:

1. Open the rendered HTML in a real browser via `new_page` + `navigate_page`.
2. Take a snapshot (`take_snapshot`) of every section and menu entry.
3. Take screenshots (`take_screenshot`) for visual verification.
4. Verify Mermaid diagrams render correctly (no broken syntax, no overflow).
5. Verify the theme toggle works in **all three states** (light, dark, auto):
   both grounds must switch, no cross-fade, no flash of unstyled content.
6. Verify all menu sections load on click and internal links resolve.
7. Check the console for errors (`list_console_messages`): zero errors
   required.
8. Verify navigation flow: search filter, section loader, TOC scroll-spy.
9. Capture a screenshot of any failure mode for the report.

