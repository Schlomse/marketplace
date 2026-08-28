<!-- Submissions are opened automatically by the RelateCore submission worker. -->
<!-- Manual PRs (community reviews, small fixes) are very welcome, too.      -->

## What does this PR change?

- [ ] New plugin submission (auto-generated — author is in `meta.json`)
- [ ] Plugin update
- [ ] Community review (`plugins/<id>/reviews/<userId>.json`)
- [ ] Repo tooling / docs

## Submission checklist

- [ ] „Validate submissions“ workflow is green
- [ ] `plugin.json` complete (id matches folder, name, semver, description, logo/icon present)
- [ ] Code quick-audit: no exfiltration, no obfuscation, no executables
- [ ] Assets appropriate
- [ ] Reviews only: file follows `reviews/<userId>.json` format (rating 1–5)

## Reviewer decision

- ✅ **Approve → merge** — the catalog workflow rebuilds `index.json` and the plugin goes live
- ❌ **Reject → close** with a short comment (the author sees the PR in RelateCore)
