# Site

Here is the source code for my personal website. Includes miscellaneous web projects that I work on from time to time.

[Blog setup](blog/README.md)

## CI and deployment

Site checks and Deploy Website use `.github/actions/validate-site/action.yml`
for the same build, local-link checks, physics tests, blog dependency compatibility
test, audit-policy tests, and audits of both npm dependency trees. A failure
prevents uploading a deployment artifact, so a failed build leaves the previously
published site in place. The required PR check remains `Build and audit`.

Independent tests and audits run even when another validation step fails. The
run summary lists results, and audit logs include advisory links. Check the first
failed step before rerunning: dependency findings require a dependency change;
reruns only help transient service failures. Dependency auto-merge also stops
when Site checks fails, so its failure can be a consequence of the same incident.

Scheduled checks run daily and npm Dependabot update checks run each weekday.
In GitHub notification settings, enable Actions notifications for failed workflows
to receive alerts; this is an account setting, not controlled by these files.
After fixing a shared dependency failure, update affected PR branches with main
and rerun their checks before merging.

Enjoy :)
