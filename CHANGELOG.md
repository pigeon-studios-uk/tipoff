# Changelog

All notable changes to Tipoff are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html):

- **Major** versions can need changes to your settings, database or Discord app. Read the **Upgrade notes**.
- **Minor** versions add features without breaking existing setups.
- **Patch** versions fix bugs only.

## [Unreleased]

### Added

- **Languages:** Tipoff can now speak more than one language. It's still English only for now; other languages come one file at a time ([Languages](README.md#languages)). Forms and private replies use each person's own Discord language, and what Tipoff posts in the server uses the server's language.
- `/setup language` chooses the server's language: its own Discord language (the default), or any language Tipoff has. `/setup check` shows it.
- Outcome DMs are in the language the reporter used when they reported.
- Command descriptions, choices and the **Report Message** / **Report User** names can be translated; slash command names stay English everywhere.
- A [guide for translators](CONTRIBUTING.md#translating-tipoff), and tests that check every language file.
- **German** (`de`), our own translation. Until a native speaker has checked it, longer messages in German end with a short line saying so and how to help.
- **Spanish (Spain)** (`es-ES`), our own translation, also waiting for a native speaker to check it.

### Changed

- Forum status tags are found by the IDs Tipoff saved first, and by name only when it has none, so renaming a tag or changing the server's language never makes Tipoff add the tags again.
- Two small database changes run by themselves when Tipoff starts: the server's language, and each report's language.

### Fixed

- Two labels in `/setup limits` were too long for Discord and were cut off. The "each member" and "whole server" part is now on its own line under them.

## [2.1.0] - 2026-11-22

### Added

- A one-click [Railway template](README.md#railway): Railway asks for your bot token and application ID, then runs Tipoff with its own MySQL database.

### Fixed

- If the database is still starting when Tipoff does (Docker Compose, Railway), Tipoff waits for it for up to a minute instead of stopping, and a failed connection now says why instead of an empty "Can't start:".

## [2.0.0] - 2026-11-22

The first public release of Tipoff. It's version 2 because the hosted Tipoff has already been through its first version behind the scenes: this is the same report bot, for anyone who wants to run their own copy.

### Added

- **Reporting:** Report Message and Report User in the right-click menu, and `/report` with up to 5 screenshots. A reason from the server's list, an optional note, "Ping the moderators" for urgent reports and anonymous reports if the server allows them.
- **Cases:** reports about the same message or member join one numbered case while it's open. The evidence is saved as it was, even if the message is deleted, and links are shown as text.
- **Moderator tools:** claim, unclaim, resolve and dismiss with a private note, reopen, and delete, time out, kick or ban from the card, checked against the moderator's own permissions. `/case` and `/reports` for timelines, notes, a member's history, statistics and blocking misuse.
- **Escalation:** reports about staff go to a separate channel.
- **Forum report channels:** one post per case, tagged with its status.
- **Safety:** cool-downs, a limit on open reports, rate-limited urgent pings, and blocking.
- **Reliability:** reports that can't be posted are kept, admins are told once, and they're posted when the problem is fixed.
- **Privacy:** closed cases are deleted after 90 days (30 to 365), a server's data 30 days after the bot leaves, and `/privacy` for anyone.
- **Running your own copy:** a Docker image (`ghcr.io/pigeon-studios-uk/tipoff`), Docker Compose with MariaDB, and links to your own website, guide, privacy policy, terms and support in `.env`.

[Unreleased]: https://github.com/pigeon-studios-uk/tipoff/compare/v2.1.0...HEAD
[2.1.0]: https://github.com/pigeon-studios-uk/tipoff/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/pigeon-studios-uk/tipoff/releases/tag/v2.0.0
