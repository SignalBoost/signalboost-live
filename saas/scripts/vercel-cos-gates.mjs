Visual Studio Code 1.135

Show release notes after an update

Follow us on LinkedIn, X, Bluesky, Instagram | View online

Release date: August 26, 2026

Welcome to the 1.135 release of Visual Studio Code. This release helps you continue agent sessions across applications, get a second opinion on agent work, and understand chat usage while working in a more streamlined Agents window.

External agent sessions: Continue recent Copilot or Claude agent sessions from other applications in VS Code.

Rubber Duck (Experimental): Get a second opinion from a complementary model to surface missed details and edge cases.

Agents window UX improvements: Work with a streamlined side layout, simplified session controls, and session information that is easier to find.

Detailed chat usage: View a per-model breakdown of input, cached input, and output tokens for each chat turn.

Happy Coding!

VS Code is rolling out gradually to all users. Use Check for Updates in VS Code to get the latest version immediately.

To try new features as soon as possible, download the nightly Insiders build, which includes the latest updates as soon as they are available.

In this update
Agents
Chat
Accessibility
Editor Experience
Code Editing
Deprecated features and settings
Thank you
Agents
Agent host
The agent host lets you connect to the same agent session from multiple VS Code windows. It runs agent harnesses in a dedicated process based on the Agent Host Protocol (AHP). The agent host's Copilot agent is powered by the Copilot SDK, which aligns the agent's behavior and functionality with the Copilot CLI, the standalone GitHub Copilot app, and other Copilot products.

We're actively developing the agent host. The following screenshot shows the Copilot harness selected for an agent host in an editor window:

Screenshot showing the harness dropdown in the editor window.

Learn more from our VS Code Agent Host documentation and the video below. If you have any feedback or requests, please let us know by filing an issue.

See it in action in our Agent Host introduction YouTube video.

Continue external agent sessions in VS Code
Setting:   chat.agentSessions.showExternal

The Sessions list in VS Code can now show recent Copilot or Claude agent sessions that you created in other applications. By default, VS Code shows up to two recently updated external sessions. Select a session from the Sessions list to view the conversation and continue it in VS Code with your Copilot subscription.

When you open an external session, a banner at the top of the chat lets you configure how many external sessions appear in the Sessions list. You can also use the External submenu in the Sessions list filter to choose which external sessions are shown. Change this preference at any time with the   chat.agentSessions.showExternal setting.

Rubber Duck (Experimental)
Rubber Duck is an experimental feature that allows you to get a second opinion from a complementary model on the agent's work. It helps surface missed details or edge cases. You can use Rubber Duck by invoking the /rubber-duck command in a Copilot agent host session.

Learn more about Rubber Duck in GitHub Copilot CLI.

Single-pane side layout is now the default
Setting: sessions.layout.singlePaneDetailPanel

In the previous release, we introduced the single-pane layout. In this layout, session details and editors are located in a single side pane, with a shared tab bar next to chat. The single-pane layout is now enabled by default for the Agents window on desktop.

This release also improves the layout:

Diffs use a side-by-side view when space permits and switch to an inline view when the side pane becomes too narrow. Use Always Show Inline Diff from the editor title menu to keep diffs inline at every width.
The action bar is less crowded. Editor-specific actions for diffs, view modes, code review, and attachments move to the editor title area, while the shared header focuses on showing or hiding Details.
Screenshot showing the simplified action bar for the Changes editor in the single-pane layout.

To use the classic layout, disable sessions.layout.singlePaneDetailPanel and reload the window.

Simplified session controls and information
The session header is less crowded, so you can identify the active session more easily and focus on the conversation.

The session title has a prominent position, while an overflow menu next to the title groups actions for creating a chat and pinning the session. Search remains available in the Sessions list. When a session contains multiple chats, chat tabs replace the single-chat header.

Screenshot showing session and chat actions grouped in the simplified Agents session header.

Session information moves directly above the chat input, where it is easier to find while you work. Pills can show changes, pull requests, issues, browsers the agent is interacting with, and artifacts from the session. For example, the Changes pill shows live file and diff counts and opens the complete set of session changes.

Screenshot showing changes, pull request, and artifact pills above the chat input, with the artifact list expanded.

Right-click an individual pill to open a context menu and choose which pill types are visible. The Changes pill remains visible whenever the session has changes.

Screenshot showing the context menu for choosing which session pill types are visible.

Chat
Editor-style sticky scroll for chat (Experimental)
Settings:   chat.stickyScroll.enabled ,   chat.experimental.stickyScroll.enabled

Chat sticky scroll lets you keep the current prompt visible as you scroll through and review long responses. We've further refined the behavior to make it more consistent with sticky scroll in the editor. Enable both settings to try the redesigned experience.


View detailed chat turn usage
To give you better insight into your chat usage, we've redesigned the chat response footer. When you hover over it, the footer shows a per-model breakdown of the input, cached input, and output tokens used in that chat turn.

Screenshot showing detailed token usage for each model in a chat turn.

Sandboxing for the local agent harness
We previously rolled out sandboxing to 50% of users to validate it on a larger scale and in real-world use cases. While we didn't identify a specific blocking issue, continuing the rollout would likely require more support and follow-up work at a time when we want to preserve focus on higher-priority investments, especially in the area of the agent host and the Copilot harness. We've therefore returned the default rollout to 0% for now.

Sandboxing for the local agent harness remains available as an opt-in feature through the UI, so users who want to try it can still enable it.

Deprecated features and settings
None

Thank you
Contributions to vscode:

@a-stewart (Anthony Stewart): Rename leftover respectAutoSaveConfig variable to isRefactoring PR #160703
@bstee615 (Benjamin Steenhoek): Add eagerness option for diffpatch prompt PR #327544
@cipheraxat (Akshat Anand): fix: center Modern UI panel title tabs in the 32px header PR #331612
@danyalahmed1995 (Danyal Ahmed): Fix case-insensitive aggregated basename glob matching PR #316387
@dzsquared (Drew Skwiers-Koballa): add mcp server key as description in tool picker PR #325003
@guimmd2 (Guilherme Menezes Magalhães): Fix package.json hover metadata broken in npm 12+ PR #327951
@jachinsamuel (Jachin Samuel): docs: remove dead Gitter badge (service shut down June 2023) PR #322702
@jadefr (Jade Ferreira Vieira): Fix file URL to path conversion in html-language-features esbuild script PR #328557
@jainampatel27 (Jainam Patel): Fix typo in selectionHighlightMaxLength description PR #296427
@juliagongms (Julia Gong): nes: add optimized PatchBased02 prompt strategy PR #332018
@n-gist (n-gist): fix languages.getDiagnostics() problem-matchers diagnostics duplication PR #290278
@rfeltis (Ralph Feltis)
Remove Agents window startup A/A experiment trigger PR #331559
Revert chat quota trajectory nudge PR #331401
@RyanEwen (Ryan Ewen): Do not present a failed tool call as a successful one PR #330707
@SimonSiefke (Simon Siefke)
fix: memory leak in markersTable PR #327885
fix: memory leak in mainThreadDocumentsAndEditors PR #331170
fix: memory leak in settings preview indicator PR #331990
@srikanthananthula63053 (srikanthananthula)
fix: use fresh service accessor when lazily initializing chat attachment context (fixes #329610) PR #331416
Fix section checkbox state when all items are unchecked PR #331419
@TheRealAlexxx (alexxx): Fix typo in Settings UI description for editor.selectionHighlightMaxLength PR #332162
@zainnadeem786 (Zain Nadeem)
Await Workspace Trust transition completion in setUrisTrust() PR #328626
Fix PowerShell quoting for runInTerminal environment values PR #331753
Contributions to vscode-windows-process-tree:

@danfiedler-msft (Dan Fiedler): Pin GitHub Actions to full-length commit SHAs PR #91
Issue tracking
Contributions to our issue tracking:

@gjsjohnmurray (John Murray)
@xguarch (Xavier Guarch)
@homeworld614 (homeworld614)
@johnnydecimal (Johnny Noble)
@wenma531 (noreply)
